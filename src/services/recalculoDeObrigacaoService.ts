// ─── recalculoDeObrigacaoService.ts — "Recalcular guia": a obrigação em aberto muda de valor SEM perder a história ──────────────────────────────────────────────
//
// A regra mora no banco (`fin_recalcular_obrigacao`, migration 20261023160000): só Administração e Tesouraria, só despesa prevista e sem quitação por terceiro, novo valor maior, quebra fechando com a diferença,
// motivo e a NOVA GUIA anexada a esta despesa. Aqui: anexar a guia (o banco exige o anexo), chamar a função e traduzir os erros. A trilha de edição e o registro imutável do recálculo ficam por conta do banco.

import { supabase } from "@/integrations/supabase/client";
import { adicionarAnexo } from "@/services/finService";

export interface PedidoDeRecalculo {
  lancamentoId: string;
  novoValor: number;
  juros: number;
  multa: number;
  correcao: number;
  motivo: string;
  /** a nova guia (PDF/imagem) */
  guia: File;
}

/** O que ainda não foi aplicado no banco aparece como erro claro em vez de "função não existe". */
const RECADO_MIGRATION = "Falta aplicar a migration 20261023160000 no banco para recalcular a guia.";

export async function recalcularGuia(p: PedidoDeRecalculo): Promise<string> {
  // 1) a nova guia primeiro: o banco só recalcula se ela já estiver anexada a ESTA despesa
  const anexo = await adicionarAnexo(p.lancamentoId, p.guia, "guia");
  // 2) o recálculo (tudo ou nada, no banco)
  const { data, error } = await supabase.rpc("fin_recalcular_obrigacao" as never, {
    p_id: p.lancamentoId, p_novo_valor: p.novoValor, p_juros: p.juros, p_multa: p.multa, p_correcao: p.correcao, p_motivo: p.motivo.trim(), p_anexo_id: anexo.id,
  } as never) as unknown as { data: string | null; error: { message: string; code?: string } | null };
  if (error) {
    if (error.code === "PGRST202" || /fin_recalcular_obrigacao/.test(error.message) && /not find|does not exist|schema cache/i.test(error.message)) throw new Error(RECADO_MIGRATION);
    // a guia já foi anexada: a mensagem diz isso, para ninguém anexar de novo sem saber
    throw new Error(`${error.message} (A guia nova ficou anexada à despesa.)`);
  }
  return String(data);
}

export interface RecalculoRegistrado {
  id: string; valor_antes: number; valor_depois: number; juros: number; multa: number; correcao: number; motivo: string; por_nome: string | null; em: string;
}

/** O histórico de recálculos de uma despesa (vazio se não houve, ou se a migration não foi aplicada). */
export async function listarRecalculos(lancamentoId: string): Promise<RecalculoRegistrado[]> {
  const { data, error } = await supabase.from("fin_obrigacao_recalculos" as never)
    .select("id, valor_antes, valor_depois, juros, multa, correcao, motivo, por_nome, em").eq("obrigacao_id", lancamentoId).order("em", { ascending: true });
  if (error) return [];
  return ((data ?? []) as unknown as RecalculoRegistrado[]).map(r => ({ ...r, valor_antes: Number(r.valor_antes), valor_depois: Number(r.valor_depois), juros: Number(r.juros), multa: Number(r.multa), correcao: Number(r.correcao) }));
}
