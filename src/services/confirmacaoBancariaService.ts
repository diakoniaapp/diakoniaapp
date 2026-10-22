// ─── confirmacaoBancariaService — quais lançamentos já têm a linha do BANCO ligada (OFX ou PDF) ───────────────────────────────────────────────────
//
// Decisão dela (22/10/2026): para pagamento automático (débito automático, Pix recorrente, transferência programada) a confirmação do banco SUBSTITUI o comprovante (`lib/documentacaoExigida.ts`).
// "Confirmação" = um vínculo ATIVO em `fin_extrato_vinculos` (migration 20261013120000): a linha do extrato OFX (`origem = 'ofx'`) ou do PDF do banco (`origem = 'pdf'`) ligada ao lançamento. Um
// vínculo desfeito (`desfeito_em`) não confirma nada. Também confirma a LIQUIDAÇÃO que guardou o identificador da linha do banco (`fin_liquidacoes.ofx_fitid`): um débito que pagou várias faturas
// de uma vez (caso Light, 22/10/2026) não gera um vínculo por fatura — o FITID fica na liquidação, e todas as faturas dela estão confirmadas. Antes da migration a tabela não existe: o mapa vem vazio e a regra volta a pedir o comprovante, como era.
import { supabase } from "@/integrations/supabase/client";

export type ConfirmacaoBancaria = "ofx" | "pdf";

/** lançamento → de onde vem a confirmação. Só entram os lançamentos que TÊM vínculo ativo. */
export async function confirmacoesBancarias(lancamentoIds: readonly string[]): Promise<Map<string, ConfirmacaoBancaria>> {
  const mapa = new Map<string, ConfirmacaoBancaria>();
  const ids = [...new Set(lancamentoIds)];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("fin_extrato_vinculos" as never).select("lancamento_id, origem, fitid")
      .in("lancamento_id" as never, ids.slice(i, i + 200) as never).is("desfeito_em" as never, null as never);
    if (error) return mapa;   // sem a tabela (migration ainda não aplicada) ou sem permissão: ninguém está confirmado
    for (const v of (data ?? []) as unknown as { lancamento_id: string | null; origem: string; fitid: string }[]) {
      if (!v.lancamento_id) continue;
      const pdf = v.origem === "pdf" || String(v.fitid).startsWith("PDF:");
      // se há dois, o OFX (a linha do próprio banco) pesa mais que o PDF
      if (!(mapa.get(v.lancamento_id) === "ofx" && pdf)) mapa.set(v.lancamento_id, pdf ? "pdf" : "ofx");
    }
  }
  // as liquidações que guardam o FITID do banco: todo lançamento delas está confirmado
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("fin_lancamentos").select("id, liquidacao_id" as never)
      .in("id", ids.slice(i, i + 200)).not("liquidacao_id" as never, "is", null);
    if (error) break;
    const deLiq = (data ?? []) as unknown as { id: string; liquidacao_id: string }[];
    if (deLiq.length === 0) continue;
    const liqs = await supabase.from("fin_liquidacoes" as never).select("id, ofx_fitid")
      .in("id" as never, [...new Set(deLiq.map(x => x.liquidacao_id))] as never).not("ofx_fitid" as never, "is", null);
    if (liqs.error) break;
    const fit = new Map(((liqs.data ?? []) as unknown as { id: string; ofx_fitid: string }[]).map(x => [x.id, x.ofx_fitid]));
    for (const x of deLiq) {
      const f = fit.get(x.liquidacao_id);
      if (!f || mapa.get(x.id) === "ofx") continue;
      mapa.set(x.id, String(f).startsWith("PDF:") ? "pdf" : "ofx");
    }
  }
  return mapa;
}
