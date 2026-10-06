// ─── importacaoOfxService.ts — a importação OFX inteligente ────────────────────
//
// A inteligência (nome, histórico, regra do dízimo, confiança) está em
// `lib/classificacaoOfx.ts`, pura e testada. Aqui só as idas ao banco:
//   · `carregarContexto`  — cadastro, categorias e o HISTÓRICO que serve de memória;
//   · `analisar`          — para cada linha do extrato: já existe? casa com um realizado?
//                           ou é nova (e então vem a sugestão);
//   · `registrarLote`     — grava as aceitas, de uma vez, com marca de lote;
//   · `desfazerLote`      — apaga o que um lote criou (a rede de segurança da gravação em massa).
//
// DUPLICIDADE (o risco de gravar centenas de linhas por vez). Antes, importar o mesmo OFX
// duas vezes era inofensivo porque nada era criado sozinho. Agora cada lançamento criado
// aqui carrega `[ofx:<FITID>]` em `observacoes` (o FITID é o identificador único do banco),
// e a análise pula toda linha cujo FITID já esteja na conta. Para o que foi lançado à mão ou
// pelo Omie, sem FITID, vale o casamento por tipo + valor + janela de 5 dias com os
// lançamentos já registrados (realizados E conciliados) — na dúvida, a linha NÃO é criada.

import { supabase } from "@/integrations/supabase/client";
import { daquiADias, hojeLocal } from "@/lib/data";
import {
  chaveDoMemo, montarContexto, sugerir, type Contexto, type Historico, type Sugestao,
} from "@/lib/classificacaoOfx";
import {
  excluirLancamentosEmLote, listarCategorias, listarCentrosCusto, listarLancamentos,
  type FinCategoria, type FinCentroCusto, type FinFormaPagamento,
} from "@/services/finService";
import { casarComLancamentos, inferirFormaPagamento, type OFXCasamento, type OFXTransacao } from "@/services/ofxService";
import { carregarCadastro } from "@/services/identificacaoService";
import {
  acharDebitoCompativel, ehAutomatica, type CandidatoDebito, type DebitoEncontrado,
} from "@/lib/formaLiquidacao";

const MESES_DE_HISTORICO = 24;
const PAGINA = 1000;

export interface ContextoOfx { ctx: Contexto; categorias: FinCategoria[]; centros: FinCentroCusto[] }

/** O texto do extrato que um lançamento antigo guardou (descrição ou, no Omie, `observacoes`). */
export function memoDoLancamento(l: { descricao: string | null; observacoes: string | null }): string {
  const d = (l.descricao ?? "").trim();
  if (d && !/^transfer[eê]ncia\s*:/i.test(d)) return d;
  const linhas = (l.observacoes ?? "").split("\n").map(x => x.trim()).filter(x =>
    x && !/^\[(lote|ofx|lote-ofx|classificacao-automatica)/i.test(x) && !/^gerado automaticamente|^inclu[ií]do pela importa/i.test(x));
  return linhas[0] ?? "";
}

export async function carregarContexto(): Promise<ContextoOfx> {
  const desde = daquiADias(hojeLocal(), -30 * MESES_DE_HISTORICO);
  const historico: Historico[] = [];
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos")
      .select("tipo, data, data_pagamento, valor, pessoa_id, fornecedor_id, categoria_id, centro_custo_id, descricao, observacoes")
      .in("status", ["realizado", "conciliado"]).neq("origem", "transferencia").gte("data", desde)
      .order("data").order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    for (const l of data ?? []) {
      historico.push({
        tipo: l.tipo === "entrada" ? "entrada" : "saida", dia: String(l.data_pagamento ?? l.data).slice(0, 10),
        valor: Number(l.valor), pessoaId: l.pessoa_id, fornecedorId: l.fornecedor_id,
        categoriaId: l.categoria_id, centroId: l.centro_custo_id,
        chave: chaveDoMemo(memoDoLancamento(l)),
      });
    }
    if ((data ?? []).length < PAGINA) break;
  }
  const [cadastro, categorias, centros] = await Promise.all([carregarCadastro(), listarCategorias(), listarCentrosCusto()]);
  const ctx = montarContexto(cadastro, categorias.map(c => ({ id: c.id, nome: c.nome, tipo: c.tipo })), historico);
  return { ctx, categorias, centros };
}

// ── a análise do arquivo ────────────────────────────────────────────────────

export type SituacaoLinha = "conciliar" | "ja_registrada" | "ambigua" | "debito_encontrado" | "nova";

