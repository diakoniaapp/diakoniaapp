// Melhorias da Prestação de Contas (15/10/2026): resumo, despesas financeiras, dízimos do período, fluxo e nomenclatura — de ponta a ponta no serviço,
// com os lançamentos de teste no lugar do banco. A demonstração (receitas, despesas, resultado, saldo) tem de seguir EXATAMENTE como era.
import { describe, expect, it, vi } from "vitest";

const cat = (id: string, nome: string, tipo: string, classificacao_dre: string | null) => ({ id, nome, tipo, classificacao_dre, ativo: true });
const categorias = [
  cat("c-diz", "Dizimos", "entrada", "receitas_regulares"), cat("c-ofe", "Ofertas", "entrada", "receitas_regulares"),
  cat("c-tar", "Tarifas Bancárias", "saida", "despesas_financeiras"), cat("c-cap", "Título de Capitalização", "saida", "despesas_financeiras"),
  cat("c-pre", "Ofertas à Preletores", "saida", "despesas"), cat("c-mat", "Material de Consumo", "saida", "despesas"),
];
const centros = [{ id: "ce-pas", nome: "Min. Pastoral", vinculo_tipo: "ministerio", centro_pai_id: null }];
let seq = 0;
const l = (o: Record<string, unknown>) => ({
  id: `l${++seq}`, status: "realizado", origem: "manual", centro_custo_id: null, pessoa_nome: null, descricao: null, conta_nome: "Bradesco", categoria_nome: null, centro_nome: null, ...o,
});
const lancamentos = [
  l({ tipo: "entrada", data: "2026-09-05", valor: 100, categoria_id: "c-diz", pessoa_nome: "Ana Souza" }),
  l({ tipo: "entrada", data: "2026-10-05", valor: 150, categoria_id: "c-diz", pessoa_nome: "ana souza" }),            // a mesma pessoa em outro mês: conta uma vez
  l({ tipo: "entrada", data: "2026-10-06", valor: 50, categoria_id: "c-diz", pessoa_nome: "Bruno Lima" }),
  l({ tipo: "entrada", data: "2026-10-07", valor: 30, categoria_id: "c-diz", descricao: "OFERTAS NÃO IDENTIFICADAS" }),   // sem nome: conta no total, não na média
  l({ tipo: "saida", data: "2026-09-10", valor: 12, categoria_id: "c-tar" }),
  l({ tipo: "saida", data: "2026-10-10", valor: 100, categoria_id: "c-cap" }),
  l({ tipo: "saida", data: "2026-09-12", valor: 200, categoria_id: "c-pre", centro_custo_id: "ce-pas" }),
  l({ tipo: "saida", data: "2026-09-20", valor: 80, categoria_id: "c-mat", status: "quitado_terceiro", descricao: "Sacolas" }),   // ofertada: fora do caixa
  l({ tipo: "entrada", data: "2026-09-02", valor: 999, categoria_id: null }),                                              // sem categoria: fora da demonstração
];

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({ data: 0, error: null }) } }));
vi.mock("./finService", () => ({
  listarLancamentosSemTeto: async () => lancamentos, listarContas: async () => [{ id: "b1", nome: "Bradesco", saldo_inicial: 1000 }],
  listarCategoriasTodas: async () => categorias, listarCentrosCusto: async () => centros,
  nomeExtrato: (x: { descricao?: string | null }) => ({ principal: x.descricao ?? "—", secundario: null }),
}));
vi.mock("./relatorioNotasService", () => ({ listarNotasDoPeriodo: async () => [] }));

import { gerarCSVPrestacaoContas, gerarPrestacaoContas } from "./prestacaoContasService";
import { despesasFinanceiras, fluxoDoRelatorio, indicadoresGerenciais, resumoExecutivo } from "@/lib/prestacaoIndicadores";

