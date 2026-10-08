// ─── lib/investFacil.ts — aplicações e resgates do Invest Fácil que vêm no PDF do extrato consolidado (puro, testado) ───────
//
// O OFX do Bradesco NÃO traz aplicação nem resgate do Invest Fácil: só o PDF "Extrato Consolidado / Por Período". Daqui sai:
//   · quais linhas do PDF são aplicação (Bradesco → Caixa de Aplicação) e quais são resgate (Caixa de Aplicação → Bradesco);
//   · a CHAVE estável de cada linha — reimportar o mesmo PDF reconhece o que já foi lançado e nunca duplica;
//   · a VALIDAÇÃO do PDF: se a leitura não fecha, nenhuma sugestão nasce dele;
//   · o que já existe no sistema (por chave, ou uma transferência feita à mão) para oferecer "vincular" em vez de criar outra;
//   · a EVIDÊNCIA gravada nas duas pernas (arquivo, hash, data da leitura, chave e o texto original do banco).
// Nada aqui grava: quem grava é o serviço, e só depois do clique do tesoureiro.
import type { ExtratoLido, LancamentoDoExtrato } from "./extratoConsolidadoPdf";

export type DirecaoInvest = "aplicacao" | "resgate";
export const ORIGEM_INVEST_PDF = "INVEST_FACIL_PDF";

export interface LinhaInvestFacil {
  /** estável e legível: data:DIREÇÃO:lote:valor (e #2, #3… se o banco repetir exatamente a mesma linha) */
  chave: string;
  data: string;
  valor: number;                 // sempre positivo
  direcao: DirecaoInvest;
  documento: string;             // o lote do banco
  textoOriginal: string;
}

const c2 = (n: number) => Math.round(n * 100) / 100;
const dia = (d: string) => Date.parse(`${d}T12:00:00Z`) / 86_400_000;

export function direcaoDoHistorico(historico: string): DirecaoInvest | null {
  if (/RESGATE\s+INVEST|RESG\.?\s*AUTOM\.?\s*INVEST/i.test(historico)) return "resgate";
  if (/APLIC\.?\s*INVEST/i.test(historico)) return "aplicacao";
  return null;
}

export function linhasDoInvestFacil(lancamentos: LancamentoDoExtrato[]): LinhaInvestFacil[] {
  const vistas = new Map<string, number>();
  const out: LinhaInvestFacil[] = [];
  for (const l of lancamentos) {
    const direcao = direcaoDoHistorico(l.historico);
    if (!direcao) continue;
    const base = `${l.data}:${direcao.toUpperCase()}:${l.documento}:${Math.abs(l.valor).toFixed(2)}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    out.push({ chave: n === 1 ? base : `${base}#${n}`, data: l.data, valor: c2(Math.abs(l.valor)), direcao, documento: l.documento, textoOriginal: l.historico });
  }
  return out;
}

const assinatura = (l: { data: string; valor: number; historico: string; documento?: string }) =>
  `${l.data}|${Math.abs(l.valor).toFixed(2)}|${l.historico}|${l.documento ?? ""}`;

/**
 * Para a auditoria: dá a cada linha de aplicação/resgate do banco a MESMA chave que a Mesa grava (e que o pareamento enxerga como marca
 * `[ofx:PDF:chave]`). A assinatura é a própria linha do PDF; linhas idênticas recebem as chaves #1, #2… na ordem em que aparecem.
 */
export function chavesPorAssinatura(lancamentos: LancamentoDoExtrato[]): (l: { data: string; valor: number; historico: string; documento?: string }) => string | undefined {
  const filas = new Map<string, string[]>();
  for (const l of linhasDoInvestFacil(lancamentos)) {
    const k = assinatura({ data: l.data, valor: l.valor, historico: l.textoOriginal, documento: l.documento });
    (filas.get(k) ?? filas.set(k, []).get(k)!).push(l.chave);
  }
  return (l) => filas.get(assinatura(l))?.shift();
}

/** O nome do índice único que fecha a corrida entre duas abas (migration 20261008180000). */
export const INDICE_UNICO_DA_CHAVE = "fin_lancamentos_invest_pdf_chave_uq";
export const AVISO_JA_REGISTRADA = "Transferência já registrada: esta linha do PDF acabou de ser lançada (outra aba ou outro usuário). Nada foi duplicado — reabra o PDF para ver a situação.";

/** O erro do banco é a recusa do índice único (23505)? Aceita o objeto do PostgREST ou só a mensagem. */
export function ehConflitoDaChave(erro: unknown): boolean {
  const e = erro as { message?: string; details?: string } | string | null | undefined;
  const texto = typeof e === "string" ? e : `${e?.message ?? ""} ${e?.details ?? ""}`;
  return texto.includes(INDICE_UNICO_DA_CHAVE);   // outra violação de unicidade (a chave primária, por ex.) não é esta
}

