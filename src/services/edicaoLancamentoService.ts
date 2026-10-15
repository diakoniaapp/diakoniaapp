// ─── edicaoLancamentoService.ts — a trilha de edição e a pergunta "o que esta edição invalida?" (Fase 2A) ─────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";
import { impactoDaResposta, type CampoDaEdicao, type EdicaoDoLancamento, type ImpactoDaEdicao } from "@/lib/edicaoDeLancamento";
import { nomesDosUsuarios } from "@/services/usuariosNomesService";

/**
 * Antes de salvar: o que a edição pretendida faria com a declaração e as aprovações? `null` = não deu para saber (a migration ainda não está aplicada, ou a consulta falhou):
 * a tela não pergunta, e o banco continua sendo a barreira (recusa a edição que invalida sem motivo).
 */
export async function impactoDaEdicao(lancamentoId: string, patch: Record<string, unknown>): Promise<ImpactoDaEdicao | null> {
  try {
    const r = await supabase.rpc("fin_impacto_edicao" as never, { p_lancamento: lancamentoId, p_patch: patch } as never);
    if (r.error) return null;
    return impactoDaResposta(r.data);
  } catch { return null; }
}

/** A trilha imutável de edição dos lançamentos pedidos (mais antiga primeiro). Sem a tabela (migration não aplicada), lista vazia. */
export async function listarEdicoes(lancamentoIds: string[]): Promise<EdicaoDoLancamento[]> {
  const ids = [...new Set(lancamentoIds.filter(Boolean))];
  if (ids.length === 0) return [];
  try {
    const r = await supabase.from("fin_lancamento_historico" as never).select("*").in("lancamento_id" as never, ids as never).order("em" as never);
    if (r.error) return [];
    const linhas = (r.data ?? []) as unknown as Record<string, unknown>[];
    const faltaNome = linhas.filter(l => !l.por_nome && l.por).map(l => String(l.por));
    const nomes = faltaNome.length ? await nomesDosUsuarios(faltaNome) : new Map<string, string>();
    return linhas.map(l => ({
      id: String(l.id), lancamentoId: String(l.lancamento_id), campo: String(l.campo) as CampoDaEdicao,
      antes: (l.antes as string | null) ?? null, depois: (l.depois as string | null) ?? null,
      antesRotulo: (l.antes_rotulo as string | null) ?? null, depoisRotulo: (l.depois_rotulo as string | null) ?? null,
      motivo: (l.motivo as string | null) ?? null, invalidouDeclaracao: l.invalidou_declaracao === true,
      por: (l.por as string | null) ?? null, porNome: (l.por_nome as string | null) ?? (l.por ? nomes.get(String(l.por)) ?? null : null), em: String(l.em),
    }));
  } catch { return []; }
}
