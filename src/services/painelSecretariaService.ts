// ─── painelSecretariaService.ts ─────────────────────────────────────────────
//
// Os números do Painel da Secretaria.
//
// ── O RECORTE DE CADA COISA MORA EM UM LUGAR SÓ ────────────────────────────
//
// As pendências de cadastro NÃO são recontadas aqui: vêm de
// `lib/pendenciasCadastro.ts`, o mesmo arquivo que o cartão do painel de Home
// e o filtro da tela de Pessoas usam. Recontar seria abrir a porta para o
// painel dizer 64 e a lista mostrar 61 — o defeito que a agenda teve hoje de
// manhã, faixa anunciando 21 sobre uma lista de 22.
//
// ── POR QUE "SEM FAMÍLIA" É DIFERENÇA NO CLIENTE, E NÃO UM `NOT IN` ────────
//
// Não há coluna em `membros` que diga se a pessoa tem família: a resposta está
// na ausência de linha em `vinculos_familiares`. Um `not.in` pediria mandar
// os ~196 ids na URL da consulta, que estoura o tamanho e quebra em silêncio
// quando a igreja crescer.
//
// Duas consultas pequenas e uma diferença de conjuntos resolvem, e de quebra
// devolvem a CONTAGEM e a LISTA do mesmo cálculo — quem mostra a lista é quem
// conta, que é a regra que este projeto aprendeu a duras penas.

import { supabase } from "@/integrations/supabase/client";
import { PENDENCIAS_CADASTRO } from "@/lib/pendenciasCadastro";

export interface PessoaSemFamilia {
  id: string;
  nome_completo: string;
  tipo_pessoa: string;
}

export interface ResumoSecretaria {
  /** Uma entrada por pendência de `PENDENCIAS_CADASTRO`, na mesma ordem. */
  pendencias: { chave: string; quantidade: number }[];
  semFamilia: PessoaSemFamilia[];
  /** Reunião encerrada cuja ata ninguém lançou. A ata é da secretaria. */
  atasPendentes: number;
  pautasRascunho: number;
  /** Solicitações que ainda não terminaram — aprovadas ou rejeitadas saem. */
  membresiaEmAndamento: number;
}

export async function carregarPainelSecretaria(): Promise<ResumoSecretaria> {
  const contarPendencia = (i: number) =>
    PENDENCIAS_CADASTRO[i].filtrarConsulta(
      supabase.from("membros").select("id", { count: "exact", head: true }),
    );

  const [
    ativosRes, vinculosRes, atasRes, pautasRes, membresiaRes, ...pendRes
  ] = await Promise.all([
    supabase.from("membros").select("id, nome_completo, tipo_pessoa").eq("status", "ativo").order("nome_completo"),
    supabase.from("vinculos_familiares").select("membro_id"),
    supabase.from("gov_reunioes").select("id", { count: "exact", head: true })
      .eq("status", "concluida").is("ata_url", null),
    supabase.from("gov_pautas").select("id", { count: "exact", head: true })
      .eq("status", "rascunho"),
    supabase.from("solicitacoes_membresia").select("id", { count: "exact", head: true })
      .in("status", ["rascunho", "aguardando_documento", "pronta_assembleia"]),
    ...PENDENCIAS_CADASTRO.map((_, i) => contarPendencia(i)),
  ]);

  const comFamilia = new Set(
    ((vinculosRes.data ?? []) as { membro_id: string }[]).map(v => v.membro_id),
  );
  const semFamilia = ((ativosRes.data ?? []) as PessoaSemFamilia[])
    .filter(p => !comFamilia.has(p.id));

  return {
    pendencias: PENDENCIAS_CADASTRO.map((p, i) => ({
      chave: p.chave,
      quantidade: (pendRes[i] as { count: number | null }).count ?? 0,
    })),
    semFamilia,
    atasPendentes:        (atasRes as { count: number | null }).count ?? 0,
    pautasRascunho:       (pautasRes as { count: number | null }).count ?? 0,
    membresiaEmAndamento: (membresiaRes as { count: number | null }).count ?? 0,
  };
}
