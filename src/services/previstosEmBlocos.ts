// ─── previstosEmBlocos.ts — atualizar muitos lançamentos previstos sem estourar o statement_timeout ──────────────
//
// POR QUE existe: editar uma recorrência propaga o modelo novo (favorecido, categoria, valor, forma de liquidação) para
// todos os previstos futuros dela. Uma recorrência mensal sem data final chegou a ter centenas de previstos à frente
// (a tela mostrava "lançamentos até 08/12/2099"), e um único `UPDATE … WHERE …` sobre todos eles dispara os gatilhos
// de `fin_lancamentos` linha a linha e passa do limite do banco: "canceling statement due to statement timeout"
// (relato dela, 08/10/2026, ao editar a recorrência da Companhia Distribuidora de Gás, R$ 207).
// Aqui o conjunto é lido (só os ids) e atualizado em blocos pequenos — cada bloco é um comando com o seu próprio limite.

import { supabase } from "@/integrations/supabase/client";

const PAGINA = 1000;
const BLOCO = 40;

/**
 * `filtrar` recebe a consulta de `fin_lancamentos` já em `select("id")` e devolve-a com os filtros aplicados.
 * Devolve quantos lançamentos foram de fato atualizados. Erro em qualquer bloco interrompe e é lançado.
 */
export async function atualizarPrevistosEmBlocos(
  filtrar: (q: any) => any,
  patch: Record<string, unknown>,
  tamanhoDoBloco = BLOCO,
): Promise<number> {
  const ids: string[] = [];
  for (let p = 0; ; p++) {
    const q = filtrar(supabase.from("fin_lancamentos").select("id")).order("data").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    const { data, error } = await q;
    if (error) throw error;
    for (const l of data ?? []) ids.push(l.id as string);
    if ((data ?? []).length < PAGINA) break;
  }
  let n = 0;
  for (let i = 0; i < ids.length; i += tamanhoDoBloco) {
    const bloco = ids.slice(i, i + tamanhoDoBloco);
    // `status = previsto` de novo: se alguém liquidou um deles no meio do caminho, ele não é tocado
    const { data, error } = await (supabase.from("fin_lancamentos").update(patch as never) as any)
      .in("id", bloco).eq("status", "previsto").select("id");
    if (error) throw error;
    n += data?.length ?? 0;
  }
  return n;
}
