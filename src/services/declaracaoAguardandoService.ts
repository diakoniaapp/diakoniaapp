// ─── declaracaoAguardandoService — quais obrigações têm a Declaração do Terceiro GERADA e esperando a assinatura do responsável ─────────────────────────────────────────────────────────────────
//
// Decisão dela (28/10/2026): a Declaração do Terceiro só passa a ser EXIGIDA depois da confirmação do responsável (a via assinada). Enquanto o documento foi gerado e espera a assinatura, a regra documental
// (`lib/documentacaoExigida.ts`, `declaracaoAguardandoAssinatura`) não o cobra: mostra o selo "Aguardando assinatura". Quem decide o estado é o banco (`fin_declaracao_estado`: a via mais nova existe, está
// ATUAL — o que o terceiro declarou não mudou depois de gerada — e ainda não tem o arquivo assinado). Uma via desatualizada NÃO espera assinatura: é a igreja que precisa gerar outra, então continua cobrada.
// Antes da migration da Declaração (ou sem permissão) a tabela não existe: o conjunto vem vazio e tudo continua cobrado como era.
import { supabase } from "@/integrations/supabase/client";

const LOTE = 200;

/** ids das OBRIGAÇÕES (raiz) cuja Declaração do Terceiro está gerada, atual e sem a via assinada. */
export async function obrigacoesAguardandoAssinatura(obrigacaoIds: readonly string[]): Promise<Set<string>> {
  const resultado = new Set<string>();
  const ids = [...new Set(obrigacaoIds)].filter(Boolean);
  const maisNova = new Map<string, { quitacao: string; obrigacao: string; versao: number; assinada: boolean }>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase.from("fin_declaracoes_terceiro" as never).select("quitacao_id, obrigacao_id, versao, assinada_anexo_id")
      .in("obrigacao_id" as never, ids.slice(i, i + LOTE) as never);
    if (error) return resultado;   // sem a tabela ou sem permissão: ninguém "espera assinatura" (continua cobrado)
    for (const d of (data ?? []) as unknown as { quitacao_id: string; obrigacao_id: string; versao: number; assinada_anexo_id: string | null }[]) {
      const atual = maisNova.get(d.quitacao_id);
      if (!atual || Number(d.versao) > atual.versao) maisNova.set(d.quitacao_id, { quitacao: d.quitacao_id, obrigacao: d.obrigacao_id, versao: Number(d.versao), assinada: !!d.assinada_anexo_id });
    }
  }
  // só as que a tabela diz "sem arquivo assinado" vão ao banco confirmar que a via está ATUAL (poucas: as ofertas à espera)
  const candidatas = [...maisNova.values()].filter(x => !x.assinada);
  await Promise.all(candidatas.map(async c => {
    const { data, error } = await supabase.rpc("fin_declaracao_estado" as never, { p_quitacao: c.quitacao } as never);
    if (!error && data === "aguardando_assinatura") resultado.add(c.obrigacao);
  }));
  return resultado;
}
