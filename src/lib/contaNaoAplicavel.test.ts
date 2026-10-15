import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/finService", () => ({ nomeExtrato: () => ({ principal: "", secundario: null }) }));
vi.mock("@/services/painelTesourariaService", () => ({}));

import { CONTA_NAO_APLICAVEL_ID, NOME_CONTA_NAO_APLICAVEL } from "./quitacao";

const raiz = path.resolve(__dirname, "../..");
const sql = (f: string) => fs.readFileSync(path.join(raiz, f), "utf8");

// O id e o nome da conta estrutural vivem em DOIS lugares (o banco e o código). Estes testes impedem que um deles mude sozinho.
describe("a conta estrutural \"Não Aplicável (Compras Pagas por Terceiros)\"", () => {
  const migration = sql("supabase/migrations/20261016140100_fin_conta_nao_aplicavel.sql");

  it("o id do código é o mesmo do banco", () => {
    expect(migration).toContain(`'${CONTA_NAO_APLICAVEL_ID}'`);
  });
  it("o nome do código é o mesmo do banco", () => {
    expect(migration).toContain(`'${NOME_CONTA_NAO_APLICAVEL}'`);
  });
  it("o banco só aceita previsto, quitado_terceiro e cancelado nela, e recusa entrada e transferência", () => {
    expect(migration).toMatch(/NOT IN \('previsto', 'quitado_terceiro', 'cancelado'\)/);
    expect(migration).toMatch(/NEW\.tipo::text <> 'saida' OR NEW\.origem IS NOT DISTINCT FROM 'transferencia'/);
  });
  it("é inativa, de saldo zero e não aceita receita, despesa nem transferência", () => {
    expect(migration).toMatch(/ativo = false AND saldo_inicial = 0 AND saldo_atual = 0/);
    expect(migration).toMatch(/aceita_receitas = false AND aceita_despesas = false AND aceita_transferencia_entrada = false AND aceita_transferencia_saida = false/);
  });
  it("o rollback devolve a oferta à conta anterior e só então remove a conta", () => {
    const rollback = sql("docs/CONTA_NEUTRA_ROLLBACK.sql");
    expect(rollback.indexOf("DROP TRIGGER IF EXISTS fin_lanc_conta_neutra")).toBeLessThan(rollback.indexOf("SET conta_id = a.conta_anterior_id"));
    expect(rollback.indexOf("SET conta_id = a.conta_anterior_id")).toBeLessThan(rollback.indexOf("DELETE FROM public.fin_contas"));
  });
});

describe("a prestação de contas: compras ofertadas ficam fora do caixa", async () => {
  const { gerarCSVPrestacaoContas } = await import("@/services/prestacaoContasService");
  const base = {
    meses: [{ ano: 2026, numero: 9, nome: "Setembro" }, { ano: 2026, numero: 10, nome: "Outubro" }],
    mesAncoraNota: { ano: 2026, mes: 10 }, saldoAnterior: [100, 100],
    gruposReceita: [], totalReceitas: [0, 0], gruposDespesaPorCentro: [], totalDespesas: [0, 0],
    grupoDespesasFinanceiras: null, grupoOutrasDespesas: null, resultado: [0, 0], saldoFinal: [100, 100],
    qtdLancamentos: 0, dizimistasPorMes: [0, 0], excluidos: { porMotivo: {}, itens: [] },
  };

  it("aparecem em seção própria e não mudam resultado nem saldo", () => {
    const csv = gerarCSVPrestacaoContas({
      ...base,
      comprasOfertadas: { itens: [{ id: "a", data: "2026-09-05", favorecido: "Sacolas Ltda", descricao: null, valor: 117.9, categoriaNome: "Material de consumo", centroNome: null }], porMes: [117.9, 0], total: 117.9 },
    } as never);
    expect(csv).toContain("Compras ofertadas por terceiros (fora do caixa);Material de consumo;Sacolas Ltda (2026-09-05);117.90;0.00");
    expect(csv).toContain("Compras ofertadas por terceiros (fora do caixa);;TOTAL;117.90;0.00");
    expect(csv).toContain(";;Saldo Anterior;100.00;100.00");
  });

  it("sem oferta no período, o arquivo é o de antes (nenhuma linha nova)", () => {
    const csv = gerarCSVPrestacaoContas({ ...base, comprasOfertadas: { itens: [], porMes: [0, 0], total: 0 } } as never);
    expect(csv).not.toContain("Compras ofertadas");
  });
});
