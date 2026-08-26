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
