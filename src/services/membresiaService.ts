import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ───────────────────────────────────────────────────────────────
export type TipoSolicitacao =
  | "entrada_batismo" | "entrada_profissao_fe" | "entrada_aclamacao"
  | "transferencia_recebida" | "transferencia_emitida"
  | "desligamento_pedido" | "desligamento_disciplinar"
  | "falecimento";

export type StatusSolicitacao =
  | "rascunho" | "aguardando_documento" | "pronta_assembleia"
  | "aprovada" | "rejeitada" | "concluida" | "cancelada";

export type PrioridadeAlerta = "urgente" | "atencao" | "informativo";

export const TIPO_LABEL: Record<TipoSolicitacao, string> = {
  entrada_batismo: "Entrada por Batismo",
  entrada_profissao_fe: "Entrada por Profissão de Fé",
  entrada_aclamacao: "Entrada por Aclamação",
  transferencia_recebida: "Transferência Recebida",
  transferencia_emitida: "Transferência Emitida",
  desligamento_pedido: "Desligamento (a pedido)",
  desligamento_disciplinar: "Desligamento Disciplinar",
  falecimento: "Falecimento",
};

export const STATUS_LABEL: Record<StatusSolicitacao, string> = {
  rascunho: "Rascunho",
  aguardando_documento: "Aguardando documento",
  pronta_assembleia: "Pronta para assembleia",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const STATUS_COR: Record<StatusSolicitacao, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  aguardando_documento: "bg-amber-50 text-amber-700 border-amber-300",
  pronta_assembleia: "bg-blue-50 text-blue-700 border-blue-300",
  aprovada: "bg-emerald-50 text-emerald-700 border-emerald-300",
  rejeitada: "bg-rose-50 text-rose-700 border-rose-300",
  concluida: "bg-emerald-100 text-emerald-800 border-emerald-400",
  cancelada: "bg-muted text-muted-foreground border-border line-through",
};

export interface SolicitacaoMembresia {
  id: string;
  pessoa_id: string | null;
  pessoa_nome: string;
  tipo: TipoSolicitacao;
  status: StatusSolicitacao;
  data_solicitacao: string;
  data_assembleia: string | null;
  data_aprovacao: string | null;
  data_conclusao: string | null;
  motivo: string | null;
  igreja_origem: string | null;
  igreja_destino: string | null;
  observacoes: string | null;
  observacao_aprovacao: string | null;
  observacao_rejeicao: string | null;
  pastor_assinante_id: string | null;
  pastor_assinante_nome: string | null;
  secretaria_assinante_id: string | null;
  secretaria_assinante_nome: string | null;
  carta_url: string | null;
  carta_versao_atual: number;
  created_at?: string;
  updated_at?: string;
}

export interface DocumentoSolicitacao {
  id: string;
  solicitacao_id: string;
  tipo: "pedido" | "carta" | "declaracao" | "identidade" | "outro";
  arquivo_url: string;
  arquivo_nome: string | null;
  mime: string | null;
  versao: number;
  observacao: string | null;
  enviado_por: string | null;
  created_at?: string;
}

export interface HistoricoSolicitacao {
  id: string;
  solicitacao_id: string;
  acao: string;
  descricao: string | null;
  user_nome: string | null;
  metadata: any;
  created_at: string;
}

export interface AlertaSecretaria {
  prioridade: PrioridadeAlerta;
  tipo: string;
  titulo: string;
  descricao: string;
  acao_sugerida: string;
  link: string;
  solicitacao_id: string;
}

export interface AssinaturaOficial {
  id: string;
  pessoa_id: string | null;
  pessoa_nome: string;
  cargo: string;
  imagem_url: string | null;
  ordem: number;
  ativo: boolean;
  observacao: string | null;
}

// ─── CRUD Solicitações ──────────────────────────────────────────────────
export async function listarSolicitacoes(filtro?: {
  status?: StatusSolicitacao | "todos";
  tipo?: TipoSolicitacao;
  busca?: string;
}): Promise<SolicitacaoMembresia[]> {
  let q = supabase.from("solicitacoes_membresia").select("*").order("created_at", { ascending: false });
  if (filtro?.status && filtro.status !== "todos") q = q.eq("status", filtro.status);
  if (filtro?.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro?.busca && filtro.busca.length >= 2) q = q.ilike("pessoa_nome", `%${filtro.busca}%`);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []) as SolicitacaoMembresia[];
}

export async function carregarSolicitacao(id: string): Promise<SolicitacaoMembresia | null> {
  const { data } = await supabase.from("solicitacoes_membresia").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as SolicitacaoMembresia | null;
}

export async function criarSolicitacao(input: Partial<SolicitacaoMembresia>): Promise<SolicitacaoMembresia> {
  const { data, error } = await supabase.from("solicitacoes_membresia").insert(input as any).select("*").single();
  if (error) throw error;
  return data as SolicitacaoMembresia;
}

export async function atualizarSolicitacao(id: string, patch: Partial<SolicitacaoMembresia>): Promise<void> {
  const { error } = await supabase.from("solicitacoes_membresia").update(patch as any).eq("id", id);
  if (error) throw error;
}

