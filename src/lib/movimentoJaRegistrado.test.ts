import { describe, expect, it } from "vitest";
import { acharJaRegistrados, fitidsDasObservacoes, type LancamentoComDono, type MovimentoDoArquivo } from "./movimentoJaRegistrado";

const lanc = (id: string, extra: Partial<LancamentoComDono> = {}): LancamentoComDono => ({
  id, tipo: "saida", valor: 278.22, data: "2026-10-05", data_pagamento: null, fitids: ["N11F17"], origem: "recorrencia", status: "conciliado",
  criadoEm: "2026-10-08T13:24:00Z", rotulo: "Verisure", ...extra,
});
const linha = (fitid: string, extra: Partial<MovimentoDoArquivo> = {}): MovimentoDoArquivo => ({ fitid, tipo: "saida", valor: 278.22, data: "2026-10-05", ...extra });
const nenhum = new Set<string>();

describe("H0 — o movimento já está registrado (o FITID do banco muda a cada exportação)", () => {
  it("o caso Verisure: mesmo valor e dia, identificador diferente → o lançamento antigo é o par", () => {
    const r = acharJaRegistrados([linha("N105B3")], [lanc("a")], new Set(["N105B3"]));
    expect(r.get("N105B3")?.lancamento.id).toBe("a");
    expect(r.get("N105B3")?.fitidAntigo).toBe("N11F17");
    expect(r.get("N105B3")?.motivo).toContain("N11F17");
  });

  it("a recorrência vence dia 05 e o banco debitou dia 02: vale o dia do pagamento", () => {
    const l = lanc("a", { valor: 760, data: "2026-10-05", data_pagamento: "2026-10-02" });
    const r = acharJaRegistrados([linha("N10335", { valor: 760, data: "2026-10-02" })], [l], nenhum);
    expect(r.get("N10335")?.lancamento.id).toBe("a");
    expect(r.get("N10335")?.mesmoDiaDePagamento).toBe(true);
  });

  it("pareamento 1 para 1: dois PIX de R$ 20 no mesmo dia, um só lançamento antigo → só UMA linha casa", () => {
    const l = lanc("a", { tipo: "entrada", valor: 20, fitids: ["N11EED"], origem: "importado_ofx" });
    const r = acharJaRegistrados([linha("X1", { tipo: "entrada", valor: 20 }), linha("X2", { tipo: "entrada", valor: 20 })], [l], nenhum);
    expect([...r.keys()]).toEqual(["X1"]);
  });

  it("dois lançamentos antigos e duas linhas: o n-ésimo com o n-ésimo, sem repetir lançamento", () => {
    const a = lanc("a", { fitids: ["A"], criadoEm: "2026-10-08T10:00:00Z" });
    const b = lanc("b", { fitids: ["B"], criadoEm: "2026-10-08T11:00:00Z" });
    const r = acharJaRegistrados([linha("X1"), linha("X2")], [b, a], nenhum);
    expect(r.get("X1")?.lancamento.id).toBe("a");
    expect(r.get("X2")?.lancamento.id).toBe("b");
  });

  it("lançamento cujo identificador está NESTE arquivo pertence a uma linha daqui: não é par de outra", () => {
    const l = lanc("a", { fitids: ["N105B3"] });
    expect(acharJaRegistrados([linha("OUTRA")], [l], new Set(["N105B3", "OUTRA"])).size).toBe(0);
  });

  it("valor, sentido ou dia diferentes não casam", () => {
    const l = lanc("a");
    const r = acharJaRegistrados([
      linha("V", { valor: 278.23 }), linha("T", { tipo: "entrada" }), linha("D", { data: "2026-10-06" }),
    ], [l], nenhum);
    expect(r.size).toBe(0);
  });

  it("previsto e lançamento sem marca do banco nunca entram (esses seguem as outras regras)", () => {
    const r = acharJaRegistrados([linha("X")], [lanc("p", { status: "previsto" }), lanc("s", { fitids: [] })], nenhum);
    expect(r.size).toBe(0);
  });

  it("o dia do pagamento vence o simples vencimento igual quando há dois candidatos", () => {
    const soVenceu = lanc("v", { fitids: ["A"], criadoEm: "2026-10-01T00:00:00Z" });
    const pagouNoDia = lanc("p", { fitids: ["B"], data: "2026-10-09", data_pagamento: "2026-10-05", criadoEm: "2026-10-02T00:00:00Z" });
    expect(acharJaRegistrados([linha("X")], [soVenceu, pagouNoDia], nenhum).get("X")?.lancamento.id).toBe("p");
  });
});

describe("fitidsDasObservacoes", () => {
  it("lê todas as marcas do OFX e ignora as do PDF do Invest Fácil", () => {
    expect(fitidsDasObservacoes("[ofx:N11F17] [debito-automatico]\n[ofx:N105B3]\n[ofx:PDF:abc]")).toEqual(["N11F17", "N105B3"]);
    expect(fitidsDasObservacoes(null)).toEqual([]);
  });
});
