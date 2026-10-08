import { describe, expect, it } from "vitest";
import {
  modoDoBeneficiario, sugerirCompetencia, temSaldoPendente, situacaoDaCompetencia, resumirBeneficiario,
  rotuloCompetencia, mesSeguinte, type CompetenciaParaSugestao, type LinhaDaCompetencia,
} from "./sustento";

const c = (competencia: string, o: Partial<CompetenciaParaSugestao> = {}): CompetenciaParaSugestao => ({
  competencia, status: "fechada", modo: "avancado", liquidoPrevisto: 13728, saldoAPagar: 0, ...o,
});

describe("modoDoBeneficiario", () => {
  it("o tipo decide: titular é avançado, os demais simples", () => {
    expect(modoDoBeneficiario({ tipo: "pastor_titular" })).toBe("avancado");
    expect(modoDoBeneficiario({ tipo: "pastor_missionario" })).toBe("simples");
    expect(modoDoBeneficiario({ tipo: "prebenda" })).toBe("simples");
  });
  it("a exceção vale a partir da data e não reinterpreta o passado", () => {
    const b = { tipo: "pastor_missionario" as const, modoManual: "avancado" as const, modoManualDesde: "2026-10-01" };
    expect(modoDoBeneficiario(b, "2026-09-01")).toBe("simples");
    expect(modoDoBeneficiario(b, "2026-10-01")).toBe("avancado");
    expect(modoDoBeneficiario(b)).toBe("avancado");
  });
});

