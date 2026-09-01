// ─── Testes de `recurrence.ts` — a expansão da agenda ──────────────────────
//
// Este é o motor que transforma UMA linha do banco em todas as datas que
// aparecem no calendário, e não tinha teste nenhum. É a lógica pura mais
// consequente da agenda: se ela erra, o evento some da tela ou aparece no dia
// errado, e ninguém descobre por um relatório — descobre porque a igreja se
// reuniu no dia errado.
//
// O caso que motivou escrevê-los: "temos um evento de segunda a quinta, das
// 22h às 23h". A pergunta era se o sistema aceitava mais de um dia. Aceita —
// `dias_semana` é uma lista e vira `byweekday` na rrule. Estes testes fixam
// isso, para que continue aceitando.
//
// ── A ARMADILHA DO FUSO, DE NOVO ───────────────────────────────────────────
//
// `new Date("2026-08-31")` é meia-noite UTC, que em Brasília é 21h do dia 30.
// O módulo usa `parseLocalDate`, que fatia o ISO e constrói a data local. Os
// testes constroem as datas do mesmo jeito, senão testariam o fuso e não a
// regra.

import { describe, it, expect, afterEach, vi } from "vitest";
import { expandirOcorrencias, descreverRegra, hojeLocal, daquiAMeses } from "./recurrence";
import type { EventoRow, RecorrenciaRegra } from "./types";

/** Data local, sem passar pelo parser de ISO do JavaScript. */
const dia = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
};

function evento(over: Partial<EventoRow> = {}): EventoRow {
  return {
    id: "ev-1",
    titulo: "Ensaio",
    tipo: "outro",
    data: "2026-08-31",          // uma segunda-feira
    hora_inicio: "22:00",
    hora_fim: "23:00",
    local: null,
    local_id: null,
    descricao: null,
    status: "agendado",
    cor: null,
    ministerio_principal_id: null,
    recorrencia_id: "serie-1",
    recorrencia_regra: null,
    is_excecao: false,
    ocorrencia_original_data: null,
    serie_origem_id: null,
    ...over,
  } as EventoRow;
}

const SEG = 1, TER = 2, QUA = 3, QUI = 4;

describe("de segunda a quinta, 22h às 23h", () => {
  const regra: RecorrenciaRegra = {
    freq: "semanal",
    intervalo: 1,
    dias_semana: [SEG, TER, QUA, QUI],
    fim: { tipo: "nunca" },
  };

  it("gera as quatro datas de uma semana, e só elas", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: regra })],
      dia("2026-08-31"),   // segunda
      dia("2026-09-06"),   // domingo seguinte
    );
    expect(ocs.map(o => o.data)).toEqual([
      "2026-08-31", // seg
      "2026-09-01", // ter
      "2026-09-02", // qua
      "2026-09-03", // qui
    ]);
    // Sexta, sábado e domingo ficam de fora — é o que "seg a qui" quer dizer.
    expect(ocs.map(o => o.data)).not.toContain("2026-09-04");
  });

  it("repete o horário em todas as datas", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: regra })],
      dia("2026-08-31"),
      dia("2026-09-06"),
    );
    for (const o of ocs) {
      expect(o.evento.hora_inicio).toBe("22:00");
      expect(o.evento.hora_fim).toBe("23:00");
    }
  });

  it("atravessa a semana: duas semanas dão oito encontros", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: regra })],
      dia("2026-08-31"),
      dia("2026-09-13"),
    );
    expect(ocs).toHaveLength(8);
  });

  it("descreve a regra em português, com os dias por extenso", () => {
    expect(descreverRegra(regra)).toBe("Semanalmente (Seg, Ter, Qua, Qui)");
  });
});

describe("a janela recorta, não inventa", () => {
  const regra: RecorrenciaRegra = {
    freq: "semanal", intervalo: 1, dias_semana: [SEG, TER, QUA, QUI], fim: { tipo: "nunca" },
  };

  it("uma janela de um dia devolve só aquele dia", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: regra })],
      dia("2026-09-02"), dia("2026-09-02"),
    );
    expect(ocs.map(o => o.data)).toEqual(["2026-09-02"]);
  });

  it("uma janela que cai só na sexta devolve nada", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: regra })],
      dia("2026-09-04"), dia("2026-09-04"),
    );
    expect(ocs).toHaveLength(0);
  });
});

