// ─── investFacilService.ts — aplicações e resgates do Invest Fácil a partir do PDF do extrato consolidado ────────────────────
//
// O OFX é a fonte oficial da movimentação bancária; o PDF serve SÓ para achar o que o OFX não traz: aplicação e resgate do Invest Fácil.
// Cada linha vira uma SUGESTÃO de transferência (Corrente → Aplicação / Aplicação → Corrente). Nada é gravado aqui sem a chamada
// explícita de `gravarTransferenciaDoPdf` / `vincularEvidencia`, que a tela só faz depois do clique do tesoureiro.
//
// Idempotência (reimportar o mesmo PDF nunca duplica), em três travas:
//   1. a CHAVE da linha (lib/investFacil.ts) fica gravada nas duas pernas; ao abrir o PDF de novo a linha sai como "já registrada";
//   2. IMEDIATAMENTE antes de gravar, a chave é procurada outra vez no banco (outra aba, outro usuário, clique duplo);
//   3. uma transferência feita à mão (mesmo valor, até 5 dias) não vira duplicata: oferece-se só VINCULAR a evidência.
import { supabase } from "@/integrations/supabase/client";
import { conferir } from "@/lib/escritaConferida";
import { daquiADias } from "@/lib/data";
import { pareceExtratoConsolidado, lerExtratoConsolidado, type ExtratoLido } from "@/lib/extratoConsolidadoPdf";
import {
  AVISO_JA_REGISTRADA, chavesNaObservacao, classificarLinhasInvest, ehConflitoDaChave, fitidDaChave, linhasDoInvestFacil, montarEvidencia, validarPdfParaSugestoes,
  type LinhaInvestFacil, type SituacaoDaLinhaInvest, type TransferenciaExistente, type ValidacaoDoPdf,
} from "@/lib/investFacil";
import { conferirVarredura, type ConferenciaDaVarredura, type MovimentoDoDia } from "@/lib/varredura";
import { textoDoPdf } from "@/services/auditoriaExtratoService";
import { ignorarLinha, listarIgnoradas, registrarTransferenciaDoExtrato } from "@/services/importacaoOfxService";
import type { OFXTransacao } from "@/services/ofxService";

