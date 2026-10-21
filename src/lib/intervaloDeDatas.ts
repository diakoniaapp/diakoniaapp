// ─── lib/intervaloDeDatas.ts — a regra do par Data inicial / Data final (puro, testado) ───────────────────────────────────────────────────────────────────────
//
// Pedido dela (21/10/2026), que SUBSTITUI o de 29/09/2026 ("quando alterar a data inicial, corrija imediatamente a data final": o Extrato da conta igualava a final à inicial a cada
// mudança e quebrava a consulta — 01/09→31/10 virava 15/09→15/09 ao mexer na inicial):
//
//   · mudar a Data inicial NÃO mexe na Data final enquanto a final continuar válida (não menor que a inicial);
//   · a Data final só é ajustada quando ficaria MENOR que a inicial — e então passa a ser igual a ela.
//
// A simetria (mudar a final para ANTES da inicial leva a inicial até a final) é a leitura natural da mesma regra: nunca fica um intervalo invertido.
// Valor vazio ou incompleto (a pessoa está digitando ou apagou o campo) nunca ajusta o outro lado.
//
// Todas as telas financeiras com um par de datas usam estas duas funções — `Prestação de Contas`, que trabalha por mês/ano, já seguia a mesma ideia (`mudarInicio`/`mudarFim`).

export interface Intervalo { inicio: string; fim: string }

const ehData = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** A pessoa escolheu uma nova Data inicial: a final fica, a menos que fique menor que a inicial. */
export function aoMudarInicio(novoInicio: string, fimAtual: string): Intervalo {
  if (ehData(novoInicio) && ehData(fimAtual) && fimAtual < novoInicio) return { inicio: novoInicio, fim: novoInicio };
  return { inicio: novoInicio, fim: fimAtual };
}

/** A pessoa escolheu uma nova Data final: a inicial fica, a menos que fique maior que a final. */
export function aoMudarFim(inicioAtual: string, novoFim: string): Intervalo {
  if (ehData(novoFim) && ehData(inicioAtual) && novoFim < inicioAtual) return { inicio: novoFim, fim: novoFim };
  return { inicio: inicioAtual, fim: novoFim };
}
