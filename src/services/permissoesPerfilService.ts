// ─── permissoesPerfilService.ts — o que cada perfil pode fazer ──────────────
//
// ── DOIS MODELOS NO BANCO, E SÓ UM LIGADO ──────────────────────────────────
//
// Levantado em 20/08/2026, antes de escrever qualquer linha daqui:
//
//   VIVO   `permissoes` (39 códigos em 12 módulos) + `role_permissoes` (108
//          concessões). Alimenta `minhas_permissoes()`, que o React consome em
//          `usePermissoes` — e é ela que decide os widgets do painel e as
//          ações rápidas. Alimenta também `tem_permissao()`, usada por 15
//          políticas de RLS (arrecadação e manutenção).
//
//   MORTO  `permissoes_modulo` (72 linhas, com a grade pode_ver/pode_criar/
//          pode_editar/pode_excluir) e as funções `fn_permissao`,
//          `fn_contexto_usuario`, `fn_minha_permissao`,
//          `fn_todas_minhas_permissoes`. Contado: ZERO políticas e ZERO
//          código chamam qualquer uma delas.
//
// A tela mexe no VIVO. A grade de `permissoes_modulo` tem a forma mais bonita
// para uma tela de caixas de seleção — e é exatamente por isso que era a
// armadilha: marcar caixa ali não mudaria nada em lugar nenhum.
//
// ── O ALCANCE REAL DE UMA CAIXA MARCADA ────────────────────────────────────
//
// Marcar uma permissão muda o que a INTERFACE oferece, e muda as 15 políticas
// que consultam `tem_permissao()`. As outras 263 políticas de RLS nomeiam o
// papel diretamente e não olham para cá — nelas o banco continua sendo a
// palavra final.
//
// Isso não é um defeito a esconder: quando as duas discordam, quem escreve
// recebe o recado de `lib/escritaConferida.ts` em vez de um "salvo" que mente.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";
import type { AppRole } from "@/hooks/useAuth";

export interface Permissao {
  codigo: string;
  modulo: string;
  descricao: string | null;
}

export interface ModuloDePermissoes {
  modulo: string;
  permissoes: Permissao[];
}

/**
 * Rótulo humano de cada módulo.
 *
 * O banco guarda o módulo em minúscula e sem acento (`pessoas`, `ebd`,
 * `pgm`). Numa tela de configuração isso é aceitável de ler, mas não de
 * decidir: "pgm" não diz a ninguém que se trata de Pequenos Grupos.
 */
const ROTULO_MODULO: Record<string, string> = {
  areas:       "Áreas e ministérios",
  arrecadacao: "Bazar, cantina e manutenção",
  assuntos:    "Assuntos administrativos",
  ebd:         "Escola Bíblica",
  familias:    "Famílias",
  financeiro:  "Financeiro",
  governanca:  "Governança",
  membresia:   "Membresia",
  painel:      "Painéis",
  pessoas:     "Pessoas",
  pgm:         "Pequenos Grupos",
  sistema:     "Sistema",
};

export function rotuloDoModulo(modulo: string): string {
  return ROTULO_MODULO[modulo] ?? modulo;
}

/**
 * A ordem em que os módulos aparecem.
 *
 * Não é alfabética: "Pessoas" primeiro porque é o módulo que a igreja mexe
 * todo dia, e "Sistema" por último porque é o que quase nunca se toca — e é o
 * mais perigoso de marcar sem querer.
 */
const ORDEM_MODULO = [
  "pessoas", "familias", "membresia", "areas", "ebd", "pgm",
  "assuntos", "governanca", "painel", "financeiro", "arrecadacao", "sistema",
];

/** O catálogo inteiro, agrupado por módulo e na ordem de leitura. */
export async function catalogoDePermissoes(): Promise<ModuloDePermissoes[]> {
  const { data, error } = await supabase
    .from("permissoes")
    .select("codigo, modulo, descricao")
    .order("codigo");
  if (error) throw error;

  const porModulo = new Map<string, Permissao[]>();
  for (const p of (data ?? []) as Permissao[]) {
    if (!porModulo.has(p.modulo)) porModulo.set(p.modulo, []);
    porModulo.get(p.modulo)!.push(p);
  }

  return [...porModulo.entries()]
    .sort((a, b) => {
      const ia = ORDEM_MODULO.indexOf(a[0]);
      const ib = ORDEM_MODULO.indexOf(b[0]);
      // Módulo que ninguém previu vai para o fim, em ordem alfabética, em vez
      // de sumir ou aparecer no meio sem explicação.
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a[0].localeCompare(b[0]);
    })
    .map(([modulo, permissoes]) => ({ modulo, permissoes }));
}

/** Todas as concessões, como um conjunto de chaves `papel::codigo`. */
export async function concessoesAtuais(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("role_permissoes")
    .select("role, permissao_codigo");
  if (error) throw error;
  return new Set(
    (data ?? []).map((r: { role: string; permissao_codigo: string }) =>
      `${r.role}::${r.permissao_codigo}`),
  );
}

export function chaveDaConcessao(papel: AppRole, codigo: string): string {
  return `${papel}::${codigo}`;
}

/**
 * Conceder é inserir; revogar é apagar. Não há UPDATE — a linha é o par
 * (papel, código) e mais nada.
 *
 * As duas conferem o resultado: as políticas de INSERT e DELETE de
 * `role_permissoes` exigem `is_admin()`, e sem `.select()` um bloqueio de RLS
 * voltaria como sucesso. Numa tela de permissões isso seria especialmente
 * cruel — a caixa ficaria marcada, e a permissão não existiria.
 */
export async function conceder(papel: AppRole, codigo: string): Promise<ResultadoEscrita> {
  return conferir(
    await supabase
      .from("role_permissoes")
      .insert({ role: papel, permissao_codigo: codigo })
      .select("permissao_codigo"),
    "A permissão",
  );
}

export async function revogar(papel: AppRole, codigo: string): Promise<ResultadoEscrita> {
  return conferir(
    await supabase
      .from("role_permissoes")
      .delete()
      .eq("role", papel)
      .eq("permissao_codigo", codigo)
      .select("permissao_codigo"),
    "A revogação",
  );
}
