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
import { conferir } from "@/lib/escritaConferida";
import { calcularOcorrencias, dataFimReal, ocorrenciasAGerar, ocupanteDaOcorrencia, precisaRenovar, redatarPrevistos, rotuloDaParcela, type ParametrosDaSerie, type Ocorrencia, type PrevistoDaSerie } from "@/lib/recorrencia";
import { resumirHabitos, PAGAMENTOS_PARA_HABITO, type HabitosDoFavorecido, type PagamentoDoHistorico } from "@/lib/habitosDoFavorecido";
import { normalizarLiquidacao } from "@/lib/formaLiquidacao";
import { DIAS_ANTES_DO_VENCIMENTO, sugerirLiquidacoes, type ObrigacaoAberta, type PagamentoRegistrado } from "@/lib/contasJaPagas";
import { daquiADias } from "@/lib/data";
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

interface LinhaLida extends PrevistoDaSerie { status: string }

/** As linhas que a recorrência já tem (qualquer situação — inclusive cancelada, para não ressuscitar). */
async function linhasJaGeradas(rec: FinRecorrencia, temVinculo: boolean): Promise<LinhaLida[]> {
  const linhas: LinhaLida[] = [];
  // `q` devolve a consulta ainda sem a paginação (tipo solto: o cliente tipado não aceita nome de tabela dinâmico aqui)
  const ler = async (q: () => any) => {
    for (let p = 0; ; p++) {
      const { data, error } = await q().order("data").range(p * 1000, p * 1000 + 999);
      if (error) throw error;
      for (const l of data ?? []) linhas.push({
        id: String(l.id), status: String(l.status), data: String(l.data).slice(0, 10),
        competencia: l.data_competencia ? String(l.data_competencia).slice(0, 10) : null, parcela: l.parcela_numero ?? null,
      });
      if ((data ?? []).length < 1000) break;
    }
  };
  if (temVinculo) await ler(() => supabase.from("fin_lancamentos").select("id, status, data, data_competencia, parcela_numero").eq("recorrencia_id", rec.id));
  // os de antes do vínculo: mesma descrição, conta e tipo, nascidos de recorrência. SÓ os sem vínculo: os que pertencem a OUTRA
  // recorrência (outro contrato do mesmo favorecido, com a mesma descrição — ex.: dois contratos da Verisure) não contam como
  // "já gerados" desta. Medido em 08/10/2026: o contrato de R$ 278,22 nunca ganhou um previsto porque o de R$ 291,31 já tinha as datas.
  await ler(() => {
    const q = supabase.from("fin_lancamentos").select("id, status, data, data_competencia")
      .eq("origem", "recorrencia").eq("descricao", rec.descricao).eq("conta_id", rec.conta_id).eq("tipo", rec.tipo);
    return temVinculo ? q.is("recorrencia_id", null) : q;
  });
  return linhas;
}

const primeiroDoMes = (ymd: string) => `${ymd.slice(0, 7)}-01`;

export interface ResultadoDaGeracao {
  criados: number; ultimaData: string | null; ignoradosPorErro: number;
  /** das ocorrências geradas que já venceram (ou vencem hoje), quantas parecem JÁ PAGAS por um lançamento solto — a tesouraria confere em "Contas já pagas" */
  jaPagas: number;
}

/**
 * A porta do GERADOR (Fase A, análise de 13/10/2026): uma ocorrência que já passou pode ter o pagamento feito antes de ela existir — foi o caso
 * Ana/Carlos/Denise (ocorrência de 05/10 gerada em 08/10, PIX de 02/10 já no extrato). Só CONTA e avisa: a ocorrência continua sendo criada
 * (nada some em silêncio) e quem liga as duas é a tesouraria, com um clique, em "Contas já pagas" (decisão dela: a ligação sempre pede um clique).
 * Uma falha aqui nunca derruba a geração.
 */
