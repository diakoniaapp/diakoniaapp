// O motor da escala é onde mora a justiça, e justiça é a coisa que a igreja
// confere primeiro. Uma escala em que fulana entra três vezes e sicrano
// nenhuma queima o botão de vez — ninguém clica duas vezes num gerador que
// já foi injusto uma.
//
// Por isso estes testes são sobre JUSTIÇA e sobre RESPEITO AO QUE A PESSOA
// DISSE, e não sobre a forma da saída.
import { describe, it, expect } from "vitest";
import { montarRodizio, diaDe, turnoDe, type CandidatoDaArea, type EventoParaEscalar } from "./rodizio";

const AREA = "recepcao";

const pessoa = (p: Partial<CandidatoDaArea> & { pessoa_id: string }): CandidatoDaArea => ({
  nome: p.pessoa_id, area_id: AREA,
  dias: ["domingo"], turnos: ["noite"],
  maxMes: 4, cargaMes: 0, diasSemServir: 30, emDescanso: false,
  ...p,
});

// Quatro domingos de outubro de 2026, culto da noite.
const domingos = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"];
const culto = (data: string, minimo = 2): EventoParaEscalar => ({
  evento_id: `ev-${data}`, titulo: "Culto da Noite", data, hora_inicio: "18:30:00",
  areas: [{ area_id: AREA, area_nome: "Recepção", minimo }],
});

describe("diaDe e turnoDe", () => {
  it("lê o dia da semana da data", () => {
    expect(diaDe("2026-10-04")).toBe("domingo");
    expect(diaDe("2026-10-07")).toBe("quarta");
  });

  it("deriva o turno da hora de início", () => {
    expect(turnoDe("10:30:00")).toBe("manha");
    expect(turnoDe("15:00:00")).toBe("tarde");
    expect(turnoDe("18:30:00")).toBe("noite");
  });

  it("evento sem hora não tem turno, e não exclui ninguém por isso", () => {
    // Excluir quem marcou "noite" de um evento sem horário seria inventar que
    // o evento é de manhã.
    expect(turnoDe(null)).toBeNull();
    const plano = montarRodizio(
      [{ evento_id: "e1", titulo: "Encontro", data: "2026-10-04", hora_inicio: null,
         areas: [{ area_id: AREA, area_nome: "Recepção", minimo: 1 }] }],
      [pessoa({ pessoa_id: "ana", turnos: ["noite"] })],
    );
    expect(plano.vagas[0].escalados.map(e => e.pessoa_id)).toEqual(["ana"]);
  });
});

describe("montarRodizio — justiça", () => {
  it("distribui o mês inteiro em vez de repetir a mesma gente", () => {
    // Oito pessoas, quatro domingos, duas vagas por domingo: dá exatamente
    // uma escala para cada. Um sorteio puro repetiria alguém e deixaria
    // outro de fora.
    const gente = ["a", "b", "c", "d", "e", "f", "g", "h"]
      .map(id => pessoa({ pessoa_id: id }));
    const plano = montarRodizio(domingos.map(d => culto(d)), gente);

    expect(plano.pessoasUsadas).toBe(8);
    expect(plano.incompletas).toBe(0);

    const vezes = new Map<string, number>();
    for (const v of plano.vagas) {
      for (const e of v.escalados) vezes.set(e.pessoa_id, (vezes.get(e.pessoa_id) ?? 0) + 1);
    }
    expect([...vezes.values()]).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("quem já serviu neste mês entra depois de quem não serviu", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [
        pessoa({ pessoa_id: "cansada", cargaMes: 2 }),
        pessoa({ pessoa_id: "folgada", cargaMes: 0 }),
      ],
    );
    expect(plano.vagas[0].escalados[0].pessoa_id).toBe("folgada");
  });

  it("empatados na carga, entra quem serviu há mais tempo", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [
        pessoa({ pessoa_id: "recente", diasSemServir: 7 }),
        pessoa({ pessoa_id: "sumida", diasSemServir: 200 }),
      ],
    );
    expect(plano.vagas[0].escalados[0].pessoa_id).toBe("sumida");
  });

  it("quem nunca serviu vem antes de quem já serviu alguma vez", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [
        pessoa({ pessoa_id: "veterana", diasSemServir: 300 }),
        pessoa({ pessoa_id: "novata", diasSemServir: null }),
      ],
    );
    expect(plano.vagas[0].escalados[0].pessoa_id).toBe("novata");
  });

  it("o sorteio só decide entre quem empatou em tudo", () => {
    // Duas pessoas idênticas, duas sementes diferentes: a ordem pode mudar.
    // O que NÃO pode mudar é a quantidade — uma entra, uma fica.
    const gente = [pessoa({ pessoa_id: "x" }), pessoa({ pessoa_id: "y" })];
    const a = montarRodizio([culto("2026-10-04", 1)], gente, 1);
    const b = montarRodizio([culto("2026-10-04", 1)], gente, 999);
    expect(a.vagas[0].escalados).toHaveLength(1);
    expect(b.vagas[0].escalados).toHaveLength(1);
    expect(["x", "y"]).toContain(a.vagas[0].escalados[0].pessoa_id);
  });
});

