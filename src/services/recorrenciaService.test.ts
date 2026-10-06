import { beforeEach, describe, expect, it, vi } from "vitest";

// Um banco de mentira que só registra o que o serviço faz: a geração é o ponto de falha que a
// Telma viu em produção (parcelas cortadas em dezembro), então o teste passa pelo serviço inteiro.
interface Estado { tabela: string; op: string | null; payload: unknown; colunas: string | null; filtros: [string, unknown[]][] }
const inseridos: Record<string, unknown>[][] = [];
const atualizacoes: { tabela: string; payload: unknown }[] = [];
let colunasAusentes: string[] = [];

function responder(e: Estado) {
  if (e.op === "insert") {
    const linhas = e.payload as Record<string, unknown>[];
    inseridos.push(linhas);
    return { data: linhas.map((_, i) => ({ id: `novo-${i}` })), error: null };
  }
  if (e.op === "update") { atualizacoes.push({ tabela: e.tabela, payload: e.payload }); return { data: [{ id: "x" }], error: null }; }
  // sondagem de coluna: select("recorrencia_id").limit(1)
  if (e.colunas && colunasAusentes.includes(e.colunas)) return { data: null, error: { code: "42703", message: `column ${e.colunas} does not exist` } };
  return { data: [], error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (tabela: string) => {
      const e: Estado = { tabela, op: null, payload: null, colunas: null, filtros: [] };
      const b: any = new Proxy({}, {
        get: (_, prop: string) => {
          if (prop === "then") return (res: (v: unknown) => unknown) => res(responder(e));
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "update") { e.op = prop; e.payload = args[0]; }
            else if (prop === "select" && !e.op) e.colunas = String(args[0]);
            else e.filtros.push([prop, args]);
            return b;
          };
        },
      });
      return b;
    },
  },
}));

import { esquecerSondagem, gerarOcorrencias } from "./recorrenciaService";
import type { FinRecorrencia } from "@/services/finService";

const carlos = {
  id: "rec-1", descricao: "RPA Carlos Eduardo", tipo: "saida", valor: 380, valor_variavel: false,
  conta_id: "bradesco", categoria_id: "cat-rpa", centro_custo_id: "cc-adm-serv", fornecedor_id: null, pessoa_id: "pessoa-carlos",
  frequencia: "mensal", dia_vencimento: 5, data_inicio: "2026-10-05", data_fim: null, ativo: true,
  ajusta_dia_util: false, lembrar_5d: true, lembrar_1d: true, lembrar_dia: true, ultimo_gerado_ate: null, observacao: null,
  forma_liquidacao: "manual", tipo_recorrencia: "parcelamento", total_parcelas: 12, parcela_inicial: 1,
} as unknown as FinRecorrencia;

beforeEach(() => { inseridos.length = 0; atualizacoes.length = 0; colunasAusentes = []; esquecerSondagem(); });

describe("gerarOcorrencias — o caso dela", () => {
  it("12 parcelas a partir de 05/10/2026 viram 12 previstos até 05/09/2027, já com o favorecido e o modelo", async () => {
    const r = await gerarOcorrencias(carlos, "2026-10-06");
    expect(r.criados).toBe(12);
    expect(r.ultimaData).toBe("2027-09-05");
    const linhas = inseridos.flat();
    expect(linhas).toHaveLength(12);
    expect(linhas.map(l => l.data)).toEqual([
      "2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05", "2027-03-05",
      "2027-04-05", "2027-05-05", "2027-06-05", "2027-07-05", "2027-08-05", "2027-09-05",
    ]);
    for (const l of linhas) {
      expect(l).toMatchObject({
        tipo: "saida", status: "previsto", origem: "recorrencia", conta_id: "bradesco", categoria_id: "cat-rpa",
        centro_custo_id: "cc-adm-serv", pessoa_id: "pessoa-carlos", valor: 380, recorrencia_id: "rec-1", parcela_total: 12,
      });
    }
    expect(linhas[0]).toMatchObject({ parcela_numero: 1, descricao: "RPA Carlos Eduardo (1/12)", data_competencia: "2026-10-01" });
    expect(linhas[11]).toMatchObject({ parcela_numero: 12, descricao: "RPA Carlos Eduardo (12/12)" });
    // a recorrência passa a lembrar até onde gerou
    expect(atualizacoes.some(a => a.tabela === "fin_recorrencias" && (a.payload as any).ultimo_gerado_ate === "2027-09-05")).toBe(true);
  });

  it("fornecedor (empresa) vai em fornecedor_id, não em pessoa_id", async () => {
    await gerarOcorrencias({ ...carlos, fornecedor_id: "amil", pessoa_id: null, tipo_recorrencia: "continua", total_parcelas: null } as FinRecorrencia, "2026-10-06");
    const l = inseridos.flat()[0];
    expect(l.fornecedor_id).toBe("amil");
    expect(l.pessoa_id).toBeUndefined();
    expect(l.parcela_numero).toBeUndefined();
    expect(l.descricao).toBe("RPA Carlos Eduardo");
  });

  it("a contínua sem fim gera 12 meses à frente, não os 90 dias que cortavam em dezembro", async () => {
    await gerarOcorrencias({ ...carlos, tipo_recorrencia: "continua", total_parcelas: null } as FinRecorrencia, "2026-10-06");
    const datas = inseridos.flat().map(l => String(l.data));
    expect(datas[datas.length - 1]).toBe("2027-10-05");
    expect(datas.length).toBeGreaterThanOrEqual(12);
  });

  it("antes das migrations: gera igual (datas e favorecido de fornecedor), só sem os campos novos", async () => {
    colunasAusentes = ["recorrencia_id", "forma_liquidacao", "pessoa_id"];
    await gerarOcorrencias({ ...carlos, fornecedor_id: "f1", pessoa_id: null } as FinRecorrencia, "2026-10-06");
    const linhas = inseridos.flat();
    expect(linhas).toHaveLength(12);
    expect(linhas[0].fornecedor_id).toBe("f1");
    for (const k of ["recorrencia_id", "parcela_numero", "parcela_total", "forma_liquidacao", "pessoa_id"]) expect(linhas[0]).not.toHaveProperty(k);
  });
});
