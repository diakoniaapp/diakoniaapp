// ─── cicloDaDespesaService.ts — tudo o que se sabe de UMA despesa, junto (documento, pagamento, OFX, conciliação, comprovante, malote) ────────────
// Só leitura. Reúne o lançamento, seus anexos, a liquidação, a situação da obrigação (juros/multa/desconto), o contrato (recorrência) e o último dia
// coberto por um extrato importado na conta, e entrega o ciclo calculado por `lib/cicloDaDespesa.ts`.
import { supabase } from "@/integrations/supabase/client";
import { cicloDaDespesa, ofxVinculado, periodoAprovadoCobre, type CicloDaDespesa } from "@/lib/cicloDaDespesa";
import { parcelasDoGrupo, raizDaObrigacao, type LinhaDoGrupo, type ParcelaDoGrupo } from "@/lib/grupoDaObrigacao";
import { dispensaDocumento } from "@/lib/pacoteContabil";
import { hojeLocal } from "@/lib/data";
import { listarAnexos, type FinLancamentoAnexo, type FinLancamentoExtenso } from "@/services/finService";

export interface DetalhesDaDespesa {
  ciclo: CicloDaDespesa | null;
  /** os anexos de TODAS as linhas da obrigação (cada um traz o `lancamento_id` de onde veio) — num pagamento parcial o boleto fica na raiz e o comprovante na parcela */
  anexos: FinLancamentoAnexo[];
  /** as linhas da obrigação (uma só, quando não houve baixa parcial) */
  parcelas: ParcelaDoGrupo[];
  /** algum comprovante antigo (coluna `comprovante_url`) em qualquer linha do grupo */
  comprovanteAntigo: string | null;
  /** o ato de pagar (fin_liquidacoes), quando houve */
  liquidacao: { id: string; data_pagamento: string; valor_total: number; ofx_fitid: string | null; created_at: string } | null;
  /** a situação da obrigação com juros, multa e desconto (vw_fin_obrigacoes), quando existe */
  obrigacao: { valor_original: number; juros: number; multa: number; complemento: number; ajuste: number; desconto: number; total_pago: number; situacao: string } | null;
  contrato: string | null;
  contaNome: string;
  contaTipo: string;
  ofx: string | null;
  /** os vínculos com a linha do banco desta obrigação — os ativos e os já fechados (patrimônio histórico: nunca somem) */
  vinculos: VinculoDoBanco[];
  /** quem conferiu à mão e quando (null no histórico e onde as colunas ainda não existem) */
  conferidoPor: { em: string; nome: string | null; nota: string | null } | null;
  /** o envio ATIVO (despesa Enviada ou Arquivada); null = nunca enviada, ou reaberta */
  envio: { ano: number; mes: number; enviadoEm: string | null; periodoAprovado: boolean } | null;
  /** as reaberturas desta obrigação: motivo, quando, quem, estado anterior e novo (patrimônio histórico) */
  reaberturas: { motivo: string; em: string; por: string | null; anterior: string; novo: string }[];
  /** trocas da conta desta despesa (a conta NÃO é congelada pelo envio, mas toda troca fica registrada) */
  contasAlteradas: { em: string; por: string | null; de: string; para: string; estavaEnviada: boolean }[];
}

export interface VinculoDoBanco {
  fitid: string;
  origem: "ofx" | "pdf";
  vinculadoEm: string;
  ativo: boolean;
  desfeitoEm: string | null;
  desfeitoMotivo: string | null;
  /** o vínculo é desta linha (e não de uma irmã da mesma obrigação) */
  daLinha: boolean;
}

