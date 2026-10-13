// ─── encargosService.ts — os totais de juros, multa e desconto de um período (informação complementar) ──────────────────────────────────
//
// Opção A (13/10/2026): o total pago continua na categoria da obrigação; juros, multa e desconto NÃO viram linha de DRE, de orçamento nem de extrato.
// Este serviço só responde "quanto pagamos de juros / multa e quanto abatemos de desconto neste período", pelo MESMO critério de data que a tela usa
// (a data do lançamento, como o DRE e o Dashboard). Conta só dinheiro que saiu: realizado/conciliado. Poucas dezenas de linhas por ano (as que têm
// encargo), então uma consulta basta — mas pagina por segurança, porque o PostgREST corta em 1000 sem avisar.

import { supabase } from "@/integrations/supabase/client";
import { somarEncargos, type TotaisDeEncargos } from "@/lib/encargos";

const PAGINA = 1000;
const COLUNAS = "valor, valor_original, juros, multa, complemento, ajuste, desconto";

/** null quando as colunas ainda não existem no banco (migration 20261008200000 não aplicada) ou a consulta falha — o indicador simplesmente não aparece. */
export async function totaisDeEncargosNoPeriodo(de: string, ate: string): Promise<TotaisDeEncargos | null> {
  const linhas: Record<string, unknown>[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos").select(COLUNAS as never)
      .eq("tipo", "saida").in("status", ["realizado", "conciliado"])
      .gte("data", de).lte("data", ate)
      .or("juros.gt.0,multa.gt.0,desconto.gt.0,complemento.gt.0,ajuste.gt.0")
      .range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) return null;
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return somarEncargos(linhas);
}
