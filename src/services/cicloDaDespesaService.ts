// ─── cicloDaDespesaService.ts — tudo o que se sabe de UMA despesa, junto (documento, pagamento, OFX, conciliação, comprovante, malote) ────────────
// Só leitura. Reúne o lançamento, seus anexos, a liquidação, a situação da obrigação (juros/multa/desconto), o contrato (recorrência) e o último dia
// coberto por um extrato importado na conta, e entrega o ciclo calculado por `lib/cicloDaDespesa.ts`.
import { supabase } from "@/integrations/supabase/client";
import { cicloDaDespesa, ofxVinculado, periodoAprovadoCobre, type CicloDaDespesa } from "@/lib/cicloDaDespesa";
import { parcelasDoGrupo, raizDaObrigacao, type LinhaDoGrupo, type ParcelaDoGrupo } from "@/lib/grupoDaObrigacao";
import { dispensaDocumento } from "@/lib/pacoteContabil";
import { documentacaoDaSaida } from "@/lib/documentacaoExigida";
import { ehDocumentoOriginal, ehTerceiro } from "@/lib/quitacao";
import { quitacaoDaObrigacao, type QuitacaoDaObrigacao } from "@/services/quitacaoService";
import { hojeLocal } from "@/lib/data";
import { listarAnexos, type FinLancamentoAnexo, type FinLancamentoExtenso } from "@/services/finService";
import { listarEdicoes } from "@/services/edicaoLancamentoService";
import { nomesDosUsuarios } from "@/services/usuariosNomesService";
import type { EdicaoDoLancamento } from "@/lib/edicaoDeLancamento";

