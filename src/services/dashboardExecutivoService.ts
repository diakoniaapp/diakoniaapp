import { supabase } from "@/integrations/supabase/client";

export interface SaldoConsolidado {
  saldo_atual: number;
  qtd_contas: number;
  a_pagar_30d: number;
  a_receber_30d: number;
  previsao_30d: number;
  previsao_60d: number;
  previsao_90d: number;
}

export interface FluxoCaixaMes {
  mes: string;        // 'YYYY-MM-01'
  rotulo: string;     // 'Jun/26'
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface CentroCustoAno {
  centro_id: string;
  nome: string;
  realizado: number;
  orcado: number;
  percentual: number | null;
}

export interface IndicadorEclesiastico {
  indicador: string;           // 'Dízimos' | 'Ofertas' | 'Missões'
  total_ano: number;
  total_mes_atual: number;
  total_mes_anterior: number;
  variacao_pct: number | null;
}

export interface AlertaExecutivo {
  severidade: "alta" | "media" | "baixa";
  categoria: "caixa" | "orcamento" | "fiscal" | "concentracao";
  mensagem: string;
  detalhe: string | null;
}

export async function buscarSaldoConsolidado(): Promise<SaldoConsolidado> {
  const { data, error } = await supabase.rpc("fin_exec_saldo_consolidado");
  if (error) throw error;
  return data as unknown as SaldoConsolidado;
}

// Período personalizado (01/10/2026, pedido dela) — sem `periodo`, chama
// a RPC sem argumento e mantém o comportamento de sempre (últimos 12
// meses terminando no mês atual). Com `periodo`, a RPC itera mês a mês
// do início ao fim do intervalo escolhido — qualquer tamanho, não só 12
// (ver migration `fin_exec_fluxo_periodo_personalizado`).
export async function buscarFluxo12m(periodo?: { de: string; ate: string }): Promise<FluxoCaixaMes[]> {
  const { data, error } = await supabase.rpc(
    "fin_exec_fluxo_12m",
    periodo ? { p_de: periodo.de, p_ate: periodo.ate } : undefined,
  );
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    mes: r.mes,
    rotulo: r.rotulo,
    entradas: Number(r.entradas ?? 0),
    saidas: Number(r.saidas ?? 0),
    saldo: Number(r.saldo ?? 0),
  }));
}

export interface ResumoCentro {
  executado: number;
  periodoAnterior: number;
  totalClassificado: number;
}

// "Indicador por Centro de Custo" (01/10/2026) — o único número desse
// bloco que precisa varrer `fin_lancamentos` inteira (pra comparar contra
// TODOS os centros, não só o escolhido) fica no banco; o resto
// (subcentro, evolução, Top Fornecedores/Despesas) vem de
// `listarLancamentosCentroPeriodo` em `finService.ts`, já filtrado por
// centro — ver comentário lá.
export async function buscarResumoCentro(centroId: string, de: string, ate: string): Promise<ResumoCentro> {
  const { data, error } = await supabase.rpc("fin_centro_resumo", {
    p_centro_id: centroId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as any;
  return {
    executado: Number(row?.executado ?? 0),
    periodoAnterior: Number(row?.periodo_anterior ?? 0),
    totalClassificado: Number(row?.total_classificado ?? 0),
  };
}

export interface RankingCategoria {
  categoriaId: string;
  nome: string;
  valor: number;
  colocacao: number;
}

// "Indicador por Categoria" (01/10/2026) — mesmo desenho de
// `buscarResumoCentro`, sem hierarquia (categoria não tem subcentro).
export async function buscarResumoCategoria(categoriaId: string, de: string, ate: string): Promise<ResumoCentro> {
  const { data, error } = await supabase.rpc("fin_categoria_resumo", {
    p_categoria_id: categoriaId, p_de: de, p_ate: ate,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as any;
  return {
    executado: Number(row?.executado ?? 0),
    periodoAnterior: Number(row?.periodo_anterior ?? 0),
    totalClassificado: Number(row?.total_classificado ?? 0),
  };
}

// Todas as categorias com gasto no período, ranqueadas — alimenta "Top 10
// Categorias de Despesas" E a colocação da categoria escolhida no resumo
// executivo, com uma busca só (ver comentário na migration).
export async function buscarRankingCategorias(de: string, ate: string): Promise<RankingCategoria[]> {
  const { data, error } = await supabase.rpc("fin_categorias_ranking", { p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    categoriaId: r.categoria_id, nome: r.nome,
    valor: Number(r.valor ?? 0), colocacao: Number(r.colocacao ?? 0),
  }));
}

export async function buscarCentrosAno(): Promise<CentroCustoAno[]> {
  const { data, error } = await supabase.rpc("fin_exec_centros_ano");
  if (error) throw error;
  return (data ?? []) as CentroCustoAno[];
}

export async function buscarIndicadoresEclesiasticos(): Promise<IndicadorEclesiastico[]> {
  const { data, error } = await supabase.rpc("fin_exec_indicadores_eclesiasticos");
  if (error) throw error;
  return (data ?? []) as IndicadorEclesiastico[];
}

export async function buscarAlertasExecutivos(): Promise<AlertaExecutivo[]> {
  const { data, error } = await supabase.rpc("fin_exec_alertas");
  if (error) throw error;
  return (data ?? []) as AlertaExecutivo[];
}
