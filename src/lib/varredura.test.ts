import { describe, expect, it } from "vitest";
import { conferirVarredura, mensagemDaFalta } from "./varredura";

describe("conferência diária do R$ 1,00", () => {
  it("quando a aplicação está registrada, o saldo de cada dia é R$ 1,00 e nada é apontado", () => {
    const r = conferirVarredura([
      { data: "2026-09-01", valor: 500 }, { data: "2026-09-01", valor: -500 },   // entrada e aplicação do mesmo valor
      { data: "2026-09-02", valor: 200 }, { data: "2026-09-02", valor: -200 },
    ], 1, "2026-09-30");
    expect(r.faltas).toEqual([]);
    expect(r.desvioAtual).toBe(0);
    expect(r.dias.map(d => d.saldo)).toEqual([1, 1]);
  });

  it("aplicação esquecida: o sistema termina o dia com a mais e a mensagem diz quanto", () => {
    const r = conferirVarredura([{ data: "2026-09-01", valor: 500 }, { data: "2026-09-02", valor: 100 }, { data: "2026-09-02", valor: -100 }], 1, "2026-09-30");
    expect(r.faltas).toHaveLength(1);
    expect(r.faltas[0]).toMatchObject({ data: "2026-09-01", situacao: "falta_aplicacao", mudanca: 500, saldo: 501 });
    expect(mensagemDaFalta(r.faltas[0])).toContain("Falta uma aplicação de");
    expect(mensagemDaFalta(r.faltas[0])).toContain("500,00");
  });

  it("o desvio acumulado não repete a falta nos dias seguintes (só a mudança conta)", () => {
    const r = conferirVarredura([{ data: "2026-09-01", valor: 500 }, { data: "2026-09-02", valor: 80 }, { data: "2026-09-02", valor: -80 }, { data: "2026-09-03", valor: 40 }, { data: "2026-09-03", valor: -40 }], 1, "2026-09-30");
    expect(r.dias.map(d => d.desvio)).toEqual([500, 500, 500]);
    expect(r.faltas.map(f => f.data)).toEqual(["2026-09-01"]);
    expect(r.desvioAtual).toBe(500);
  });

  it("resgate esquecido: o sistema termina o dia com a menos", () => {
    const r = conferirVarredura([{ data: "2026-09-01", valor: -300 }], 301, "2026-09-30");
    expect(r.faltas[0]).toMatchObject({ situacao: "falta_resgate", mudanca: -300 });
    expect(mensagemDaFalta(r.faltas[0])).toContain("Falta um resgate de");
  });

  it("um resgate que cobre a aplicação esquecida zera o desvio", () => {
    const r = conferirVarredura([{ data: "2026-09-01", valor: 500 }, { data: "2026-09-05", valor: 500 }, { data: "2026-09-05", valor: -500 }, { data: "2026-09-06", valor: -500 }], 1, "2026-09-30");
    expect(r.desvioAtual).toBe(0);
    expect(r.faltas.map(f => f.situacao)).toEqual(["falta_aplicacao", "falta_resgate"]);
  });

  it("dentro da tolerância de R$ 0,05 não aponta; o dia pedido como limite não entra", () => {
    expect(conferirVarredura([{ data: "2026-09-01", valor: 0.04 }], 1, "2026-09-30").faltas).toEqual([]);
    const r = conferirVarredura([{ data: "2026-09-01", valor: 10 }, { data: "2026-10-05", valor: 999 }], 1, "2026-10-04");
    expect(r.dias.map(d => d.data)).toEqual(["2026-09-01"]);
  });

  it("sem movimento: sem dias, desvio vem do saldo de partida", () => {
    expect(conferirVarredura([], 1, "2026-09-30")).toEqual({ dias: [], faltas: [], desvioAtual: 0 });
  });
});
