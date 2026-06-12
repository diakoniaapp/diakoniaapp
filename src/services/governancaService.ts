import { supabase } from "@/integrations/supabase/client";

export type GovReuniaoTipo = "diretoria" | "lideranca" | "conselho" | "extraordinaria" | "outra";
export type GovReuniaoStatus = "agendada" | "em_andamento" | "concluida" | "cancelada" | "adiada";
export type GovPautaClassificacao = "informativa" | "deliberativa";
export type GovPautaStatus = "rascunho" | "aprovada_em_pauta" | "para_assembleia" | "aprovada_assembleia" | "rejeitada" | "adiada" | "executada";
export type GovPautaVinculo = "solicitacao_membresia" | "compra" | "financeiro" | "administrativo" | "espiritual" | "outro";

export const REUNIAO_TIPO_LABEL: Record<GovReuniaoTipo, string> = {
  diretoria: "Diretoria",
  lideranca: "Liderança",
  conselho: "Conselho Fiscal",
  extraordinaria: "Extraordinária",
  outra: "Outra",
};

export const REUNIAO_STATUS_LABEL: Record<GovReuniaoStatus, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  adiada: "Adiada",
};

export const REUNIAO_STATUS_COR: Record<GovReuniaoStatus, string> = {
  agendada: "bg-blue-50 text-blue-700 border-blue-300",
  em_andamento: "bg-amber-50 text-amber-700 border-amber-300",
  concluida: "bg-emerald-50 text-emerald-700 border-emerald-300",
  cancelada: "bg-muted text-muted-foreground border-border line-through",
  adiada: "bg-rose-50 text-rose-700 border-rose-300",
};

export const PAUTA_STATUS_LABEL: Record<GovPautaStatus, string> = {
  rascunho: "Rascunho",
  aprovada_em_pauta: "Aprovada (reunião)",
  para_assembleia: "Para assembleia",
  aprovada_assembleia: "Aprovada (assembleia)",
  rejeitada: "Rejeitada",
  adiada: "Adiada",
  executada: "Executada",
};

export interface GovReuniao {
  id: string;
  titulo: string;
  tipo: GovReuniaoTipo;
  status: GovReuniaoStatus;
  data_reuniao: string;
  horario: string | null;
  local: string | null;
  online: boolean;
  link_online: string | null;
  presidente_id: string | null;
  presidente_nome: string | null;
  secretaria_id: string | null;
  secretaria_nome: string | null;
  ata_url: string | null;
  ata_versao: number;
  proxima_sugerida: string | null;
  observacoes: string | null;
}

export interface GovParticipante {
  id: string;
  reuniao_id: string;
  pessoa_id: string | null;
  pessoa_nome: string;
  papel: string;
  convocado: boolean;
  presente: boolean;
  justificativa: string | null;
}

export interface GovPauta {
  id: string;
  reuniao_id: string | null;
  assembleia_id: string | null;
  ordem: number;
  titulo: string;
  descricao: string | null;
  classificacao: GovPautaClassificacao;
  status: GovPautaStatus;
  vinculo_tipo: GovPautaVinculo | null;
  vinculo_id: string | null;
  vinculo_nome: string | null;
  proposto_por_id: string | null;
  proposto_por: string | null;
  decisao: string | null;
  votos_sim: number;
  votos_nao: number;
  votos_abstencao: number;
  votos_impedimento: number;
  data_decisao: string | null;
  observacao_decisao: string | null;
  executada: boolean;
}

export interface GovHistorico {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  acao: string;
  descricao: string | null;
  user_nome: string | null;
  created_at: string;
}

