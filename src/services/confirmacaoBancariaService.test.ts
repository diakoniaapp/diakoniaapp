import { beforeEach, describe, expect, it, vi } from "vitest";

// um construtor de consulta mínimo: qualquer encadeamento devolve ele mesmo e, ao ser aguardado, entrega o que a "tabela" tem
type Resposta = { data: unknown[]; error: { message: string } | null };
const tabelas: Record<string, Resposta> = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "is", "not"]) q[m] = () => q;
      q.then = (ok: (r: Resposta) => unknown) => Promise.resolve(tabelas[t] ?? { data: [], error: null }).then(ok);
      return q;
    },
  },
}));

import { confirmacoesBancarias } from "./confirmacaoBancariaService";

beforeEach(() => { for (const k of Object.keys(tabelas)) delete tabelas[k]; });

describe("confirmacoesBancarias", () => {
  it("o vínculo ativo com a linha do OFX ou do PDF confirma o lançamento", async () => {
    tabelas.fin_extrato_vinculos = { error: null, data: [
      { lancamento_id: "a", origem: "ofx", fitid: "N1" },
      { lancamento_id: "b", origem: "pdf", fitid: "PDF:2026-10-08:265.84" },
    ] };
    const m = await confirmacoesBancarias(["a", "b", "c"]);
    expect(m.get("a")).toBe("ofx");
    expect(m.get("b")).toBe("pdf");
    expect(m.has("c")).toBe(false);
  });
  it("se há OFX e PDF, vale o OFX (a linha do próprio banco)", async () => {
    tabelas.fin_extrato_vinculos = { error: null, data: [
      { lancamento_id: "a", origem: "ofx", fitid: "N1" },
      { lancamento_id: "a", origem: "pdf", fitid: "PDF:x" },
    ] };
    expect((await confirmacoesBancarias(["a"])).get("a")).toBe("ofx");
  });
  it("a liquidação que guardou o FITID do banco confirma todas as faturas dela (caso Light)", async () => {
    tabelas.fin_lancamentos = { error: null, data: [{ id: "set", liquidacao_id: "L1" }, { id: "out", liquidacao_id: "L1" }] };
    tabelas.fin_liquidacoes = { error: null, data: [{ id: "L1", ofx_fitid: "N10DBB" }] };
    const m = await confirmacoesBancarias(["set", "out", "outra"]);
    expect(m.get("set")).toBe("ofx");
    expect(m.get("out")).toBe("ofx");
    expect(m.has("outra")).toBe(false);
  });
  it("sem a tabela (migration não aplicada) ou sem permissão: ninguém está confirmado, nada quebra", async () => {
    tabelas.fin_extrato_vinculos = { error: { message: "relation does not exist" }, data: [] };
    expect((await confirmacoesBancarias(["a"])).size).toBe(0);
  });
  it("lista vazia não consulta nada", async () => {
    expect((await confirmacoesBancarias([])).size).toBe(0);
  });
});
