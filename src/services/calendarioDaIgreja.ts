// ─── calendarioDaIgreja.ts — a Identidade da Igreja decide o calendário ─────
//
// A Identidade já guardava a quais instituições a igreja é vinculada (CBB,
// JMM, JMN, CBERJ…), mas isso não mudava nada na agenda: as 39 datas da CBB
// apareciam para qualquer igreja, vinculada ou não. Desde 22/10/2026 o vínculo
// é o interruptor — vinculou a CBB, aparecem as datas da CBB; desvinculou,
// somem. A data de fundação, que também já estava lá, vira o aniversário da
// igreja.
//
// ── POR QUE A SIGLA, E NÃO O ID ────────────────────────────────────────────
//
// O catálogo de datas (`lib/agenda/externalEvents.ts`) é código, e o id de uma
// linha de `instituicoes` é um UUID gerado no banco — o código não tem como
// conhecê-lo. A sigla ("CBB", "JMM") é o que o seed gravou e o que o catálogo
// cita.
//
// ── QUANDO A CONSULTA FALHA ────────────────────────────────────────────────
//
// `vinculadas: null` — "não se sabe" — e a agenda mostra todas as datas
// denominacionais. Ver o comentário de `eventosBatistas`.

import { useEffect, useState } from "react";
import { supabase, supabaseRel } from "@/integrations/supabase/client";
import { CONTEXTO_DESCONHECIDO, type ContextoDoCalendario } from "@/lib/agenda/externalEvents";

async function carregar(): Promise<ContextoDoCalendario> {
  const { data: ident, error } = await supabase
    .from("identidade_igreja")
    .select("id, nome_igreja, fundada_em")
    .eq("ativa", true)
    .maybeSingle();
  if (error || !ident) return CONTEXTO_DESCONHECIDO;

  const fundacao = ident.fundada_em
    ? { data: ident.fundada_em, nomeIgreja: ident.nome_igreja }
    : null;

  // `supabaseRel` porque a consulta tem embed — ver a nota em client.ts.
  const { data: vinculos, error: e2 } = await supabaseRel
    .from("igreja_instituicoes")
    .select("instituicoes(sigla, ativo)")
    .eq("igreja_id", ident.id);
  if (e2) return { vinculadas: null, fundacao };

  const siglas = new Set<string>();
  // O embed de uma FK de muitos-para-um volta como objeto; o tipo inferido diz lista.
  for (const v of (vinculos ?? []) as unknown as { instituicoes: { sigla: string | null; ativo: boolean } | null }[]) {
    const sigla = v.instituicoes?.ativo ? v.instituicoes.sigla?.trim().toUpperCase() : null;
    if (sigla) siglas.add(sigla);
  }
  return { vinculadas: siglas, fundacao };
}

// Uma consulta por carga do app, não uma por tela: a Agenda, a Mesa e a tira
// da semana pedem a mesma coisa, e ela só muda quando alguém salva a
// Identidade — que chama `esquecerCalendarioDaIgreja`.
let emCurso: Promise<ContextoDoCalendario> | null = null;

/** O que a Identidade diz sobre o calendário. Nunca rejeita. */
export function calendarioDaIgreja(): Promise<ContextoDoCalendario> {
  if (!emCurso) {
    emCurso = carregar().catch(() => {
      emCurso = null; // a próxima tela tenta de novo
      return CONTEXTO_DESCONHECIDO;
    });
  }
  return emCurso;
}

/** Descarta o que foi carregado. Chamar depois de salvar a Identidade. */
export function esquecerCalendarioDaIgreja(): void {
  emCurso = null;
}

/** O mesmo, para telas que montam a agenda dentro de um `useMemo`. */
export function useCalendarioDaIgreja(): ContextoDoCalendario {
  const [ctx, setCtx] = useState<ContextoDoCalendario>(CONTEXTO_DESCONHECIDO);
  useEffect(() => {
    let vivo = true;
    calendarioDaIgreja().then((c) => { if (vivo) setCtx(c); });
    return () => { vivo = false; };
  }, []);
  return ctx;
}