describe("gerarPrestacaoContas — a demonstração segue igual e ganha o que a Diretoria precisa", async () => {
  const r = await gerarPrestacaoContas(2026, 9, 2);

  it("a demonstração de sempre: receitas, despesas, financeiras, resultado e saldo (a compra ofertada e o lançamento sem categoria ficam de fora)", () => {
    expect(r.totalReceitas).toEqual([100, 230]);
    expect(r.totalDespesas).toEqual([200, 0]);
    expect(r.grupoDespesasFinanceiras?.valores).toEqual([12, 100]);
    expect(r.resultado).toEqual([-112, 130]);
    expect(r.saldoFinal).toEqual([888, 1130 - 0]);               // saldo anterior de cada mês é 1000 (o mock devolve movimento 0)
    expect(r.comprasOfertadas.total).toBe(80);
    expect(r.comprasOfertadas.itens).toHaveLength(1);
  });

  it("nomes padronizados na apresentação: 'Ofertas à Preletores' → 'Ofertas a Preletores', 'Dizimos' → 'Dízimos', 'Min. Pastoral' → 'Ministério Pastoral'", () => {
    const g = r.gruposDespesaPorCentro.find(x => x.chave === "ce-pas")!;
    expect(g.titulo).toBe("Ministério Pastoral");
    expect(g.linhas[0].nome).toBe("Ofertas a Preletores");
    expect(r.gruposReceita[0].linhas.map(x => x.nome)).toContain("Dízimos");
  });

  it("indicadores de dízimos do PERÍODO: dizimistas únicos (quem deu em dois meses conta uma vez), total, parte sem nome e média só de quem tem nome", () => {
    expect(r.dizimistasPorMes).toEqual([1, 2]);                   // a linha de sempre, por mês, não mudou
    expect(r.indicadoresDizimos).toEqual({ dizimistasUnicos: 2, valorTotal: 330, valorNaoIdentificado: 30, valorMedio: 150 });
  });

  it("o fluxo tem os lançamentos da demonstração (sem a compra ofertada nem o lançamento sem categoria)", () => {
    expect(r.fluxo).toHaveLength(7);
    expect(r.fluxo.filter(m => m.tipo === "entrada").reduce((s, m) => s + m.valor, 0)).toBe(330);
    expect(r.fluxo.filter(m => m.tipo === "saida").reduce((s, m) => s + m.valor, 0)).toBe(312);
  });

  it("o gráfico fecha com a tabela, em qualquer agrupamento", () => {
    for (const modo of ["diario", "semanal", "mensal", "automatico"] as const) {
      const f = fluxoDoRelatorio(r, modo);
      expect(f.pontos[f.pontos.length - 1].saldo).toBe(r.saldoFinal[1]);
    }
    expect(fluxoDoRelatorio(r, "mensal").pontos.map(p => p.saldo)).toEqual(r.saldoFinal);
  });

  it("resumo executivo e despesas financeiras saem dos mesmos números", () => {
    const s = resumoExecutivo(r);
    expect(s).toMatchObject({ receitaTotal: 330, despesasDosMinisterios: 200, despesasFinanceiras: 112, despesaTotal: 312, resultado: 18, situacao: "superavit", saldoInicial: 1000, saldoFinal: 1130, comprasOfertadasQtd: 1, comprasOfertadasValor: 80 });
    const d = despesasFinanceiras(r);
    expect(d.subgrupos.map(g => [g.titulo, g.total])).toEqual([["Tarifas Bancárias", 12], ["Título de Capitalização", 100], ["Outros encargos financeiros", 0]]);
    expect(indicadoresGerenciais(r, fluxoDoRelatorio(r, "diario").serie).maiorArrecadacao).toEqual({ valor: 230, mes: "Outubro" });
  });

  it("o CSV da versão simples é o de antes: sem o resumo, as despesas financeiras em blocos, os dízimos, os indicadores e o fluxo", () => {
    const csv = gerarCSVPrestacaoContas(r, { simples: true });
    expect(csv).toContain(";;SALDO FINAL;888.00;1130.00");
    for (const novo of ["Resumo Executivo", "Indicadores de Dizimos", "Indicadores Gerenciais", "Fluxo de Caixa", "SUBTOTAL"]) expect(csv).not.toContain(novo);
    expect(csv.split("\n").at(-1)).toBe(";;SALDO FINAL;888.00;1130.00");
    expect(gerarCSVPrestacaoContas(r).startsWith(csv)).toBe(true);        // o completo é o simples + o que foi acrescentado no fim
  });

  it("o CSV de sempre continua igual no começo, e ganha o resumo, as despesas financeiras, os dízimos, os indicadores e o fluxo no fim", () => {
    const csv = gerarCSVPrestacaoContas(r);
    const linhas = csv.split("\n");
    expect(linhas[0]).toBe("Secao;Grupo;Categoria;Setembro;Outubro");
    expect(linhas[1]).toBe(";;Saldo Anterior;1000.00;1000.00");
    expect(csv).toContain(";;SALDO FINAL;888.00;1130.00");
    const iResumo = linhas.findIndex(x => x.startsWith("Resumo Executivo;;Receita Total"));
    expect(iResumo).toBeGreaterThan(linhas.findIndex(x => x.startsWith(";;SALDO FINAL")));
    expect(csv).toContain("Resumo Executivo;;Compras ofertadas por terceiros (fora do caixa) - quantidade;1");
    expect(csv).toContain("Despesas Financeiras;Título de Capitalização;SUBTOTAL;0.00;100.00");
    expect(csv).toContain("Indicadores de Dizimos;;Dizimistas unicos no periodo;2");
    expect(csv).toContain("Indicadores Gerenciais;;Meses com saldo negativo;0 de 2");
    expect(csv).toContain("Fluxo de Caixa (visao diaria);Periodo;Entradas;Saidas;Resultado;Saldo acumulado");
  });
});