describe("o fim da série", () => {
  it("por número de ocorrências, conta o total da série e não da janela", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: {
        freq: "semanal", intervalo: 1, dias_semana: [SEG, TER, QUA, QUI],
        fim: { tipo: "ocorrencias", n: 6 },
      } })],
      dia("2026-08-31"), dia("2026-09-30"),
    );
    expect(ocs).toHaveLength(6);
    // Quatro na primeira semana, e as duas seguintes caem na segunda (07/09)
    // e na terça (08/09). Errei esta conta ao escrever o teste — o motor
    // estava certo, e o teste é que dizia 07.
    expect(ocs[ocs.length - 1].data).toBe("2026-09-08");
  });

  it("por data, não passa dela", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: {
        freq: "semanal", intervalo: 1, dias_semana: [SEG, TER, QUA, QUI],
        fim: { tipo: "data", data: "2026-09-02" },
      } })],
      dia("2026-08-31"), dia("2026-09-30"),
    );
    expect(ocs.map(o => o.data)).toEqual(["2026-08-31", "2026-09-01", "2026-09-02"]);
  });
});

describe("evento sem recorrência", () => {
  it("aparece uma vez, no seu próprio dia", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: null, recorrencia_id: null })],
      dia("2026-08-24"), dia("2026-09-07"),
    );
    expect(ocs.map(o => o.data)).toEqual(["2026-08-31"]);
  });

  it("não aparece se a janela não o alcança", () => {
    const ocs = expandirOcorrencias(
      [evento({ recorrencia_regra: null, recorrencia_id: null })],
      dia("2026-09-01"), dia("2026-09-07"),
    );
    expect(ocs).toHaveLength(0);
  });
});

// ─── A data local, e o fim da série ────────────────────────────────────────
//
// `new Date().toISOString().slice(0,10)` devolve a data em UTC: das 21h à
// meia-noite em Brasília ele já responde AMANHÃ. Estava em dois lugares da
// agenda — no padrão do formulário e no padrão do fim de série.
//
// Não é hipótese: o culto desta igreja é às 22h, então a janela em que o erro
// acontece é exatamente a janela em que alguém cadastraria esse culto. Medido
// às 21h22 de 27/08/2026, o formulário sugeria fim em 28/08.

describe("hojeLocal", () => {
  afterEach(() => vi.useRealTimers());

  it("às 21h de Brasília ainda é hoje, e não amanhã", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T21:22:00"));
    expect(hojeLocal()).toBe("2026-08-27");
    // O que o caminho antigo respondia no mesmo instante:
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-28");
  });

  it("logo depois da meia-noite também acerta", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:05:00"));
    expect(hojeLocal()).toBe("2026-01-01");
  });
});

describe("daquiAMeses", () => {
  it("soma meses sem escorregar de dia", () => {
    expect(daquiAMeses("2026-08-27", 3)).toBe("2026-11-27");
    expect(daquiAMeses("2026-01-04", 3)).toBe("2026-04-04");
  });

  it("atravessa o fim do ano", () => {
    expect(daquiAMeses("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("nunca devolve o próprio dia — era esse o defeito", () => {
    // O padrão antigo do campo "Em" era HOJE, o que produzia uma série que
    // começa e termina no mesmo dia: um encontro só, e o evento sumia.
    expect(daquiAMeses("2026-08-27", 3)).not.toBe("2026-08-27");
  });
});

describe("descreverRegra avisa quando a série acabou", () => {
  afterEach(() => vi.useRealTimers());

  it("diz 'série encerrada' quando o fim já passou", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T10:00:00"));
    // O caso real: a Escola Bíblica Dominical, semanal, de 04/01 a 04/01.
    expect(descreverRegra({
      freq: "semanal", intervalo: 1, dias_semana: [0],
      fim: { tipo: "data", data: "2026-01-04" },
    })).toBe("Semanalmente (Dom) até 2026-01-04 — série encerrada");
  });

  it("cala quando a série ainda vale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T10:00:00"));
    expect(descreverRegra({
      freq: "semanal", intervalo: 1, dias_semana: [0],
      fim: { tipo: "data", data: "2026-12-27" },
    })).toBe("Semanalmente (Dom) até 2026-12-27");
  });
});