// ─── CRUD Reuniões ──────────────────────────────────────────────────────
export async function listarReunioes(): Promise<GovReuniao[]> {
  const { data, error } = await supabase
    .from("gov_reunioes").select("*")
    .order("data_reuniao", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GovReuniao[];
}

export async function carregarReuniao(id: string): Promise<GovReuniao | null> {
  const { data } = await supabase.from("gov_reunioes").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as GovReuniao | null;
}

export async function criarReuniao(input: Partial<GovReuniao>): Promise<GovReuniao> {
  const { data, error } = await supabase.from("gov_reunioes").insert(input as any).select("*").single();
  if (error) throw error;
  return data as GovReuniao;
}

export async function atualizarReuniao(id: string, patch: Partial<GovReuniao>): Promise<void> {
  const { error } = await supabase.from("gov_reunioes").update(patch as any).eq("id", id);
  if (error) throw error;
}

// ─── Participantes ──────────────────────────────────────────────────────
export async function listarParticipantes(reuniaoId: string): Promise<GovParticipante[]> {
  const { data, error } = await supabase
    .from("gov_participantes").select("*")
    .eq("reuniao_id", reuniaoId)
    .order("pessoa_nome");
  if (error) throw error;
  return (data ?? []) as GovParticipante[];
}

export async function sugerirParticipantes(reuniaoId: string): Promise<Array<{ pessoa_id: string; pessoa_nome: string; papel: string }>> {
  const { data, error } = await supabase.rpc("gov_sugerir_participantes", { p_reuniao_id: reuniaoId });
  if (error) throw error;
  return data ?? [];
}

export async function adicionarParticipante(input: {
  reuniao_id: string;
  pessoa_id: string | null;
  pessoa_nome: string;
  papel: string;
}): Promise<void> {
  const { error } = await supabase.from("gov_participantes").upsert(input as any, {
    onConflict: "reuniao_id,pessoa_id"
  });
  if (error) throw error;
}

export async function autoConvocarLideranca(reuniaoId: string): Promise<number> {
  const sugeridos = await sugerirParticipantes(reuniaoId);
  for (const p of sugeridos) {
    await adicionarParticipante({
      reuniao_id: reuniaoId,
      pessoa_id: p.pessoa_id,
      pessoa_nome: p.pessoa_nome,
      papel: p.papel,
    });
  }
  return sugeridos.length;
}

export async function marcarPresenca(id: string, presente: boolean): Promise<void> {
  const { error } = await supabase.from("gov_participantes").update({ presente }).eq("id", id);
  if (error) throw error;
}

export async function removerParticipante(id: string): Promise<void> {
  const { error } = await supabase.from("gov_participantes").delete().eq("id", id);
  if (error) throw error;
}

// ─── Pautas ──────────────────────────────────────────────────────────────
export async function listarPautas(reuniaoId: string): Promise<GovPauta[]> {
  const { data, error } = await supabase
    .from("gov_pautas").select("*")
    .eq("reuniao_id", reuniaoId)
    .order("ordem").order("created_at");
  if (error) throw error;
  return (data ?? []) as GovPauta[];
}

export async function criarPauta(input: Partial<GovPauta>): Promise<GovPauta> {
  const { data, error } = await supabase.from("gov_pautas").insert(input as any).select("*").single();
  if (error) throw error;
  return data as GovPauta;
}

export async function atualizarPauta(id: string, patch: Partial<GovPauta>): Promise<void> {
  const { error } = await supabase.from("gov_pautas").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function excluirPauta(id: string): Promise<void> {
  const { error } = await supabase.from("gov_pautas").delete().eq("id", id);
  if (error) throw error;
}

export async function sugerirPautas(): Promise<Array<{
  vinculo_tipo: GovPautaVinculo;
  vinculo_id: string;
  titulo: string;
  descricao: string;
  classificacao: GovPautaClassificacao;
}>> {
  const { data, error } = await supabase.rpc("gov_sugerir_pautas");
  if (error) throw error;
  return data ?? [];
}

// ─── Histórico ───────────────────────────────────────────────────────────
export async function listarHistorico(entidadeTipo: string, entidadeId: string): Promise<GovHistorico[]> {
  const { data, error } = await supabase
    .from("gov_historico").select("*")
    .eq("entidade_tipo", entidadeTipo)
    .eq("entidade_id", entidadeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GovHistorico[];
}

// ─── Recorrência sugerida ────────────────────────────────────────────────
export function sugerirProximasReunioes(dataAtual: string, qtd = 5): string[] {
  // Bimestral por padrão
  const datas: string[] = [];
  const d = new Date(dataAtual + "T00:00");
  for (let i = 1; i <= qtd; i++) {
    const nova = new Date(d);
    nova.setMonth(nova.getMonth() + 2 * i);
    datas.push(nova.toISOString().slice(0, 10));
  }
  return datas;
}

// ─── Convocação WhatsApp ─────────────────────────────────────────────────
export function montarConvocacaoWhatsApp(reuniao: GovReuniao, pessoa: { nome: string; telefone?: string }): { mensagem: string; url: string } {
  const data = new Date(reuniao.data_reuniao + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const horario = reuniao.horario ?? "";
  const local = reuniao.online ? `🌐 Online: ${reuniao.link_online ?? "(link a definir)"}` : `📍 ${reuniao.local ?? "(local a definir)"}`;

  const linhas = [
    `🙏 *Convocação — ${reuniao.titulo}*`,
    "",
    `Prezado(a) *${pessoa.nome}*,`,
    "",
    `Você foi convocado(a) para a reunião de *${REUNIAO_TIPO_LABEL[reuniao.tipo]}*:`,
    "",
    `📅 *Data:* ${data}${horario ? ` às ${horario.slice(0, 5)}` : ""}`,
    local,
    "",
    "Sua presença é fundamental para o andamento das decisões da igreja.",
    "",
    `Em Cristo,`,
    "_Secretaria da Igreja_`,
    "",
    "_Enviado pelo Diakonia APP_",
  ];
  const mensagem = linhas.join("\n");
  const tel = (pessoa.telefone ?? "").replace(/\D/g, "");
  const url = tel
    ? `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`
    : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
  return { mensagem, url };
}
