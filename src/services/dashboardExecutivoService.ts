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
  return data as SaldoConsolidado;
}

export async function buscarFluxo12m(): Promise<FluxoCaixaMes[]> {
  const { data, error } = await supabase.rpc("fin_exec_fluxo_12m");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    mes: r.mes,
    rotulo: r.rotulo,
    entradas: Number(r.entradas ?? 0),
    saidas: Number(r.saidas ?? 0),
    saldo: Number(r.saldo ?? 0),
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
