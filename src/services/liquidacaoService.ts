// ─── liquidacaoService.ts — liquidar de verdade (parcial, juros, multa, desconto, vários documentos) ────────
//
// Fala com a função `fin_liquidar` e a tabela `fin_liquidacoes` (migration 20261007100000). O app funciona ANTES
// da migration: `liquidacaoDisponivel()` sonda a tabela e, sem ela, o "Pagar" continua o de antes.
// A conta (soma dos documentos + encargos = valor pago) é feita em `lib/liquidacao.ts`; a função do banco confere
// de novo e recusa o que não fecha — a tela nunca é a única barreira.

import { supabase } from "@/integrations/supabase/client";
import type { PlanoDeLiquidacao } from "@/lib/liquidacao";

let sondagem: { em: number; ok: boolean } | null = null;

/** `true` quando a migration da liquidação foi aplicada. Resultado guardado por 30 s. */
export async function liquidacaoDisponivel(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.from("fin_liquidacoes" as never).select("id").limit(1);
  sondagem = { em: Date.now(), ok: !error };
  return !error;
}

export function esquecerSondagemDeLiquidacao() { sondagem = null; }

export interface PedidoDeLiquidacao {
  contaId: string;
  /** AAAA-MM-DD */
  data: string;
  plano: PlanoDeLiquidacao;
  comprovanteUrl?: string | null;
  observacoes?: string | null;
}

/** Devolve o id da liquidação. Erros da função (soma que não fecha, status errado…) chegam em português. */
export async function liquidar(p: PedidoDeLiquidacao): Promise<string> {
  const { data, error } = await supabase.rpc("fin_liquidar" as never, {
    p_conta_id: p.contaId,
    p_data: p.data,
    p_forma: null,
    p_valor_total: p.plano.valorPago,
    p_itens: p.plano.itens,
    p_encargos: p.plano.encargos,
    p_comprovante_url: p.comprovanteUrl ?? null,
    p_ofx_fitid: null,
    p_observacoes: p.observacoes ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}

export interface DocumentoEmAberto {
  id: string;
  valor: number;
  vencimento: string;
  descricao: string | null;
}

/** Outras obrigações em aberto do MESMO favorecido — para somar no mesmo pagamento ("outro documento incluído"). */
export async function documentosEmAbertoDoFavorecido(
  lancamento: { id: string; fornecedor_id: string | null },
): Promise<DocumentoEmAberto[]> {
  if (!lancamento.fornecedor_id) return [];
  const { data, error } = await supabase.from("fin_lancamentos")
    .select("id, valor, data, descricao")
    .eq("tipo", "saida").eq("status", "previsto").eq("fornecedor_id", lancamento.fornecedor_id)
    .neq("id", lancamento.id).order("data").limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map(l => ({ id: l.id, valor: Number(l.valor), vencimento: String(l.data).slice(0, 10), descricao: l.descricao }));
}
