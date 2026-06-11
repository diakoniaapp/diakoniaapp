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

export async function listarClasses(incluirInativas = false): Promise<EbdClasse[]> {
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

export async function desativarClasse(id: string): Promise<void> {
  const { error } = await supabase.from("ebd_classes")
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function reativarClasse(id: string): Promise<void> {
  const { error } = await supabase.from("ebd_classes")
    .update({ ativo: true, updated_at: new Date().toISOString() })
    .eq("id", id);
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

// ─── Campanhas EBD ─────────────────────────────────────────────────────────
export interface CampanhaEbd {
  id: string;
  classe_id: string | null;
  nome: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string;
  meta_valor: number;
  ativo: boolean;
  created_at?: string;
}

export interface CampanhaInput {
  classe_id: string | null;
  nome: string;
  descricao?: string | null;
  data_inicio: string;
  data_fim: string;
  meta_valor: number;
  ativo?: boolean;
}

export interface EntradaEbd {
  id: string;
  campanha_id: string;
  data: string;
  valor: number;
  tipo: "oferta" | "evento" | "produto";
  forma: "pix" | "envelope" | "outro";
  descricao: string | null;
  comprovante_url: string | null;
  registrado_por?: string | null;
  created_at?: string;
}

export interface ResumoCampanha {
  meta: number;
  arrecadado: number;
  percentual: number;
  dias_decorridos: number;
  dias_totais: number;
  meta_diaria: number;
  esperado_ate_hoje: number;
  status: "meta_atingida" | "acima_esperado" | "no_ritmo" | "abaixo_esperado" | "muito_abaixo";
}

// Centavos simbólicos (R$ 0,10) para identificar oferta de campanha no extrato
export const CENTAVOS_SIMBOLICOS = 0.10;

export async function listarCampanhas(classeId?: string | null): Promise<CampanhaEbd[]> {
  let q = supabase.from("ebd_campanhas").select("*").order("data_fim", { ascending: false });
  if (classeId) q = q.eq("classe_id", classeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CampanhaEbd[];
}

export async function carregarCampanha(id: string): Promise<CampanhaEbd | null> {
  const { data } = await supabase.from("ebd_campanhas").select("*").eq("id", id).maybeSingle();
  return (data ?? null) as CampanhaEbd | null;
}

export async function criarCampanha(input: CampanhaInput): Promise<CampanhaEbd> {
  const { data, error } = await supabase.from("ebd_campanhas")
    .insert({ ...input, ativo: input.ativo ?? true })
    .select("*").single();
  if (error) throw error;
  return data as CampanhaEbd;
}

export async function atualizarCampanha(id: string, patch: Partial<CampanhaInput>): Promise<void> {
  const { error } = await supabase.from("ebd_campanhas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function excluirCampanha(id: string): Promise<void> {
  const { error } = await supabase.from("ebd_campanhas").delete().eq("id", id);
  if (error) throw error;
}

export async function listarEntradas(campanhaId: string): Promise<EntradaEbd[]> {
  const { data, error } = await supabase.from("ebd_entradas")
    .select("*")
    .eq("campanha_id", campanhaId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EntradaEbd[];
}

export async function registrarEntrada(
  campanhaId: string,
  input: Omit<EntradaEbd, "id" | "campanha_id" | "created_at" | "registrado_por">,
): Promise<EntradaEbd> {
  const { data, error } = await supabase.from("ebd_entradas")
    .insert({ campanha_id: campanhaId, ...input })
    .select("*").single();
  if (error) throw error;
  return data as EntradaEbd;
}

export async function atualizarEntrada(
  id: string,
  patch: Partial<Omit<EntradaEbd, "id" | "campanha_id" | "created_at" | "registrado_por">>,
): Promise<void> {
  const { error } = await supabase.from("ebd_entradas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function excluirEntrada(id: string): Promise<void> {
  // Apaga comprovante do Storage antes (se houver)
  const { data: entrada } = await supabase.from("ebd_entradas")
    .select("comprovante_url").eq("id", id).maybeSingle();
  if (entrada?.comprovante_url) {
    await removerComprovante(entrada.comprovante_url);
  }
  const { error } = await supabase.from("ebd_entradas").delete().eq("id", id);
  if (error) throw error;
}

// ─── Comprovantes (storage: ebd-comprovantes, bucket privado) ──────────────
export const COMPROVANTE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const COMPROVANTE_MIMES = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];

export async function uploadComprovante(file: File, campanhaId: string): Promise<string> {
  if (file.size > COMPROVANTE_MAX_BYTES) {
    throw new Error(`Arquivo grande demais (max ${COMPROVANTE_MAX_BYTES / 1024 / 1024} MB)`);
  }
  if (!COMPROVANTE_MIMES.includes(file.type)) {
    throw new Error("Formato não aceito. Use JPG, PNG ou PDF.");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${campanhaId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("ebd-comprovantes")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;
  return path; // armazenamos o path; signed URL é gerada on-demand
}

export async function comprovanteSignedUrl(path: string, segs = 600): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("ebd-comprovantes")
    .createSignedUrl(path, segs);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function removerComprovante(path: string): Promise<void> {
  // ignora erro (idempotente)
  await supabase.storage.from("ebd-comprovantes").remove([path]);
}

export async function resumoCampanha(campanhaId: string): Promise<ResumoCampanha | null> {
  const { data, error } = await supabase.rpc("resumo_campanha_ebd", { p_campanha_id: campanhaId });
  if (error) throw error;
  const linhas = (data ?? []) as ResumoCampanha[];
  return linhas[0] ?? null;
}
