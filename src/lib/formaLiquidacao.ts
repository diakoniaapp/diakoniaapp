// ─── formaLiquidacao.ts — COMO uma conta é liquidada (puro, sem React) ──────────
//
// Até 06/10/2026 toda recorrência era tratada como "conta para pagar": a tesouraria precisava
// abrir o item e marcá-lo pago. Na rotina real muita despesa NÃO é paga à mão — o banco debita
// sozinho (plano de saúde, seguro, consórcio) — e o trabalho do tesoureiro é só ACOMPANHAR,
// CONCILIAR e CONFERIR depois que o débito aconteceu.
//
// A forma de liquidação separa as duas rotinas:
//   · a pagar    — manual e boleto/fatura: alguém precisa agir até o vencimento;
//   · automática — débito automático, PIX recorrente, transferência programada: o banco
//                  executa; a tesouraria confere se aconteceu.
//
// `LIQUIDACAO_AUTOMATICA` é a ÚNICA definição de "automática": mudar o que entra em "Débitos
// automáticos" é mudar esta lista.

export type FormaLiquidacao =
  | "manual" | "boleto_fatura" | "debito_automatico" | "pix_recorrente" | "transferencia_programada";

export const FORMAS_LIQUIDACAO: FormaLiquidacao[] = [
  "manual", "boleto_fatura", "debito_automatico", "pix_recorrente", "transferencia_programada",
];

export const ROTULO_LIQUIDACAO: Record<FormaLiquidacao, string> = {
  manual: "Pagamento manual",
  boleto_fatura: "Boleto / Fatura",
  debito_automatico: "Débito automático",
  pix_recorrente: "PIX recorrente",
  transferencia_programada: "Transferência programada",
};

export const DICA_LIQUIDACAO: Record<FormaLiquidacao, string> = {
  manual: "Alguém paga e marca como pago (dinheiro, Pix avulso, cartão).",
  boleto_fatura: "Chega um boleto ou fatura para pagar até o vencimento.",
  debito_automatico: "O banco debita sozinho; a tesouraria só confere no extrato.",
  pix_recorrente: "Um Pix agendado ou autorizado sai sozinho; só conferir no extrato.",
  transferencia_programada: "Uma transferência agendada sai sozinha; só conferir no extrato.",
};

export const LIQUIDACAO_AUTOMATICA: ReadonlySet<FormaLiquidacao> = new Set<FormaLiquidacao>([
  "debito_automatico", "pix_recorrente", "transferencia_programada",
]);

/** Valor lido do banco (pode faltar antes da migration, ou vir com texto antigo) → forma válida. */
export function normalizarLiquidacao(v: unknown): FormaLiquidacao {
  return (FORMAS_LIQUIDACAO as string[]).includes(v as string) ? (v as FormaLiquidacao) : "manual";
}

export const ehAutomatica = (v: unknown): boolean => LIQUIDACAO_AUTOMATICA.has(normalizarLiquidacao(v));

// ── acompanhamento do débito ────────────────────────────────────────────────

/** O banco costuma lançar o débito no dia útil seguinte (fim de semana, feriado): só depois
 *  dessa folga um débito que não apareceu vira "não encontrado". */
export const DIAS_DE_TOLERANCIA_DO_DEBITO = 3;

export type SituacaoDoDebito = "aguardando" | "encontrado" | "nao_encontrado";

export interface DebitoItem {
  id: string;
  /** Vencimento. */
  data: string;
  /** Dia em que o dinheiro saiu, quando já saiu. */
  dataPagamento?: string | null;
  valor: number;
  status: string;
  descricao?: string | null;
  fornecedor?: string | null;
}

