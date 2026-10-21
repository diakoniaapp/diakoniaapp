// H2: gerar SÓ a ocorrência do mês que falta (contrato existe, conta do mês nunca foi gerada) — nunca uma segunda, nunca fora da agenda.
import { beforeEach, describe, expect, it, vi } from "vitest";

const inseridos: Record<string, unknown>[] = [];
let recorrencia: Record<string, unknown> | null = null;
let linhasDaRecorrencia: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (tabela: string) => {
      let op: string | null = null; let payload: unknown = null; let colunas = ""; let filtroDescricao = false;
      const b: any = new Proxy({}, {
        get: (_, prop: string) => {
          if (prop === "maybeSingle") return async () => ({ data: tabela === "fin_recorrencias" ? recorrencia : null, error: null });
          if (prop === "then") return (res: (v: unknown) => unknown) => {
            if (op === "insert") { inseridos.push(payload as Record<string, unknown>); return res({ data: [{ id: "nova-1" }], error: null }); }
            // sondagem de coluna e leitura das linhas da recorrência (por vínculo); a 2ª consulta (as sem vínculo, por descrição) volta vazia
            if (tabela === "fin_lancamentos" && colunas.includes("status, data")) return res({ data: filtroDescricao ? [] : linhasDaRecorrencia, error: null });
            return res({ data: [], error: null });
          };
          return (...args: unknown[]) => {
            if (prop === "insert") { op = "insert"; payload = args[0]; }
            else if (prop === "select" && !op) colunas = String(args[0]);
            else if (prop === "eq" && args[0] === "descricao") filtroDescricao = true;
            return b;
          };
        },
      });
      return b;
    },
  },
}));

import { esquecerSondagem, gerarUmaOcorrencia } from "./recorrenciaService";

const verisure = {
  id: "r-ver", descricao: "Verisure — Templo", tipo: "saida", valor: 278.22, valor_variavel: false, conta_id: "bradesco", categoria_id: "cat-seg", centro_custo_id: "cc-adm",
  fornecedor_id: "f-ver", pessoa_id: null, frequencia: "mensal", dia_vencimento: 5, data_inicio: "2026-01-05", data_fim: null, ativo: true, forma_liquidacao: "manual",
  tipo_recorrencia: "continua", total_parcelas: null, fornecedor_nome: "Verisure Brasil",
};

beforeEach(() => { inseridos.length = 0; recorrencia = { ...verisure }; linhasDaRecorrencia = []; esquecerSondagem(); });

describe("gerarUmaOcorrencia", () => {
  it("cria SÓ a ocorrência pedida, com o modelo inteiro do contrato e o vínculo com a recorrência", async () => {
    const r = await gerarUmaOcorrencia("r-ver", "2026-10-05");
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({
      data: "2026-10-05", data_competencia: "2026-10-01", status: "previsto", tipo: "saida", valor: 278.22, origem: "recorrencia", conta_id: "bradesco",
      categoria_id: "cat-seg", centro_custo_id: "cc-adm", fornecedor_id: "f-ver", recorrencia_id: "r-ver", descricao: "Verisure — Templo",
    });
    expect(r).toMatchObject({ id: "nova-1", data: "2026-10-05", valor: 278.22, recorrencia_id: "r-ver", fornecedor_id: "f-ver", fornecedor_nome: "Verisure Brasil" });
  });

  it("recusa a data que não é da agenda do contrato", async () => {
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-07")).rejects.toThrow(/agenda/);
    expect(inseridos).toEqual([]);
  });

  it("recusa quando a ocorrência já tem linha, em qualquer situação — nunca cria uma segunda", async () => {
    linhasDaRecorrencia = [{ id: "x", status: "cancelado", data: "2026-10-05", data_competencia: "2026-10-01", parcela_numero: null }];
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-05")).rejects.toThrow(/já tem conta/);
    expect(inseridos).toEqual([]);
  });

  it("a linha paga em outro dia (a data andou, a competência não) também ocupa a ocorrência", async () => {
    linhasDaRecorrencia = [{ id: "x", status: "conciliado", data: "2026-10-02", data_competencia: "2026-10-01", parcela_numero: null }];
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-05")).rejects.toThrow(/já tem conta/);
  });

  it("recusa contrato parcelado, inativo ou inexistente", async () => {
    recorrencia = { ...verisure, tipo_recorrencia: "parcelamento", total_parcelas: 12, parcela_inicial: 1 };
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-05")).rejects.toThrow(/parcelada/);
    recorrencia = { ...verisure, ativo: false };
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-05")).rejects.toThrow(/inativa/);
    recorrencia = null;
    await expect(gerarUmaOcorrencia("r-ver", "2026-10-05")).rejects.toThrow(/não existe/);
    expect(inseridos).toEqual([]);
  });
});
