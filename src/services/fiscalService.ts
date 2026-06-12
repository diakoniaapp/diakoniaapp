import { supabase } from "@/integrations/supabase/client";

export type FiscalEsfera = "federal" | "municipal" | "estadual";
export type FiscalPeriodicidade = "mensal" | "anual" | "trimestral";
export type FiscalStatus = "pendente" | "pago" | "atrasado" | "dispensado" | "enviado";

export interface FiscalTipoObrigacao {
  codigo: string;
  nome: string;
  descricao: string | null;
  esfera: FiscalEsfera;
  periodicidade: FiscalPeriodicidade;
  dia_vencimento: number | null;
  mes_anual: number | null;
  requer_funcionarios: boolean;
  icone: string;
  cor: string;
}

export interface FiscalConfig {
  id: number;
  tipo_entidade: string;
  municipio: string | null;
  uf: string | null;
  inscricao_municipal: string | null;
  cnae_principal: string | null;
  possui_funcionarios: boolean;
  dia_iss_municipal: number;
  alerta_dias_antes: number;
  whatsapp_tesouraria: string | null;
  atualizado_em: string;
}

export interface FiscalObrigacaoAtiva {
  codigo_obrigacao: string;
  ativa: boolean;
  dia_vencimento_custom: number | null;
  categoria_financeira_id: string | null;
  centro_custo_id: string | null;
  conta_pagadora_id: string | null;
  observacao: string | null;
}

export interface FiscalAgendaItem {
  id: string;
  codigo_obrigacao: string;
  competencia: string;
  vencimento: string;
  valor_esperado: number | null;
  valor_pago: number | null;
  data_pagamento: string | null;
  lancamento_id: string | null;
  status: FiscalStatus;
  observacao: string | null;
  // Joined
  tipo?: FiscalTipoObrigacao;
}

// ─── Configuração ─────────────────────────────────────────────────────
export async function carregarConfig(): Promise<FiscalConfig | null> {
  const { data, error } = await supabase
    .from("fiscal_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as FiscalConfig | null;
}

export async function atualizarConfig(patch: Partial<FiscalConfig>): Promise<void> {
  const { error } = await supabase
    .from("fiscal_config")
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ─── Tipos & Obrigações ativas ────────────────────────────────────────
export async function listarTiposObrigacao(): Promise<FiscalTipoObrigacao[]> {
  const { data, error } = await supabase
    .from("fiscal_tipos_obrigacao")
    .select("*")
    .order("esfera")
    .order("codigo");
  if (error) throw error;
  return (data ?? []) as FiscalTipoObrigacao[];
}

export async function listarObrigacoesAtivas(): Promise<FiscalObrigacaoAtiva[]> {
  const { data, error } = await supabase
    .from("fiscal_obrigacoes_ativas")
    .select("*");
  if (error) throw error;
  return (data ?? []) as FiscalObrigacaoAtiva[];
}

export async function definirObrigacaoAtiva(
  codigo: string,
  ativa: boolean,
  extras: Partial<FiscalObrigacaoAtiva> = {},
): Promise<void> {
  const { error } = await supabase
    .from("fiscal_obrigacoes_ativas")
    .upsert({
      codigo_obrigacao: codigo,
      ativa,
      ...extras,
      atualizado_em: new Date().toISOString(),
    });
  if (error) throw error;
}

// ─── Agenda fiscal ────────────────────────────────────────────────────
/** Gera agenda no intervalo dado (idempotente). */
export async function gerarAgenda(inicio: string, fim: string) {
  const { data, error } = await supabase.rpc("fiscal_gerar_agenda", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw error;
  return data ?? [];
}

export interface FiltroAgenda {
  inicio?: string;
  fim?: string;
  status?: FiscalStatus;
  codigo_obrigacao?: string;
}

export async function listarAgenda(f: FiltroAgenda = {}): Promise<FiscalAgendaItem[]> {
  let q = supabase
    .from("fiscal_agenda")
    .select("*, tipo:fiscal_tipos_obrigacao!codigo_obrigacao(codigo,nome,icone,cor,esfera)")
    .order("vencimento");
  if (f.inicio) q = q.gte("vencimento", f.inicio);
  if (f.fim) q = q.lte("vencimento", f.fim);
  if (f.status) q = q.eq("status", f.status);
  if (f.codigo_obrigacao) q = q.eq("codigo_obrigacao", f.codigo_obrigacao);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FiscalAgendaItem[];
}

export async function darBaixaObrigacao(
  agendaId: string,
  dados: { valor_pago: number; data_pagamento: string; observacao?: string },
): Promise<void> {
  const { error } = await supabase
    .from("fiscal_agenda")
    .update({
      ...dados,
      status: "pago",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", agendaId);
  if (error) throw error;
}

export async function dispensarObrigacao(agendaId: string, motivo: string): Promise<void> {
  const { error } = await supabase
    .from("fiscal_agenda")
    .update({
      status: "dispensado",
      observacao: motivo,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", agendaId);
  if (error) throw error;
}
