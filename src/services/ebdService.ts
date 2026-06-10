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
