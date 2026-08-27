// ─── Testes de `idade.ts` ──────────────────────────────────────────────────
//
// Esta conta passou a servir duas telas ao mesmo tempo: a lista de candidatos
// ao batismo (regra dos 9 anos) e a pirâmide etária do rol. As duas precisam
// pôr a mesma pessoa no mesmo lugar, e o jeito de garantir isso é fixar o
// relógio e conferir as bordas.
//
// A borda que mais importa é o **fuso**: `new Date("2000-01-01")` é meia-noite
// UTC, que em Brasília é 21h do dia 31/12/1999. Sem o `+ "T00:00"` que a
// função usa, todo mundo nascido em 1º de janeiro perderia um ano.

import { describe, it, expect, afterEach, vi } from "vitest";
import { idadeEm } from "./idade";

/** Fixa o relógio num instante local conhecido. */
function hojeE(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${iso}T12:00:00`));
}

afterEach(() => { vi.useRealTimers(); });

describe("idadeEm", () => {
  it("devolve nulo quando não há data — e nulo não é zero", () => {
    expect(idadeEm(null)).toBeNull();
    expect(idadeEm(undefined)).toBeNull();
    expect(idadeEm("")).toBeNull();
  });

  it("devolve nulo para data inválida, em vez de NaN", () => {
    // NaN se propagaria em silêncio: `NaN >= 9` é falso, então a pessoa
    // cairia no balde de "abaixo da idade" em vez do de "indecidível".
    expect(idadeEm("data ruim")).toBeNull();
  });

  it("conta anos completos: no dia do aniversário já vale o ano novo", () => {
    hojeE("2026-08-26");
    expect(idadeEm("2000-08-26")).toBe(26);
  });

  it("na véspera do aniversário ainda vale o ano anterior", () => {
    hojeE("2026-08-25");
    expect(idadeEm("2000-08-26")).toBe(25);
  });

  it("no dia seguinte ao aniversário mantém o ano novo", () => {
    hojeE("2026-08-27");
    expect(idadeEm("2000-08-26")).toBe(26);
  });

  it("não perde um ano de quem nasceu em 1º de janeiro (fuso)", () => {
    // Sem `T00:00`, `new Date("2000-01-01")` viraria 31/12/1999 local e a
    // conta daria 27 aqui — um ano a mais, para todo mundo dessa data.
    hojeE("2026-06-15");
    expect(idadeEm("2000-01-01")).toBe(26);
  });

  it("não erra quem nasceu em 31 de dezembro (o outro lado do fuso)", () => {
    hojeE("2026-06-15");
    expect(idadeEm("1999-12-31")).toBe(26);
  });

  it("acerta a borda dos 9 anos, que é a regra do batismo", () => {
    hojeE("2026-08-26");
    expect(idadeEm("2017-08-26")).toBe(9);  // faz 9 hoje: já é candidato
    expect(idadeEm("2017-08-27")).toBe(8);  // faz 9 amanhã: ainda não
  });

  it("lida com 29 de fevereiro sem estourar", () => {
    // Quem nasceu em 29/02 completa anos em 28/02 nos anos comuns pela
    // conta de mês e dia — e o que não pode é dar erro nem pular um ano.
    hojeE("2026-02-28");
    expect(idadeEm("2016-02-29")).toBe(9);
    hojeE("2026-03-01");
    expect(idadeEm("2016-02-29")).toBe(10);
  });

  it("ignora a hora do dia: meio-dia e meia-noite dão o mesmo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T00:05:00"));
    const cedo = idadeEm("2000-08-26");
    vi.setSystemTime(new Date("2026-08-26T23:55:00"));
    expect(idadeEm("2000-08-26")).toBe(cedo);
  });
});
