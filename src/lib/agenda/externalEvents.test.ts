// ─── O calendário batista confere com o que a CBB publicou ─────────────────
//
// Este teste existe por causa de um defeito que ficou anos em produção sem
// dar sinal: as datas denominacionais estavam guardadas como dia fixo do mês,
// e a CBB as define por regra ("2º domingo de junho"). O Dia do Pastor de
// 2026 aparecia em 09/06; a CBB publicou 14/06.
//
// É a pior classe de erro que existe numa agenda — não quebra nada, não
// registra erro, não deixa a tela em branco. Mostra uma data plausível, no
// mês certo, e errada. Ninguém confere uma data que parece certa.
//
// Por isso o teste não inventa os valores esperados: cada linha de
// `DATAS_BATISTAS` carrega em `cbb2026` a data que a própria Convenção
// publicou, e o teste exige que a regra reproduza exatamente aquilo. Trocar
// "2º domingo" por "3º" quebra aqui, citando o dia oficial.
//
// Fonte: https://www.convencaobatista.com.br/site/pagina.php?MEN_ID=61
// (Atividades 2026, lida em 26/08/2026)

import { describe, it, expect } from "vitest";
import {
  DATAS_BATISTAS, resolverRegra, eventosBatistas, eventosExternos,
  feriadosBrasil, datasEspeciais, aniversarioDaIgreja, datasPorInstituicao,
} from "./externalEvents";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("calendário batista — regras contra o calendário oficial de 2026", () => {
  for (const item of DATAS_BATISTAS) {
    it(`${item.nome} cai em ${item.cbb2026}`, () => {
      expect(ymd(resolverRegra(item.regra, 2026))).toBe(item.cbb2026);
    });
  }
});

describe("as regras continuam válidas fora de 2026", () => {
  // O ponto inteiro da mudança: a data se move sozinha com o ano. Um dia fixo
  // passaria neste teste em 2026 e erraria em todo ano seguinte.
  it("Dia do Pastor é o 2º domingo de junho, em qualquer ano", () => {
    const esperado: Record<number, string> = {
      2026: "2026-06-14", 2027: "2027-06-13", 2028: "2028-06-11", 2029: "2029-06-10",
    };
    for (const [ano, data] of Object.entries(esperado)) {
      const d = resolverRegra({ tipo: "nth", mes: 6, semana: 2, diaSemana: 0 }, Number(ano));
      expect(ymd(d)).toBe(data);
      expect(d.getDay()).toBe(0);
    }
  });

  it("toda data com regra de dia da semana cai nesse dia, de 2026 a 2035", () => {
    for (let ano = 2026; ano <= 2035; ano++) {
      for (const item of DATAS_BATISTAS) {
        if (item.regra.tipo === "fixa") continue;
        const d = resolverRegra(item.regra, ano);
        expect(
          d.getDay(),
          `${item.nome} em ${ano} caiu em ${ymd(d)}`,
        ).toBe(item.regra.diaSemana);
        expect(d.getMonth() + 1).toBe(item.regra.mes);
      }
    }
  });

  it("a última quinta de novembro é mesmo a última", () => {
    for (let ano = 2026; ano <= 2035; ano++) {
      const d = resolverRegra({ tipo: "ultima", mes: 11, diaSemana: 4 }, ano);
      expect(d.getDay()).toBe(4);
      // Somar sete dias tem de sair de novembro — senão não era a última.
      const proxima = new Date(d);
      proxima.setDate(proxima.getDate() + 7);
      expect(proxima.getMonth()).not.toBe(10);
    }
  });
});

