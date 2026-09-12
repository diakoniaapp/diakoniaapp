// ─── fechamentoPeriodoService.ts ─────────────────────────────────────────
//
// Fase 6 do projeto Tesouraria (docs/PROJETO_TESOURARIA_PRESTACAO_CONTAS.md
// §7.4-7.5) — fechar/aprovar/reabrir um período (`fin_fechamentos_
// periodo`). Período é `ano_inicio + mes_inicio + qtd_meses`, o mesmo
// formato que `prestacaoContasService` usa pra ler — "trimestre" não é um
// conceito do banco, é só `qtd_meses = 3` escolhido na tela.
//
// A trava de verdade (bloquear UPDATE/DELETE de lançamento de período
// fechado) é um trigger em `fin_lancamentos`, não código daqui — este
// serviço só chama as RPCs que já fazem a checagem de admin
// (`fin_aprovar_periodo`, `fin_reabrir_periodo`) ou não fazem por
// desenho (`fin_fechar_periodo`: mesma malha de escrita do resto do
// módulo, a TELA decide quem vê o botão via `ROLES_FINANCEIRO`).
import { supabase } from "@/integrations/supabase/client";

export type FinStatusFechamento = "aberto" | "em_revisao" | "fechado" | "aprovado";

export interface FinFechamentoPeriodo {
  id: string;
  ano_inicio: number;
  mes_inicio: number;
  qtd_meses: number;
  status: FinStatusFechamento;
  saldo_anterior: number | null;
  saldo_final: number | null;
  fechado_em: string | null;
  fechado_por: string | null;
  aprovado_em: string | null;
  aprovado_por: string | null;
  observacao_geral: string | null;
  created_at: string;
  updated_at: string;
}

export async function buscarFechamento(anoInicio: number, mesInicio: number, qtdMeses: number): Promise<FinFechamentoPeriodo | null> {
  const { data, error } = await supabase
    .from("fin_fechamentos_periodo").select("*")
    .eq("ano_inicio", anoInicio).eq("mes_inicio", mesInicio).eq("qtd_meses", qtdMeses)
    .maybeSingle();
  if (error) throw error;
  return data as FinFechamentoPeriodo | null;
}

/** Cria o fechamento se não existir, e fecha — carimba os lançamentos do período e calcula o saldo final. */
export async function fecharPeriodo(anoInicio: number, mesInicio: number, qtdMeses: number): Promise<void> {
  let fechamento = await buscarFechamento(anoInicio, mesInicio, qtdMeses);
  if (!fechamento) {
    const { data, error } = await supabase.from("fin_fechamentos_periodo")
      .insert({ ano_inicio: anoInicio, mes_inicio: mesInicio, qtd_meses: qtdMeses })
      .select("*").single();
    if (error) throw error;
    fechamento = data as FinFechamentoPeriodo;
  }
  const { error } = await supabase.rpc("fin_fechar_periodo", { p_fechamento_id: fechamento.id });
  if (error) throw error;
}

export async function aprovarPeriodo(fechamentoId: string): Promise<void> {
  const { error } = await supabase.rpc("fin_aprovar_periodo", { p_fechamento_id: fechamentoId });
  if (error) throw error;
}

export async function reabrirPeriodo(fechamentoId: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("fin_reabrir_periodo", { p_fechamento_id: fechamentoId, p_motivo: motivo });
  if (error) throw error;
}
