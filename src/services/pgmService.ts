import { supabase } from "@/integrations/supabase/client";

// ─── Tipos ───────────────────────────────────────────────────────────────
export type PgmPapel = "participante" | "lider" | "colider" | "anfitriao";

export interface PgmGrupo {
  id: string;
  nome: string;
  descricao: string | null;
  dia_semana: number | null;
  horario: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  lider_id: string | null;
  co_lider_id: string | null;
  anfitriao_id: string | null;
  grupo_pai_id: string | null;
  multiplicado_em: string | null;
  whatsapp_link: string | null;
  ativo: boolean;
  data_inicio: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PgmGrupoResumo extends PgmGrupo {
  qtd_membros: number;
  qtd_filhos: number;
  lider_nome: string | null;
  co_lider_nome: string | null;
  anfitriao_nome: string | null;
}

export interface PgmMembro {
  id: string;
  grupo_id: string;
  pessoa_id: string;
  papel: PgmPapel;
  principal: boolean;
  data_entrada: string;
  data_saida: string | null;
  ativo: boolean;
  observacao: string | null;
}

export interface PgmMembroComPessoa extends PgmMembro {
  nome_completo?: string;
  telefone_celular?: string | null;
  bairro?: string | null;
}

export interface GrupoInput {
  nome: string;
  descricao?: string | null;
  dia_semana?: number | null;
  horario?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  lider_id?: string | null;
  co_lider_id?: string | null;
  anfitriao_id?: string | null;
  grupo_pai_id?: string | null;
  whatsapp_link?: string | null;
  ativo?: boolean;
  data_inicio?: string | null;
}

// ─── Constantes ─────────────────────────────────────────────────────────
export const DIA_SEMANA_LABEL = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"
] as const;

export const PAPEL_LABEL: Record<PgmPapel, string> = {
  participante: "Participante",
  lider: "Líder",
  colider: "Co-líder",
  anfitriao: "Anfitrião",
};

// ─── Grupos ─────────────────────────────────────────────────────────────
export async function listarGrupos(incluirInativos = false): Promise<PgmGrupoResumo[]> {
  const { data, error } = await supabase
    .from("vw_pgm_grupos_resumo")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome");
  if (error) throw error;
  let lista = (data ?? []) as PgmGrupoResumo[];
  if (!incluirInativos) lista = lista.filter(g => g.ativo);
  return lista;
}

export async function carregarGrupo(id: string): Promise<PgmGrupoResumo | null> {
  const { data } = await supabase.from("vw_pgm_grupos_resumo").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as PgmGrupoResumo | null;
}

export async function criarGrupo(input: GrupoInput): Promise<PgmGrupo> {
  const { data, error } = await supabase.from("pgm_grupos")
    .insert({ ...input, ativo: input.ativo ?? true })
    .select("*").single();
  if (error) throw error;
  return data as PgmGrupo;
}

export async function atualizarGrupo(id: string, patch: Partial<GrupoInput>): Promise<void> {
  const { error } = await supabase.from("pgm_grupos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function desativarGrupo(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_grupos").update({ ativo: false }).eq("id", id);
  if (error) throw error;
}

export async function reativarGrupo(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_grupos").update({ ativo: true }).eq("id", id);
  if (error) throw error;
}

export async function excluirGrupo(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_grupos").delete().eq("id", id);
  if (error) throw error;
}

// ─── Membros (vínculos) ─────────────────────────────────────────────────
export async function listarMembrosDoGrupo(grupoId: string): Promise<PgmMembroComPessoa[]> {
  const { data, error } = await supabase
    .from("pgm_membros")
    .select("*")
    .eq("grupo_id", grupoId)
    .eq("ativo", true)
    .order("papel", { ascending: false });
  if (error) throw error;
  const membros = (data ?? []) as PgmMembro[];
  if (membros.length === 0) return [];

  const ids = membros.map(m => m.pessoa_id);
  const { data: pessoas } = await supabase
    .from("membros")
    .select("id, nome_completo, telefone_celular, bairro")
    .in("id", ids);
  const pMap = new Map((pessoas ?? []).map((p: any) => [p.id, p]));

  return membros.map(m => ({
    ...m,
    nome_completo: pMap.get(m.pessoa_id)?.nome_completo,
    telefone_celular: pMap.get(m.pessoa_id)?.telefone_celular,
    bairro: pMap.get(m.pessoa_id)?.bairro,
  }));
}

