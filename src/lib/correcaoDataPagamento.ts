// ─── lib/correcaoDataPagamento.ts — quando a data_pagamento de um pagamento ANTIGO pode ser corrigida pelo comprovante (puro, testado) ───
//
// Pedido dela (14/10/2026): corrigir em massa a data_pagamento dos pagamentos históricos usando os comprovantes anexados — o "Pagar"
// gravava a data do REGISTRO, não a do Pix/boleto, e o lançamento não batia com o extrato nem com o OFX. Executado nesse dia: 19
// corrigidos de 34 (docs/CORRECAO_DATA_PAGAMENTO_COMPROVANTE.md). Esta lib é a REGRA; quem lê os arquivos e grava são os scripts em
// scripts/correcao-data-pagamento/. Ela decide sozinha, sem revisão humana — por isso só corrige quando não há dúvida nenhuma.
//
// Medido em 14/10/2026 contra os pagamentos ligados ao OFX (data do BANCO): em dia útil, a data lida do comprovante Bradesco foi
// sempre a do extrato. Em fim de semana/feriado o Bradesco lança no PRÓXIMO dia útil (Pix de sábado 05/09 → extrato 08/09; Pix do
// feriado 07/09 → 08/09): aí a data do comprovante NÃO é a do extrato, e trocar pioraria a conciliação. Esses casos ficam de fora.

import type { LeituraDoComprovante } from "./documentos/comprovante";

export const MOTIVO_DA_CORRECAO = "Correção automática baseada em comprovante anexado.";
/** `usuario_email` das linhas de trilha em log_auditoria — é por ele que o rollback acha o que desfazer. */
export const AUTOR_DA_CORRECAO = "correcao-automatica@comprovante";
export const EVENTO_CORRECAO = "CORRECAO_DATA_PAGAMENTO";
export const EVENTO_DESFEITA = "DESFAZ_CORRECAO_DATA_PAGAMENTO";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** Dias sem expediente bancário: feriados nacionais, os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) e São Jorge (RJ, 23/04). */
export function feriadosBancarios(ano: number): Set<string> {
  const p = pascoa(ano);
  const fixos = ["01-01", "04-21", "04-23", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map(md => `${ano}-${md}`);
  const moveis = [-48, -47, -2, 60].map(n => iso(somarDias(p, n)));
  return new Set([...fixos, ...moveis]);
}

/** `true` em dia útil bancário (segunda a sexta, fora dos feriados). */
export function diaUtilBancario(data: string): boolean {
  const d = new Date(data + "T12:00:00Z");
  const semana = d.getUTCDay();
  return semana !== 0 && semana !== 6 && !feriadosBancarios(d.getUTCFullYear()).has(data);
}

export interface LeituraDoAnexo {
  anexoId: string;
  arquivo: string | null;
  /** por que o arquivo não pôde ser lido (não baixou, PDF escaneado sem texto…) */
  erro: string | null;
  /** quantos comprovantes o PDF traz (o Bradesco junta vários num arquivo só) */
  quantidadeDeComprovantes: number;
  leitura: Pick<LeituraDoComprovante, "data" | "hora" | "valor" | "banco" | "tipo" | "confianca" | "e2e" | "candidatas"> | null;
}

export interface PagamentoComComprovante {
  lancamentoId: string;
  tipo: string;
  status: string;
  dataPagamento: string | null;
  valor: number;
  anexos: LeituraDoAnexo[];
}

export type Decisao =
  | { tipo: "corrigir"; de: string | null; para: string; anexo: LeituraDoAnexo }
  | { tipo: "ja_certa"; data: string }
  | { tipo: "excluir"; motivos: string[] }
  | { tipo: "sem_comprovante"; motivo: string };

/** A decisão para UM pagamento. Corrige só quando TODAS as condições valem; qualquer dúvida exclui, com o motivo. */
export function decidir(p: PagamentoComComprovante): Decisao {
  const legiveis = p.anexos.filter(a => !a.erro && a.leitura);
  if (!legiveis.length) return { tipo: "sem_comprovante", motivo: p.anexos.map(a => a.erro ?? "sem leitura").join("; ") || "nenhum comprovante" };

  const a = legiveis[0]; const l = a.leitura!;
  const motivos: string[] = [];
  if (p.tipo !== "saida" || !["realizado", "conciliado"].includes(p.status)) motivos.push(`não é um pagamento feito (${p.tipo}/${p.status})`);
  if (!l.data) motivos.push("o comprovante não tem data identificável");
  const datas = [...new Set(legiveis.map(x => x.leitura!.data).filter(Boolean))];
  if (datas.length > 1) motivos.push(`os comprovantes da mesma despesa têm datas diferentes (${datas.join(", ")})`);
  if (l.confianca !== "alta") motivos.push(`confiança da leitura ${l.confianca ?? "nenhuma"} (exige alta)`);
  if (l.valor == null || Math.abs(l.valor - p.valor) > 0.009) motivos.push(`valor do comprovante ${l.valor ?? "não encontrado"} ≠ valor pago ${p.valor}`);
  if (new Set(l.candidatas.filter(c => c.peso >= 0).map(c => c.data)).size > 1) motivos.push("mais de uma data no comprovante");
  if (legiveis.some(x => x.quantidadeDeComprovantes > 1)) motivos.push("o PDF traz mais de um comprovante");
  if (l.data && !diaUtilBancario(l.data)) motivos.push(`${l.data} não é dia útil bancário: o banco lança no próximo dia útil (o extrato não terá esta data)`);
  if (motivos.length) return { tipo: "excluir", motivos };

  if (l.data === p.dataPagamento) return { tipo: "ja_certa", data: l.data! };
  return { tipo: "corrigir", de: p.dataPagamento, para: l.data!, anexo: a };
}

/** Quantos comprovantes um texto de PDF traz (cabeçalho do Bradesco e equivalentes). Mínimo 1. */
export function contarComprovantes(texto: string): number {
  return Math.max(1, (texto.match(/Comprovante de Transa[cç][aã]o/gi) ?? []).length);
}