export async function carregarDetalhesDaDespesa(l: FinLancamentoExtenso): Promise<DetalhesDaDespesa> {
  const conta = await supabase.from("fin_contas").select("nome, tipo").eq("id", l.conta_id).maybeSingle();
  const contaTipo = String(conta.data?.tipo ?? "banco");
  const raiz = raizDaObrigacao(l);
  const [grupoRes, liq, obr, rec, extrato, vincRes, itemRes, fechRes, reabRes, contaAltRes] = await Promise.all([
    supabase.from("fin_lancamentos").select("id, obrigacao_id, data, data_pagamento, status, valor, comprovante_url").or(`id.eq.${raiz},obrigacao_id.eq.${raiz}`),
    l.liquidacao_id ? supabase.from("fin_liquidacoes" as never).select("id, data_pagamento, valor_total, ofx_fitid, created_at").eq("id" as never, l.liquidacao_id as never).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("vw_fin_obrigacoes" as never).select("valor_original, juros, multa, complemento, ajuste, desconto, total_pago, situacao").eq("obrigacao_id" as never, (l.obrigacao_id ?? l.id) as never).maybeSingle(),
    l.recorrencia_id ? supabase.from("fin_recorrencias").select("descricao").eq("id", l.recorrencia_id).maybeSingle() : Promise.resolve({ data: null }),
    contaTipo === "banco"
      ? supabase.from("fin_lancamentos").select("data, data_pagamento").eq("conta_id", l.conta_id).like("observacoes", "%[ofx:%").not("observacoes", "like", "%[ofx:PDF:%").order("data", { ascending: false }).limit(1)
      : Promise.resolve({ data: [] as { data: string; data_pagamento: string | null }[] }),
    // os vínculos da obrigação (migration 20261013120000): sem a tabela, a lista simplesmente fica vazia
    supabase.from("fin_extrato_vinculos" as never).select("fitid, origem, lancamento_id, vinculado_em, desfeito_em, desfeito_motivo")
      .eq("obrigacao_id" as never, raiz as never).order("vinculado_em" as never),
    // o envio ativo, os períodos aprovados e as reaberturas (migration 20261013130000): sem as tabelas, a despesa simplesmente não está enviada
    supabase.from("fin_malote_itens" as never).select("envio_id, ano, mes, incluido_em").eq("lancamento_id" as never, l.id as never).is("reaberto_em" as never, null as never).maybeSingle(),
    supabase.from("fin_fechamentos_periodo" as never).select("status, ano_inicio, mes_inicio, qtd_meses").eq("status" as never, "aprovado" as never),
    supabase.from("fin_reaberturas" as never).select("motivo, reaberto_em, reaberto_por, estado_anterior, estado_novo").eq("obrigacao_id" as never, raiz as never).order("reaberto_em" as never),
    supabase.from("fin_conta_alteracoes" as never).select("alterado_em, alterado_por, conta_anterior_nome, conta_nova_nome, despesa_enviada").eq("obrigacao_id" as never, raiz as never).order("alterado_em" as never),
  ]);
  const item = itemRes.error ? null : (itemRes.data as unknown as { ano: number; mes: number; incluido_em: string } | null);
  const envio = item ? { ano: Number(item.ano), mes: Number(item.mes), enviadoEm: item.incluido_em ?? null,
    periodoAprovado: periodoAprovadoCobre(((fechRes.data ?? []) as unknown as { status: string; ano_inicio: number; mes_inicio: number; qtd_meses: number }[]), Number(item.ano), Number(item.mes)) } : null;
  // o grupo: sempre inclui a própria linha, mesmo que a consulta falhe ou o RLS esconda as irmãs
  const linhas = ((grupoRes.data ?? []) as unknown as LinhaDoGrupo[]);
  const grupo: LinhaDoGrupo[] = linhas.some(x => x.id === l.id) ? linhas : [...linhas, { id: l.id, obrigacao_id: l.obrigacao_id, data: l.data, data_pagamento: l.data_pagamento, status: l.status, valor: l.valor, comprovante_url: l.comprovante_url }];
  const anexos = (await Promise.all(grupo.map(x => listarAnexos(x.id).catch(() => [] as FinLancamentoAnexo[])))).flat();
  const parcelas = parcelasDoGrupo(grupo, l.id, raiz);
  const comprovanteAntigo = l.comprovante_url ?? grupo.find(x => x.comprovante_url)?.comprovante_url ?? null;
  const ultimo = (extrato.data ?? [])[0];
  // o DOCUMENTO é da obrigação (vale o de qualquer linha do grupo); o COMPROVANTE é do pagamento (só o desta linha)
  const temComprovante = !!l.comprovante_url || anexos.some(a => a.tipo === "comprovante" && a.lancamento_id === l.id);
  const temDocumento = anexos.some(a => a.tipo !== "comprovante");
  const ciclo = cicloDaDespesa({
    tipo: l.tipo, status: l.status, data: String(l.data).slice(0, 10), data_pagamento: l.data_pagamento, observacoes: l.observacoes, origem: l.origem, contaTipo,
    ultimoExtratoDaConta: ultimo ? String(ultimo.data_pagamento ?? ultimo.data).slice(0, 10) : null,
    envio: envio ? { ano: envio.ano, mes: envio.mes, periodoAprovado: envio.periodoAprovado } : null,
    temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, temDocumento, temComprovante,
    dispensaDocumento: dispensaDocumento({ categoria_nome: l.categoria_nome }), hoje: hojeLocal(),
  });
  const o = obr.data as unknown as Record<string, unknown> | null;
  const vinculos: VinculoDoBanco[] = ((vincRes.data ?? []) as unknown as Record<string, unknown>[]).map(v => ({
    fitid: String(v.fitid), origem: v.origem === "pdf" ? "pdf" : "ofx", vinculadoEm: String(v.vinculado_em), ativo: !v.desfeito_em,
    desfeitoEm: (v.desfeito_em as string) ?? null, desfeitoMotivo: (v.desfeito_motivo as string) ?? null, daLinha: v.lancamento_id === l.id || v.lancamento_id == null,
  }));
  const conf = l as unknown as { conferido_em?: string | null; conferido_por?: string | null; conferencia_nota?: string | null };
  let conferidoPor: DetalhesDaDespesa["conferidoPor"] = null;
  if (conf.conferido_em) {
    let nome: string | null = null;
    if (conf.conferido_por) { try { nome = (await supabase.from("profiles").select("nome").eq("id", conf.conferido_por).maybeSingle()).data?.nome ?? null; } catch { /* só o nome */ } }
    conferidoPor = { em: conf.conferido_em, nome, nota: conf.conferencia_nota ?? null };
  }
  return {
    ciclo, anexos, parcelas, comprovanteAntigo, vinculos, conferidoPor, envio,
    contasAlteradas: contaAltRes.error ? [] : ((contaAltRes.data ?? []) as unknown as Record<string, unknown>[]).map(r => ({
      em: String(r.alterado_em), por: null, de: String(r.conta_anterior_nome ?? "?"), para: String(r.conta_nova_nome ?? "?"), estavaEnviada: !!r.despesa_enviada,
    })),
    reaberturas: reabRes.error ? [] : ((reabRes.data ?? []) as unknown as Record<string, unknown>[]).map(r => ({
      motivo: String(r.motivo), em: String(r.reaberto_em), por: null, anterior: String(r.estado_anterior), novo: String(r.estado_novo),
    })),
    liquidacao: (liq.data as DetalhesDaDespesa["liquidacao"]) ?? null,
    obrigacao: o ? {
      valor_original: Number(o.valor_original), juros: Number(o.juros), multa: Number(o.multa), complemento: Number(o.complemento), ajuste: Number(o.ajuste),
      desconto: Number(o.desconto), total_pago: Number(o.total_pago), situacao: String(o.situacao),
    } : null,
    contrato: (rec.data as { descricao?: string } | null)?.descricao ?? null,
    contaNome: String(conta.data?.nome ?? ""), contaTipo, ofx: ofxVinculado(l.observacoes),
  };
}
