// ─── contasJaPagasService.ts — obrigações abertas que já têm pagamento registrado (carregar e liquidar) ─────────────────────────────
//
// Lê as obrigações abertas (previstas, vencidas ou a vencer em 10 dias) e os pagamentos soltos (realizados/conciliados SEM liquidação, recorrência,
// obrigação ou transferência) e entrega as sugestões de `lib/contasJaPagas.ts`. Liquidar chama `fin_liquidar_com_pagamento_existente` (migration
// 20261008220000), que funde os dois registros numa transação. Sem a migration a lista aparece e a ação avisa: nada quebra.
import { supabase } from "@/integrations/supabase/client";
import { daquiADias, hojeLocal } from "@/lib/data";
import {
  DIAS_ANTES_DO_VENCIMENTO, sugerirLiquidacoes, type ObrigacaoAberta, type PagamentoRegistrado, type SugestaoDeLiquidacao,
} from "@/lib/contasJaPagas";
import { planejarLiquidacao, type PlanoDeLiquidacao } from "@/lib/liquidacao";

const PAGINA = 1000;
const ZERO = "00000000-0000-0000-0000-000000000000";

async function nomesDe(fornecedorIds: string[], pessoaIds: string[]) {
  const forn = new Map<string, string>(), pes = new Map<string, string>();
  for (let i = 0; i < fornecedorIds.length; i += 200) {
    const { data } = await supabase.from("fin_fornecedores").select("id, nome").in("id", fornecedorIds.slice(i, i + 200));
    (data ?? []).forEach(f => forn.set(f.id, f.nome));
  }
  for (let i = 0; i < pessoaIds.length; i += 200) {
    const { data } = await supabase.from("membros").select("id, nome_completo").in("id", pessoaIds.slice(i, i + 200));
    (data ?? []).forEach(m => pes.set(m.id, m.nome_completo));
  }
  return { forn, pes };
}

export async function carregarSugestoesDeLiquidacao(): Promise<SugestaoDeLiquidacao[]> {
  const limite = daquiADias(hojeLocal(), 10);
  const previstos: Record<string, unknown>[] = [];
  for (let p = 0; ; p++) {
    const r = await supabase.from("fin_lancamentos").select("id, data, valor, descricao, fornecedor_id, pessoa_id, valor_variavel, conta_id")
      .eq("tipo", "saida").eq("status", "previsto").lte("data", limite).order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    previstos.push(...((r.data ?? []) as Record<string, unknown>[]));
    if ((r.data ?? []).length < PAGINA) break;
  }
  if (previstos.length === 0) return [];
  const maisAntigo = previstos.map(x => String(x.data).slice(0, 10)).sort()[0];
  const desde = daquiADias(maisAntigo, -DIAS_ANTES_DO_VENCIMENTO);

  const soltos: Record<string, unknown>[] = [];
  for (let p = 0; ; p++) {
    const r = await supabase.from("fin_lancamentos")
      .select("id, data, data_pagamento, valor, descricao, origem, fornecedor_id, pessoa_id, conta_id")
      .eq("tipo", "saida").in("status", ["realizado", "conciliado"])
      .is("liquidacao_id", null).is("obrigacao_id", null).is("recorrencia_id", null).is("lancamento_pai_id", null).neq("origem", "transferencia")
      .or(`data.gte.${desde},data_pagamento.gte.${desde}`).order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    soltos.push(...((r.data ?? []) as Record<string, unknown>[]));
    if ((r.data ?? []).length < PAGINA) break;
  }
  const ids = <K extends string>(xs: Record<string, unknown>[], k: K) => [...new Set(xs.map(x => x[k]).filter((v): v is string => typeof v === "string"))];
  const { forn, pes } = await nomesDe([...ids(previstos, "fornecedor_id"), ...ids(soltos, "fornecedor_id")], [...ids(previstos, "pessoa_id"), ...ids(soltos, "pessoa_id")]);
  const nomeDe = (x: Record<string, unknown>) => (x.fornecedor_id ? forn.get(String(x.fornecedor_id)) : null) ?? (x.pessoa_id ? pes.get(String(x.pessoa_id)) : null) ?? "";

  const obrigacoes: ObrigacaoAberta[] = previstos.map(x => ({
    id: String(x.id), valor: Number(x.valor), data: String(x.data).slice(0, 10), fornecedor_id: (x.fornecedor_id as string) ?? null, pessoa_id: (x.pessoa_id as string) ?? null,
    nome: nomeDe(x) || String(x.descricao ?? ""), valor_variavel: !!x.valor_variavel, conta_id: String(x.conta_id),
  }));
  const pagamentos: PagamentoRegistrado[] = soltos.map(x => ({
    id: String(x.id), valor: Number(x.valor), data: String(x.data_pagamento ?? x.data).slice(0, 10), nome: nomeDe(x), descricao: String(x.descricao ?? ""),
    fornecedor_id: (x.fornecedor_id as string) ?? null, pessoa_id: (x.pessoa_id as string) ?? null, origem: String(x.origem), conta_id: String(x.conta_id),
  }));
  return sugerirLiquidacoes(obrigacoes, pagamentos);
}

let sondagem: { em: number; ok: boolean } | null = null;
/** A função do banco existe? (sonda sem escrever nada: um id que não existe só pode terminar em "não encontrada") */
export async function fusaoDisponivel(): Promise<boolean> {
  if (sondagem && Date.now() - sondagem.em < 30_000) return sondagem.ok;
  const { error } = await supabase.rpc("fin_liquidar_com_pagamento_existente" as never, { p_previsto: ZERO, p_pagamento: ZERO, p_itens: [], p_encargos: [], p_adotar_valor: false } as never);
  const ok = !error || !/could not find the function|schema cache|does not exist/i.test(error.message);
  sondagem = { em: Date.now(), ok };
  return ok;
}
export function esquecerSondagemDaFusao() { sondagem = null; }

/**
 * O plano mais simples: o pagamento liquida a obrigação. `comoEstimativa` = a obrigação era só uma estimativa e o valor real é o do pagamento
 * (o documento passa a valer o que foi pago; nada fica a pagar). Sem isso, qualquer diferença exige ser explicada (parcial, desconto, juros…).
 */
export function planoDireto(s: SugestaoDeLiquidacao, comoEstimativa = false): PlanoDeLiquidacao {
  return planejarLiquidacao({
    documentos: [{ id: s.obrigacao.id, valor: comoEstimativa ? s.pagamento.valor : s.obrigacao.valor, vencimento: s.obrigacao.data }],
    valorPago: s.pagamento.valor, motivoMenos: null, motivoMais: null, juros: 0, multa: 0, complemento: 0, ajuste: 0, motivoDoAjuste: "",
  });
}

export async function liquidarComPagamentoExistente(p: { obrigacaoId: string; pagamentoId: string; plano: PlanoDeLiquidacao; adotarValor: boolean }): Promise<string> {
  if (!p.plano.pronto) throw new Error(p.plano.problemas[0] ?? "A diferença entre o documento e o pagamento ainda não foi explicada.");
  const { data, error } = await supabase.rpc("fin_liquidar_com_pagamento_existente" as never, {
    p_previsto: p.obrigacaoId, p_pagamento: p.pagamentoId, p_itens: p.plano.itens, p_encargos: p.plano.encargos, p_adotar_valor: p.adotarValor,
  } as never);
  if (error) {
    if (/could not find the function|schema cache/i.test(error.message)) throw new Error("Falta aplicar a migration 20261008220000 no banco para liquidar com o pagamento já registrado.");
    throw new Error(error.message);
  }
  esquecerSondagemDaFusao();
  return data as unknown as string;
}
