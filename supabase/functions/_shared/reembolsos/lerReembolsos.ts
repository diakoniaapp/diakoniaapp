// ─── lerReembolsos — a lista de reembolsos a pagar para os e-mails (a função do banco, sem derrubar o e-mail se ela faltar) ─────────────────────────────────────────────────────────
import type { ReembolsoParaExibir } from "./apresentacao.ts";

/**
 * Lê `resumo_reembolsos_a_pagar()`. Sem a migration 20261022230000 (ou em qualquer erro) devolve lista vazia: o e-mail sai como antes, sem a lista — nunca deixa de sair por isso.
 * `cliente` é só o que se usa do supabase-js (o módulo não importa a biblioteca).
 */
export async function lerReembolsosAPagar(cliente: { rpc: (nome: string) => PromiseLike<{ data: unknown; error: unknown }> }): Promise<ReembolsoParaExibir[]> {
  try {
    const r = await cliente.rpc("resumo_reembolsos_a_pagar");
    if (r.error || !Array.isArray(r.data)) return [];
    return (r.data as Record<string, unknown>[]).map(x => ({
      obrigacao_id: x.obrigacao_id ? String(x.obrigacao_id) : undefined,
      quem_recebe: x.quem_recebe ? String(x.quem_recebe) : null,
      tipo_de_quem_recebe: x.tipo_de_quem_recebe ? String(x.tipo_de_quem_recebe) : null,
      quitou: x.quitou ? String(x.quitou) : null,
      descricao: x.descricao ? String(x.descricao) : null,
      valor: Number(x.valor ?? 0),
      valor_obrigacao: x.valor_obrigacao === null || x.valor_obrigacao === undefined ? undefined : Number(x.valor_obrigacao),
      conta_prevista: x.conta_prevista ? String(x.conta_prevista) : null,
      data_despesa: x.data_despesa ? String(x.data_despesa).slice(0, 10) : undefined,
      ultimo_envio: x.ultimo_envio ? String(x.ultimo_envio) : null,
    }));
  } catch {
    return [];
  }
}