export const fitidDaChave =(chave: string) => `PDF:${chave}`;

/** O alerta: aplicações e resgates que o banco tem e o sistema não (sobraram do pareamento) — o que a conta corrente perdeu de vista. */
export interface AlertaInvest { aplicacoes: { n: number; total: number }; resgates: { n: number; total: number }; efeitoNaCorrente: number }

export function alertaDoInvest(soBanco: { classe: string; valor: number }[]): AlertaInvest {
  const soma = (xs: { valor: number }[]) => c2(xs.reduce((s, x) => s + Math.abs(x.valor), 0));
  const ap = soBanco.filter(b => b.classe === "aplicacao"), rg = soBanco.filter(b => b.classe === "resgate");
  return { aplicacoes: { n: ap.length, total: soma(ap) }, resgates: { n: rg.length, total: soma(rg) }, efeitoNaCorrente: c2(soma(rg) - soma(ap)) };
}

// ── a validação: sem leitura confiável, sem sugestão ─────────────────────────────

export interface ValidacaoDoPdf { ok: boolean; problemas: string[]; avisos: string[] }

const soDigitos = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

export function validarPdfParaSugestoes(extrato: ExtratoLido, ctx: { ofxDe: string; ofxAte: string; contaNumero?: string | null }): ValidacaoDoPdf {
  const problemas: string[] = [], avisos: string[] = [];
  if (extrato.lancamentos.length === 0) problemas.push("Nenhum lançamento foi lido do PDF.");
  if (extrato.quebras.length) {
    const q = extrato.quebras[0];
    problemas.push(`A cadeia de saldos não fecha em ${extrato.quebras.length} linha(s) — a primeira em ${q.data.split("-").reverse().join("/")} (${q.historico.slice(0, 40)}): o saldo lido é ${q.saldoLido.toLocaleString("pt-BR")} e o esperado ${q.saldoEsperado.toLocaleString("pt-BR")}.`);
  }
  for (const t of extrato.totaisDivergentes) {
    problemas.push(`O total de ${t.campo === "creditos" ? "créditos" : "débitos"} lido (${t.lido.toLocaleString("pt-BR")}) não é o impresso no PDF (${t.impresso.toLocaleString("pt-BR")}).`);
  }
  if (extrato.blocos.some(b => b.total === null)) problemas.push("Falta o 'Total' impresso de um dos blocos do PDF: não dá para conferir a leitura.");
  if (extrato.lancamentos.some(l => !Number.isFinite(l.valor) || l.valor === 0)) problemas.push("Há lançamento com valor zero ou ilegível.");
  for (const l of extrato.lancamentos) {
    const d = direcaoDoHistorico(l.historico);
    if ((d === "aplicacao" && l.valor >= 0) || (d === "resgate" && l.valor <= 0)) {
      problemas.push(`Linha de ${d} com o sinal trocado (${l.data} ${l.valor.toLocaleString("pt-BR")}): aplicação é sempre débito e resgate sempre crédito.`);
      break;
    }
  }
  if (ctx.contaNumero && extrato.contas.length > 0 && !extrato.contas.some(c => soDigitos(c.conta) === soDigitos(ctx.contaNumero!))) {
    problemas.push(`Este PDF é da conta ${extrato.contas.map(c => c.conta).join(", ")}, e a conta da Mesa é a ${ctx.contaNumero}.`);
  }
  const datas = extrato.lancamentos.map(l => l.data).sort();
  if (datas.length) {
    const [de, ate] = [datas[0], datas[datas.length - 1]];
    if (ate < ctx.ofxDe || de > ctx.ofxAte) problemas.push("O período do PDF não tem nada em comum com o do OFX.");
    else if (de > ctx.ofxDe && dia(de) - dia(ctx.ofxDe) > 3) avisos.push(`O PDF começa em ${de.split("-").reverse().join("/")}, depois do início do OFX: aplicações e resgates anteriores não serão sugeridos.`);
    else if (ate < ctx.ofxAte && dia(ctx.ofxAte) - dia(ate) > 3) avisos.push(`O PDF termina em ${ate.split("-").reverse().join("/")}, antes do fim do OFX: aplicações e resgates posteriores não serão sugeridos.`);
  }
  if (extrato.blocos.length > 1) avisos.push("O PDF tem mais de um bloco (o 'Últimos Lançamentos' abre com saldo que já soma o dia anterior): as linhas de aplicação e resgate de cada bloco são lidas normalmente.");
  return { ok: problemas.length === 0, problemas, avisos };
}

// ── o que já existe no sistema ───────────────────────────────────────────────────

/** Uma perna da conta corrente que já é uma transferência para a conta de aplicação (par com a perna de lá). */
export interface TransferenciaExistente { id: string; data: string; valor: number; tipo: "entrada" | "saida"; chaves: string[] }

