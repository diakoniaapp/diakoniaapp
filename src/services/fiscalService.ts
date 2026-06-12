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

// ═══════════════════════════════════════════════════════════════════════
// FB-2: Alertas + Integração financeira + WhatsApp
// ═══════════════════════════════════════════════════════════════════════

export type Severidade = "atrasado" | "urgente" | "proximo" | "futuro" | "pago";

export interface AlertaFiscalDashboard {
  id: string;
  codigo: string;
  nome: string;
  icone: string;
  vencimento: string;
  dias_para_vencer: number;
  severidade: Severidade;
  valor_esperado: number | null;
}

export interface ResumoFiscalDashboard {
  total_atrasados: number;
  total_urgentes: number;
  total_proximos: number;
  total_pagos_mes: number;
  proximos: AlertaFiscalDashboard[];
}

export async function carregarResumoFiscal(): Promise<ResumoFiscalDashboard> {
  const { data, error } = await supabase.rpc("fiscal_resumo_dashboard");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { total_atrasados: 0, total_urgentes: 0, total_proximos: 0, total_pagos_mes: 0, proximos: [] };
  }
  return {
    total_atrasados: row.total_atrasados ?? 0,
    total_urgentes: row.total_urgentes ?? 0,
    total_proximos: row.total_proximos ?? 0,
    total_pagos_mes: row.total_pagos_mes ?? 0,
    proximos: row.proximos ?? [],
  };
}

export async function marcarAtrasados(): Promise<number> {
  const { data, error } = await supabase.rpc("fiscal_marcar_atrasados");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function criarLancamentoFiscal(
  agendaId: string,
  valor: number,
  descricao?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("fiscal_criar_lancamento", {
    p_agenda_id: agendaId,
    p_valor: valor,
    p_descricao: descricao ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** WhatsApp da tesouraria — alerta de obrigações urgentes/atrasadas. */
export function montarAlertaFiscalWhatsApp(
  resumo: ResumoFiscalDashboard,
  telefoneTesouraria: string | null,
): { mensagem: string; url: string } {
  const linhas: string[] = [
    "🚨 *Alerta Fiscal — QIBRJ*",
    "",
  ];

  if (resumo.total_atrasados > 0) {
    linhas.push(`🔴 *${resumo.total_atrasados} obrigação(ões) ATRASADA(S)*`);
  }
  if (resumo.total_urgentes > 0) {
    linhas.push(`🟡 *${resumo.total_urgentes} vencem nos próximos dias*`);
  }

  linhas.push("", "_Próximas:_", "");

  for (const a of resumo.proximos) {
    const dia = new Date(a.vencimento + "T00:00").toLocaleDateString("pt-BR");
    const tag =
      a.severidade === "atrasado"
        ? `vencida há ${Math.abs(a.dias_para_vencer)}d`
        : a.dias_para_vencer === 0
        ? "vence HOJE"
        : `vence em ${a.dias_para_vencer}d`;
    linhas.push(`${a.icone} *${a.nome}* — ${dia} (${tag})`);
  }

  linhas.push(
    "",
    "_Por favor, dá uma olhada quando puder?_",
    "_Pra evitar multa e juros._",
    "",
    "_Secretaria · QIBRJ_",
    "_Diakonia APP — Módulo Fiscal_",
  );

  const mensagem = linhas.join("\n");
  const tel = (telefoneTesouraria ?? "").replace(/\D/g, "");
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return { mensagem, url };
}