export async function listarGruposDaPessoa(pessoaId: string): Promise<(PgmMembro & { grupo_nome: string })[]> {
  const { data } = await supabase
    .from("pgm_membros")
    .select("*, grupo:pgm_grupos(nome)")
    .eq("pessoa_id", pessoaId)
    .eq("ativo", true);
  return (data ?? []).map((r: any) => ({ ...r, grupo_nome: r.grupo?.nome ?? "—" }));
}

export async function vincularPessoa(
  grupoId: string, pessoaId: string,
  opts?: { papel?: PgmPapel; principal?: boolean },
): Promise<void> {
  const { error } = await supabase.from("pgm_membros").upsert({
    grupo_id: grupoId,
    pessoa_id: pessoaId,
    papel: opts?.papel ?? "participante",
    principal: opts?.principal ?? false,
    ativo: true,
  }, { onConflict: "grupo_id,pessoa_id" });
  if (error) throw error;
}

export async function desvincularPessoa(grupoId: string, pessoaId: string): Promise<void> {
  const { error } = await supabase
    .from("pgm_membros")
    .update({ ativo: false, data_saida: new Date().toISOString().slice(0, 10) })
    .eq("grupo_id", grupoId)
    .eq("pessoa_id", pessoaId);
  if (error) throw error;
}

export async function alterarPapel(membroId: string, papel: PgmPapel): Promise<void> {
  const { error } = await supabase.from("pgm_membros").update({ papel }).eq("id", membroId);
  if (error) throw error;
}

export async function marcarPrincipal(membroId: string): Promise<void> {
  const { error } = await supabase.from("pgm_membros").update({ principal: true }).eq("id", membroId);
  if (error) throw error;
}

// ─── Helpers de UI ──────────────────────────────────────────────────────
export function diaSemanaTexto(d: number | null): string {
  if (d == null) return "Sem dia definido";
  return DIA_SEMANA_LABEL[d] ?? "—";
}

export function horarioTexto(h: string | null): string {
  if (!h) return "—";
  return h.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE B — Reuniões + Presenças + Visitas
// ═══════════════════════════════════════════════════════════════════════════

export interface PgmReuniao {
  id: string;
  grupo_id: string;
  data: string;
  tema: string | null;
  texto_base: string | null;
  observacoes: string | null;
  local_alterado: string | null;
  foto_url: string | null;
  fechada: boolean;
  registrada_por: string | null;
  created_at?: string;
}

export interface PgmPresenca {
  id: string;
  reuniao_id: string;
  pessoa_id: string;
  presente: boolean;
  observacao: string | null;
}

export interface PgmPresencaComPessoa extends PgmPresenca {
  nome_completo?: string;
  papel?: PgmPapel;
}

export interface PgmVisita {
  id: string;
  reuniao_id: string;
  nome: string;
  telefone: string | null;
  bairro: string | null;
  convidado_por: string | null;
  observacao: string | null;
  virou_pessoa_id: string | null;
}

export interface ResumoPresenca {
  reuniao_id: string;
  data: string;
  tema: string | null;
  total: number;
  presentes: number;
  percentual: number;
}

// ─── Reuniões ────────────────────────────────────────────────────────────
export async function listarReunioes(grupoId: string): Promise<PgmReuniao[]> {
  const { data, error } = await supabase
    .from("pgm_reunioes")
    .select("*")
    .eq("grupo_id", grupoId)
    .order("data", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PgmReuniao[];
}

export async function carregarReuniao(id: string): Promise<PgmReuniao | null> {
  const { data } = await supabase.from("pgm_reunioes").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as PgmReuniao | null;
}

export async function iniciarReuniao(grupoId: string, data: string, tema?: string | null): Promise<string> {
  const { data: rid, error } = await supabase.rpc("pgm_iniciar_reuniao", {
    p_grupo_id: grupoId,
    p_data: data,
    p_tema: tema ?? null,
  });
  if (error) throw error;
  return rid as string;
}

export async function atualizarReuniao(id: string, patch: Partial<Omit<PgmReuniao, "id" | "grupo_id" | "created_at">>): Promise<void> {
  const { error } = await supabase.from("pgm_reunioes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function excluirReuniao(id: string): Promise<void> {
  const r = await carregarReuniao(id);
  if (r?.foto_url) await removerFotoReuniao(r.foto_url);
  const { error } = await supabase.from("pgm_reunioes").delete().eq("id", id);
  if (error) throw error;
}

// ─── Presenças ───────────────────────────────────────────────────────────
export async function listarPresencas(reuniaoId: string): Promise<PgmPresencaComPessoa[]> {
  const { data, error } = await supabase
    .from("pgm_presencas")
    .select("*")
    .eq("reuniao_id", reuniaoId);
  if (error) throw error;
  const presencas = (data ?? []) as PgmPresenca[];
  if (presencas.length === 0) return [];

  const ids = presencas.map(p => p.pessoa_id);
  const [{ data: pessoas }, { data: vinculos }] = await Promise.all([
    supabase.from("membros").select("id, nome_completo").in("id", ids),
    supabase.from("pgm_membros").select("pessoa_id, papel").in("pessoa_id", ids),
  ]);
  const pMap = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_completo]));
  const vMap = new Map((vinculos ?? []).map((v: any) => [v.pessoa_id, v.papel]));

  return presencas
    .map(p => ({
      ...p,
      nome_completo: pMap.get(p.pessoa_id),
      papel: vMap.get(p.pessoa_id),
    }))
    .sort((a, b) => (a.nome_completo ?? "").localeCompare(b.nome_completo ?? "", "pt-BR"));
}

