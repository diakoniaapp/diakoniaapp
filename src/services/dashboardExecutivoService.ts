import { supabase } from "@/integrations/supabase/client";
import { serieDiaria, type DiaFluxo, type Movimento } from "@/lib/fluxoCaixa";

export interface SaldoConsolidado {
  saldo_atual: number;
  qtd_contas: number;
  a_pagar_30d: number;
  a_receber_30d: number;
  previsao_30d: number;
  previsao_60d: number;
  previsao_90d: number;
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

// Fluxo de caixa DIÁRIO (03/10/2026, pedido dela). Até 01/10 o gráfico vinha da RPC
// `fin_exec_fluxo_12m`, que só sabe somar por MÊS — um período de 15 dias virava um ou
// dois pontos mensais. Agora a base é o dia: busca os movimentos realizados do período e
// o saldo de abertura, e `serieDiaria` (lib/fluxoCaixa.ts) monta um ponto por dia.
//
// Sem migration nova: o saldo é reconstruído com o que já existe —
// `fin_contas.saldo_inicial` + `fin_movimento_antes_de(data, conta)` (a mesma soma do
// gatilho `fin_recalc_saldo_conta`) — e, medido em 03/10/2026, a soma das 6 contas
// bate com `fin_exec_saldo_consolidado().saldo_atual` até o centavo. A RPC mensal
// segue no banco, mas esta tela não a usa mais.
const PAGINA_MOV = 1000;

export async function buscarFluxoDiario(de: string, ate: string): Promise<DiaFluxo[]> {
  // Só contas ATIVAS: é a base do "Saldo total" que a própria tela mostra.
  const { data: contas, error: eContas } = await supabase
    .from("fin_contas").select("id, saldo_inicial").eq("ativo", true);
  if (eContas) throw eContas;
  const ids = (contas ?? []).map(c => c.id);
  if (ids.length === 0) return serieDiaria([], 0, de, ate);

  // saldo ANTES do primeiro dia, conta a conta (a função soma no banco, sem o teto de linhas)
  const antes = await Promise.all(ids.map(id =>
    supabase.rpc("fin_movimento_antes_de", { p_data_limite_exclusiva: de, p_conta_id: id })));
  let saldoAbertura = 0;
  antes.forEach((r, i) => {
    if (r.error) throw r.error;
    saldoAbertura += Number(contas![i].saldo_inicial ?? 0) + Number(r.data ?? 0);
  });

  const filtro = () => supabase.from("fin_lancamentos")
    .select("data, tipo, valor, origem", { count: "exact" })
    .in("status", ["realizado", "conciliado"]).in("conta_id", ids)
    .gte("data", de).lte("data", ate).order("data").order("id");

  // 1ª página já traz o total; as demais saem em paralelo
  const primeira = await filtro().range(0, PAGINA_MOV - 1);
  if (primeira.error) throw primeira.error;
  const linhas = [...(primeira.data ?? [])];
  const total = primeira.count ?? linhas.length;
  if (total > PAGINA_MOV) {
    const restantes = await Promise.all(
      Array.from({ length: Math.ceil(total / PAGINA_MOV) - 1 }, (_, i) =>
        filtro().range((i + 1) * PAGINA_MOV, (i + 2) * PAGINA_MOV - 1)));
    for (const r of restantes) {
      if (r.error) throw r.error;
      linhas.push(...(r.data ?? []));
    }
  }

  const movs: Movimento[] = linhas.map(l => ({
    data: String(l.data).slice(0, 10),
    tipo: l.tipo === "entrada" ? "entrada" : "saida",
    valor: Number(l.valor ?? 0),
    transferencia: l.origem === "transferencia",
  }));
  return serieDiaria(movs, saldoAbertura, de, ate);
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