export async function aprovarSolicitacao(id: string, observacao?: string): Promise<void> {
  await atualizarSolicitacao(id, {
    status: "aprovada",
    data_aprovacao: new Date().toISOString().slice(0, 10),
    observacao_aprovacao: observacao ?? null,
  });
}

export async function rejeitarSolicitacao(id: string, observacao: string): Promise<void> {
  await atualizarSolicitacao(id, {
    status: "rejeitada",
    observacao_rejeicao: observacao,
  });
}

export async function concluirSolicitacao(id: string): Promise<void> {
  await atualizarSolicitacao(id, {
    status: "concluida",
    data_conclusao: new Date().toISOString().slice(0, 10),
  });
}

// ─── Documentos ──────────────────────────────────────────────────────────
export async function listarDocumentos(solicitacaoId: string): Promise<DocumentoSolicitacao[]> {
  const { data, error } = await supabase
    .from("solicitacoes_documentos").select("*")
    .eq("solicitacao_id", solicitacaoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DocumentoSolicitacao[];
}

export const DOC_MIMES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

export async function anexarDocumento(
  solicitacaoId: string,
  file: File,
  tipo: DocumentoSolicitacao["tipo"] = "pedido",
  observacao?: string,
): Promise<DocumentoSolicitacao> {
  if (file.size > DOC_MAX_BYTES) throw new Error("Arquivo > 10MB");
  if (!DOC_MIMES.includes(file.type)) throw new Error("Formato inválido (JPG/PNG/PDF)");

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${solicitacaoId}/${tipo}_${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("membresia-docs").upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;

  const { data, error } = await supabase.from("solicitacoes_documentos").insert({
    solicitacao_id: solicitacaoId,
    tipo,
    arquivo_url: path,
    arquivo_nome: file.name,
    mime: file.type,
    observacao: observacao ?? null,
  }).select("*").single();
  if (error) throw error;

  // Quando recebe documento, muda status se ainda estiver aguardando
  if (tipo === "pedido") {
    const sol = await carregarSolicitacao(solicitacaoId);
    if (sol && (sol.status === "rascunho" || sol.status === "aguardando_documento")) {
      await atualizarSolicitacao(solicitacaoId, { status: "pronta_assembleia" });
    }
  }
  return data as DocumentoSolicitacao;
}

export async function excluirDocumento(id: string, path: string): Promise<void> {
  await supabase.storage.from("membresia-docs").remove([path]);
  const { error } = await supabase.from("solicitacoes_documentos").delete().eq("id", id);
  if (error) throw error;
}

export async function documentoSignedUrl(path: string, segs = 600): Promise<string | null> {
  const { data } = await supabase.storage.from("membresia-docs").createSignedUrl(path, segs);
  return data?.signedUrl ?? null;
}

// ─── Histórico ───────────────────────────────────────────────────────────
export async function listarHistorico(solicitacaoId: string): Promise<HistoricoSolicitacao[]> {
  const { data, error } = await supabase
    .from("solicitacoes_historico").select("*")
    .eq("solicitacao_id", solicitacaoId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoricoSolicitacao[];
}

// ─── Painel de Alertas (Secretaria) ──────────────────────────────────────
export async function alertasSecretaria(): Promise<AlertaSecretaria[]> {
  const { data, error } = await supabase.rpc("secretaria_alertas");
  if (error) throw error;
  return (data ?? []) as AlertaSecretaria[];
}

// ─── Assinaturas ─────────────────────────────────────────────────────────
export async function listarAssinaturas(): Promise<AssinaturaOficial[]> {
  const { data, error } = await supabase
    .from("assinaturas_oficiais").select("*").eq("ativo", true).order("ordem").order("cargo");
  if (error) throw error;
  return (data ?? []) as AssinaturaOficial[];
}

export async function criarAssinatura(input: Partial<AssinaturaOficial>): Promise<AssinaturaOficial> {
  const { data, error } = await supabase.from("assinaturas_oficiais").insert(input as any).select("*").single();
  if (error) throw error;
  return data as AssinaturaOficial;
}

// ─── Checklist (calculado client-side) ───────────────────────────────────
export interface ChecklistItem {
  label: string;
  ok: boolean;
  acao?: string;
}

export function checklistDeSolicitacao(
  s: SolicitacaoMembresia,
  docs: DocumentoSolicitacao[]
): ChecklistItem[] {
  const temDocPedido = docs.some(d => d.tipo === "pedido");
  const temCarta = !!s.carta_url || docs.some(d => d.tipo === "carta");

  return [
    { label: "Documento anexado", ok: temDocPedido, acao: temDocPedido ? undefined : "Anexar pedido" },
    { label: "Assembleia agendada", ok: !!s.data_assembleia, acao: s.data_assembleia ? undefined : "Agendar assembleia" },
    { label: "Aprovada em assembleia", ok: s.status === "aprovada" || s.status === "concluida", acao: s.status === "pronta_assembleia" ? "Registrar aprovação" : undefined },
    { label: "Carta gerada", ok: temCarta, acao: temCarta ? undefined : "Gerar carta" },
    { label: "Concluída", ok: s.status === "concluida", acao: s.status === "aprovada" && temCarta ? "Marcar como concluída" : undefined },
  ];
}
