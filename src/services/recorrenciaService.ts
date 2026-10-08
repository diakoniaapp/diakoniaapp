// ─── recorrenciaService.ts — gerar os previstos de uma recorrência e ler o histórico ──
//
// As regras (datas, parcelas, horizonte) estão em `lib/recorrencia.ts`; o resumo do histórico
// do favorecido, em `lib/habitosDoFavorecido.ts`. Aqui ficam só as idas ao banco.
//
// POR QUE a geração saiu da função SQL `fin_gerar_recorrencias`: ela cortava em 90 dias,
// ignorava a data de início e não contava parcelas (ver o cabeçalho de lib/recorrencia.ts).
// Gerar aqui deixa a regra testável e deixa cada previsto nascer com o MODELO inteiro da
// recorrência — favorecido (fornecedor ou pessoa), categoria, centro (e subcentro: é o mesmo
// campo), conta, valor, forma de liquidação — e com o vínculo `recorrencia_id`.
//
// As colunas novas (migrations 20261006120000 e 20261006150000) podem ainda não existir no
// banco: cada uma é sondada uma vez e, se faltar, a geração segue SEM ela — o corte em dezembro
// fica corrigido mesmo antes de a migration ser aplicada.

import { supabase } from "@/integrations/supabase/client";
import { hojeLocal } from "@/lib/data";
import { dataFimReal, ocorrenciasAGerar, precisaRenovar, rotuloDaParcela, type ParametrosDaSerie, type Ocorrencia } from "@/lib/recorrencia";
import { resumirHabitos, PAGAMENTOS_PARA_HABITO, type HabitosDoFavorecido, type PagamentoDoHistorico } from "@/lib/habitosDoFavorecido";
import { normalizarLiquidacao } from "@/lib/formaLiquidacao";
import { listarRecorrencias, type FinRecorrencia } from "@/services/finService";
import { atualizarPrevistosEmBlocos } from "@/services/previstosEmBlocos";

const BLOCO = 50;   // cada linha dispara os gatilhos de fin_lancamentos: blocos menores ficam longe do statement_timeout

// ── sondagem das colunas novas ─────────────────────────────────────────────

const cache = new Map<string, boolean>();
async function colunaExiste(tabela: string, coluna: string): Promise<boolean> {
  const chave = `${tabela}.${coluna}`;
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado;
  const { error } = await supabase.from(tabela as never).select(coluna).limit(1);
  const ok = !error;
  cache.set(chave, ok);
  return ok;
}
/** Só para os testes/diagnóstico: esquece o que foi sondado. */
export function esquecerSondagem() { cache.clear(); }

export async function modeloCompletoDisponivel(): Promise<boolean> {
  return colunaExiste("fin_lancamentos", "recorrencia_id");
}

// ── geração ────────────────────────────────────────────────────────────────

export function parametrosDaRecorrencia(rec: FinRecorrencia): ParametrosDaSerie {
  const parcelado = rec.tipo_recorrencia === "parcelamento" && !!rec.total_parcelas;
  return {
    dataInicio: rec.data_inicio,
    diaVencimento: rec.dia_vencimento,
    frequencia: rec.frequencia,
    tipo: parcelado ? "parcelamento" : "continua",
    totalParcelas: parcelado ? rec.total_parcelas : null,
    parcelaInicial: parcelado ? rec.parcela_inicial ?? 1 : null,
    dataFim: parcelado ? null : dataFimReal(rec.data_fim),   // 2099-12-31 = "sem fim" do legado
  };
}

/** As datas que a recorrência já tem (qualquer situação — inclusive cancelada, para não ressuscitar). */
async function datasJaGeradas(rec: FinRecorrencia, temVinculo: boolean): Promise<Set<string>> {
  const datas = new Set<string>();
  // `q` devolve a consulta ainda sem a paginação (tipo solto: o cliente tipado não aceita nome de tabela dinâmico aqui)
  const ler = async (q: () => any) => {
    for (let p = 0; ; p++) {
      const { data, error } = await q().order("data").range(p * 1000, p * 1000 + 999);
      if (error) throw error;
      for (const l of data ?? []) datas.add(String(l.data).slice(0, 10));
      if ((data ?? []).length < 1000) break;
    }
  };
  if (temVinculo) await ler(() => supabase.from("fin_lancamentos").select("data").eq("recorrencia_id", rec.id));
  // os de antes do vínculo: mesma descrição, conta e tipo, nascidos de recorrência
  await ler(() => supabase.from("fin_lancamentos").select("data")
    .eq("origem", "recorrencia").eq("descricao", rec.descricao).eq("conta_id", rec.conta_id).eq("tipo", rec.tipo));
  return datas;
}

