// ─── familiaService.ts — Famílias Fase A ────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

export type ParentescoTipo =
  | "pai_mae" | "conjuge" | "filho" | "avo"
  | "enteado" | "tutelado" | "irmao" | "outro";

export const PARENTESCO_LABEL: Record<ParentescoTipo, string> = {
  pai_mae:  "Pai/Mãe",
  conjuge:  "Cônjuge",
  filho:    "Filho(a)",
  avo:      "Avô/Avó",
  enteado:  "Enteado(a)",
  tutelado: "Tutelado(a)",
  irmao:    "Irmão(ã)",
  outro:    "Outro vínculo",
};

export interface Familia {
  id: string;
  nome_familia: string;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cep?: string | null;
  data_casamento?: string | null;
  observacoes?: string | null;
}

export interface VinculoFamiliar {
  id: string;
  familia_id: string;
  membro_id: string;
  parentesco: ParentescoTipo;
  responsavel_familia: boolean;
}

export interface SugestaoVinculo {
  pessoa_id: string;
  nome_completo: string;
  sobrenome: string;
  familia_id: string | null;
  familia_nome: string | null;
  parentesco: ParentescoTipo | null;
  responsavel: boolean;
}

// ── Sugestões automáticas por sobrenome ────────────────────────────────────
export async function sugerirVinculos(
  pessoaId?: string | null,
  nomeCompleto?: string | null,
): Promise<SugestaoVinculo[]> {
  const { data, error } = await supabase.rpc("sugerir_vinculos_familiares", {
    p_pessoa_id: pessoaId ?? null,
    p_nome_completo: nomeCompleto ?? null,
  });
  if (error) throw error;
  return (data ?? []) as SugestaoVinculo[];
}

// ── Família atual da pessoa ────────────────────────────────────────────────
export async function familiaDaPessoa(pessoaId: string): Promise<
  { vinculo: VinculoFamiliar; familia: Familia } | null
> {
  const { data } = await supabase
    .from("vinculos_familiares")
    .select("id, familia_id, membro_id, parentesco, responsavel_familia, familias(*)")
    .eq("membro_id", pessoaId)
    .maybeSingle();
  if (!data) return null;
  return {
    vinculo: {
      id: (data as any).id,
      familia_id: (data as any).familia_id,
      membro_id: (data as any).membro_id,
      parentesco: (data as any).parentesco as ParentescoTipo,
      responsavel_familia: (data as any).responsavel_familia,
    },
    familia: (data as any).familias as Familia,
  };
}

// ── Criar família + opcionalmente vincular a pessoa como responsável ───────
export async function criarFamilia(
  nomeFamilia: string,
  enderecoSeed?: Partial<Familia>,
): Promise<Familia> {
  const payload: any = { nome_familia: nomeFamilia.trim() };
  if (enderecoSeed) {
    ["endereco", "numero", "complemento", "bairro", "cidade", "cep"].forEach(k => {
      const v = (enderecoSeed as any)[k];
      if (v) payload[k] = v;
    });
  }
  const { data, error } = await supabase
    .from("familias")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as Familia;
}

// ── Vincular pessoa a família (via RPC: UPSERT + responsavel exclusivo) ────
export async function vincularPessoa(
  familiaId: string,
  pessoaId: string,
  parentesco: ParentescoTipo,
  responsavel = false,
  copiarEnderecoParaFamilia = false,
): Promise<string> {
  const { data, error } = await supabase.rpc("vincular_pessoa_familia", {
    p_familia_id: familiaId,
    p_pessoa_id: pessoaId,
    p_parentesco: parentesco,
    p_responsavel: responsavel,
    p_copiar_endereco_para_familia: copiarEnderecoParaFamilia,
  });
  if (error) throw error;
  return data as string;
}

// ── Desvincular (deleta vínculo, família permanece) ────────────────────────
export async function desvincularPessoa(vinculoId: string): Promise<void> {
  const { error } = await supabase
    .from("vinculos_familiares")
    .delete()
    .eq("id", vinculoId);
  if (error) throw error;
}

// ── Atualizar família ──────────────────────────────────────────────────────
export async function atualizarFamilia(familiaId: string, patch: Partial<Familia>): Promise<void> {
  const { error } = await supabase
    .from("familias")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", familiaId);
  if (error) throw error;
}

// ── Helper: sugere nome de família a partir do sobrenome ───────────────────
export function nomeFamiliaSugerido(nomeCompleto: string): string {
  // Pega a última palavra significativa
  const partes = nomeCompleto.trim().toLowerCase().split(/\s+/);
  const pular = new Set([
    "da", "de", "do", "das", "dos", "e",
    "filho", "filha", "junior", "jr", "jr.", "neto", "neta",
    "iii", "ii"
  ]);
  for (let i = partes.length - 1; i >= 0; i--) {
    const p = partes[i].replace(/[.,;:]/g, "");
    if (!pular.has(p) && p.length >= 3) {
      // Capitaliza primeira letra
      return "Família " + p.charAt(0).toUpperCase() + p.slice(1);
    }
  }
  return "Família " + nomeCompleto.split(" ").pop();
}
