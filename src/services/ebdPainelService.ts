// ─── ebdPainelService.ts — Painel de acompanhamento da EBD ─────────────────
//
// Só leitura. As quatro RPCs vêm da migration
// 20260826140000_painel_de_acompanhamento_da_ebd.sql, e o cabeçalho dela
// explica a decisão que atravessa todos os números aqui:
//
//   **Aula sem nenhuma presença registrada é chamada não feita, não "todos
//   faltaram".** Toda taxa usa só as aulas com chamada.
//
// Medido em produção em 26/08/2026: 12 aulas, 3 com chamada. Pelas 12 a taxa
// daria ~4,8% e a tela acusaria uma evasão que não houve.

import { supabase } from "@/integrations/supabase/client";

export interface EbdResumo {
  classes_ativas: number;
  alunos_matriculados: number;
  alunos_sem_data_nasc: number;
  aulas_total: number;
  aulas_com_chamada: number;
  aulas_sem_chamada: number;
  primeira_aula: string | null;
  ultima_aula: string | null;
  presencas_registradas: number;
  presentes: number;
  visitantes: number;
  /** Nulo quando nenhuma aula teve chamada — não há taxa a calcular. */
  taxa_presenca: number | null;
  homens_matriculados: number;
  mulheres_matriculadas: number;
  homens_presentes: number;
  mulheres_presentes: number;
}

export interface EbdFaixa {
  faixa: string;
  ordem: number;
  matriculados: number;
  presencas: number;
  ausencias: number;
  taxa: number | null;
}

export interface EbdClasseLinha {
  classe_id: string;
  classe: string;
  cor: string | null;
  matriculados: number;
  homens: number;
  mulheres: number;
  aulas_com_chamada: number;
  aulas_sem_chamada: number;
  presencas: number;
  taxa: number | null;
  ultima_aula: string | null;
}

export interface EbdAlunoAusente {
  pessoa_id: string;
  nome: string;
  classe: string;
  sexo: string | null;
  idade: number | null;
  oportunidades: number;
  presencas: number;
  ausencias: number;
  taxa: number | null;
}

export async function ebdResumo(): Promise<EbdResumo | null> {
  const { data, error } = await supabase.rpc("ebd_painel_resumo" as any);
  if (error) throw error;
  return ((data as any[]) ?? [])[0] ?? null;
}

export async function ebdPorFaixa(): Promise<EbdFaixa[]> {
  const { data, error } = await supabase.rpc("ebd_painel_por_faixa" as any);
  if (error) throw error;
  return ((data as any[]) ?? []) as EbdFaixa[];
}

export async function ebdPorClasse(): Promise<EbdClasseLinha[]> {
  const { data, error } = await supabase.rpc("ebd_painel_por_classe" as any);
  if (error) throw error;
  return ((data as any[]) ?? []) as EbdClasseLinha[];
}

export async function ebdAlunosAusentes(limite = 12): Promise<EbdAlunoAusente[]> {
  const { data, error } = await supabase.rpc("ebd_painel_alunos_ausentes" as any, { p_limite: limite });
  if (error) throw error;
  return ((data as any[]) ?? []) as EbdAlunoAusente[];
}

// ─── Leituras derivadas ────────────────────────────────────────────────────

/**
 * A faixa etária com maior e com menor frequência.
 *
 * Faixas sem nenhuma oportunidade de presença (nenhuma aula com chamada na
 * classe delas) voltam com `taxa` nula e **não competem** — não se pode
 * chamar de "mais ausente" quem nunca teve chamada feita.
 */
export function faixasExtremas(faixas: EbdFaixa[]): {
  maisPresente: EbdFaixa | null;
  maisAusente: EbdFaixa | null;
} {
  const comTaxa = faixas.filter(f => f.taxa !== null && f.presencas + f.ausencias > 0);
  if (comTaxa.length === 0) return { maisPresente: null, maisAusente: null };
  const ordenadas = [...comTaxa].sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0));
  return {
    maisPresente: ordenadas[0],
    maisAusente: ordenadas[ordenadas.length - 1],
  };
}
