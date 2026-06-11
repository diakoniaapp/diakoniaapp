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