export type SituacaoDaLinhaInvest =
  | { tipo: "nova" }
  | { tipo: "ja_registrada"; lancamentoId: string }                       // a MESMA chave já está gravada: nada a fazer
  | { tipo: "transferencia_manual"; lancamentoId: string; data: string }  // existe um par feito à mão: só falta vincular a evidência
  | { tipo: "ignorada" };

export const JANELA_DE_VINCULO = 5;

/**
 * Para cada linha: já registrada (mesma chave), igual a uma transferência feita à mão (mesmo valor, até 5 dias, sentido certo) ou nova.
 * Cada transferência existente serve a UMA linha só; o dia mais próximo vence. Linhas ignoradas antes ficam recolhidas.
 */
export function classificarLinhasInvest(linhas: LinhaInvestFacil[], existentes: TransferenciaExistente[], ignoradas: ReadonlySet<string>): Map<string, SituacaoDaLinhaInvest> {
  const out = new Map<string, SituacaoDaLinhaInvest>();
  const usadas = new Set<string>();
  for (const l of linhas) {
    const igual = existentes.find(e => e.chaves.includes(l.chave));
    if (igual) { out.set(l.chave, { tipo: "ja_registrada", lancamentoId: igual.id }); usadas.add(igual.id); }
  }
  for (const l of linhas) {
    if (out.has(l.chave)) continue;
    if (ignoradas.has(l.chave)) { out.set(l.chave, { tipo: "ignorada" }); continue; }
    const tipo = l.direcao === "aplicacao" ? "saida" : "entrada";
    const par = existentes
      .filter(e => !usadas.has(e.id) && e.chaves.length === 0 && e.tipo === tipo && Math.abs(e.valor - l.valor) < 0.005 && Math.abs(dia(e.data) - dia(l.data)) <= JANELA_DE_VINCULO)
      .sort((a, b) => Math.abs(dia(a.data) - dia(l.data)) - Math.abs(dia(b.data) - dia(l.data)))[0];
    if (par) { usadas.add(par.id); out.set(l.chave, { tipo: "transferencia_manual", lancamentoId: par.id, data: par.data }); }
    else out.set(l.chave, { tipo: "nova" });
  }
  return out;
}

// ── a evidência gravada nas pernas ───────────────────────────────────────────────

export interface Evidencia { chave: string; arquivo: string; hash: string; lidoEm: string; texto: string }

const limpo = (s: string) => s.replace(/[\[\]\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** O que vai em `observacoes` das duas pernas: marcas legíveis e pesquisáveis + o texto original do banco. */
export function montarEvidencia(e: Evidencia): string {
  return `[invest-pdf:${e.chave}] [origem:${ORIGEM_INVEST_PDF}] [pdf-arquivo:${limpo(e.arquivo)}] [pdf-hash:${e.hash}] [pdf-lido-em:${e.lidoEm}]\nExtrato: ${limpo(e.texto)}`;
}

export function chavesNaObservacao(obs: string | null | undefined): string[] {
  return [...String(obs ?? "").matchAll(/\[invest-pdf:([^\]]+)\]/g)].map(m => m[1]);
}

export function lerEvidencia(obs: string | null | undefined): Evidencia | null {
  const t = String(obs ?? "");
  const pega = (nome: string) => t.match(new RegExp(`\\[${nome}:([^\\]]+)\\]`))?.[1];
  const chave = pega("invest-pdf");
  if (!chave) return null;
  return { chave, arquivo: pega("pdf-arquivo") ?? "", hash: pega("pdf-hash") ?? "", lidoEm: pega("pdf-lido-em") ?? "", texto: t.match(/Extrato: (.*)/)?.[1]?.trim() ?? "" };
}

// ── o resumo antes de gravar ─────────────────────────────────────────────────────

export interface ResumoDoLote {
  aplicacoes: { n: number; total: number };
  resgates: { n: number; total: number };
  /** efeito líquido na conta CORRENTE (resgates − aplicações); na de aplicação é o oposto */
  efeitoNaCorrente: number;
  datas: { de: string; ate: string } | null;
}

export function resumirLote(itens: LinhaInvestFacil[]): ResumoDoLote {
  const ap = itens.filter(i => i.direcao === "aplicacao"), rg = itens.filter(i => i.direcao === "resgate");
  const soma = (xs: LinhaInvestFacil[]) => c2(xs.reduce((s, x) => s + x.valor, 0));
  const datas = itens.map(i => i.data).sort();
  return {
    aplicacoes: { n: ap.length, total: soma(ap) }, resgates: { n: rg.length, total: soma(rg) },
    efeitoNaCorrente: c2(soma(rg) - soma(ap)), datas: datas.length ? { de: datas[0], ate: datas[datas.length - 1] } : null,
  };
}
