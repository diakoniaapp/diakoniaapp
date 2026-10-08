import { describe, expect, it } from "vitest";
import { acharContrapartes, ehDepositoEmDinheiro, type CandidatoContraparte, type LinhaParaTransferencia } from "./transferenciaOfx";

const linha = (fitid: string, p: Partial<LinhaParaTransferencia> = {}): LinhaParaTransferencia =>
  ({ fitid, tipo: "entrada", data: "2026-09-10", valor: 535, memo: "DEP DINHEIRO ATM AG00448MAQ007616SEQ03221", temFavorecido: false, ...p });
const cand = (id: string, p: Partial<CandidatoContraparte> = {}): CandidatoContraparte =>
  ({ id, contaId: "env", contaNome: "Caixa de Envelopes", tipo: "saida", data: "2026-09-10", valor: 535, ...p });

describe("depósito em dinheiro", () => {
  it("reconhece o texto do banco", () => {
    expect(ehDepositoEmDinheiro("DEP DINHEIRO ATM AG00448MAQ007616SEQ03221")).toBe(true);
    expect(ehDepositoEmDinheiro("DEPOSITO EM CAIXA ELETRONICO")).toBe(true);
    expect(ehDepositoEmDinheiro("DEP ENVELOPE")).toBe(true);
    expect(ehDepositoEmDinheiro("PIX RECEBIDO REM: MARIA REGINA MENEZES")).toBe(false);
  });
});

describe("contraparte em outra conta", () => {
  it("entrada no banco ↔ saída do caixa, mesmo valor e mesma data: 95%", () => {
    const r = acharContrapartes([linha("a")], [cand("c1")]);
    expect(r.get("a")).toMatchObject({ contaId: "env", contaNome: "Caixa de Envelopes", lancamentoId: "c1", confianca: 95, outras: [] });
  });
  it("datas próximas valem menos; passou de 5 dias não casa; valor diferente não casa; mesmo tipo não casa", () => {
    expect(acharContrapartes([linha("a")], [cand("c", { data: "2026-09-11" })]).get("a")?.confianca).toBe(92);
    expect(acharContrapartes([linha("a")], [cand("c", { data: "2026-09-13" })]).get("a")?.confianca).toBe(85);
    expect(acharContrapartes([linha("a")], [cand("c", { data: "2026-09-15" })]).get("a")?.confianca).toBe(75);
    expect(acharContrapartes([linha("a")], [cand("c", { data: "2026-09-16" })]).size).toBe(0);
    expect(acharContrapartes([linha("a")], [cand("c", { valor: 535.01 })]).size).toBe(0);
    expect(acharContrapartes([linha("a")], [cand("c", { tipo: "entrada" })]).size).toBe(0);
  });
  it("saída do banco casa com a ENTRADA na outra conta (aplicação)", () => {
    const r = acharContrapartes([linha("s", { tipo: "saida", memo: "APLIC INVEST FACIL" })], [cand("c", { tipo: "entrada", contaId: "apl", contaNome: "Aplicação" })]);
    expect(r.get("s")).toMatchObject({ contaNome: "Aplicação", confianca: 95 });
  });
  it("cada perna serve a UMA linha: a de data mais próxima fica com ela", () => {
    const r = acharContrapartes(
      [linha("longe", { data: "2026-09-13" }), linha("perto", { data: "2026-09-10" })],
      [cand("c1", { data: "2026-09-10" })]);
    expect(r.has("perto")).toBe(true);
    expect(r.has("longe")).toBe(false);
  });
  it("duas contas igualmente compatíveis: sugere a mais próxima, mas com 10 pontos a menos e a outra à vista", () => {
    const r = acharContrapartes([linha("a")], [cand("c1"), cand("c2", { contaId: "cx", contaNome: "Caixinha Administrativo" })]);
    expect(r.get("a")?.confianca).toBe(85);
    expect(r.get("a")?.outras).toHaveLength(1);
  });
  it("PIX de alguém já identificado pesa contra: teto de 70%; depósito em dinheiro não sofre o teto", () => {
    expect(acharContrapartes([linha("a", { memo: "PIX RECEBIDO MARIA", temFavorecido: true })], [cand("c1")]).get("a")?.confianca).toBe(70);
    expect(acharContrapartes([linha("a", { temFavorecido: true })], [cand("c1")]).get("a")?.confianca).toBe(95);
  });
});