describe("sugerirCompetencia — a hierarquia que ela definiu", () => {
  it("1. competência com saldo pendente: agosto R$ 3.428 e PIX em 01/09 → agosto", () => {
    const s = sugerirCompetencia("2026-09-01", [c("2026-08-01", { saldoAPagar: 3428 }), c("2026-09-01", { status: "aberta", saldoAPagar: 0 })]);
    expect(s.competencia).toBe("2026-08-01");
    expect(s.motivo).toBe("saldo_pendente");
    expect(s.explicacao).toContain("Agosto/2026");
    expect(s.explicacao).toContain("3.428,00");
  });
  it("com saldo pendente, o dia 20 não decide nada: 25/09 ainda quita agosto", () => {
    const s = sugerirCompetencia("2026-09-25", [c("2026-08-01", { saldoAPagar: 3428 })]);
    expect(s.competencia).toBe("2026-08-01");
  });
  it("escolhe a MAIS ANTIGA entre várias pendentes", () => {
    const s = sugerirCompetencia("2026-10-03", [c("2026-09-01", { saldoAPagar: 100 }), c("2026-07-01", { saldoAPagar: 50 }), c("2026-08-01", { saldoAPagar: 70 })]);
    expect(s.competencia).toBe("2026-07-01");
  });
  it("2. sem pendência, até o dia 20 → competência atual (adiantamento de 09/09 → setembro)", () => {
    const s = sugerirCompetencia("2026-09-09", [c("2026-08-01", { status: "paga", saldoAPagar: -1 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "atual" });
  });
  it("o dia 20 ainda é do mês corrente", () => {
    expect(sugerirCompetencia("2026-08-20", []).competencia).toBe("2026-08-01");
  });
  it("3. sem pendência, depois do dia 20 → próxima (21/08 → setembro; 21/12 → janeiro do ano seguinte)", () => {
    expect(sugerirCompetencia("2026-08-21", []).competencia).toBe("2026-09-01");
    expect(sugerirCompetencia("2026-12-21", []).competencia).toBe("2027-01-01");
    expect(sugerirCompetencia("2026-08-21", []).motivo).toBe("proxima");
  });
  it("a competência aberta do avançado NÃO é dívida: adiantamento de 09/09 com setembro já tendo adiantamento fica em setembro", () => {
    const s = sugerirCompetencia("2026-09-15", [c("2026-09-01", { status: "aberta", liquidoPrevisto: 0, saldoAPagar: -4000 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "atual" });
  });
  it("competência de mês futuro não disputa o item 1", () => {
    const s = sugerirCompetencia("2026-09-05", [c("2026-10-01", { saldoAPagar: 999 })]);
    expect(s.competencia).toBe("2026-09-01");
  });
  it("modo simples: valor previsto sem pagamento já é pendência", () => {
    const s = sugerirCompetencia("2026-10-05", [c("2026-09-01", { modo: "simples", status: "aberta", liquidoPrevisto: 2362, saldoAPagar: 2362 })]);
    expect(s).toMatchObject({ competencia: "2026-09-01", motivo: "saldo_pendente" });
  });
});

describe("temSaldoPendente", () => {
  it("paga, zerada ou com pagamento a maior (−R$ 1,00) não pende", () => {
    expect(temSaldoPendente(c("2026-08-01", { status: "paga", saldoAPagar: 5 }))).toBe(false);
    expect(temSaldoPendente(c("2026-08-01", { saldoAPagar: 0 }))).toBe(false);
    expect(temSaldoPendente(c("2026-08-01", { saldoAPagar: -1 }))).toBe(false);
  });
  it("avançado só pende depois de fechado", () => {
    expect(temSaldoPendente(c("2026-09-01", { status: "aberta", saldoAPagar: 5728 }))).toBe(false);
    expect(temSaldoPendente(c("2026-09-01", { status: "fechada", saldoAPagar: 5728 }))).toBe(true);
  });
});

const linha = (o: Partial<LinhaDaCompetencia>): LinhaDaCompetencia => ({
  ...c("2026-09-01"), adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, nItens: 0, ...o,
});

describe("situacaoDaCompetencia e resumo", () => {
  it("simples: Prevista → Paga parcialmente → Paga integralmente", () => {
    expect(situacaoDaCompetencia(linha({ modo: "simples", status: "aberta", liquidoPrevisto: 2362, saldoAPagar: 2362 }))).toBe("Prevista");
    expect(situacaoDaCompetencia(linha({ modo: "simples", liquidoPrevisto: 2362, saldoAPagar: 1000, pagamentosSimples: 1362 }))).toBe("Paga parcialmente");
    expect(situacaoDaCompetencia(linha({ modo: "simples", liquidoPrevisto: 2362, saldoAPagar: 0, pagamentosSimples: 2362 }))).toBe("Paga integralmente");
  });
  it("avançado: Aberta → A pagar → Paga", () => {
    expect(situacaoDaCompetencia(linha({ status: "aberta", adiantamentos: 8000, saldoAPagar: -8000, liquidoPrevisto: 0 }))).toBe("Aberta");
    expect(situacaoDaCompetencia(linha({ status: "fechada", adiantamentos: 8000, saldoAPagar: 5728 }))).toBe("A pagar");
    expect(situacaoDaCompetencia(linha({ status: "fechada", saldoAPagar: -1 }))).toBe("Paga");
  });
  it("o resumo soma só o que pende e separa o adiantado em competência aberta", () => {
    const r = resumirBeneficiario([
      linha({ competencia: "2026-09-01", status: "fechada", saldoAPagar: 5728.1, adiantamentos: 8000 }),
      linha({ competencia: "2026-08-01", status: "paga", saldoAPagar: -1 }),
      linha({ competencia: "2026-10-01", status: "aberta", adiantamentos: 4000, saldoAPagar: -4000, liquidoPrevisto: 0 }),
    ]);
    expect(r.saldoPendente).toBe(5728.1);
    expect(r.pendentes).toEqual(["2026-09-01"]);
    expect(r.adiantadoEmAberto).toBe(4000);
  });
});

describe("datas", () => {
  it("rótulo e mês seguinte", () => {
    expect(rotuloCompetencia("2026-09-01")).toBe("setembro/2026");
    expect(mesSeguinte("2026-12-15")).toBe("2027-01-01");
    expect(mesSeguinte("2026-01-31")).toBe("2026-02-01");
  });
});