export async function marcarPresenca(presencaId: string, presente: boolean): Promise<void> {
  const { error } = await supabase.from("pgm_presencas").update({ presente }).eq("id", presencaId);
  if (error) throw error;
}

// ─── Visitas ────────────────────────────────────────────────────────────
export async function listarVisitas(reuniaoId: string): Promise<PgmVisita[]> {
  const { data, error } = await supabase
    .from("pgm_visitas")
    .select("*")
    .eq("reuniao_id", reuniaoId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PgmVisita[];
}

export async function registrarVisita(reuniaoId: string, input: {
  nome: string; telefone?: string | null; bairro?: string | null;
  convidado_por?: string | null; observacao?: string | null;
}): Promise<PgmVisita> {
  const { data, error } = await supabase.from("pgm_visitas").insert({
    reuniao_id: reuniaoId,
    nome: input.nome,
    telefone: input.telefone ?? null,
    bairro: input.bairro ?? null,
    convidado_por: input.convidado_por ?? null,
    observacao: input.observacao ?? null,
  }).select("*").single();
  if (error) throw error;
  return data as PgmVisita;
}

export async function excluirVisita(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_visitas").delete().eq("id", id);
  if (error) throw error;
}

// ─── Foto da reunião ─────────────────────────────────────────────────────
export async function uploadFotoReuniao(file: File, reuniaoId: string): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Foto maior que 5 MB");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${reuniaoId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("pgm-reunioes")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function removerFotoReuniao(path: string): Promise<void> {
  await supabase.storage.from("pgm-reunioes").remove([path]);
}

export async function fotoReuniaoSignedUrl(path: string, segs = 600): Promise<string | null> {
  const { data } = await supabase.storage.from("pgm-reunioes").createSignedUrl(path, segs);
  return data?.signedUrl ?? null;
}

