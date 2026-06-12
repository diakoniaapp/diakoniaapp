import { supabase } from "@/integrations/supabase/client";

export type AssuntoPrioridade = "alta" | "media" | "baixa";
export type AssuntoStatus = "aberto" | "em_andamento" | "concluido" | "cancelado" | "aguardando_terceiro";
export type AssuntoSituacao = "atrasado" | "vence_em_breve" | "parado" | "concluido" | "normal";

export const PRIORIDADE_LABEL: Record<AssuntoPrioridade, string> = {
  alta: "Alta", media: "Média", baixa: "Baixa",
};
export const PRIORIDADE_COR: Record<AssuntoPrioridade, string> = {
  alta: "bg-rose-100 text-rose-700 border-rose-300",
  media: "bg-amber-100 text-amber-700 border-amber-300",
  baixa: "bg-blue-100 text-blue-700 border-blue-300",
};
export const PRIORIDADE_ICONE: Record<AssuntoPrioridade, string> = {
  alta: "🔴", media: "🟡", baixa: "🟢",
};

export const STATUS_LABEL: Record<AssuntoStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
  aguardando_terceiro: "Aguardando terceiros",
};
export const STATUS_COR: Record<AssuntoStatus, string> = {
  aberto: "bg-blue-50 text-blue-700 border-blue-300",
  em_andamento: "bg-amber-50 text-amber-700 border-amber-300",
  concluido: "bg-emerald-50 text-emerald-700 border-emerald-300",
  cancelado: "bg-muted text-muted-foreground border-border line-through",
  aguardando_terceiro: "bg-purple-50 text-purple-700 border-purple-300",
};

export const SITUACAO_COR: Record<AssuntoSituacao, string> = {
  atrasado: "border-rose-300 bg-rose-50/30",
  vence_em_breve: "border-amber-300 bg-amber-50/30",
  parado: "border-purple-200 bg-purple-50/20",
  concluido: "border-emerald-200 bg-emerald-50/10",
  normal: "",
};

export interface Assunto {
  id: string;
  titulo: string;
  descricao: string | null;
  status: AssuntoStatus;
  prioridade: AssuntoPrioridade;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  data_criacao: string;
  data_conclusao: string | null;
  origem: string;
  reuniao_origem_id: string | null;
  vinculo_tipo: string | null;
  vinculo_id: string | null;
  vinculo_descricao: string | null;
  observacao_conclusao: string | null;
  vezes_discutido: number;
  ultima_atualizacao_em: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssuntoDashboard extends Assunto {
  situacao: AssuntoSituacao;
  dias_para_prazo: number | null;
}

export interface HistoricoAssunto {
  id: string;
  assunto_id: string;
  acao: string;
  descricao: string | null;
  user_nome: string | null;
  created_at: string;
}

export interface AlertaAssunto {
  prioridade: "urgente" | "atencao" | "informativo";
  tipo: string;
  titulo: string;
  descricao: string;
  acao_sugerida: string;
  link: string;
  entidade_id: string;
}

export interface ResumoResponsavel {
  responsavel_id: string;
  responsavel_nome: string;
  total_abertos: number;
  atrasados: number;
  proximos: number;
}

// ─── CRUD ─────────────────────────────────────────────────────────────
export interface FiltroAssunto {
  status?: AssuntoStatus | "todos" | "abertos";
  prioridade?: AssuntoPrioridade | "todas";
  responsavelId?: string;
  busca?: string;
}

export async function listarAssuntos(f: FiltroAssunto = {}): Promise<AssuntoDashboard[]> {
  let q = supabase.from("vw_assuntos_dashboard").select("*").order("prioridade").order("prazo");
  if (f.status && f.status !== "todos") {
    if (f.status === "abertos") {
      q = q.in("status", ["aberto", "em_andamento", "aguardando_terceiro"]);
    } else {
      q = q.eq("status", f.status);
    }
  }
  if (f.prioridade && f.prioridade !== "todas") q = q.eq("prioridade", f.prioridade);
  if (f.responsavelId) q = q.eq("responsavel_id", f.responsavelId);
  if (f.busca && f.busca.length >= 2) q = q.ilike("titulo", `%${f.busca}%`);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []) as AssuntoDashboard[];
}

export async function carregarAssunto(id: string): Promise<Assunto | null> {
  const { data } = await supabase.from("assuntos").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as Assunto | null;
}

