// A leitura do Extrato de Obrigações: traz TODOS os estados (previsto, pago, quitado por terceiro, cancelado), junta as irmãs do pagamento parcial que caem fora do período,
// resolve os nomes (inclusive de quem quitou) e aplica os filtros no banco.
import { describe, expect, it, vi } from "vitest";

type Consulta = { tabela: string; passos: [string, unknown[]][] };
const consultas: Consulta[] = [];

const linha = (o: Record<string, unknown>) => ({
  obrigacao_id: null, data: "2026-09-10", status: "previsto", valor: 100, valor_original: null, descricao: "Despesa", documento_numero: null,
  fornecedor_id: "f1", pessoa_id: null, categoria_id: "c1", centro_custo_id: "ce1", projeto_id: null, ...o,
});
const NO_PERIODO = [
  linha({ id: "prev" }),
  linha({ id: "pago", status: "realizado", data: "2026-09-02" }),
  linha({ id: "terc", status: "quitado_terceiro", data: "2026-09-03", fornecedor_id: "f2", valor: 250 }),
  linha({ id: "canc", status: "cancelado", data: "2026-09-04" }),
  linha({ id: "parc", status: "realizado", valor: 60, valor_original: 100, data: "2026-09-05" }),
];
// a parcela com o saldo tem outra data (fora do período) e só chega pela busca das irmãs
const IRMAS = [...NO_PERIODO, linha({ id: "parc2", obrigacao_id: "parc", valor: 40, data: "2026-11-05" })];

vi.mock("@/integrations/supabase/client", () => {
  const criar = (tabela: string) => {
    const c: Consulta = { tabela, passos: [] };
    consultas.push(c);
    const resposta = () => {
      const fez = (n: string) => c.passos.some(p => p[0] === n);
      if (tabela === "fin_lancamentos") return { data: fez("or") ? IRMAS : NO_PERIODO, error: null };
      if (tabela === "vw_fin_quitacao") return { data: [{ obrigacao_id: "terc", responsavel_tipo: "empresa", responsavel_pessoa_id: null, responsavel_fornecedor_id: "f2", intencao: "oferta" }], error: null };
      if (tabela === "fin_fornecedores") return { data: [{ id: "f1", nome: "Papelaria" }, { id: "f2", nome: "Mercado Bom" }], error: null };
      if (tabela === "membros") return { data: [], error: null };
      return { data: [], error: null };
    };
    const proxy: any = new Proxy({}, {
      get: (_t, nome: string) => {
        if (nome === "then") return (ok: (v: unknown) => unknown) => Promise.resolve(resposta()).then(ok);
        return (...args: unknown[]) => { c.passos.push([nome, args]); return proxy; };
      },
    });
    return proxy;
  };
  return { supabase: { from: (t: string) => criar(t) } };
});
vi.mock("@/services/finService", () => ({
  listarCategoriasTodas: async () => [{ id: "c1", nome: "Material de Consumo" }], listarCentrosCustoTodas: async () => [{ id: "ce1", nome: "Ministério Pastoral" }], listarProjetosTodos: async () => [], listarContas: async () => [{ id: "cc1", nome: "Bradesco" }],
}));

import { carregarExtratoDeObrigacoes } from "./extratoDeObrigacoesService";

describe("carregarExtratoDeObrigacoes", () => {
  it("traz previsto, pago, quitado por terceiro e cancelado — nenhuma consulta filtra por status — e junta o pagamento parcial em UMA obrigação", async () => {
    consultas.length = 0;
    const ex = await carregarExtratoDeObrigacoes({ de: "2026-09-01", ate: "2026-09-30" });
    expect(ex.map(x => x.obrigacaoId).sort()).toEqual(["canc", "pago", "parc", "prev", "terc"]);
    const por = Object.fromEntries(ex.map(x => [x.obrigacaoId, x]));
    expect(por.canc.situacao).toBe("cancelada");
    expect(por.terc).toMatchObject({ situacao: "quitada_por_terceiro", valor: 250, responsavel: "Empresa — Mercado Bom", intencao: "Oferta" });
    expect(por.parc).toMatchObject({ situacao: "paga_parcialmente", valor: 100, saldoEmAberto: 40 });
    expect(consultas.filter(c => c.tabela === "fin_lancamentos").some(c => c.passos.some(p => p[0] === "eq" && p[1][0] === "status"))).toBe(false);
  });

  it("lê só despesas (saída), sem transferências, dentro do período, e as irmãs de cada obrigação", async () => {
    consultas.length = 0;
    await carregarExtratoDeObrigacoes({ de: "2026-09-01", ate: "2026-09-30" });
    const doPeriodo = consultas.find(c => c.tabela === "fin_lancamentos" && c.passos.some(p => p[0] === "range"))!;
    expect(doPeriodo.passos).toEqual(expect.arrayContaining([["eq", ["tipo", "saida"]], ["neq", ["origem", "transferencia"]], ["gte", ["data", "2026-09-01"]], ["lte", ["data", "2026-09-30"]]]));
    expect(consultas.some(c => c.tabela === "fin_lancamentos" && c.passos.some(p => p[0] === "or"))).toBe(true);
  });

  it("fornecedor, categoria, centro e projeto viram filtros no banco", async () => {
    consultas.length = 0;
    await carregarExtratoDeObrigacoes({ de: "2026-09-01", ate: "2026-09-30", fornecedorId: "f1", categoriaId: "c1", centroId: "ce1", projetoId: "pr1" });
    const doPeriodo = consultas.find(c => c.tabela === "fin_lancamentos" && c.passos.some(p => p[0] === "range"))!;
    expect(doPeriodo.passos).toEqual(expect.arrayContaining([
      ["eq", ["fornecedor_id", "f1"]], ["eq", ["categoria_id", "c1"]], ["eq", ["centro_custo_id", "ce1"]], ["eq", ["projeto_id", "pr1"]],
    ]));
  });
});
