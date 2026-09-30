// ─── Serviço único de saldo ────────────────────────────────────────────────
//
// Auditoria de saldos (30/09/2026), pedido da Telma: "nenhuma tela deve
// possuir cálculo próprio". Até aqui o saldo acumulado linha a linha estava
// escrito TRÊS vezes, copiado à mão — `FinancasConta.tsx` (Movimentação da
// Conta), `ExtratoContaDrawer.tsx` (Extrato) e `FinancasRelatorioContas.tsx`
// (Relatório por conta). As três cópias estavam iguais no dia da auditoria,
// mas nada as obrigava a continuar iguais.
//
// A fórmula é UMA só, e já existe no banco: `fin_recalc_saldo_conta` (mantém
// `fin_contas.saldo_atual`, lido pelo Dashboard Executivo e pelo Painel da
// Tesouraria) e `fin_movimento_antes_de` (âncora "saldo antes do período"):
//
//   saldo = saldo_inicial + Σ(entrada) − Σ(saída), só status realizado/conciliado
//
// Este arquivo é o lado cliente dessa mesma fórmula — o acumulado linha a
// linha, que o banco não devolve pronto. Toda tela que mostra coluna "Saldo"
// consome `calcularExtrato`; toda tela que mostra o saldo atual lê
// `saldo_atual` (mesma fórmula, no gatilho).
//
// ORDEM DETERMINÍSTICA — o defeito que a auditoria achou: as três cópias
// desempatavam só por `created_at`. A importação da Omie grava um lote
// inteiro num INSERT só, e dentro de uma transação o Postgres dá o MESMO
// `now()` a todas as linhas — `created_at` empata, e a ordem entre elas
// (logo, o saldo intermediário de cada linha) passava a depender do acaso.
// O saldo FINAL não muda com a ordem; o de cada linha, sim. `id` entra como
// último critério: é único, então duas execuções nunca ordenam diferente.

import { saldoAcumuladoAntesDe } from "@/services/prestacaoContasService";
import type { FinLancamento } from "@/services/finService";

type LancamentoParaSaldo = Pick<FinLancamento, "id" | "data" | "tipo" | "valor" | "status" | "created_at">;

/** Só o que de fato aconteceu mexe no saldo — mesma regra de `fin_recalc_saldo_conta`. */
export function movimentaSaldo(l: Pick<FinLancamento, "status">): boolean {
  return l.status === "realizado" || l.status === "conciliado";
}

/** Efeito do lançamento no saldo: entrada soma, saída subtrai, o resto é 0. */
export function efeitoNoSaldo(l: Pick<FinLancamento, "status" | "tipo" | "valor">): number {
  if (!movimentaSaldo(l)) return 0;
  return l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor);
}

/**
 * Ordem cronológica do extrato (mais antigo primeiro), total e estável:
 * data → entrada antes de saída na mesma data → created_at → id.
 *
 * "Entrada antes de saída" é pedido da Telma (15/09/2026): a transferência
 * que cobre as despesas do dia chega no mesmo dia, e sem isso o acumulado
 * mostrava um mergulho negativo artificial no meio do dia.
 */
export function compararParaExtrato(a: LancamentoParaSaldo, b: LancamentoParaSaldo): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.tipo !== b.tipo) return a.tipo === "entrada" ? -1 : 1;
  const ca = a.created_at ?? "", cb = b.created_at ?? "";
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function ordenarParaExtrato<T extends LancamentoParaSaldo>(lancs: T[]): T[] {
  return [...lancs].sort(compararParaExtrato);
}

export interface ExtratoCalculado<T> {
  /** Lançamentos na ordem do extrato. */
  ordenados: T[];
  /** Saldo acumulado DEPOIS de cada lançamento, por id. */
  saldoPorLancamento: Map<string, number>;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoFinal: number;
}

/**
 * O cálculo de saldo acumulado — único no sistema. Recebe os lançamentos
 * de UMA conta e o saldo imediatamente antes do primeiro deles
 * (`saldoAntesDe`).
 *
 * Soma em centavos inteiros: `numeric` chega do PostgREST como número JS, e
 * somar 0,1 + 0,2 em ponto flutuante já dá 0,30000000000000004 — em
 * centenas de linhas o erro aparece no último centavo da coluna.
 */
export function calcularExtrato<T extends LancamentoParaSaldo>(lancs: T[], saldoInicial: number): ExtratoCalculado<T> {
  const ordenados = ordenarParaExtrato(lancs);
  const paraCentavos = (v: number) => Math.round(v * 100);
  let acumulado = paraCentavos(saldoInicial);
  let entradas = 0, saidas = 0;
  const saldoPorLancamento = new Map<string, number>();
  for (const l of ordenados) {
    if (movimentaSaldo(l)) {
      const v = paraCentavos(Number(l.valor));
      if (l.tipo === "entrada") { acumulado += v; entradas += v; }
      else { acumulado -= v; saidas += v; }
    }
    saldoPorLancamento.set(l.id, acumulado / 100);
  }
  return {
    ordenados,
    saldoPorLancamento,
    saldoInicial,
    totalEntradas: entradas / 100,
    totalSaidas: saidas / 100,
    saldoFinal: acumulado / 100,
  };
}

/**
 * Saldo de uma conta (ou de todas, sem `contaId`) no instante imediatamente
 * antes de `data`. Reexportado daqui para as telas terem UM ponto de
 * entrada; a soma em si é feita no banco (`fin_movimento_antes_de`).
 */
export function saldoAntesDe(data: string, contaId?: string): Promise<number> {
  return saldoAcumuladoAntesDe(data, contaId);
}