export interface LinhaAnalisada {
  tx: OFXTransacao;
  situacao: SituacaoLinha;
  /** `conciliar`: o lançamento realizado que casou. */
  lancamentoId?: string;
  /** `nova`: o que o sistema sugere. */
  sugestao?: Sugestao;
  /** `ja_registrada`: por que acreditamos que já existe. */
  motivoJaRegistrada?: string;
  /** `debito_encontrado`: o débito automático previsto que esta saída do extrato cumpriu
   *  (`lancamentoId` é o dele). */
  debito?: DebitoEncontrado;
}

const MARCA_OFX = /\[ofx:([^\]]+)\]/g;

async function fitidsJaImportados(contaId: string, de: string, ate: string): Promise<Set<string>> {
  const set = new Set<string>();
  for (let p = 0; ; p++) {
    const { data, error } = await supabase.from("fin_lancamentos").select("observacoes")
      .eq("conta_id", contaId).gte("data", de).lte("data", ate).like("observacoes", "%[ofx:%")
      .order("id").range(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw error;
    for (const l of data ?? []) for (const m of (l.observacoes ?? "").matchAll(MARCA_OFX)) set.add(m[1]);
    if ((data ?? []).length < PAGINA) break;
  }
  return set;
}

export async function analisar(contaId: string, txs: OFXTransacao[], contexto: ContextoOfx): Promise<LinhaAnalisada[]> {
  const datas = txs.map(t => t.data).sort();
  const de = daquiADias(datas[0], -5);
  const ate = daquiADias(datas[datas.length - 1], 5);
  const [realizados, conciliados, fitids, debitos] = await Promise.all([
    listarLancamentos({ contaId, status: "realizado", dataInicio: de, dataFim: ate }),
    listarLancamentos({ contaId, status: "conciliado", dataInicio: de, dataFim: ate }),
    fitidsJaImportados(contaId, de, ate),
    debitosAutomaticosPrevistos(de, ate),
  ]);

  const out: LinhaAnalisada[] = new Array(txs.length);
  // 1. o que já veio deste mesmo arquivo (FITID gravado)
  const restantes: { tx: OFXTransacao; i: number }[] = [];
  txs.forEach((tx, i) => {
    if (tx.fitid && fitids.has(tx.fitid)) out[i] = { tx, situacao: "ja_registrada", motivoJaRegistrada: "já importada deste extrato (mesmo identificador do banco)" };
    else restantes.push({ tx, i });
  });

  // 2. realizados que casam → conciliar (o comportamento de sempre)
  const casamentos: OFXCasamento[] = casarComLancamentos(restantes.map(r => r.tx), realizados);
  const semRealizado: { tx: OFXTransacao; i: number }[] = [];
  casamentos.forEach((c, k) => {
    const { tx, i } = restantes[k];
    if (c.status === "encontrado") out[i] = { tx, situacao: "conciliar", lancamentoId: c.lancamentoId };
    else if (c.status === "ambiguo") out[i] = { tx, situacao: "ambigua" };
    else semRealizado.push({ tx, i });
  });

  // cada débito previsto só pode ser cumprido por UMA linha do extrato
  const usados = new Set<string>();
  const debitosLivres = (todos: CandidatoDebito[]) => todos.filter(d => !usados.has(d.id));

  // 3. já conciliados (lançados à mão ou pelo Omie): não criar de novo
  const jaConc = casarComLancamentos(semRealizado.map(r => r.tx), conciliados);
  jaConc.forEach((c, k) => {
    const { tx, i } = semRealizado[k];
    if (c.status === "encontrado" || c.status === "ambiguo") {
      out[i] = { tx, situacao: "ja_registrada", motivoJaRegistrada: "já existe lançamento conciliado com este valor e data" };
    } else {
      // um DÉBITO AUTOMÁTICO previsto que esta saída cumpre: conciliar, não criar outro lançamento
      const achado = tx.tipo === "saida" ? acharDebitoCompativel(tx, debitosLivres(debitos)) : null;
      if (achado) {
        usados.add(achado.candidato.id);
        out[i] = { tx, situacao: "debito_encontrado", lancamentoId: achado.candidato.id, debito: achado };
        return;
      }
      out[i] = { tx, situacao: "nova", sugestao: sugerir({ fitid: tx.fitid, tipo: tx.tipo, data: tx.data, valor: tx.valor, memo: tx.memo }, contexto.ctx) };
    }
  });
  return out;
}

/** Saídas PREVISTAS cuja forma de liquidação é automática, no entorno das datas do extrato.
 *  Antes da migration 20261006120000 a coluna não existe: nada é devolvido (e nada quebra). */
async function debitosAutomaticosPrevistos(de: string, ate: string): Promise<CandidatoDebito[]> {
  try {
    const previstos = await listarLancamentos({ status: "previsto", tipo: "saida", dataInicio: de, dataFim: ate });
    return previstos.filter(l => ehAutomatica(l.forma_liquidacao)).map(l => ({
      id: l.id, data: l.data, valor: Number(l.valor), status: l.status,
      descricao: l.descricao, fornecedor: l.fornecedor_nome ?? null, variavel: !!l.valor_variavel,
    }));
  } catch {
    return [];
  }
}

// ── gravação em lote ────────────────────────────────────────────────────────

export interface ParaRegistrar {
  tx: OFXTransacao;
  categoriaId: string;
  centroId?: string;
  pessoaId?: string;
  fornecedorId?: string;
}

export interface ResultadoLoteOfx { loteId: string; ids: string[]; erros: string[] }

const TAMANHO_BLOCO = 40;

/**
 * Cria os lançamentos como `conciliado` — a linha SAIU do extrato do banco, então já está
 * batida com ele —, marcados com o FITID e o lote. `onProgresso(feitos, total)` a cada bloco.
 */
export async function registrarLote(
  contaId: string, itens: ParaRegistrar[], onProgresso?: (f: number, t: number) => void,
): Promise<ResultadoLoteOfx> {
  const loteId = `${Date.now().toString(36)}`;
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();
  const resultado: ResultadoLoteOfx = { loteId, ids: [], erros: [] };

  for (let i = 0; i < itens.length; i += TAMANHO_BLOCO) {
    const bloco = itens.slice(i, i + TAMANHO_BLOCO);
    const linhas = bloco.map(it => ({
      tipo: it.tx.tipo, data: it.tx.data, valor: it.tx.valor, conta_id: contaId, status: "conciliado",
      categoria_id: it.categoriaId, centro_custo_id: it.centroId ?? null,
      pessoa_id: it.pessoaId ?? null, fornecedor_id: it.fornecedorId ?? null,
      forma_pagamento: (inferirFormaPagamento(it.tx.memo) ?? null) as FinFormaPagamento | null,
      descricao: it.tx.memo, origem: "importado_ofx",
      observacoes: `[ofx:${it.tx.fitid}] [lote-ofx:${loteId}]`,
      audit_user_id: userId, audit_em: agora,
    }));
    const { data, error } = await supabase.from("fin_lancamentos").insert(linhas as never).select("id");
    if (error) resultado.erros.push(error.message);
    // RLS barrando um INSERT em lote devolve sucesso com 0 linhas (CLAUDE.md §6.1)
    else if (!data || data.length !== linhas.length) resultado.erros.push(`${linhas.length - (data?.length ?? 0)} lançamento(s) não gravados (permissão)`);
    resultado.ids.push(...(data ?? []).map(d => d.id));
    onProgresso?.(Math.min(i + TAMANHO_BLOCO, itens.length), itens.length);
  }
  return resultado;
}

export async function desfazerLote(ids: string[]): Promise<void> {
  await excluirLancamentosEmLote(ids);
}

// ── débitos automáticos: cumprir o previsto ────────────────────────────────

export interface DebitoParaConciliar { lancamentoId: string; tx: OFXTransacao }
export interface ResultadoDebitos { conciliados: string[]; erros: string[] }

/**
 * O débito apareceu no extrato: o PREVISTO vira `conciliado` com o dia e o valor que o banco
 * debitou de verdade (numa conta variável o previsto era só uma estimativa), na conta do extrato,
 * e leva o FITID — importar o mesmo arquivo de novo reconhece a linha como já registrada.
 */
export async function conciliarDebitos(contaId: string, itens: DebitoParaConciliar[]): Promise<ResultadoDebitos> {
  const res: ResultadoDebitos = { conciliados: [], erros: [] };
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  const agora = new Date().toISOString();
  for (const it of itens) {
    const { data: atual, error: e1 } = await supabase.from("fin_lancamentos").select("observacoes").eq("id", it.lancamentoId).maybeSingle();
    if (e1) { res.erros.push(e1.message); continue; }
    const observacoes = [(atual?.observacoes ?? "").trim(), `[ofx:${it.tx.fitid}] [debito-automatico]`].filter(Boolean).join("\n");
    const { data, error } = await supabase.from("fin_lancamentos")
      .update({
        status: "conciliado", data_pagamento: it.tx.data, valor: it.tx.valor, conta_id: contaId,
        observacoes, audit_user_id: userId, audit_em: agora,
      } as never)
      .eq("id", it.lancamentoId).eq("status", "previsto").select("id");
    if (error) res.erros.push(error.message);
    // RLS barrando (ou o previsto já mudou de situação) devolve sucesso com 0 linhas
    else if (!data || data.length === 0) res.erros.push("um débito não pôde ser conciliado (permissão ou já alterado)");
    else res.conciliados.push(it.lancamentoId);
  }
  return res;
}