describe("o que chega às telas", () => {
  it("as semanas ocupam todos os dias que declaram", () => {
    const todos = eventosBatistas(2026);
    const patria = todos.filter(o => o.evento.titulo.startsWith("7 dias de Oração pela Pátria"));
    expect(patria).toHaveLength(7);
    expect(patria[0].data).toBe("2026-09-01");
    expect(patria[6].data).toBe("2026-09-07");
  });

  it("não há duas ocorrências com a mesma chave", () => {
    // A chave vira o `key` do React e o id do evento. Repetida, a lista
    // renderiza errado e o filtro por dia conta a mais.
    const chaves = eventosBatistas(2026).map(o => o.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("eventosExternos devolve só o que está dentro do intervalo", () => {
    const so13 = eventosExternos(new Date(2026, 8, 13), new Date(2026, 8, 13));
    expect(so13.map(o => o.evento.titulo)).toContain("Dia de Missões Nacionais");
    expect(so13.every(o => o.data === "2026-09-13")).toBe(true);
  });

  it("toda data batista é somente-leitura", () => {
    // Elas não existem na tabela `eventos`: editar uma na tela salvaria um id
    // que o banco não conhece.
    expect(eventosBatistas(2026).every(o => o.externalReadOnly)).toBe(true);
  });
});

// ─── Datas Especiais (22/10/2026) ──────────────────────────────────────────

const titulosEm = (ocs: { data: string; evento: { titulo: string } }[], data: string) =>
  ocs.filter(o => o.data === data).map(o => o.evento.titulo);

describe("feriados", () => {
  it("Consciência Negra é feriado nacional a partir de 2024 (Lei 14.759/2023)", () => {
    expect(titulosEm(feriadosBrasil(2026), "2026-11-20")).toContain("Dia Nacional de Zumbi e da Consciência Negra");
    expect(titulosEm(feriadosBrasil(2023), "2023-11-20")).toEqual([]);
  });
  it("os do Rio de Janeiro: São Sebastião (municipal) e São Jorge (estadual)", () => {
    expect(titulosEm(feriadosBrasil(2026), "2026-01-20")).toContain("Dia de São Sebastião");
    expect(titulosEm(feriadosBrasil(2026), "2026-04-23")).toContain("Dia de São Jorge");
  });
  it("Páscoa não é feriado — saiu daqui para o calendário cristão", () => {
    expect(feriadosBrasil(2026).map(o => o.evento.titulo)).not.toContain("Páscoa");
    expect(titulosEm(datasEspeciais(2026), "2026-04-05")).toContain("Páscoa");
  });
});

describe("calendário cristão", () => {
  // Páscoa de 2026: 5 de abril.
  it("datas relativas à Páscoa em 2026", () => {
    const ds = datasEspeciais(2026);
    expect(titulosEm(ds, "2026-03-29")).toContain("Domingo de Ramos");
    expect(titulosEm(ds, "2026-05-14")).toContain("Ascensão de Cristo");
    expect(titulosEm(ds, "2026-05-24")).toContain("Pentecostes");
  });
  it("o Advento começa no quarto domingo antes do Natal — inclusive quando o Natal cai num domingo", () => {
    const advento = { tipo: "advento" } as const;
    const esperado: Record<number, string> = {
      2022: "2022-11-27", // Natal num domingo
      2023: "2023-12-03", // Natal numa segunda: a véspera é o 4º domingo
      2026: "2026-11-29",
      2027: "2027-11-28",
    };
    for (const [ano, data] of Object.entries(esperado)) {
      const d = resolverRegra(advento, Number(ano));
      expect(ymd(d)).toBe(data);
      expect(d.getDay()).toBe(0);
    }
  });
  it("Dia das Mães e Dia dos Pais são o 2º domingo de maio e de agosto", () => {
    const ds = datasEspeciais(2026);
    expect(titulosEm(ds, "2026-05-10")).toContain("Dia das Mães");
    expect(titulosEm(ds, "2026-08-09")).toContain("Dia dos Pais");
  });
  it("Reforma Protestante é cristã, não só da CBB", () => {
    expect(DATAS_BATISTAS.map(d => d.nome)).not.toContain("Dia da Reforma Protestante");
    const r = datasEspeciais(2026).find(o => o.evento.titulo === "Dia da Reforma Protestante");
    expect(r?.categoria).toBe("crista");
    expect(r?.data).toBe("2026-10-31");
  });
});

describe("a Identidade decide o calendário denominacional", () => {
  it("vinculada à CBB: aparecem todas as datas batistas", () => {
    const n = eventosBatistas(2026, new Set(["CBB"])).length;
    expect(n).toBe(eventosBatistas(2026).length);
  });
  it("sem vínculo nenhum: nenhuma data denominacional", () => {
    expect(eventosBatistas(2026, new Set())).toEqual([]);
  });
  it("só a JMM: aparece o Dia de Missões Mundiais, e só ele", () => {
    expect(eventosBatistas(2026, new Set(["JMM"])).map(o => o.evento.titulo)).toEqual(["Dia de Missões Mundiais"]);
  });
  it("não se sabe (consulta falhou): todas aparecem", () => {
    expect(eventosBatistas(2026, null).length).toBe(eventosBatistas(2026).length);
  });
  it("as datas por instituição batem com o catálogo", () => {
    const conta = datasPorInstituicao();
    expect(conta.CBB).toBe(DATAS_BATISTAS.length);
    expect(conta.JMM).toBe(1);
    expect(conta.JMN).toBe(3);
  });
  it("o vínculo não mexe nas datas que não são denominacionais", () => {
    const de = new Date(2026, 0, 1), ate = new Date(2026, 11, 31);
    const sem = eventosExternos(de, ate, { vinculadas: new Set(), fundacao: null });
    expect(sem.some(o => o.categoria === "batista")).toBe(false);
    expect(sem.some(o => o.categoria === "feriado")).toBe(true);
    expect(sem.some(o => o.categoria === "crista")).toBe(true);
  });
});

describe("aniversário da igreja", () => {
  const fundacao = { data: "1948-10-03", nomeIgreja: "Igreja de Teste" };
  it("conta os anos a partir da fundação", () => {
    const [a] = aniversarioDaIgreja(2026, fundacao);
    expect(a.data).toBe("2026-10-03");
    expect(a.evento.titulo).toBe("Aniversário da igreja — 78 anos");
    expect(a.categoria).toBe("institucional");
  });
  it("sem data de fundação, nada", () => {
    expect(aniversarioDaIgreja(2026, null)).toEqual([]);
  });
});

describe("o ano inteiro", () => {
  it("não há duas ocorrências com a mesma chave em todas as categorias", () => {
    const tudo = eventosExternos(new Date(2026, 0, 1), new Date(2026, 11, 31), {
      vinculadas: null, fundacao: { data: "1948-10-03", nomeIgreja: "Igreja de Teste" },
    });
    const chaves = tudo.map(o => o.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