// ─── Resumo de presenças ─────────────────────────────────────────────────
export async function resumoPresenca(grupoId: string, n = 4): Promise<ResumoPresenca[]> {
  const { data, error } = await supabase.rpc("pgm_resumo_presenca", { p_grupo_id: grupoId, p_n: n });
  if (error) throw error;
  return (data ?? []) as ResumoPresenca[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FASE C — Oração + Multiplicação + Geografia + Discipulado
// ═══════════════════════════════════════════════════════════════════════════

export type PgmOracaoVisibilidade = "privada" | "lideranca" | "grupo";
export type PgmOracaoStatus = "ativo" | "respondido" | "arquivado";

export interface PgmPedidoOracao {
  id: string;
  grupo_id: string;
  pessoa_id: string | null;
  nome_avulso: string | null;
  texto: string;
  visibilidade: PgmOracaoVisibilidade;
  status: PgmOracaoStatus;
  respondido_em: string | null;
  resposta: string | null;
  created_at?: string;
}

export interface PgmPedidoComPessoa extends PgmPedidoOracao {
  pessoa_nome?: string | null;
}

export interface PgmMarcosDiscipulado {
  pessoa_id: string;
  batizado: boolean;
  data_batismo: string | null;
  classe_descobrindo: boolean;
  classe_novos_crentes: boolean;
  tem_mentor: boolean;
  mentor_id: string | null;
  observacao: string | null;
}

export const VISIBILIDADE_LABEL: Record<PgmOracaoVisibilidade, string> = {
  privada: "Só líder",
  lideranca: "Líder e co-líder",
  grupo: "Grupo todo",
};

// ─── Pedidos de oração ────────────────────────────────────────────────────
export async function listarPedidosOracao(
  grupoId: string, status: PgmOracaoStatus | "todos" = "ativo",
): Promise<PgmPedidoComPessoa[]> {
  let q = supabase.from("pgm_pedidos_oracao").select("*").eq("grupo_id", grupoId);
  if (status !== "todos") q = q.eq("status", status);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  const ped = (data ?? []) as PgmPedidoOracao[];
  if (ped.length === 0) return [];

  const ids = ped.map(p => p.pessoa_id).filter(Boolean) as string[];
  if (ids.length === 0) return ped.map(p => ({ ...p, pessoa_nome: p.nome_avulso }));
  const { data: pessoas } = await supabase
    .from("membros").select("id, nome_completo").in("id", ids);
  const pMap = new Map((pessoas ?? []).map((p: any) => [p.id, p.nome_completo]));
  return ped.map(p => ({
    ...p,
    pessoa_nome: p.pessoa_id ? pMap.get(p.pessoa_id) ?? null : p.nome_avulso,
  }));
}

export async function registrarPedidoOracao(input: {
  grupo_id: string;
  pessoa_id?: string | null;
  nome_avulso?: string | null;
  texto: string;
  visibilidade?: PgmOracaoVisibilidade;
}): Promise<PgmPedidoOracao> {
  const { data, error } = await supabase.from("pgm_pedidos_oracao").insert({
    grupo_id: input.grupo_id,
    pessoa_id: input.pessoa_id ?? null,
    nome_avulso: input.nome_avulso ?? null,
    texto: input.texto,
    visibilidade: input.visibilidade ?? "lideranca",
    status: "ativo",
  }).select("*").single();
  if (error) throw error;
  return data as PgmPedidoOracao;
}

export async function responderPedidoOracao(
  id: string, resposta: string,
): Promise<void> {
  const { error } = await supabase.from("pgm_pedidos_oracao").update({
    status: "respondido",
    respondido_em: new Date().toISOString().slice(0, 10),
    resposta,
  }).eq("id", id);
  if (error) throw error;
}

export async function arquivarPedidoOracao(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_pedidos_oracao")
    .update({ status: "arquivado" }).eq("id", id);
  if (error) throw error;
}

export async function excluirPedidoOracao(id: string): Promise<void> {
  const { error } = await supabase.from("pgm_pedidos_oracao").delete().eq("id", id);
  if (error) throw error;
}

// ─── Multiplicação ────────────────────────────────────────────────────────
export async function multiplicarGrupo(
  paiId: string, nomeFilho: string, liderId: string, pessoasIds: string[],
): Promise<string> {
  const { data, error } = await supabase.rpc("pgm_multiplicar_grupo", {
    p_pai_id: paiId,
    p_nome_filho: nomeFilho,
    p_lider_id: liderId,
    p_pessoas_ids: pessoasIds,
  });
  if (error) throw error;
  return data as string;
}

// ─── Geografia ────────────────────────────────────────────────────────────
export async function sugerirPgmPorBairro(bairro: string): Promise<Array<{
  id: string; nome: string; dia_semana: number | null; horario: string | null;
  bairro: string | null; qtd_membros: number; lider_nome: string | null;
}>> {
  if (!bairro?.trim()) return [];
  const { data, error } = await supabase.rpc("pgm_sugerir_por_bairro", { p_bairro: bairro.trim() });
  if (error) throw error;
  return data ?? [];
}

// ─── Alertas pastorais ────────────────────────────────────────────────────
export async function alertasAusencia(grupoId?: string): Promise<Array<{
  pessoa_id: string; nome: string; grupo_id: string; grupo_nome: string;
  faltas_seguidas: number; ultima_presenca: string | null;
}>> {
  const { data, error } = await supabase.rpc("pgm_alertas_ausencia", {
    p_grupo_id: grupoId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

// ─── Marcos de discipulado ────────────────────────────────────────────────
export async function carregarMarcos(pessoaId: string): Promise<PgmMarcosDiscipulado | null> {
  const { data } = await supabase.from("pgm_marcos_discipulado")
    .select("*").eq("pessoa_id", pessoaId).maybeSingle();
  return (data ?? null) as PgmMarcosDiscipulado | null;
}

export async function salvarMarcos(input: PgmMarcosDiscipulado): Promise<void> {
  const { error } = await supabase.from("pgm_marcos_discipulado")
    .upsert(input, { onConflict: "pessoa_id" });
  if (error) throw error;
}
