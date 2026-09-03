// ─── conferenciaLideranca.ts ─────────────────────────────────────────────────
// A ficha diz uma coisa, o cadastro das equipes diz outra. Quem tem razão?
//
// ── DUAS FONTES PARA UM FATO SÓ ──────────────────────────────────────────────
//
// A lista de cargos da ficha (`membros.funcoes_ministeriais`) tem 26 valores.
// Vinte e quatro deles são cargo de verdade — presidente, tesoureiro, diácono,
// auditor —, eleitos em ata e sem par no sistema. Dois não são:
//
//   `ministro`     duplica `ministerios.lider_id / vice_lider_id / co_lider_id`
//   `lider_area`   duplica `areas.lider_id / co_lider_id`
//
// E são exatamente esses dois que discordam da realidade. Os outros não
// discordam de nada porque não têm coluna com que discordar.
//
// ── QUEM MANDA É A COLUNA ────────────────────────────────────────────────────
//
// O acesso ao sistema sai do cadastro das equipes, nunca do rótulo da ficha —
// é `fn_minhas_areas()` e `fn_meus_ministerios()` que recortam tudo. O rótulo
// documenta; a coluna opera.
//
// Por isso esta tela edita SÓ O RÓTULO. Trocar quem lidera uma área é outro
// ato, com outras consequências, e mora no cadastro da área. Aqui se conserta
// a documentação para ela parar de contradizer o fato.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";

export type RotuloDeLideranca = "ministro" | "lider_area";

export const ROTULO_LEGIVEL: Record<RotuloDeLideranca, string> = {
  ministro: "Ministro",
  lider_area: "Líder de área",
};

export interface Divergencia {
  pessoa_id: string;
  nome: string;
  rotulo: RotuloDeLideranca;
  /** O que o cadastro das equipes diz. Vazio quando ela não lidera nada. */
  equipes: string[];
}

export interface Conferencia {
  /** Diz na ficha que lidera, e não lidera nada. O rótulo sai. */
  rotuloSozinho: Divergencia[];
  /** Lidera de verdade, e a ficha não diz. O rótulo entra. */
  cadastroSozinho: Divergencia[];
  /** As duas fontes concordam — nada a fazer, e vale dizer quantas são. */
  deAcordo: number;
}

export async function carregarConferencia(): Promise<Conferencia> {
  const [{ data: mins }, { data: areas }, { data: pessoas }] = await Promise.all([
    supabase.from("ministerios").select("nome, lider_id, vice_lider_id, co_lider_id").eq("ativo", true),
    supabase.from("areas").select("nome, lider_id, co_lider_id").eq("ativo", true),
    supabase.from("membros").select("id, nome_completo, funcoes_ministeriais"),
  ]);

  // pessoa → equipes que ela lidera, por eixo
  const porMinisterio = new Map<string, string[]>();
  for (const m of (mins ?? []) as any[]) {
    for (const id of [m.lider_id, m.vice_lider_id, m.co_lider_id]) {
      if (!id) continue;
      porMinisterio.set(id, [...(porMinisterio.get(id) ?? []), m.nome]);
    }
  }
  const porArea = new Map<string, string[]>();
  for (const a of (areas ?? []) as any[]) {
    for (const id of [a.lider_id, a.co_lider_id]) {
      if (!id) continue;
      porArea.set(id, [...(porArea.get(id) ?? []), a.nome]);
    }
  }

  const rotuloSozinho: Divergencia[] = [];
  const cadastroSozinho: Divergencia[] = [];
  let deAcordo = 0;

  for (const p of (pessoas ?? []) as any[]) {
    const rotulos: string[] = p.funcoes_ministeriais ?? [];
    for (const [rotulo, mapa] of [
      ["ministro", porMinisterio] as const,
      ["lider_area", porArea] as const,
    ]) {
      const temRotulo = rotulos.includes(rotulo);
      const equipes = mapa.get(p.id) ?? [];
      const lidera = equipes.length > 0;

      if (temRotulo && lidera) { deAcordo++; continue; }
      if (temRotulo && !lidera) {
        rotuloSozinho.push({ pessoa_id: p.id, nome: p.nome_completo, rotulo, equipes: [] });
      } else if (!temRotulo && lidera) {
        cadastroSozinho.push({ pessoa_id: p.id, nome: p.nome_completo, rotulo, equipes });
      }
    }
  }

  const porNome = (a: Divergencia, b: Divergencia) => a.nome.localeCompare(b.nome, "pt-BR");
  return {
    rotuloSozinho: rotuloSozinho.sort(porNome),
    cadastroSozinho: cadastroSozinho.sort(porNome),
    deAcordo,
  };
}

/**
 * Acrescenta ou tira um rótulo da ficha.
 *
 * Lê a lista atual e reescreve inteira, porque a coluna é um array e não há
 * como acrescentar um item pela API sem saber o que já está lá. A leitura e a
 * escrita são duas idas: se alguém mexer na ficha no meio, a segunda vence —
 * risco aceitável para uma tela de conferência que uma pessoa usa de cada vez.
 */
export async function ajustarRotulo(
  pessoaId: string, rotulo: RotuloDeLideranca, acao: "por" | "tirar",
): Promise<ResultadoEscrita> {
  const { data: atual, error } = await supabase
    .from("membros").select("funcoes_ministeriais").eq("id", pessoaId).maybeSingle();
  if (error) return { ok: false, erro: error.message };

  const lista: string[] = (atual as any)?.funcoes_ministeriais ?? [];
  const nova = acao === "por"
    ? (lista.includes(rotulo) ? lista : [...lista, rotulo])
    : lista.filter(f => f !== rotulo);

  const resultado = await supabase
    .from("membros")
    .update({ funcoes_ministeriais: nova as any })
    .eq("id", pessoaId)
    .select("id");

  return conferir(resultado, "O cargo na ficha");
}