export async function criarAssunto(input: Partial<Assunto>): Promise<Assunto> {
  const { data, error } = await supabase.from("assuntos").insert(input as any).select("*").single();
  if (error) throw error;
  return data as Assunto;
}

export async function atualizarAssunto(id: string, patch: Partial<Assunto>): Promise<void> {
  const { error } = await supabase.from("assuntos").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function excluirAssunto(id: string): Promise<void> {
  const { error } = await supabase.from("assuntos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Histórico ────────────────────────────────────────────────────────
export async function listarHistoricoAssunto(id: string): Promise<HistoricoAssunto[]> {
  const { data, error } = await supabase
    .from("assuntos_historico").select("*")
    .eq("assunto_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoricoAssunto[];
}

// ─── Vínculos com reuniões ────────────────────────────────────────────
export async function assuntosDaReuniao(reuniaoId: string): Promise<Array<{
  vinculo_id: string;
  assunto: AssuntoDashboard;
  ordem: number;
  observacao_reuniao: string | null;
  decisao_reuniao: string | null;
}>> {
  const { data, error } = await supabase
    .from("reuniao_assuntos")
    .select("id, ordem, observacao_reuniao, decisao_reuniao, assunto:assuntos(*)")
    .eq("reuniao_id", reuniaoId)
    .order("ordem");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    vinculo_id: r.id,
    assunto: r.assunto,
    ordem: r.ordem,
    observacao_reuniao: r.observacao_reuniao,
    decisao_reuniao: r.decisao_reuniao,
  }));
}

export async function vincularAssuntoNaReuniao(reuniaoId: string, assuntoId: string): Promise<void> {
  const { error } = await supabase.from("reuniao_assuntos").upsert({
    reuniao_id: reuniaoId, assunto_id: assuntoId,
  }, { onConflict: "reuniao_id,assunto_id" });
  if (error) throw error;
}

export async function desvincularAssuntoDaReuniao(vinculoId: string): Promise<void> {
  const { error } = await supabase.from("reuniao_assuntos").delete().eq("id", vinculoId);
  if (error) throw error;
}

export async function importarPautaAutomatica(reuniaoId: string): Promise<number> {
  const { data, error } = await supabase.rpc("assuntos_para_reuniao", { p_reuniao_id: reuniaoId });
  if (error) throw error;
  return data as number;
}

// ─── Alertas e Dashboard ──────────────────────────────────────────────
export async function alertasAssuntos(): Promise<AlertaAssunto[]> {
  const { data, error } = await supabase.rpc("assuntos_alertas");
  if (error) throw error;
  return (data ?? []) as AlertaAssunto[];
}

export async function resumoPorResponsavel(): Promise<ResumoResponsavel[]> {
  const { data, error } = await supabase.rpc("assuntos_por_responsavel");
  if (error) throw error;
  return (data ?? []) as ResumoResponsavel[];
}

// ─── WhatsApp por responsável ─────────────────────────────────────────
export async function montarMensagemTarefasResponsavel(
  pessoa: { nome: string; telefone?: string | null },
  assuntos: AssuntoDashboard[],
): Promise<{ mensagem: string; url: string }> {
  const atrasados = assuntos.filter(a => a.situacao === "atrasado");
  const proximos = assuntos.filter(a => a.situacao === "vence_em_breve");
  const normais  = assuntos.filter(a => a.situacao === "normal" || a.situacao === "parado");

  const linhas: string[] = [
    `🙏 *Suas tarefas pendentes*`,
    "",
    `Prezado(a) *${pessoa.nome}*,`,
    "",
    `Você tem *${assuntos.length}* tarefa(s) sob sua responsabilidade:`,
    "",
  ];

  if (atrasados.length > 0) {
    linhas.push(`🔴 *Atrasadas (${atrasados.length}):*`);
    atrasados.forEach(a => {
      linhas.push(`• ${a.titulo}`);
      if (a.prazo) linhas.push(`  Prazo era ${new Date(a.prazo + "T00:00").toLocaleDateString("pt-BR")}`);
    });
    linhas.push("");
  }
  if (proximos.length > 0) {
    linhas.push(`🟡 *Vence em breve (${proximos.length}):*`);
    proximos.forEach(a => {
      linhas.push(`• ${a.titulo}`);
      if (a.prazo) linhas.push(`  Prazo: ${new Date(a.prazo + "T00:00").toLocaleDateString("pt-BR")}`);
    });
    linhas.push("");
  }
  if (normais.length > 0) {
    linhas.push(`🟢 *Em andamento (${normais.length}):*`);
    normais.forEach(a => {
      linhas.push(`• ${a.titulo}`);
    });
    linhas.push("");
  }

  linhas.push("Obrigada pela dedicação!", "", "_Secretaria da Igreja_", "", "_Enviado pelo Diakonia APP_");

  const mensagem = linhas.join("\n");
  const tel = (pessoa.telefone ?? "").replace(/\D/g, "");
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return { mensagem, url };
}

// ═══════════════════════════════════════════════════════════════════════
// Dashboard widgets — RPCs e lembrete WhatsApp individual
// ═══════════════════════════════════════════════════════════════════════

export interface MeuAssuntoResumo {
  id: string;
  titulo: string;
  prazo: string | null;
  prioridade: AssuntoPrioridade;
  situacao: "atrasado" | "vence_breve" | "parado" | "normal";
}

export interface MeusAssuntosResposta {
  total_abertos: number;
  total_atrasados: number;
  total_vence_breve: number;
  total_parados: number;
  proximos: MeuAssuntoResumo[];
}

export async function buscarMeusAssuntos(): Promise<MeusAssuntosResposta> {
  const { data, error } = await supabase.rpc("assuntos_meus_resumo");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { total_abertos: 0, total_atrasados: 0, total_vence_breve: 0, total_parados: 0, proximos: [] };
  return {
    total_abertos: row.total_abertos ?? 0,
    total_atrasados: row.total_atrasados ?? 0,
    total_vence_breve: row.total_vence_breve ?? 0,
    total_parados: row.total_parados ?? 0,
    proximos: row.proximos ?? [],
  };
}

export interface AssuntoUrgenteIgreja {
  id: string;
  titulo: string;
  prazo: string | null;
  prioridade: AssuntoPrioridade;
  situacao: "atrasado" | "vence_semana";
  responsavel_id: string | null;
  responsavel_nome: string | null;
}

export interface UrgentesIgrejaResposta {
  total_atrasados: number;
  total_vence_semana: number;
  lista: AssuntoUrgenteIgreja[];
}

export async function buscarUrgentesIgreja(): Promise<UrgentesIgrejaResposta> {
  const { data, error } = await supabase.rpc("assuntos_urgentes_igreja");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { total_atrasados: 0, total_vence_semana: 0, lista: [] };
  return {
    total_atrasados: row.total_atrasados ?? 0,
    total_vence_semana: row.total_vence_semana ?? 0,
    lista: row.lista ?? [],
  };
}

/** Lembrete WhatsApp para UM assunto específico. */
export function montarLembreteAssuntoIndividual(
  assunto: Assunto,
  telefoneResponsavel: string | null,
): { mensagem: string; url: string } {
  const prazoFmt = assunto.prazo
    ? new Date(assunto.prazo + "T00:00").toLocaleDateString("pt-BR")
    : "sem prazo definido";
  const diasAtraso = assunto.prazo
    ? Math.floor((Date.now() - new Date(assunto.prazo + "T00:00").getTime()) / 86_400_000)
    : 0;
  const prazoLinha = assunto.prazo && diasAtraso > 0
    ? `⏰ Prazo: ${prazoFmt} *(vencido há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""})*`
    : `⏰ Prazo: ${prazoFmt}`;

  const linhas = [
    `Olá *${assunto.responsavel_nome ?? "irmão(ã)"}*! 👋`,
    "",
    "Passando para lembrar do assunto sob sua responsabilidade:",
    "",
    `📋 *${assunto.titulo}*`,
    prazoLinha,
    `${PRIORIDADE_ICONE[assunto.prioridade]} Prioridade: ${PRIORIDADE_LABEL[assunto.prioridade]}`,
  ];

  if (assunto.descricao) {
    linhas.push("", `📝 ${assunto.descricao}`);
  }

  linhas.push(
    "",
    "_Sem pressão — só pra não passar batido. Qualquer dúvida estou à disposição._",
    "",
    "_Secretaria · QIBRJ_",
    "_Enviado pelo Diakonia APP_",
  );

  const mensagem = linhas.join("\n");
  const tel = (telefoneResponsavel ?? "").replace(/\D/g, "");
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return { mensagem, url };
}