async function contarJaPagas(rec: FinRecorrencia, geradas: { id: string; data: string }[], hoje: string): Promise<number> {
  const vencidas = geradas.filter(g => g.data <= hoje);
  if (vencidas.length === 0 || (!rec.fornecedor_id && !rec.pessoa_id)) return 0;
  try {
    const desde = daquiADias(vencidas.map(g => g.data).sort()[0], -DIAS_ANTES_DO_VENCIMENTO);
    const quem = [rec.fornecedor_id ? `fornecedor_id.eq.${rec.fornecedor_id}` : "", rec.pessoa_id ? `pessoa_id.eq.${rec.pessoa_id}` : ""].filter(Boolean).join(",");
    const { data, error } = await supabase.from("fin_lancamentos")
      .select("id, data, data_pagamento, valor, descricao, origem, fornecedor_id, pessoa_id, conta_id, obrigacao_id")
      .eq("tipo", rec.tipo).in("status", ["realizado", "conciliado"]).eq("conta_id", rec.conta_id)
      .is("liquidacao_id", null).is("recorrencia_id", null).is("lancamento_pai_id", null).neq("origem", "transferencia")
      .or(quem).or(`data.gte.${desde},data_pagamento.gte.${desde}`).limit(200);
    if (error || !data || data.length === 0) return 0;
    const obrigacoes: ObrigacaoAberta[] = vencidas.map(g => ({
      id: g.id, valor: Number(rec.valor), data: g.data, fornecedor_id: rec.fornecedor_id ?? null, pessoa_id: rec.pessoa_id ?? null,
      nome: rec.descricao, valor_variavel: !!rec.valor_variavel, conta_id: rec.conta_id,
    }));
    // "solto" = não é parcela de OUTRA obrigação: sem obrigacao_id, ou com o próprio id (D1: toda linha nova nasce assim)
    const pagamentos: PagamentoRegistrado[] = (data as unknown as Record<string, unknown>[]).filter(x => !x.obrigacao_id || x.obrigacao_id === x.id).map(x => ({
      id: String(x.id), valor: Number(x.valor), data: String(x.data_pagamento ?? x.data).slice(0, 10), nome: "", descricao: String(x.descricao ?? ""),
      fornecedor_id: (x.fornecedor_id as string) ?? null, pessoa_id: (x.pessoa_id as string) ?? null, origem: String(x.origem), conta_id: String(x.conta_id),
    }));
    return sugerirLiquidacoes(obrigacoes, pagamentos).length;
  } catch { return 0; }
}

/** A linha (previsto) que uma ocorrência da recorrência vira no banco — com o MODELO inteiro do contrato. Uma só forma para a geração em série e para a ocorrência avulsa. */
function linhaDaOcorrencia(
  rec: FinRecorrencia, o: Ocorrencia, colunas: { temPessoa: boolean; temVinculo: boolean; temLiquidacao: boolean }, userId: string | null, agora: string,
): Record<string, unknown> {
  const l: Record<string, unknown> = {
    data: o.data, data_competencia: primeiroDoMes(o.data), tipo: rec.tipo, status: "previsto",
    conta_id: rec.conta_id, categoria_id: rec.categoria_id, centro_custo_id: rec.centro_custo_id,
    fornecedor_id: rec.fornecedor_id, valor: rec.valor, origem: "recorrencia",
    descricao: o.parcela ? `${rec.descricao} (${rotuloDaParcela(o.parcela, o.totalParcelas!)})` : rec.descricao,
    audit_user_id: userId, audit_em: agora,
  };
  if (colunas.temPessoa && rec.pessoa_id) l.pessoa_id = rec.pessoa_id;
  if (colunas.temVinculo) {
    l.recorrencia_id = rec.id;
    if (o.parcela) { l.parcela_numero = o.parcela; l.parcela_total = o.totalParcelas; }
  }
  if (colunas.temLiquidacao) {
    l.forma_liquidacao = normalizarLiquidacao(rec.forma_liquidacao);
    l.valor_variavel = !!rec.valor_variavel;
  }
  return l;
}

export interface OcorrenciaGerada {
  id: string; data: string; valor: number; descricao: string | null; recorrencia_id: string;
  fornecedor_id: string | null; pessoa_id: string | null; fornecedor_nome: string | null;
}

/**
 * H2 (Fase 2 da conciliação, 20/10/2026): o pagamento chegou pelo OFX e o contrato existe, mas a ocorrência DAQUELE mês nunca foi gerada (o gerador não despeja
 * meses atrasados). Gera SÓ essa ocorrência, com o modelo inteiro do contrato, para a tesouraria liquidá-la pelo extrato — em vez de criar uma despesa solta.
 * Recusa se a data não é da agenda do contrato, se o contrato é parcelado, ou se a ocorrência já tem linha (qualquer situação): nunca cria uma segunda.
 */
export async function gerarUmaOcorrencia(recorrenciaId: string, data: string): Promise<OcorrenciaGerada> {
  const { data: bruto, error } = await supabase.from("fin_recorrencias").select("*").eq("id", recorrenciaId).maybeSingle();
  if (error) throw error;
  if (!bruto) throw new Error("A recorrência não existe mais — reabra o extrato");
  const rec = bruto as unknown as FinRecorrencia;
  if (!rec.ativo) throw new Error("A recorrência está inativa");
  const params = parametrosDaRecorrencia(rec);
  if (params.tipo === "parcelamento") throw new Error("Recorrência parcelada: as parcelas se geram pelo próprio contrato");
  const o = calcularOcorrencias(params, data).find(x => x.data === data);
  if (!o) throw new Error("Essa data não pertence à agenda da recorrência");
  const [temPessoa, temVinculo, temLiquidacao] = await Promise.all([
    colunaExiste("fin_lancamentos", "pessoa_id"), colunaExiste("fin_lancamentos", "recorrencia_id"), colunaExiste("fin_lancamentos", "forma_liquidacao"),
  ]);
  const existentes = await linhasJaGeradas(rec, temVinculo);
  if (ocupanteDaOcorrencia(o, existentes)) throw new Error("Esta ocorrência já tem conta (alguém a gerou ou pagou): reabra o extrato");
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const linha = linhaDaOcorrencia(rec, o, { temPessoa, temVinculo, temLiquidacao }, userId, new Date().toISOString());
  const ins = await supabase.from("fin_lancamentos").insert(linha as never).select("id");
  const r = conferir(ins, "A ocorrência da recorrência");
  if (!r.ok) throw new Error(r.erro);
  return {
    id: String((ins.data as { id: string }[])[0].id), data, valor: Number(rec.valor), descricao: String(linha.descricao ?? ""), recorrencia_id: rec.id,
    fornecedor_id: rec.fornecedor_id ?? null, pessoa_id: (rec.pessoa_id as string | null | undefined) ?? null, fornecedor_nome: rec.fornecedor_nome ?? rec.pessoa_nome ?? null,
  };
}