const somaDias = (ymd: string, n: number): string => {
  const [a, m, d] = ymd.split("-").map(Number);
  const t = new Date(a, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};

/** `null` = não conta (cancelado, aguardando aprovação etc.). */
export function situacaoDoDebito(item: Pick<DebitoItem, "status" | "data">, hoje: string): SituacaoDoDebito | null {
  if (item.status === "realizado" || item.status === "conciliado") return "encontrado";
  if (item.status !== "previsto") return null;
  return somaDias(item.data, DIAS_DE_TOLERANCIA_DO_DEBITO) < hoje ? "nao_encontrado" : "aguardando";
}

export interface IndicadoresDeDebitos {
  /** Quantos débitos automáticos o mês tem (todos). */
  previstos: number;
  encontrados: number;
  naoEncontrados: number;
  aguardando: number;
  valorPrevisto: number;
  valorDebitado: number;
}

export function indicadoresDeDebitos(itens: DebitoItem[], hoje: string): IndicadoresDeDebitos {
  const r: IndicadoresDeDebitos = { previstos: 0, encontrados: 0, naoEncontrados: 0, aguardando: 0, valorPrevisto: 0, valorDebitado: 0 };
  for (const it of itens) {
    const s = situacaoDoDebito(it, hoje);
    if (!s) continue;
    r.previstos += 1;
    r.valorPrevisto += it.valor;
    if (s === "encontrado") { r.encontrados += 1; r.valorDebitado += it.valor; }
    else if (s === "nao_encontrado") r.naoEncontrados += 1;
    else r.aguardando += 1;
  }
  const arred = (n: number) => Math.round(n * 100) / 100;
  r.valorPrevisto = arred(r.valorPrevisto);
  r.valorDebitado = arred(r.valorDebitado);
  return r;
}

// ── "débito automático encontrado" no extrato ──────────────────────────────

/** Tolerância de valor de quem tem conta variável (energia, água, telefonia). */
export const TOLERANCIA_VALOR_VARIAVEL = 0.35;
/** O débito sai perto do vencimento: antecipado no fim de semana ou no dia útil seguinte. */
export const JANELA_DO_DEBITO_DIAS = 5;

const PALAVRAS_SEM_VALOR = new Set([
  "pix", "debito", "deb", "aut", "automatico", "pagamento", "pgto", "pag", "ted", "doc", "cobranca", "cob",
  "tarifa", "ltda", "eireli", "sa", "de", "da", "do", "das", "dos", "em", "conta", "cartao", "compra",
  "des", "rem", "transf", "boleto", "fatura", "titulo", "tit", "bancario", "bancaria", "recebido", "enviado",
]);

function palavrasDoNome(texto: string): string[] {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)
    .filter(t => t.length >= 4 && !PALAVRAS_SEM_VALOR.has(t) && !/^\d+$/.test(t));
}

/** Quantas palavras com significado o extrato e o cadastro têm em comum (casando começo de
 *  palavra, porque o banco corta: "ASSISTENCIA" × "Assist"). */
export function palavrasEmComum(memo: string, ...cadastro: (string | null | undefined)[]): string[] {
  const a = palavrasDoNome(memo);
  const b = palavrasDoNome(cadastro.filter(Boolean).join(" "));
  return a.filter(x => b.some(y => x === y || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))));
}

export interface CandidatoDebito extends DebitoItem {
  /** A recorrência marcou o valor como variável. */
  variavel?: boolean;
}

export interface DebitoEncontrado {
  candidato: CandidatoDebito;
  /** 0–100. */
  confianca: number;
  motivos: string[];
}

const centavos = (n: number) => Math.round(n * 100);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

/**
 * Procura, entre os débitos automáticos ainda "aguardando", o que casa com uma saída do extrato.
 *
 *   · dentro da janela de dias do vencimento;
 *   · valor igual (centavos) — ou, se a conta é variável, até ±35% E com nome em comum;
 *   · se vários candidatos servem, só vale quem tem o nome em comum — sem isso, ninguém: é melhor
 *     o tesoureiro escolher do que o sistema baixar o débito errado.
 */
export function acharDebitoCompativel(
  tx: { data: string; valor: number; memo: string },
  candidatos: CandidatoDebito[],
): DebitoEncontrado | null {
  type Ponto = { c: CandidatoDebito; comum: string[]; igual: boolean; dias: number };
  const pontos: Ponto[] = [];
  for (const c of candidatos) {
    if (c.status !== "previsto") continue;
    const dias = Math.abs(diasEntre(c.data, tx.data));
    if (dias > JANELA_DO_DEBITO_DIAS) continue;
    const comum = palavrasEmComum(tx.memo, c.descricao, c.fornecedor);
    const igual = centavos(c.valor) === centavos(tx.valor);
    const proximo = c.variavel && c.valor > 0 && Math.abs(tx.valor - c.valor) / c.valor <= TOLERANCIA_VALOR_VARIAVEL;
    if (igual || (proximo && comum.length > 0)) pontos.push({ c, comum, igual, dias });
  }
  if (pontos.length === 0) return null;

  let escolhidos = pontos;
  if (pontos.length > 1) {
    escolhidos = pontos.filter(p => p.comum.length > 0);
    if (escolhidos.length > 1) {
      escolhidos.sort((a, b) => b.comum.length - a.comum.length || a.dias - b.dias);
      if (escolhidos[0].comum.length === escolhidos[1].comum.length && escolhidos[0].dias === escolhidos[1].dias) return null;
      escolhidos = [escolhidos[0]];
    }
    if (escolhidos.length !== 1) return null;
  }
  const p = escolhidos[0];
  const motivos = [p.igual ? "valor igual ao previsto" : `valor ${p.c.valor > 0 && tx.valor > p.c.valor ? "acima" : "abaixo"} do previsto (conta variável)`];
  if (p.comum.length > 0) motivos.push(`nome em comum: ${p.comum.join(", ")}`);
  motivos.push(p.dias === 0 ? "no dia do vencimento" : `${p.dias} dia${p.dias > 1 ? "s" : ""} do vencimento`);
  let confianca = p.igual ? 80 : 65;
  if (p.comum.length > 0) confianca += 15;
  if (p.dias <= 1) confianca += 4;
  return { candidato: p.c, confianca: Math.min(99, confianca), motivos };
}