describe("montarRodizio — respeita o que a pessoa disse", () => {
  it("não passa do teto declarado, nem somando os domingos do mês", () => {
    // O caso da Sunamyta: disse "uma vez por mês". Entra num domingo e sai
    // da urna nos outros três — mesmo que sobrem vagas.
    const plano = montarRodizio(
      domingos.map(d => culto(d, 1)),
      [pessoa({ pessoa_id: "sunamyta", maxMes: 1 })],
    );
    const vezes = plano.vagas.flatMap(v => v.escalados).filter(e => e.pessoa_id === "sunamyta");
    expect(vezes).toHaveLength(1);
    expect(plano.incompletas).toBe(3);
  });

  it("quem não declarou teto pode entrar mais de uma vez", () => {
    // "Quando precisarem" não é um número, e é justamente quem se ofereceu
    // para tapar buraco.
    const plano = montarRodizio(
      domingos.map(d => culto(d, 1)),
      [pessoa({ pessoa_id: "sempre", maxMes: null })],
    );
    expect(plano.vagas.flatMap(v => v.escalados)).toHaveLength(4);
  });

  it("não escala quem não marcou aquele dia", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "so_sabado", dias: ["sabado"] })],
    );
    expect(plano.vagas[0].escalados).toHaveLength(0);
    expect(plano.vagas[0].motivoDaFalta).toContain("ninguém marcou domingo");
  });

  it("não escala quem não marcou aquele turno", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "so_manha", turnos: ["manha"] })],
    );
    expect(plano.vagas[0].escalados).toHaveLength(0);
  });

  it("'dia todo' serve para qualquer turno", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "flexivel", turnos: ["dia_todo"] })],
    );
    expect(plano.vagas[0].escalados[0].pessoa_id).toBe("flexivel");
  });

  it("não escala quem está em descanso", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "descansando", emDescanso: true })],
    );
    expect(plano.vagas[0].escalados).toHaveLength(0);
  });

  it("ninguém em duas áreas do mesmo culto", () => {
    // Recepção e Introdução acontecem à mesma hora. A pessoa não se divide.
    const evento: EventoParaEscalar = {
      evento_id: "e1", titulo: "Culto", data: "2026-10-04", hora_inicio: "18:30:00",
      areas: [
        { area_id: "recepcao", area_nome: "Recepção", minimo: 1 },
        { area_id: "introducao", area_nome: "Introdução", minimo: 1 },
      ],
    };
    const plano = montarRodizio(evento.areas.map(() => evento).slice(0, 1), [
      pessoa({ pessoa_id: "ana", area_id: "recepcao" }),
      pessoa({ pessoa_id: "ana", area_id: "introducao" }),
    ]);
    const nomes = plano.vagas.flatMap(v => v.escalados.map(e => e.pessoa_id));
    expect(nomes.filter(n => n === "ana")).toHaveLength(1);
    expect(plano.vagas[1].faltam).toBe(1);
  });
});

describe("montarRodizio — explica o que faltou", () => {
  it("diz que ninguém serve na área quando a equipe está vazia", () => {
    const plano = montarRodizio([culto("2026-10-04", 2)], []);
    expect(plano.vagas[0].motivoDaFalta).toBe("ninguém serve nesta área");
  });

  it("diz quando todos já cumpriram o mês", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 2)],
      [pessoa({ pessoa_id: "a", maxMes: 1, cargaMes: 1 }),
       pessoa({ pessoa_id: "b", maxMes: 1, cargaMes: 1 })],
    );
    expect(plano.vagas[0].motivoDaFalta).toBe("todos já cumpriram o que se dispuseram no mês");
  });

  it("aponta quem não disse quando pode servir", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "muda", dias: [] })],
    );
    expect(plano.vagas[0].motivoDaFalta).toContain("não disse quando pode servir");
  });

  it("cada escalado vem com a frase que explica a escolha", () => {
    const plano = montarRodizio(
      [culto("2026-10-04", 1)],
      [pessoa({ pessoa_id: "ana", diasSemServir: 47, maxMes: 2, cargaMes: 0 })],
    );
    expect(plano.vagas[0].escalados[0].porque).toBe("não serve há 47 dias · 0 de 2 no mês");
  });
});
