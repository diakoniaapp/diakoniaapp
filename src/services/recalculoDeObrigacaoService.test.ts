// O serviço do "Recalcular guia": a nova guia é anexada ANTES (o banco exige), a função recebe o id do anexo e o motivo sem espaços sobrando, e os erros chegam claros.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const adicionarAnexo = vi.fn();
const ordem: string[] = [];
let consulta: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => { ordem.push("rpc"); return rpc(...a); },
    from: () => { const p: any = new Proxy({}, { get: (_t, n: string) => (n === "then" ? (ok: (v: unknown) => unknown) => Promise.resolve(consulta).then(ok) : () => p) }); return p; },
  },
}));
vi.mock("@/services/finService", () => ({ adicionarAnexo: (...a: unknown[]) => { ordem.push("anexo"); return adicionarAnexo(...a); } }));

import { listarRecalculos, recalcularGuia } from "./recalculoDeObrigacaoService";

const guia = new File(["%PDF"], "guia.pdf", { type: "application/pdf" });
const pedido = { lancamentoId: "l1", novoValor: 1037.5, juros: 10, multa: 20, correcao: 7.5, motivo: "  Encargos por atraso  ", guia };

beforeEach(() => { rpc.mockReset(); adicionarAnexo.mockReset(); ordem.length = 0; consulta = { data: [], error: null }; adicionarAnexo.mockResolvedValue({ id: "ax1" }); });

describe("recalcularGuia", () => {
  it("anexa a nova guia como tipo 'guia' ANTES de recalcular e manda o id do anexo ao banco", async () => {
    rpc.mockResolvedValue({ data: "rec1", error: null });
    expect(await recalcularGuia(pedido)).toBe("rec1");
    expect(ordem).toEqual(["anexo", "rpc"]);
    expect(adicionarAnexo).toHaveBeenCalledWith("l1", guia, "guia");
    expect(rpc).toHaveBeenCalledWith("fin_recalcular_obrigacao", { p_id: "l1", p_novo_valor: 1037.5, p_juros: 10, p_multa: 20, p_correcao: 7.5, p_motivo: "Encargos por atraso", p_anexo_id: "ax1" });
  });

  it("erro do banco chega com a mensagem e avisa que a guia nova ficou anexada", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Só a Administração e a Tesouraria recalculam a guia de uma obrigação." } });
    await expect(recalcularGuia(pedido)).rejects.toThrow(/Só a Administração e a Tesouraria.*A guia nova ficou anexada/s);
  });

  it("função ainda não aplicada no banco: recado claro sobre a migration", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function public.fin_recalcular_obrigacao in the schema cache" } });
    await expect(recalcularGuia(pedido)).rejects.toThrow(/migration 20261023160000/);
  });

  it("se a guia nem sobe, nada é recalculado", async () => {
    adicionarAnexo.mockRejectedValue(new Error("Arquivo > 5MB"));
    await expect(recalcularGuia(pedido)).rejects.toThrow("Arquivo > 5MB");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("listarRecalculos", () => {
  it("devolve o histórico com números de verdade", async () => {
    consulta = { data: [{ id: "r1", valor_antes: "1000.00", valor_depois: "1037.50", juros: "10", multa: "20", correcao: "7.5", motivo: "x", por_nome: "Ana", em: "2026-10-23T10:00:00Z" }], error: null };
    const r = await listarRecalculos("l1");
    expect(r).toEqual([{ id: "r1", valor_antes: 1000, valor_depois: 1037.5, juros: 10, multa: 20, correcao: 7.5, motivo: "x", por_nome: "Ana", em: "2026-10-23T10:00:00Z" }]);
  });
  it("sem a migration (erro na consulta): lista vazia, nunca derruba o Pagar", async () => {
    consulta = { data: null, error: { message: "relation does not exist" } };
    expect(await listarRecalculos("l1")).toEqual([]);
  });
});