export async function gerarOcorrencias(rec: FinRecorrencia, hoje = hojeLocal()): Promise<ResultadoDaGeracao> {
  const [temVinculo, temLiquidacao, temPessoa] = await Promise.all([
    colunaExiste("fin_lancamentos", "recorrencia_id"),
    colunaExiste("fin_lancamentos", "forma_liquidacao"),
    colunaExiste("fin_lancamentos", "pessoa_id"),
  ]);
  const params = parametrosDaRecorrencia(rec);
  const existentes = await linhasJaGeradas(rec, temVinculo);
  const novas: Ocorrencia[] = ocorrenciasAGerar(params, hoje, new Set(existentes.map(l => l.data)), existentes);
  if (novas.length === 0) return { criados: 0, ultimaData: null, ignoradosPorErro: 0, jaPagas: 0 };

  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();
  const linhas = novas.map(o => linhaDaOcorrencia(rec, o, { temPessoa, temVinculo, temLiquidacao }, userId, agora));

  let criados = 0, falhas = 0;
  const geradas: { id: string; data: string }[] = [];
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const bloco = linhas.slice(i, i + BLOCO);
    const { data, error } = await supabase.from("fin_lancamentos").insert(bloco as never).select("id");
    if (error) throw error;
    // RLS barrando um INSERT em lote devolve sucesso com 0 linhas (CLAUDE.md §6.1)
    if (!data || data.length !== bloco.length) falhas += bloco.length - (data?.length ?? 0);
    else data.forEach((d, k) => geradas.push({ id: String((d as { id: string }).id), data: String(bloco[k].data) }));
    criados += data?.length ?? 0;
  }
  if (criados === 0 && falhas > 0) throw new Error("Os lançamentos não foram gravados (sem permissão).");

  const ultimaData = novas[novas.length - 1].data;
  if (!rec.ultimo_gerado_ate || ultimaData > rec.ultimo_gerado_ate) {
    await supabase.from("fin_recorrencias").update({ ultimo_gerado_ate: ultimaData }).eq("id", rec.id).select("id");
  }
  return { criados, ultimaData, ignoradosPorErro: falhas, jaPagas: await contarJaPagas(rec, geradas, hoje) };
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
 * Editou o dia (ou a frequência, ou o início) da recorrência: os previstos ABERTOS que ela já gerou, deste mês em diante, andam para
 * a data que a agenda nova dá à ocorrência de cada um. O previsto pago/vencido é história e não muda (só `previsto` é tocado).
 * Medido em 13/10/2026: cinco recorrências passaram a dia 10 e os previstos antigos (dia 09/13) ficaram — com o gerador criando
 * outros no dia 10, a Mesa de Operações mostrava a mesma despesa duas vezes. Devolve quantos previstos mudaram de data.
 */
export async function redatarPrevistosDaRecorrencia(rec: FinRecorrencia, hoje = hojeLocal()): Promise<number> {
  if (!(await colunaExiste("fin_lancamentos", "recorrencia_id"))) return 0;
  const existentes = await linhasJaGeradas(rec, true);
  const previstos = existentes.filter(l => l.status === "previsto");
  const mudancas = redatarPrevistos(parametrosDaRecorrencia(rec), hoje, previstos, existentes);
  let n = 0;
  for (const m of mudancas) {
    const { data, error } = await supabase.from("fin_lancamentos").update({ data: m.para }).eq("id", m.id).eq("status", "previsto").select("id");
    if (error) throw error;
    n += data?.length ?? 0;   // RLS barrando devolve sucesso com 0 linhas (CLAUDE.md §6.1)
  }
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
export async function gerarTodasAsRecorrencias(): Promise<{ criados: number; jaPagas: number }> {
  const ativas = await listarRecorrencias(false);
  let criados = 0, jaPagas = 0;
  for (const r of ativas) { const g = await gerarOcorrencias(r); criados += g.criados; jaPagas += g.jaPagas; }
  return { criados, jaPagas };
}

/** A frase do aviso quando ocorrências já vencidas parecem pagas (vazia quando não há nenhuma). */
export function avisoDeJaPagas(jaPagas: number): string | null {
  if (jaPagas <= 0) return null;
  return `${jaPagas} ${jaPagas === 1 ? "ocorrência gerada já venceu e parece já paga" : "ocorrências geradas já venceram e parecem já pagas"} — confira em "Contas já pagas" na Mesa de Operações (um clique liga o pagamento à conta, sem duplicar).`;
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
