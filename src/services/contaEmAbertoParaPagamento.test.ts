// A porta do lançamento manual (Fase A-1, 13/10/2026): digitar o pagamento de quem tem conta em aberto NÃO cria um segundo registro sem perguntar.
// O banco é simulado com as tabelas que a função toca; o que se confere é a consulta que ela faz e a decisão que devolve.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const tabelas: Record<string, Linha[]> = {};
let consultas: { tabela: string; filtros: [string, string, unknown][] }[] = [];

function builder(tabela: string) {
  const filtros: [string, string, unknown][] = [];
  const b: any = {
    select: () => b,
    eq: (c: string, v: unknown) => { filtros.push([c, "eq", v]); return b; },
    gte: (c: string, v: unknown) => { filtros.push([c, "gte", v]); return b; },
    lte: (c: string, v: unknown) => { filtros.push([c, "lte", v]); return b; },
    in: (c: string, v: unknown) => { filtros.push([c, "in", v]); return b; },
    or: (v: string) => { filtros.push(["or", "or", v]); return b; },
    order: () => b,
    limit: () => b,
    then: (res: (r: unknown) => unknown) => {
      consultas.push({ tabela, filtros });
      const linhas = (tabelas[tabela] ?? []).filter(l => filtros.every(([c, op, v]) => {
        if (op === "eq") return l[c] === v;
        if (op === "gte") return String(l[c]) >= String(v);
        if (op === "lte") return String(l[c]) <= String(v);
        if (op === "in") return (v as unknown[]).includes(l.id);
        return true;
      }));
      return Promise.resolve({ data: linhas, error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => builder(t), rpc: async () => ({ data: null, error: null }) } }));
vi.mock("@/services/finService", () => ({ confirmarPagamento: async () => {} }));
vi.mock("@/services/liquidacaoService", () => ({ liquidacaoDisponivel: async () => false, liquidar: async () => "liq" }));

import { contaEmAbertoParaPagamento } from "./contasJaPagasService";

const CONTA = "bradesco";
const verisure = { id: "ob-verisure", data: "2026-10-05", valor: 278.22, descricao: null, fornecedor_id: "f-verisure", pessoa_id: null, valor_variavel: false, conta_id: CONTA, tipo: "saida", status: "previsto" };
const base = { conta_id: CONTA, data: "2026-10-05", valor: 278.22, fornecedor_id: "f-verisure", pessoa_id: null, descricao: null };

describe("contaEmAbertoParaPagamento", () => {
  beforeEach(() => {
    consultas = [];
    tabelas.fin_lancamentos = [verisure, { ...verisure, id: "ob-outra-conta", conta_id: "caixa" }, { ...verisure, id: "ob-paga", status: "realizado" }];
    tabelas.fin_fornecedores = [{ id: "f-verisure", nome: "Verisure Brasil" }];
    tabelas.membros = [];
  });

  it("o pagamento exato de quem tem a conta em aberto acha a conta — e só a da mesma conta, ainda prevista", async () => {
    const s = await contaEmAbertoParaPagamento(base);
    expect(s?.obrigacao.id).toBe("ob-verisure");
    expect(s).toMatchObject({ diferenca: 0, nivel: "segura", podeSerEstimativa: false });
    const q = consultas.find(c => c.tabela === "fin_lancamentos")!.filtros;
    expect(q).toContainEqual(["status", "eq", "previsto"]);
    expect(q).toContainEqual(["conta_id", "eq", CONTA]);
    expect(q).toContainEqual(["or", "or", "fornecedor_id.eq.f-verisure"]);
  });

  it("sem favorecido não há o que procurar (nem consulta)", async () => {
    expect(await contaEmAbertoParaPagamento({ ...base, fornecedor_id: null })).toBeNull();
    expect(consultas).toHaveLength(0);
  });

  it("outro favorecido, valor muito diferente de documento fixo ou vencimento fora da janela: nada", async () => {
    expect(await contaEmAbertoParaPagamento({ ...base, fornecedor_id: "f-outro" })).toBeNull();
    expect(await contaEmAbertoParaPagamento({ ...base, valor: 1000 })).toBeNull();
    expect(await contaEmAbertoParaPagamento({ ...base, data: "2027-03-01" })).toBeNull();
  });

  it("valor um pouco diferente de documento fixo: achada, mas pede a decisão (juros, multa ou desconto)", async () => {
    const s = await contaEmAbertoParaPagamento({ ...base, valor: 290 });
    expect(s).toMatchObject({ nivel: "conferir", podeSerEstimativa: false });
    expect(s!.diferenca).toBeCloseTo(11.78, 2);
  });

  it("conta de valor estimado paga com outro valor: pode ser o valor real", async () => {
    tabelas.fin_lancamentos = [{ ...verisure, valor_variavel: true, valor: 380 }];
    const s = await contaEmAbertoParaPagamento({ ...base, valor: 760 });
    expect(s).toMatchObject({ podeSerEstimativa: true, nivel: "conferir" });
  });
});
