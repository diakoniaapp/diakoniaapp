// ─── lib/extratoDoProjeto.ts — o extrato cronológico de UM projeto, com o saldo acumulado dele (puro, testado) ─────────────────────────────────────────────
//
// Pedido dela (21/10/2026): "gostaria de ter um extrato, de data, projeto — hoje acompanho o extrato do centro de custo". Receitas e despesas do projeto numa lista só, por data, com o saldo do
// projeto linha a linha. As regras são as da reserva (lib/recursosReservados.ts): só conta o que de fato passou pela conta (realizado/conciliado), sem transferência entre contas; previsto pode
// aparecer na lista (se a pessoa quiser ver o que vem aí) mas NUNCA mexe no saldo. A data é a do CAIXA: pago → data do pagamento; senão, o vencimento.

export interface LancamentoDeExtratoDoProjeto {
  id: string;
  data: string;
  data_pagamento?: string | null;
  tipo: string;
  status: string;
  valor: number | string;
  origem?: string | null;
  projeto_id?: string | null;
}

export interface LinhaDoExtratoDoProjeto<L extends LancamentoDeExtratoDoProjeto> {
  lancamento: L;
  dia: string;
  entrada: number;
  saida: number;
  /** o lançamento mexe no saldo (realizado/conciliado) — previsto aparece, mas não conta */
  conta: boolean;
  /** saldo do projeto depois desta linha (as linhas que não contam repetem o saldo de antes) */
  saldo: number;
}

export interface ExtratoDoProjeto<L extends LancamentoDeExtratoDoProjeto> {
  linhas: LinhaDoExtratoDoProjeto<L>[];
  /** saldo acumulado ANTES do período (0 sem data inicial) */
  saldoAnterior: number;
  entradas: number;
  saidas: number;
  /** saldo no fim do período: anterior + entradas − saídas (pode ser negativo) */
  saldoFinal: number;
  /** o que fica reservado: o saldo, com piso zero */
  reservado: number;
  /** o quanto passou do arrecadado: "gasto além da reserva" */
  alemDaReserva: number;
}

const REALIZADO = new Set(["realizado", "conciliado"]);
const arredondar = (n: number) => Math.round(n * 100) / 100;
const valorDe = (l: LancamentoDeExtratoDoProjeto) => Number(l.valor) || 0;

/** O dia do CAIXA: o pagamento entra no dia em que o banco o debitou/creditou; o resto, pelo vencimento. */
export const diaDoCaixa = (l: LancamentoDeExtratoDoProjeto): string =>
  REALIZADO.has(l.status) && l.data_pagamento ? String(l.data_pagamento).slice(0, 10) : String(l.data).slice(0, 10);

/** Só vale para o saldo o que passou pela conta e não é transferência entre contas. */
const contaNoSaldo = (l: LancamentoDeExtratoDoProjeto) => REALIZADO.has(l.status) && l.origem !== "transferencia";

export function montarExtratoDoProjeto<L extends LancamentoDeExtratoDoProjeto>(
  lancamentos: L[], opcoes: { de?: string; ate?: string; mostrarPrevistos?: boolean } = {},
): ExtratoDoProjeto<L> {
  const { de, ate, mostrarPrevistos } = opcoes;
  // o que pode aparecer: o que conta no saldo + (se pedido) os previstos; cancelado, aguardando aprovação e quitado por terceiro nunca (não movem caixa)
  const visiveis = lancamentos.filter(l => contaNoSaldo(l) || (mostrarPrevistos && l.status === "previsto" && l.origem !== "transferencia"));
  const ordenados = [...visiveis].sort((a, b) =>
    diaDoCaixa(a).localeCompare(diaDoCaixa(b)) || (a.tipo === b.tipo ? 0 : a.tipo === "entrada" ? -1 : 1) || a.id.localeCompare(b.id));

  let saldoAnterior = 0;
  for (const l of ordenados) {
    if (de && diaDoCaixa(l) < de && contaNoSaldo(l)) saldoAnterior += l.tipo === "entrada" ? valorDe(l) : -valorDe(l);
  }
  saldoAnterior = arredondar(saldoAnterior);

  let saldo = saldoAnterior, entradas = 0, saidas = 0;
  const linhas: LinhaDoExtratoDoProjeto<L>[] = [];
  for (const l of ordenados) {
    const dia = diaDoCaixa(l);
    if ((de && dia < de) || (ate && dia > ate)) continue;
    const conta = contaNoSaldo(l);
    const v = valorDe(l);
    const entrada = l.tipo === "entrada" ? v : 0;
    const saida = l.tipo === "entrada" ? 0 : v;
    if (conta) { saldo = arredondar(saldo + entrada - saida); entradas += entrada; saidas += saida; }
    linhas.push({ lancamento: l, dia, entrada, saida, conta, saldo });
  }
  const saldoFinal = arredondar(saldo);
  return {
    linhas, saldoAnterior, entradas: arredondar(entradas), saidas: arredondar(saidas), saldoFinal,
    reservado: Math.max(0, saldoFinal), alemDaReserva: Math.max(0, arredondar(-saldoFinal)),
  };
}

/** Os lançamentos do MESMO centro que ainda não têm projeto — candidatos a entrar neste projeto. Só o que passou pela conta, fora transferência. */
export function candidatosSemProjeto<L extends LancamentoDeExtratoDoProjeto>(doCentro: L[], opcoes: { de?: string; ate?: string } = {}): L[] {
  return doCentro
    .filter(l => !l.projeto_id && contaNoSaldo(l))
    .filter(l => { const d = diaDoCaixa(l); return (!opcoes.de || d >= opcoes.de) && (!opcoes.ate || d <= opcoes.ate); })
    .sort((a, b) => diaDoCaixa(b).localeCompare(diaDoCaixa(a)) || a.id.localeCompare(b.id));
}