export interface PdfDoInvestFacil {
  arquivo: string;
  /** SHA-256 do arquivo: prova de qual PDF originou cada transferência */
  hash: string;
  lidoEm: string;
  extrato: ExtratoLido | null;
  validacao: ValidacaoDoPdf;
  /** vazio quando a validação reprova: sem leitura confiável, nenhuma sugestão */
  linhas: LinhaInvestFacil[];
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Lê o PDF, valida (cadeia de saldos, totais, conta, período, sinais) e só então extrai as linhas de aplicação e resgate. */
export async function lerPdfDoInvestFacil(arquivo: File, ctx: { ofxDe: string; ofxAte: string; contaNumero?: string | null }): Promise<PdfDoInvestFacil> {
  const lidoEm = new Date().toISOString();
  const bytes = await arquivo.arrayBuffer();
  const hash = await sha256(bytes);
  const base = { arquivo: arquivo.name, hash, lidoEm };
  let texto: string;
  try {
    texto = await textoDoPdf(arquivo);
  } catch (e: any) {
    return { ...base, extrato: null, linhas: [], validacao: { ok: false, problemas: [`Não foi possível ler o PDF: ${e?.message ?? "erro desconhecido"}.`], avisos: [] } };
  }
  if (!pareceExtratoConsolidado(texto)) {
    return { ...base, extrato: null, linhas: [], validacao: { ok: false, problemas: ["Este PDF não parece o 'Extrato Consolidado / Por Período' do Bradesco."], avisos: [] } };
  }
  const extrato = lerExtratoConsolidado(texto);
  const validacao = validarPdfParaSugestoes(extrato, ctx);
  return { ...base, extrato, validacao, linhas: validacao.ok ? linhasDoInvestFacil(extrato.lancamentos) : [] };
}

/** Candidatas a "conta da aplicação": as contas com "aplica" no nome, exceto a da Mesa. */
export function candidatasDeAplicacao(contas: { id: string; nome: string }[], contaId: string): { id: string; nome: string }[] {
  return contas.filter(c => c.id !== contaId && /aplica/i.test(c.nome));
}

const chaveDoFitid = fitidDaChave;
const txSintetica = (l: LinhaInvestFacil): OFXTransacao => ({
  fitid: chaveDoFitid(l.chave), tipo: l.direcao === "resgate" ? "entrada" : "saida", data: l.data, valor: l.valor, memo: l.textoOriginal,
});

/**
 * O que cada linha já tem no sistema: chave já gravada, transferência feita à mão (só vincular), ignorada antes, ou nova.
 * Só olha a conta corrente e as pernas que têm par na conta de aplicação — um depósito de caixa não é "transferência para o Invest Fácil".
 */
export async function situacaoDasLinhas(contaId: string, aplicacaoId: string, linhas: LinhaInvestFacil[]): Promise<Map<string, SituacaoDaLinhaInvest>> {
  if (linhas.length === 0) return new Map();
  const datas = linhas.map(l => l.data).sort();
  const de = daquiADias(datas[0], -6), ate = daquiADias(datas[datas.length - 1], 6);
  const [aplic, corr, ign] = await Promise.all([
    supabase.from("fin_lancamentos").select("id").eq("conta_id", aplicacaoId).eq("origem", "transferencia").gte("data", de).lte("data", ate).limit(5000),
    supabase.from("fin_lancamentos").select("id, data, data_pagamento, valor, tipo, observacoes, lancamento_pai_id").eq("conta_id", contaId)
      .in("status", ["realizado", "conciliado"]).gte("data", de).lte("data", ate).not("lancamento_pai_id", "is", null).limit(5000),
    listarIgnoradas(contaId),
  ]);
  if (aplic.error) throw new Error(aplic.error.message);
  if (corr.error) throw new Error(corr.error.message);
  const idsDaAplicacao = new Set((aplic.data ?? []).map(l => l.id));
  const existentes: TransferenciaExistente[] = (corr.data ?? [])
    .filter(l => idsDaAplicacao.has(l.lancamento_pai_id as string) || chavesNaObservacao(l.observacoes).length > 0)
    .map(l => ({ id: l.id, data: String(l.data_pagamento ?? l.data).slice(0, 10), valor: Number(l.valor), tipo: l.tipo === "entrada" ? "entrada" : "saida", chaves: chavesNaObservacao(l.observacoes) }));
  const ignoradas = new Set(linhas.filter(l => ign.porFitid.has(chaveDoFitid(l.chave))).map(l => l.chave));
  return classificarLinhasInvest(linhas, existentes, ignoradas);
}

/** Grava UMA transferência (as duas pernas, ou nenhuma) com a evidência do PDF. Recusa se a chave já existe. */
export async function gravarTransferenciaDoPdf(p: {
  contaId: string; contaNome: string; aplicacao: { id: string; nome: string }; linha: LinhaInvestFacil; pdf: Pick<PdfDoInvestFacil, "arquivo" | "hash" | "lidoEm">;
}): Promise<{ ids: string[]; desfazer: () => Promise<void> }> {
  // última trava: a chave pode ter sido gravada depois que a tela abriu
  const jaTem = await supabase.from("fin_lancamentos").select("id").eq("conta_id", p.contaId).like("observacoes", `%[invest-pdf:${p.linha.chave}]%`).limit(1);
  if (jaTem.error) throw new Error(jaTem.error.message);
  if ((jaTem.data ?? []).length > 0) throw new Error(AVISO_JA_REGISTRADA);
  const evidencia = montarEvidencia({ chave: p.linha.chave, arquivo: p.pdf.arquivo, hash: p.pdf.hash, lidoEm: p.pdf.lidoEm, texto: p.linha.textoOriginal });
  try {
    return await registrarTransferenciaDoExtrato(p.contaId, p.contaNome, txSintetica(p.linha), { contaId: p.aplicacao.id, contaNome: p.aplicacao.nome }, evidencia);
  } catch (e) {
    // a corrida entre duas abas: as duas passaram pela conferência acima, o índice único recusou a segunda (e as duas pernas dela, de uma vez)
    if (ehConflitoDaChave(e)) throw new Error(AVISO_JA_REGISTRADA);
    throw e;
  }
}

/** "Vincular Evidência PDF": acrescenta a evidência a uma transferência que JÁ existe. Não cria nem apaga lançamento; devolve o desfazer. */
export async function vincularEvidencia(p: {
  lancamentoId: string; linha: LinhaInvestFacil; pdf: Pick<PdfDoInvestFacil, "arquivo" | "hash" | "lidoEm">;
}): Promise<{ desfazer: () => Promise<void> }> {
  const atual = await supabase.from("fin_lancamentos").select("observacoes").eq("id", p.lancamentoId).maybeSingle();
  if (atual.error || !atual.data) throw new Error(atual.error?.message ?? "Lançamento não encontrado.");
  const antes = atual.data.observacoes ?? "";
  if (chavesNaObservacao(antes).length > 0) throw new Error("Esta transferência já tem uma evidência de PDF.");
  const nova = `${antes ? `${antes}\n` : ""}${montarEvidencia({ chave: p.linha.chave, arquivo: p.pdf.arquivo, hash: p.pdf.hash, lidoEm: p.pdf.lidoEm, texto: p.linha.textoOriginal })} [vinculada-a-transferencia-existente]`;
  const r = conferir(await supabase.from("fin_lancamentos").update({ observacoes: nova } as never).eq("id", p.lancamentoId).select("id"), "A evidência do PDF");
  if (!r.ok) throw new Error(ehConflitoDaChave(r.erro) ? AVISO_JA_REGISTRADA : r.erro);
  return {
    desfazer: async () => {
      const v = conferir(await supabase.from("fin_lancamentos").update({ observacoes: antes || null } as never).eq("id", p.lancamentoId).select("id"), "O desfazer da evidência");
      if (!v.ok) throw new Error(v.erro);
    },
  };
}

export interface ConferenciaDiariaCarregada {
  contaId: string;
  contaNome: string;
  /** último dia que veio de uma importação de OFX; a conferência vai até o dia ANTERIOR (o banco só varre à noite) */
  ultimaImportacao: string;
  conferencia: ConferenciaDaVarredura;
}

const JANELA_DA_CONFERENCIA = 45;

/**
 * A "conferência diária do R$ 1,00": acha a conta corrente que tem conta de aplicação, lê os últimos 45 dias de movimento e confere se o saldo
 * de cada dia terminou em R$ 1,00. Só leitura. Devolve null quando não há o que conferir (sem conta com aplicação, ou OFX nunca importado).
 */
export async function carregarConferenciaDiaria(): Promise<ConferenciaDiariaCarregada | null> {
  const contas = await supabase.from("fin_contas").select("id, nome, saldo_atual").eq("ativo", true);
  if (contas.error) throw new Error(contas.error.message);
  const lista = contas.data ?? [];
  const corrente = lista.find(c => /bradesco/i.test(c.nome) && !/aplica/i.test(c.nome) && candidatasDeAplicacao(lista, c.id).length > 0);
  if (!corrente) return null;
  const ultima = await supabase.from("fin_lancamentos").select("data, data_pagamento").eq("conta_id", corrente.id)
    .like("observacoes", "%[ofx:%").not("observacoes", "like", "%[ofx:PDF:%").order("data", { ascending: false }).limit(1);
  if (ultima.error) throw new Error(ultima.error.message);
  const ultimaImportacao = ultima.data?.[0] ? String(ultima.data[0].data_pagamento ?? ultima.data[0].data).slice(0, 10) : null;
  if (!ultimaImportacao) return null;
  const inicio = daquiADias(ultimaImportacao, -JANELA_DA_CONFERENCIA);
  const movs: MovimentoDoDia[] = [];
  for (let p = 0; ; p++) {
    const r = await supabase.from("fin_lancamentos").select("data, data_pagamento, valor, tipo")
      .eq("conta_id", corrente.id).in("status", ["realizado", "conciliado"]).or(`data.gte.${inicio},data_pagamento.gte.${inicio}`)
      .order("id").range(p * 1000, p * 1000 + 999);
    if (r.error) throw new Error(r.error.message);
    for (const l of r.data ?? []) {
      const quando = String(l.data_pagamento ?? l.data).slice(0, 10);
      if (quando >= inicio) movs.push({ data: quando, valor: (l.tipo === "entrada" ? 1 : -1) * Number(l.valor) });
    }
    if ((r.data ?? []).length < 1000) break;
  }
  // o saldo antes da janela = saldo guardado − tudo o que está dentro dela (e depois dela)
  const saldoAntes = Math.round((Number(corrente.saldo_atual) - movs.reduce((t, m) => t + m.valor, 0)) * 100) / 100;
  return { contaId: corrente.id, contaNome: corrente.nome, ultimaImportacao, conferencia: conferirVarredura(movs, saldoAntes, daquiADias(ultimaImportacao, -1)) };
}

/** Recolhe a linha (guardada em fin_extrato_ignorados, com chave própria): não volta a ser sugerida; dá para reativar. */
export async function ignorarLinhaDoPdf(contaId: string, linha: LinhaInvestFacil): Promise<void> {
  await ignorarLinha(contaId, txSintetica(linha), "outro", `Invest Fácil (PDF): ${linha.direcao} · ${linha.textoOriginal}`.slice(0, 280));
}