const primeiroDoMes = (ymd: string) => `${ymd.slice(0, 7)}-01`;

export interface ResultadoDaGeracao { criados: number; ultimaData: string | null; ignoradosPorErro: number }

export async function gerarOcorrencias(rec: FinRecorrencia, hoje = hojeLocal()): Promise<ResultadoDaGeracao> {
  const [temVinculo, temLiquidacao, temPessoa] = await Promise.all([
    colunaExiste("fin_lancamentos", "recorrencia_id"),
    colunaExiste("fin_lancamentos", "forma_liquidacao"),
    colunaExiste("fin_lancamentos", "pessoa_id"),
  ]);
  const params = parametrosDaRecorrencia(rec);
  const jaGeradas = await datasJaGeradas(rec, temVinculo);
  const novas: Ocorrencia[] = ocorrenciasAGerar(params, hoje, jaGeradas);
  if (novas.length === 0) return { criados: 0, ultimaData: null, ignoradosPorErro: 0 };

  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();
  const linhas = novas.map(o => {
    const l: Record<string, unknown> = {
      data: o.data, data_competencia: primeiroDoMes(o.data), tipo: rec.tipo, status: "previsto",
      conta_id: rec.conta_id, categoria_id: rec.categoria_id, centro_custo_id: rec.centro_custo_id,
      fornecedor_id: rec.fornecedor_id, valor: rec.valor, origem: "recorrencia",
      descricao: o.parcela ? `${rec.descricao} (${rotuloDaParcela(o.parcela, o.totalParcelas!)})` : rec.descricao,
      audit_user_id: userId, audit_em: agora,
    };
    if (temPessoa && rec.pessoa_id) l.pessoa_id = rec.pessoa_id;
    if (temVinculo) {
      l.recorrencia_id = rec.id;
      if (o.parcela) { l.parcela_numero = o.parcela; l.parcela_total = o.totalParcelas; }
    }
    if (temLiquidacao) {
      l.forma_liquidacao = normalizarLiquidacao(rec.forma_liquidacao);
      l.valor_variavel = !!rec.valor_variavel;
    }
    return l;
  });

  let criados = 0, falhas = 0;
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const bloco = linhas.slice(i, i + BLOCO);
    const { data, error } = await supabase.from("fin_lancamentos").insert(bloco as never).select("id");
    if (error) throw error;
    // RLS barrando um INSERT em lote devolve sucesso com 0 linhas (CLAUDE.md §6.1)
    if (!data || data.length !== bloco.length) falhas += bloco.length - (data?.length ?? 0);
    criados += data?.length ?? 0;
  }
  if (criados === 0 && falhas > 0) throw new Error("Os lançamentos não foram gravados (sem permissão).");

  const ultimaData = novas[novas.length - 1].data;
  if (!rec.ultimo_gerado_ate || ultimaData > rec.ultimo_gerado_ate) {
    await supabase.from("fin_recorrencias").update({ ultimo_gerado_ate: ultimaData }).eq("id", rec.id).select("id");
  }
  return { criados, ultimaData, ignoradosPorErro: falhas };
}

/**
 * Editou a recorrência: os previstos FUTUROS que ela já gerou passam a seguir o modelo novo
 * (favorecido, categoria, centro e — se o valor é fixo — o valor). Só `previsto` e de hoje em
 * diante: o que foi pago ou já venceu é história e não muda. `descricaoAnterior` serve aos
 * previstos de antes do vínculo (casados pela descrição antiga).
 */
export async function propagarModelo(rec: FinRecorrencia, descricaoAnterior: string, hoje = hojeLocal()): Promise<number> {
  const [temVinculo, temPessoa] = await Promise.all([
    colunaExiste("fin_lancamentos", "recorrencia_id"), colunaExiste("fin_lancamentos", "pessoa_id"),
  ]);
  const patch: Record<string, unknown> = {
    fornecedor_id: rec.fornecedor_id ?? null, categoria_id: rec.categoria_id ?? null, centro_custo_id: rec.centro_custo_id ?? null,
  };
  if (temPessoa) patch.pessoa_id = rec.pessoa_id ?? null;
  if (!rec.valor_variavel) patch.valor = rec.valor;
  // em blocos: uma recorrência sem fim chega a ter centenas de previstos, e um UPDATE único estoura o statement_timeout
  const base = (q: any) => q.eq("status", "previsto").gte("data", hoje);
  let n = 0;
  if (temVinculo) n += await atualizarPrevistosEmBlocos(q => base(q).eq("recorrencia_id", rec.id), patch);
  // os de antes do vínculo (sem recorrencia_id): casados pela descrição de antes da edição
  n += await atualizarPrevistosEmBlocos(q => {
    let l = base(q).eq("origem", "recorrencia").eq("descricao", descricaoAnterior).eq("conta_id", rec.conta_id).eq("tipo", rec.tipo);
    if (temVinculo) l = l.is("recorrencia_id", null);
    return l;
  }, patch);
  return n;
}