export interface DetalhesDaDespesa {
  ciclo: CicloDaDespesa | null;
  /** a Quitação (quem pagou e por quê) desta obrigação, quando um terceiro pagou ou a igreja marcou "Não localizado"; null = nenhuma (ou a Política ainda não foi aplicada no banco) */
  quitacao: QuitacaoDaObrigacao | null;
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
  /** a trilha imutável de edição (valor, data, fornecedor, favorecido, categoria, centro, projeto, conta, número e chave da nota): antes, depois, quem, quando e o motivo */
  edicoes: EdicaoDoLancamento[];
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

/** A liquidação que guardou o FITID do banco (um débito que pagou várias faturas) também confirma o pagamento. */
function confirmacaoDaLiquidacao(ofxFitid: string | null | undefined): "ofx" | "pdf" | null {
  return ofxFitid ? (String(ofxFitid).startsWith("PDF:") ? "pdf" : "ofx") : null;
}

/** A confirmação do banco (OFX ou PDF) da linha: o vínculo ATIVO dela. Pura sobre os vínculos já lidos da obrigação. */
function confirmacaoDaLinha(vinculos: Record<string, unknown>[], lancamentoId: string): "ofx" | "pdf" | null {
  const meus = vinculos.filter(v => !v.desfeito_em && v.lancamento_id === lancamentoId);
  if (meus.length === 0) return null;
  return meus.some(v => v.origem !== "pdf" && !String(v.fitid ?? "").startsWith("PDF:")) ? "ofx" : "pdf";
}

export async function carregarDetalhesDaDespesa(l: FinLancamentoExtenso): Promise<DetalhesDaDespesa> {
  const conta = await supabase.from("fin_contas").select("nome, tipo").eq("id", l.conta_id).maybeSingle();
  const contaTipo = String(conta.data?.tipo ?? "banco");
  const raiz = raizDaObrigacao(l);
  const [grupoRes, liq, obr, rec, extrato, vincRes, itemRes, fechRes, reabRes, contaAltRes, quitacao, edicoes] = await Promise.all([
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
    quitacaoDaObrigacao(l.id).catch(() => null),
    listarEdicoes([l.id, raiz]),
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
  // as provas da quitação (declaração, pedido de reembolso, prova do pagamento do terceiro) NÃO são o documento original da despesa (a mesma regra de vw_fin_ciclo)
  const temDocumento = anexos.some(a => ehDocumentoOriginal(a.tipo));
  // a REGRA ÚNICA de completude documental (20/10/2026): o documento certo para o tipo da despesa; o COMPROVANTE é do pagamento (só o desta linha), o resto é da obrigação inteira
  const documentacao = documentacaoDaSaida({
    categoriaNome: l.categoria_nome, status: String(l.status), contaTipo, temComprovanteAntigo: !!l.comprovante_url,
    tipos: anexos.filter(a => a.tipo !== "comprovante" || a.lancamento_id === l.id).map(a => a.tipo),
    intencao: quitacao?.intencao ?? null, terceiroQuitou: !!quitacao && ehTerceiro(quitacao.responsavel),
    temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, documentoNumero: l.documento_numero ?? null,
    // pagamento automático: a linha do banco (OFX/PDF) ligada a ESTA linha substitui o comprovante
    formaLiquidacao: l.forma_liquidacao ?? null,
    confirmacaoBancaria: confirmacaoDaLinha(((vincRes.data ?? []) as unknown as Record<string, unknown>[]), l.id)
      ?? confirmacaoDaLiquidacao((liq.data as unknown as { ofx_fitid?: string | null } | null)?.ofx_fitid),
  });
  const ciclo = cicloDaDespesa({
    tipo: l.tipo, status: l.status, data: String(l.data).slice(0, 10), data_pagamento: l.data_pagamento, observacoes: l.observacoes, origem: l.origem, contaTipo,
    ultimoExtratoDaConta: ultimo ? String(ultimo.data_pagamento ?? ultimo.data).slice(0, 10) : null,
    envio: envio ? { ano: envio.ano, mes: envio.mes, periodoAprovado: envio.periodoAprovado } : null,
    temCategoria: !!l.categoria_id, temCentro: !!l.centro_custo_id, temDocumento, temComprovante,
    dispensaDocumento: dispensaDocumento({ categoria_nome: l.categoria_nome }), hoje: hojeLocal(), documentacao, formaLiquidacao: l.forma_liquidacao ?? null,
    terceiroQuitou: !!quitacao && ehTerceiro(quitacao.responsavel),
    conferidoEm: (l as unknown as { conferido_em?: string | null }).conferido_em ?? null,
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
    if (conf.conferido_por) { nome = (await nomesDosUsuarios([conf.conferido_por])).get(conf.conferido_por) ?? null; }
    conferidoPor = { em: conf.conferido_em, nome, nota: conf.conferencia_nota ?? null };
  }
  // quem reabriu e quem trocou a conta: antes saíam em branco (a tabela de perfis não deixa a Tesouraria ler o nome dos outros)
  const linhasReab = reabRes.error ? [] : ((reabRes.data ?? []) as unknown as Record<string, unknown>[]);
  const linhasConta = contaAltRes.error ? [] : ((contaAltRes.data ?? []) as unknown as Record<string, unknown>[]);
  const nomes = await nomesDosUsuarios([...linhasReab.map(r => r.reaberto_por as string | null), ...linhasConta.map(r => r.alterado_por as string | null)]);
  return {
    ciclo, quitacao, anexos, parcelas, comprovanteAntigo, vinculos, conferidoPor, envio,
    contasAlteradas: linhasConta.map(r => ({
      em: String(r.alterado_em), por: r.alterado_por ? nomes.get(String(r.alterado_por)) ?? null : null, de: String(r.conta_anterior_nome ?? "?"), para: String(r.conta_nova_nome ?? "?"), estavaEnviada: !!r.despesa_enviada,
    })),
    reaberturas: linhasReab.map(r => ({
      motivo: String(r.motivo), em: String(r.reaberto_em), por: r.reaberto_por ? nomes.get(String(r.reaberto_por)) ?? null : null, anterior: String(r.estado_anterior), novo: String(r.estado_novo),
    })),
    edicoes,
    liquidacao: (liq.data as DetalhesDaDespesa["liquidacao"]) ?? null,
    obrigacao: o ? {
      valor_original: Number(o.valor_original), juros: Number(o.juros), multa: Number(o.multa), complemento: Number(o.complemento), ajuste: Number(o.ajuste),
      desconto: Number(o.desconto), total_pago: Number(o.total_pago), situacao: String(o.situacao),
    } : null,
    contrato: (rec.data as { descricao?: string } | null)?.descricao ?? null,
    contaNome: String(conta.data?.nome ?? ""), contaTipo, ofx: ofxVinculado(l.observacoes),
  };
}
