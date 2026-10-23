// ─── lib/recalculoDeGuia.ts — a conferência do "Recalcular guia" (puro, testado) ─────────────────────────────────────────────────────────────────
//
// Pedido dela (23/10/2026): a guia do FGTS atrasou e foi recalculada; em vez de excluir e criar outra, a obrigação é ALTERADA preservando o valor original, com o encargo (juros, multa, correção), o motivo e a nova
// guia — para o histórico e para o custo extra aparecer nos relatórios (docs/PROPOSTA_RECALCULO_DE_OBRIGACAO_2026-10-23.md). O banco (`fin_recalcular_obrigacao`) confere tudo de novo; aqui a tela diz, ao vivo, o que
// ainda falta — com as MESMAS regras, para ninguém só descobrir o erro depois de clicar.

export interface EntradaDoRecalculo {
  valorAtual: number;
  novoValor: number;
  juros: number;
  multa: number;
  correcao: number;
  motivo: string;
  /** a nova guia já foi escolhida (arquivo) */
  temGuia: boolean;
}

export interface ConferenciaDoRecalculo {
  /** quanto a guia nova custa a mais que a de antes */
  diferenca: number;
  /** o que a quebra (juros + multa + correção) já explica */
  explicado: number;
  /** diferença − explicado: zero quando fecha, positivo quando falta explicar, negativo quando passou */
  sobra: number;
  problemas: string[];
  ok: boolean;
}

export const MOTIVO_MINIMO = 5;
/** Sugestões de motivo (toque para preencher; a pessoa pode escrever o que quiser). */
export const MOTIVOS_SUGERIDOS = ["Encargos por atraso", "Guia reemitida com juros e multa", "Atualização monetária da guia"] as const;

const c2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const brl = (n: number) => c2(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export function conferirRecalculo(e: EntradaDoRecalculo): ConferenciaDoRecalculo {
  const diferenca = c2(c2(e.novoValor) - c2(e.valorAtual));
  const explicado = c2(c2(e.juros) + c2(e.multa) + c2(e.correcao));
  const sobra = c2(diferenca - explicado);
  const problemas: string[] = [];
  if (!(e.novoValor > 0)) problemas.push("Informe o novo valor da guia.");
  else if (diferenca <= 0) problemas.push(`O novo valor precisa ser maior que o atual (${brl(e.valorAtual)}). Para pagar menos, use o desconto no pagamento.`);
  if (e.juros < 0 || e.multa < 0 || e.correcao < 0) problemas.push("Juros, multa e correção não podem ser negativos.");
  else if (diferenca > 0 && Math.abs(sobra) >= 0.005) {
    problemas.push(sobra > 0 ? `Faltam ${brl(sobra)} para explicar: distribua entre juros, multa e correção.` : `A quebra passa ${brl(-sobra)} da diferença da guia.`);
  }
  if (e.motivo.trim().length < MOTIVO_MINIMO) problemas.push(`Informe o motivo (pelo menos ${MOTIVO_MINIMO} caracteres).`);
  if (!e.temGuia) problemas.push("Anexe a nova guia: ela é a prova do novo valor.");
  return { diferenca, explicado, sobra, problemas, ok: problemas.length === 0 };
}

/** A frase que resume o resultado: "R$ 1.000,00 → R$ 1.037,50 (+ R$ 37,50)". */
export function resumoDoRecalculo(valorAtual: number, novoValor: number): string {
  const d = c2(novoValor - valorAtual);
  return `${brl(valorAtual)} → ${brl(novoValor)}${d > 0 ? ` (+ ${brl(d)})` : ""}`;
}
