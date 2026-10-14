// ─── importacaoArquivosService.ts — checagens antes de importar um arquivo ──
//
// Estas duas funções moravam em `omieImportService.ts`. Com a aposentadoria do
// importador do Omie (14/10/2026) ficaram aqui, porque o importador de FATURA
// DE CARTÃO (`faturaImportService.ts`) as usa — e a tabela `fin_import_arquivos`
// continua sendo a trava de duplicidade dele (migration 20260915160000).
import { supabase } from "@/integrations/supabase/client";

/** Já existe uma importação bem-sucedida deste MESMO arquivo (mesmo hash)
 *  nesta conta? A tabela `fin_import_arquivos` é quem garante isto de
 *  verdade (constraint `unique(conta_id, arquivo_hash)`) — esta função é
 *  só a checagem ANTECIPADA, pra avisar antes de tentar, não a trava em si. */
export async function verificarArquivoJaImportado(
  contaId: string, hash: string,
): Promise<{ lote_tag: string; qtd_linhas: number; importado_em: string; data_min: string | null; data_max: string | null } | null> {
  const { data, error } = await supabase
    .from("fin_import_arquivos")
    .select("lote_tag, qtd_linhas, importado_em, data_min, data_max")
    .eq("conta_id", contaId)
    .eq("arquivo_hash", hash)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Quantos lançamentos essa conta JÁ TEM no intervalo de datas do arquivo
 *  que está prestes a ser importado — não bloqueia (reimportar um pedaço
 *  de período de propósito é uso legítimo, ex.: corrigir um mês), só avisa
 *  antes de confirmar. Qualquer origem conta (manual, transferência,
 *  importação anterior) — o que importa é se JÁ TEM MOVIMENTO ali, não de
 *  onde veio. */
export async function verificarSobreposicaoPeriodo(
  contaId: string, dataInicio: string, dataFim: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("fin_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("conta_id", contaId)
    .gte("data", dataInicio)
    .lte("data", dataFim);
  if (error) throw error;
  return count ?? 0;
}
