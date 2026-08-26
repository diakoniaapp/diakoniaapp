// ─── painelPastoralService.ts — Blocos próprios do Painel Pastoral ─────────
//
// Só leitura. As efemérides continuam em `agendaPastoralService`; aqui mora
// o bloco de candidatos à membresia, que o painel ganhou em 26/08/2026.

import { supabase } from "@/integrations/supabase/client";

// ─── Candidatos à membresia ────────────────────────────────────────────────

export interface CandidatoMembresia {
  id: string;
  nome_completo: string;
  data_nascimento: string | null;
  data_congregado: string | null;
  telefone_celular: string | null;
  sexo: string | null;
  /** Anos completos hoje. Nulo quando não há data de nascimento. */
  idade: number | null;
}

export interface CandidatosMembresia {
  /** Congregados com 9 anos ou mais — os candidatos ao batismo pela regra. */
  elegiveis: CandidatoMembresia[];
  /**
   * Congregados sem data de nascimento.
   *
   * **Não são "não elegíveis" — são indecidíveis.** Medido em produção em
   * 26/08/2026: dos 68 congregados ativos, **49 não têm data de nascimento**.
   * Aplicar a regra "9 anos ou mais" e mostrar só quem passa esconderia 49
   * pessoas justamente da tela que existe para encontrá-las.
   *
   * Por isso eles aparecem num grupo próprio, com o que falta dito em voz
   * alta: preencher a data de nascimento decide de que lado eles caem.
   */
  semDataNascimento: CandidatoMembresia[];
  /** Congregados abaixo da idade mínima. Só o número — não há ação pastoral. */
  abaixoDaIdade: number;
}

/** Idade mínima para o batismo, conforme já praticado em `MembroForm`. */
export const IDADE_MINIMA_BATISMO = 9;

function idadeEm(dataNascimento: string | null): number | null {
  if (!dataNascimento) return null;
  const nasc = new Date(dataNascimento + "T00:00");
  const hoje = new Date();
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return anos;
}

/**
 * Congregados ativos, separados em três grupos pela idade.
 *
 * A regra ("congregado, 9 anos ou mais") é a mesma que `MembroForm` já usa
 * para marcar candidato a membresia — repeti-la aqui mantém as duas telas
 * dizendo a mesma coisa sobre a mesma pessoa.
 */
export async function candidatosMembresia(): Promise<CandidatosMembresia> {
  const { data, error } = await supabase
    .from("membros")
    .select("id, nome_completo, data_nascimento, data_congregado, telefone_celular, sexo")
    .eq("tipo_pessoa", "congregado")
    .eq("status", "ativo")
    .order("data_congregado", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const elegiveis: CandidatoMembresia[] = [];
  const semDataNascimento: CandidatoMembresia[] = [];
  let abaixoDaIdade = 0;

  for (const p of data ?? []) {
    const idade = idadeEm(p.data_nascimento);
    const item: CandidatoMembresia = { ...(p as any), idade };
    if (idade === null) semDataNascimento.push(item);
    else if (idade >= IDADE_MINIMA_BATISMO) elegiveis.push(item);
    else abaixoDaIdade++;
  }

  // Quem é congregado há mais tempo primeiro: espera mais pelo batismo.
  elegiveis.sort((a, b) => (a.data_congregado ?? "9999").localeCompare(b.data_congregado ?? "9999"));

  return { elegiveis, semDataNascimento, abaixoDaIdade };
}
