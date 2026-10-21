import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { atalhoQueCasa, intervaloDoAtalho, periodoInicialDoExtrato, periodoParaLembrar } from "./SeletorPeriodo";

// quarta-feira, 21/10/2026 ao meio-dia (longe da virada do dia, que é a armadilha de fuso do projeto)
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 21, 12, 0, 0)); });
afterEach(() => { vi.useRealTimers(); });

describe("intervaloDoAtalho — só preenche as datas", () => {
  it("Hoje, Semana (domingo a sábado), Mês (fechado) e 30 dias (contando hoje)", () => {
    expect(intervaloDoAtalho("hoje")).toEqual({ inicio: "2026-10-21", fim: "2026-10-21" });
    expect(intervaloDoAtalho("semana")).toEqual({ inicio: "2026-10-18", fim: "2026-10-24" });
    expect(intervaloDoAtalho("mes")).toEqual({ inicio: "2026-10-01", fim: "2026-10-31" });
    expect(intervaloDoAtalho("30dias")).toEqual({ inicio: "2026-09-22", fim: "2026-10-21" });
  });
});

describe("atalhoQueCasa / periodoParaLembrar", () => {
  it("reconhece o par que é exatamente um atalho", () => {
    expect(atalhoQueCasa("2026-10-01", "2026-10-31")).toBe("mes");
    expect(atalhoQueCasa("2026-10-21", "2026-10-21")).toBe("hoje");
  });
  it("mexer numa data desfaz o casamento (o atalho não é estado)", () => {
    expect(atalhoQueCasa("2026-10-02", "2026-10-31")).toBeNull();
    expect(atalhoQueCasa("2026-09-01", "2026-10-31")).toBeNull();
  });
  it("lembra o atalho (recalcula amanhã) ou 'personalizado' (guarda as datas)", () => {
    expect(periodoParaLembrar("2026-10-01", "2026-10-31")).toBe("mes_atual");
    expect(periodoParaLembrar("2026-10-21", "2026-10-21")).toBe("hoje");
    expect(periodoParaLembrar("2026-09-01", "2026-10-31")).toBe("personalizado");
  });
});

describe("periodoInicialDoExtrato — links antigos continuam funcionando", () => {
  const SEM = { periodoUrl: null, de: null, ate: null, contexto: null };
  it("sem nada: hoje", () => {
    expect(periodoInicialDoExtrato(SEM)).toEqual({ inicio: "2026-10-21", fim: "2026-10-21", vencidos: false });
  });
  it("?periodo=mes_atual recalcula para o mês de HOJE, ignorando as datas velhas da URL", () => {
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "mes_atual", de: "2026-06-01", ate: "2026-06-30" }))
      .toEqual({ inicio: "2026-10-01", fim: "2026-10-31", vencidos: false });
  });
  it("?periodo=personalizado&de=&ate= usa as datas da URL", () => {
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "personalizado", de: "2026-09-01", ate: "2026-09-30" }))
      .toEqual({ inicio: "2026-09-01", fim: "2026-09-30", vencidos: false });
  });
  it("só ?de= (sem ate): a final vem do contexto lembrado, senão de hoje", () => {
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "personalizado", de: "2026-06-28" }))
      .toEqual({ inicio: "2026-06-28", fim: "2026-10-21", vencidos: false });
    expect(periodoInicialDoExtrato({ ...SEM, de: "2026-06-28", contexto: { contaId: "c", periodo: "personalizado", dataInicio: "2026-01-01", dataFim: "2026-07-03" } }))
      .toEqual({ inicio: "2026-06-28", fim: "2026-07-03", vencidos: false });
  });
  it("?de=&ate= sem periodo (a URL nova) vale como estão", () => {
    expect(periodoInicialDoExtrato({ ...SEM, de: "2026-10-05", ate: "2026-10-09" })).toEqual({ inicio: "2026-10-05", fim: "2026-10-09", vencidos: false });
  });
  it("o antigo 'atrasados' abre com a Situação 'Só vencidos em aberto' e as datas em hoje", () => {
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "atrasados" })).toEqual({ inicio: "2026-10-21", fim: "2026-10-21", vencidos: true });
  });
  it("sem URL: o contexto lembrado — atalho recalculado, personalizado com as datas guardadas", () => {
    expect(periodoInicialDoExtrato({ ...SEM, contexto: { contaId: "c", periodo: "semana_atual" } }))
      .toEqual({ inicio: "2026-10-18", fim: "2026-10-24", vencidos: false });
    expect(periodoInicialDoExtrato({ ...SEM, contexto: { contaId: "c", periodo: "personalizado", dataInicio: "2026-08-01", dataFim: "2026-08-31" } }))
      .toEqual({ inicio: "2026-08-01", fim: "2026-08-31", vencidos: false });
  });
  it("valor estranho em periodo= não quebra: cai nas datas/contexto/hoje", () => {
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "constructor" })).toEqual({ inicio: "2026-10-21", fim: "2026-10-21", vencidos: false });
    expect(periodoInicialDoExtrato({ ...SEM, periodoUrl: "inventado", contexto: { contaId: "c", periodo: "toString" as never } }))
      .toEqual({ inicio: "2026-10-21", fim: "2026-10-21", vencidos: false });
  });
});
