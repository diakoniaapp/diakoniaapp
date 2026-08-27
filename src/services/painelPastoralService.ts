// ─── painelPastoralService.ts — Blocos próprios do Painel Pastoral ─────────
//
// Só leitura. As efemérides continuam em `agendaPastoralService`; aqui mora
// o bloco de candidatos à membresia, que o painel ganhou em 26/08/2026.

import { supabase } from "@/integrations/supabase/client";
// A conta de idade saiu daqui para `lib/idade.ts` quando o bloco de
// membresia passou a precisar dela — duas cópias seriam duas telas
// discordando sobre a idade da mesma pessoa. Ver o cabeçalho de lá.
import { idadeEm } from "@/lib/idade";

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
   * Quantos congregados não têm data de nascimento — só a contagem.
   *
   * **Eles não são "não elegíveis": são indecidíveis.** Sem a data, a regra
   * dos 9 anos não consegue julgar. Medido em produção em 26/08/2026: dos 68
   * congregados ativos, **48 não têm data de nascimento**.
   *
   * O Painel Pastoral chegou a listá-los, com botão para abrir cada ficha, e
   * o bloco foi retirado a pedido: **preencher cadastro é trabalho da
   * secretaria, não da liderança pastoral** — o mesmo critério que tirou dali
   * os dois blocos de família.
   *
   * A contagem fica aqui porque o número continua sendo verdadeiro e barato,
   * e porque o dia em que houver uma tela de qualidade de cadastro — o lugar
   * certo para isso — ela vai precisar dele.
   */
  semDataNascimento: number;
  /**
   * Congregados abaixo da idade mínima. Só o número — não há ação pastoral.
   *
   * **Deixou de ser exibido em 27/08/2026**, a pedido: o subtítulo da seção
   * já declara "congregados com 9 anos ou mais", e quem tem menos está fora
   * por definição. A linha gastava espaço para repetir a regra.
   *
   * A contagem fica porque ela fecha a conta: todo congregado cai em
   * exatamente um dos três baldes — elegível, sem data, abaixo da idade. Quem
   * ler só os dois primeiros não conseguiria conferir que a soma bate.
   */
  abaixoDaIdade: number;
}

/** Idade mínima para o batismo, conforme já praticado em `MembroForm`. */
export const IDADE_MINIMA_BATISMO = 9;

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
  let semDataNascimento = 0;
  let abaixoDaIdade = 0;

  for (const p of data ?? []) {
    const idade = idadeEm(p.data_nascimento);
    if (idade === null) semDataNascimento++;
    else if (idade >= IDADE_MINIMA_BATISMO) elegiveis.push({ ...(p as any), idade });
    else abaixoDaIdade++;
  }

  // Quem é congregado há mais tempo primeiro: espera mais pelo batismo.
  elegiveis.sort((a, b) => (a.data_congregado ?? "9999").localeCompare(b.data_congregado ?? "9999"));

  return { elegiveis, semDataNascimento, abaixoDaIdade };
}
