// ─── ebdService.ts — Operações do módulo EBD ──────────────────────────────
import { supabase } from "@/integrations/supabase/client";

export interface EbdClasse {
  id: string;
  nome: string;
  idade_min: number | null;
  idade_max: number | null;
  genero: "masculino" | "feminino" | "misto";
  descricao: string | null;
  cor: string | null;
  ordem: number;
  ativo: boolean;
}

export interface EbdEsperado {
  pessoa_id: string;
  nome_completo: string;
  sexo: string | null;
  data_nascimento: string | null;
  idade: number | null;
  ja_matriculado: boolean;
  matricula_id?: string | null;
  outra_classe_id?: string | null;
  outra_classe_nome?: string | null;
}

export async function listarClasses(): Promise<EbdClasse[]> {
  const { data, error } = await supabase
    .from("ebd_classes")
    .select("*")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  return (data ?? []) as EbdClasse[];
}

export async function carregarClasse(id: string): Promise<EbdClasse | null> {
  const { data } = await supabase
    .from("ebd_classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as EbdClasse | null;
}

export async function esperadosDaClasse(classeId: string): Promise<EbdEsperado[]> {
  const { data, error } = await supabase.rpc("esperados_da_classe", {
    p_classe_id: classeId,
  });
  if (error) throw error;
  return (data ?? []) as EbdEsperado[];
}

export async function matriculadosDaClasse(classeId: string) {
  const { data, error } = await supabase
    .from("ebd_matriculas")
    .select("id, data_matricula, pessoa_id, membros(id, nome_completo, sexo, data_nascimento)")
    .eq("classe_id", classeId)
    .eq("ativo", true);
  if (error) throw error;
  return data ?? [];
}

export async function matricular(pessoaId: string, classeId: string) {
  const { error } = await supabase
    .from("ebd_matriculas")
    .insert({ pessoa_id: pessoaId, classe_id: classeId, ativo: true });
  if (error) throw error;
}

export async function desmatricular(matriculaId: string) {
  const { error } = await supabase
    .from("ebd_matriculas")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", matriculaId);
  if (error) throw error;
}

export async function sugerirClasse(dataNascimento: string, sexo?: string | null): Promise<string | null> {
  const { data } = await supabase.rpc("sugerir_classe_ebd", {
    p_data_nascimento: dataNascimento,
    p_sexo: sexo ?? null,
  });
  return (data as string | null) ?? null;
}

export async function classesDaPessoa(pessoaId: string) {
  const { data } = await supabase
    .from("ebd_matriculas")
    .select("classe_id, ebd_classes(id, nome)")
    .eq("pessoa_id", pessoaId)
    .eq("ativo", true);
  return data ?? [];
}

// ─── CRUD de Classes ────────────────────────────────────────────────────────
export interface ClasseInput {
  nome: string;
  idade_min: number | null;
  idade_max: number | null;
  genero: "masculino" | "feminino" | "misto";
  descricao?: string | null;
  cor?: string | null;
  ordem?: number;
  ativo?: boolean;
}

export async function criarClasse(input: ClasseInput): Promise<EbdClasse> {
  const { data, error } = await supabase
    .from("ebd_classes")
    .insert({ ...input, ativo: input.ativo ?? true })
    .select("*")
    .single();
  if (error) throw error;
  return data as EbdClasse;
}

export async function atualizarClasse(id: string, patch: Partial<ClasseInput>): Promise<EbdClasse> {
  const { data, error } = await supabase
    .from("ebd_classes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as EbdClasse;
}

export async function excluirClasse(id: string): Promise<void> {
  // Trigger no banco impede DELETE se houver matriculados ou aulas
  const { error } = await supabase.from("ebd_classes").delete().eq("id", id);
  if (error) throw error;
}

// ─── Professores ────────────────────────────────────────────────────────────
export interface EbdProfessor {
  id: string;
  classe_id: string;
  pessoa_id: string;
  tipo: "principal" | "auxiliar" | "substituto";
  ativo: boolean;
  desde: string;
  membros?: { id: string; nome_completo: string } | null;
}

export async function listarProfessores(classeId: string): Promise<EbdProfessor[]> {
  const { data, error } = await supabase
    .from("ebd_professores")
    .select("id, classe_id, pessoa_id, tipo, ativo, desde, membros(id, nome_completo)")
    .eq("classe_id", classeId)
    .eq("ativo", true)
    .order("tipo");
  if (error) throw error;
  return (data ?? []) as EbdProfessor[];
}

export async function adicionarProfessor(
  classeId: string,
  pessoaId: string,
  tipo: EbdProfessor["tipo"] = "principal",
): Promise<void> {
  const { error } = await supabase
    .from("ebd_professores")
    .insert({ classe_id: classeId, pessoa_id: pessoaId, tipo, ativo: true });
  if (error) throw error;
}

export async function removerProfessor(id: string): Promise<void> {
  const { error } = await supabase
    .from("ebd_professores")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function moverParaClasse(pessoaId: string, classeNovaId: string): Promise<string> {
  const { data, error } = await supabase.rpc("mover_aluno_classe", {
    p_pessoa_id: pessoaId,
    p_classe_nova: classeNovaId,
  });
  if (error) throw error;
  return data as string;
}

// ─── Chamada / Aula ────────────────────────────────────────────────────────
export interface EbdAula {
  id: string;
  classe_id: string;
  data: string;
  professor_id?: string | null;
  tema?: string | null;
  foto_url?: string | null;
  observacoes?: string | null;
  created_at?: string;
}

export interface EbdChamadaRow {
  pessoa_id: string;
  nome_completo: string;
  idade: number | null;
  presente: boolean;
  eh_visitante: boolean;
  tipo: "matriculado" | "visitante";
}

export async function obterOuCriarAula(classeId: string, data: string): Promise<string> {
  const { data: id, error } = await supabase.rpc("ebd_obter_ou_criar_aula", {
    p_classe_id: classeId,
    p_data: data,
  });
  if (error) throw error;
  return id as string;
}

export async function carregarAula(aulaId: string): Promise<EbdAula | null> {
  const { data } = await supabase
    .from("ebd_aulas")
    .select("*")
    .eq("id", aulaId)
    .maybeSingle();
  return (data ?? null) as EbdAula | null;
}

export async function atualizarAula(aulaId: string, patch: Partial<EbdAula>) {
  const { error } = await supabase
    .from("ebd_aulas")
    .update(patch)
    .eq("id", aulaId);
  if (error) throw error;
}

export async function chamadaView(aulaId: string): Promise<EbdChamadaRow[]> {
  const { data, error } = await supabase.rpc("ebd_chamada_view", { p_aula_id: aulaId });
  if (error) throw error;
  return (data ?? []) as EbdChamadaRow[];
}

export async function marcarPresenca(
  aulaId: string, pessoaId: string, presente: boolean, ehVisitante = false,
): Promise<void> {
  const { error } = await supabase.rpc("ebd_marcar_presenca", {
    p_aula_id: aulaId,
    p_pessoa_id: pessoaId,
    p_presente: presente,
    p_eh_visitante: ehVisitante,
  });
  if (error) throw error;
}

export async function adicionarVisitanteAula(
  aulaId: string,
  nome: string,
  telefone?: string,
): Promise<string> {
  // 1. Criar pessoa do tipo visitante
  const payload: any = {
    nome_completo: nome.trim(),
    tipo_pessoa: "visitante",
    status: "ativo",
    data_entrada: new Date().toISOString().slice(0, 10),
    como_conheceu: "evento_igreja",
    como_conheceu_descricao: "Veio na EBD",
  };
  if (telefone) payload.telefone_celular = telefone.replace(/\D/g, "");
  const { data: novaPessoa, error: e1 } = await supabase
    .from("membros")
    .insert(payload)
    .select("id")
    .single();
  if (e1) throw e1;

  // 2. Marcar presença com eh_visitante=true
  await marcarPresenca(aulaId, novaPessoa.id, true, true);
  return novaPessoa.id;
}

export async function uploadFotoAula(aulaId: string, classeId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${classeId}/${aulaId}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("ebd-aulas")
    .upload(path, file, { upsert: true });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("ebd-aulas").getPublicUrl(path);
  const publicUrl = data.publicUrl;
  await atualizarAula(aulaId, { foto_url: publicUrl });
  return publicUrl;
}
