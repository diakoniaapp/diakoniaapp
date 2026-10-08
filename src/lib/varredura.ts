// ─── lib/varredura.ts — a "conferência diária do R$ 1,00" da conta corrente com Invest Fácil (puro, testado) ───────────────
//
// O Bradesco varre a conta corrente para o Invest Fácil: no fim de todo dia com movimento o saldo volta a R$ 1,00 (comprovado nos extratos
// de set/out de 2026). Logo, o saldo do SISTEMA ao fim de um dia com movimento tem de ser R$ 1,00 também. Se não for, o que falta é
// aplicação ou resgate do Invest Fácil que ninguém registrou — e a diferença é exatamente o valor que faltou naquele dia.
//
// O desvio é cumulativo (um esquecimento de 3 dias atrás continua aparecendo nos dias seguintes); por isso o que se mostra é a MUDANÇA
// do desvio de um dia para o outro: ela isola o valor que faltou NAQUELE dia.

export const SALDO_APOS_VARREDURA = 1;
export const TOLERANCIA_DA_VARREDURA = 0.05;

export interface MovimentoDoDia { data: string; /** assinado: entrada +, saída − */ valor: number }

export interface DiaDaVarredura {
  data: string;
  saldo: number;
  /** saldo − R$ 1,00, acumulado */
  desvio: number;
  /** quanto o desvio mudou neste dia: o que faltou registrar NESTE dia */
  mudanca: number;
  situacao: "ok" | "falta_aplicacao" | "falta_resgate";
}

export interface ConferenciaDaVarredura {
  dias: DiaDaVarredura[];
  /** só os dias em que algo novo ficou faltando */
  faltas: DiaDaVarredura[];
  /** desvio no último dia conferido (0 = a conta bate com o banco) */
  desvioAtual: number;
}

const c2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param saldoAntes saldo do sistema ao fim do dia anterior ao primeiro movimento recebido
 * @param ate último dia a conferir, inclusive (o chamador exclui o dia da última importação: o banco só varre à noite)
 */
export function conferirVarredura(movimentos: MovimentoDoDia[], saldoAntes: number, ate: string, tolerancia = TOLERANCIA_DA_VARREDURA): ConferenciaDaVarredura {
  const porDia = new Map<string, number>();
  for (const m of movimentos) if (m.data <= ate) porDia.set(m.data, c2((porDia.get(m.data) ?? 0) + m.valor));
  let saldo = c2(saldoAntes);
  let desvioAnterior = c2(saldo - SALDO_APOS_VARREDURA);
  const dias: DiaDaVarredura[] = [];
  for (const data of [...porDia.keys()].sort()) {
    saldo = c2(saldo + porDia.get(data)!);
    const desvio = c2(saldo - SALDO_APOS_VARREDURA);
    const mudanca = c2(desvio - desvioAnterior);
    const novaFalta = Math.abs(mudanca) > tolerancia;
    dias.push({ data, saldo, desvio, mudanca, situacao: !novaFalta ? "ok" : mudanca > 0 ? "falta_aplicacao" : "falta_resgate" });
    desvioAnterior = desvio;
  }
  return { dias, faltas: dias.filter(d => d.situacao !== "ok"), desvioAtual: dias.length ? dias[dias.length - 1].desvio : c2(saldoAntes - SALDO_APOS_VARREDURA) };
}

export function mensagemDaFalta(d: DiaDaVarredura): string {
  const v = Math.abs(d.mudanca).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return d.situacao === "falta_aplicacao"
    ? `Falta uma aplicação de ${v}: o sistema terminou o dia com ${v} a mais do que o banco.`
    : `Falta um resgate de ${v}: o sistema terminou o dia com ${v} a menos do que o banco.`;
}
