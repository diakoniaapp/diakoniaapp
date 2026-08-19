// ─── estruturaService.ts — quantas pessoas servem em cada lugar ────────────
//
// ── POR QUE ISTO EXISTE ───────────────────────────────────────────────────
//
// Três telas contavam gente na estrutura, e duas contavam na tabela errada:
//
//   /ministerios   contava por `area_voluntarios`   →  "35 integrantes"
//   /organograma   contava por `ministerio_membros` →  "0 pessoas"
//   /estrutura     contava por `ministerio_membros` →  "0 pessoas"
//
// Mesmo ministério, mesmo instante, dois números. `ministerio_membros` tem
// ZERO linhas — é um vínculo que o sistema nunca passou a usar. Quem serve
// está em `area_voluntarios`: 112 vínculos, 97 ativos, espalhados por 10
// áreas.
//
// A conta certa era a que menos gente via: /ministerios está atrás do menu de
// líderes, enquanto o organograma é a tela que se abre para mostrar a igreja.
//
// Agora há uma implementação só. Duas telas contando de dois jeitos é como
// duas testemunhas com versões diferentes — não adianta escolher a mais
// simpática, tem de sobrar uma.
//
// ── A REGRA DA CONTAGEM ───────────────────────────────────────────────────
//
// Pessoas DISTINTAS, e não vínculos. Quem serve na Recepção e na Introdução é
// uma pessoa em dois lugares, não duas pessoas — somar vínculos inflaria o
// ministério de Comunhão de 35 para 38 e ninguém saberia por quê.
//
// Só vínculo `ativa`. Os 15 `encerrada` são história: contá-los diria que a
// igreja tem gente servindo onde já saiu.

import { supabase } from "@/integrations/supabase/client";

/** Um vínculo de voluntário como está no banco. */
interface VinculoVoluntario {
  ministerio_id: string | null;
  area_id: string | null;
  membro_id: string;
  status: string | null;
}

export interface ContagemEstrutura {
  /** ministerio_id → pessoas distintas servindo em qualquer área dele */
  porMinisterio: Record<string, number>;
  /** area_id → pessoas distintas servindo nela */
  porArea: Record<string, number>;
}

const ATIVO = (s: string | null | undefined) => {
  const v = String(s ?? "").toLowerCase();
  // O enum grava "ativa"; aceito "ativo" porque o mesmo campo já apareceu nas
  // duas formas em telas diferentes, e recusar uma delas por causa de gênero
  // gramatical zeraria a contagem sem avisar.
  return v === "ativa" || v === "ativo";
};

export async function contarVoluntarios(): Promise<ContagemEstrutura> {
  const { data } = await supabase
    .from("area_voluntarios")
    .select("ministerio_id, area_id, membro_id, status");

  const porMin = new Map<string, Set<string>>();
  const porArea = new Map<string, Set<string>>();

  for (const v of ((data ?? []) as VinculoVoluntario[])) {
    if (!ATIVO(v.status)) continue;
    if (v.ministerio_id) {
      if (!porMin.has(v.ministerio_id)) porMin.set(v.ministerio_id, new Set());
      porMin.get(v.ministerio_id)!.add(v.membro_id);
    }
    if (v.area_id) {
      if (!porArea.has(v.area_id)) porArea.set(v.area_id, new Set());
      porArea.get(v.area_id)!.add(v.membro_id);
    }
  }

  const somar = (m: Map<string, Set<string>>) =>
    Object.fromEntries([...m].map(([k, s]) => [k, s.size]));

  return { porMinisterio: somar(porMin), porArea: somar(porArea) };
}

// ── O embed de líder de área precisa dizer QUAL chave usa ──────────────────
//
// `areas` passou a ter duas chaves estrangeiras para `membros` — lider_id e
// co_lider_id, criadas na migração 20260819040000. Com duas, o PostgREST não
// adivinha qual embed se quer e responde 300 com a lista de candidatas.
//
// Antes de existirem as chaves ele respondia 400 dizendo que não havia
// nenhuma. Trocar um erro pelo outro seria consertar pela metade: o nome da
// restrição no select é o que faz a consulta passar.
export const SELECT_AREA_COM_LIDER =
  "id, ministerio_id, nome, lider:membros!areas_lider_id_fkey(id, nome_completo, foto_url)";