/**
 * Recorrência SEM data de fim não tem limite: os previstos são só uma janela de 12 meses que anda
 * junto com o tempo. Esta função renova a janela de quem está ficando curta — uma vez por dia, em
 * silêncio, quando o painel da tesouraria abre (relato dela, 06/10/2026: "eu não digitei data e o
 * sistema gerou até 2027, não deveria ter data limite").
 */
export async function renovarRecorrenciasSemFim(hoje = hojeLocal()): Promise<number> {
  const chave = "diakonia:renovacao-recorrencias";
  try { if (sessionStorage.getItem(chave) === hoje) return 0; } catch { /* sem sessionStorage: renova assim mesmo */ }
  const ativas = await listarRecorrencias(false);
  let total = 0;
  for (const r of ativas) {
    if (!precisaRenovar(parametrosDaRecorrencia(r), r.ultimo_gerado_ate, hoje)) continue;
    try { total += (await gerarOcorrencias(r, hoje)).criados; } catch { /* sem permissão ou migration pendente: a próxima abertura tenta de novo */ }
  }
  try { sessionStorage.setItem(chave, hoje); } catch { /* idem */ }
  return total;
}

/** O botão "Gerar": completa o horizonte de todas as recorrências ativas. */
export async function gerarTodasAsRecorrencias(): Promise<number> {
  const ativas = await listarRecorrencias(false);
  let total = 0;
  for (const r of ativas) total += (await gerarOcorrencias(r)).criados;
  return total;
}

// ── o histórico do favorecido ──────────────────────────────────────────────

export interface AlvoDoHistorico { fornecedorId?: string | null; pessoaId?: string | null }

export async function habitosDoFavorecido(alvo: AlvoDoHistorico): Promise<HabitosDoFavorecido | null> {
  if (!alvo.fornecedorId && !alvo.pessoaId) return null;
  let q = supabase.from("fin_lancamentos")
    .select("id, data, data_pagamento, valor, categoria_id, centro_custo_id, forma_pagamento")
    .eq("tipo", "saida").in("status", ["realizado", "conciliado"]).neq("origem", "transferencia")
    .order("data", { ascending: false }).limit(PAGAMENTOS_PARA_HABITO);
  q = alvo.fornecedorId && alvo.pessoaId
    ? q.or(`fornecedor_id.eq.${alvo.fornecedorId},pessoa_id.eq.${alvo.pessoaId}`)   // favorecido-PESSOA: os dois caminhos
    : alvo.fornecedorId ? q.eq("fornecedor_id", alvo.fornecedorId) : q.eq("pessoa_id", alvo.pessoaId!);
  const { data, error } = await q;
  if (error) throw error;
  const lancs = data ?? [];
  if (lancs.length === 0) return null;

  // tipos dos anexos dos pagamentos mais recentes
  const { data: anexos } = await supabase.from("fin_lancamento_anexos")
    .select("lancamento_id, tipo").in("lancamento_id", lancs.map(l => l.id));
  const tiposPorLanc = new Map<string, string[]>();
  for (const a of anexos ?? []) tiposPorLanc.set(a.lancamento_id, [...(tiposPorLanc.get(a.lancamento_id) ?? []), String(a.tipo)]);

  const pagamentos: PagamentoDoHistorico[] = lancs.map(l => ({
    dia: String(l.data_pagamento ?? l.data).slice(0, 10), valor: Number(l.valor),
    categoriaId: l.categoria_id, centroId: l.centro_custo_id, formaPagamento: l.forma_pagamento,
    tiposDeDocumento: tiposPorLanc.get(l.id) ?? [],
  }));
  return resumirHabitos(pagamentos);
}

/** Erro de coluna ausente (migration pendente) → recado que a tesouraria entende. */
export function erroDaRecorrencia(e: { message?: string; code?: string } | null | undefined): string {
  const m = e?.message ?? "";
  if (/pessoa_id|tipo_recorrencia|total_parcelas|parcela_inicial|recorrencia_id|parcela_numero/.test(m) || e?.code === "PGRST204" || e?.code === "42703") {
    if (/forma_liquidacao|valor_variavel/.test(m)) return "Falta aplicar a migration 20261006120000 (forma de liquidação) no banco.";
    return "Falta aplicar a migration 20261006150000 (recorrência como modelo completo) no banco.";
  }
  return m || "Erro ao salvar a recorrência";
}
