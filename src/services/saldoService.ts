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

import { supabase } from "@/integrations/supabase/client";
import { saldoAcumuladoAntesDe } from "@/services/prestacaoContasService";
import type { FinLancamento } from "@/services/finService";

type LancamentoParaSaldo = Pick<FinLancamento, "id" | "data" | "tipo" | "valor" | "status" | "created_at"> & {
  data_pagamento?: string | null;
  /** Posição da linha dentro do dia no extrato do BANCO (1 = a primeira). null/ausente = ainda não sincronizada com um extrato. */
  ordem_banco?: number | null;
};

/** Só o que de fato aconteceu mexe no saldo — mesma regra de `fin_recalc_saldo_conta`. */
export function movimentaSaldo(l: Pick<FinLancamento, "status">): boolean {
  return l.status === "realizado" || l.status === "conciliado";
}

// DATA DE CAIXA (08/10/2026, "o dia 18/09 não fecha em R$ 1,00"): `data` é o VENCIMENTO. Um pagamento de recorrência que vence dia 20 e foi pago
// pelo banco dia 18 tem data = 20/09 e data_pagamento = 18/09. O extrato ordenava e acumulava só por `data`, então o saldo de 18/09 aparecia
// R$ 9.022,85 acima do banco (os 4 pagamentos só "aconteciam" em 20/09) — o dinheiro estava certo, a data não. O extrato é a visão de CAIXA: quando o
// lançamento movimenta o saldo e tem `data_pagamento`, é ela que vale. Previsto/cancelado (sem pagamento) continuam pelo vencimento.
// Só o EXTRATO muda: DRE, prestação de contas, vencimentos e `fin_movimento_antes_de` seguem por `data`, como sempre.
export function dataEfetiva(l: Pick<LancamentoParaSaldo, "status" | "data" | "data_pagamento">): string {
  return String(movimentaSaldo(l) && l.data_pagamento ? l.data_pagamento : l.data).slice(0, 10);
}

/** O vencimento (dd/mm da `data`), quando o pagamento caiu em OUTRO dia — para a tela mostrar os dois sem esconder nada. Senão, null. */
export function vencimentoDiferente(l: Pick<LancamentoParaSaldo, "status" | "data" | "data_pagamento">): string | null {
  return dataEfetiva(l) !== String(l.data).slice(0, 10) ? String(l.data).slice(0, 10) : null;
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
  const da = dataEfetiva(a), db = dataEfetiva(b);
  if (da !== db) return da < db ? -1 : 1;
  // Mesma data: a ORDEM DO BANCO manda (08/10/2026, "o extrato do sistema na mesma sequência do extrato do banco"). Quem já foi sincronizado com um
  // extrato (`ordem_banco`) vem primeiro, na sequência do banco; quem não foi (lançamento manual sem par, previsto) vem depois, pela regra de sempre.
  // Ordem total e transitiva: (tem ordem?, ordem, …regra antiga).
  const oa = a.ordem_banco ?? null, ob = b.ordem_banco ?? null;
  if (oa !== null && ob !== null && oa !== ob) return oa - ob;
  if ((oa === null) !== (ob === null)) return oa === null ? 1 : -1;
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

export interface FechamentoDoDia { data: string; saldo: number }

/**
 * O saldo de FECHAMENTO de cada dia do extrato (a linha "SALDO DO DIA", como no Omie e no extrato do banco): o acumulado depois da ÚLTIMA linha do dia,
 * na data efetiva (caixa). Chave = id da última linha do dia — a tela desenha a linha de fechamento logo depois dela. Previsto/cancelado não movem o
 * acumulado, então o fechamento é o mesmo com ou sem eles no fim do dia.
 */
export function fechamentosDoDia<T extends LancamentoParaSaldo>(ordenados: T[], saldoPorLancamento: Map<string, number>): Map<string, FechamentoDoDia> {
  const out = new Map<string, FechamentoDoDia>();
  for (let i = 0; i < ordenados.length; i++) {
    const hoje = dataEfetiva(ordenados[i]);
    const proximo = i + 1 < ordenados.length ? dataEfetiva(ordenados[i + 1]) : null;
    if (proximo !== hoje) out.set(ordenados[i].id, { data: hoje, saldo: saldoPorLancamento.get(ordenados[i].id) ?? 0 });
  }
  return out;
}

/**
 * Quanto o saldo "antes de `limite`" muda ao contar por data de CAIXA em vez de por vencimento. Só os lançamentos que CRUZAM o limite contam:
 * os que têm vencimento antes e pagamento depois saem da soma; os que têm vencimento depois e pagamento antes entram. Os demais não mudam.
 * Em centavos inteiros, como `calcularExtrato`.
 */
export function ajusteDeCaixaAntesDe(
  cruzados: { tipo: string; valor: number | string; data: string; data_pagamento: string | null; status?: string }[], limite: string,
): number {
  let centavos = 0;
  for (const l of cruzados) {
    if (l.status && !movimentaSaldo({ status: l.status } as Pick<FinLancamento, "status">)) continue;
    if (!l.data_pagamento) continue;
    const peso = (l.tipo === "entrada" ? 1 : -1) * Math.round(Number(l.valor) * 100);
    const vencAntes = String(l.data).slice(0, 10) < limite;
    const caixaAntes = String(l.data_pagamento).slice(0, 10) < limite;
    centavos += peso * ((caixaAntes ? 1 : 0) - (vencAntes ? 1 : 0));
  }
  return centavos / 100;
}

/** Os lançamentos pagos cujo vencimento e pagamento ficam em lados opostos de `limite` — poucos (hoje, 4 num mês), nunca a conta inteira. */
async function lancamentosQueCruzam(limite: string, contaId?: string) {
  const out: { tipo: string; valor: number; data: string; data_pagamento: string | null; status: string }[] = [];
  const TAMANHO = 1000;
  for (let p = 0; ; p++) {
    let q = supabase.from("fin_lancamentos").select("id, tipo, valor, data, data_pagamento, status")
      .in("status", ["realizado", "conciliado"])
      .or(`and(data.lt.${limite},data_pagamento.gte.${limite}),and(data.gte.${limite},data_pagamento.lt.${limite})`)
      .order("id").range(p * TAMANHO, p * TAMANHO + TAMANHO - 1);
    if (contaId) q = q.eq("conta_id", contaId);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as unknown as typeof out));
    if ((data ?? []).length < TAMANHO) break;
  }
  return out;
}

/**
 * Saldo de uma conta (ou de todas, sem `contaId`) no instante imediatamente
 * antes de `data`, na visão de CAIXA do extrato (ver `dataEfetiva`). Reexportado
 * daqui para as telas terem UM ponto de entrada. A soma pesada é feita no banco
 * (`fin_movimento_antes_de`, por vencimento — o que a prestação de contas e o
 * dashboard seguem usando); aqui só se corrige o punhado de pagamentos que cruzam a data.
 */
export async function saldoAntesDe(data: string, contaId?: string): Promise<number> {
  const [porVencimento, cruzados] = await Promise.all([saldoAcumuladoAntesDe(data, contaId), lancamentosQueCruzam(data, contaId)]);
  return Math.round((porVencimento + ajusteDeCaixaAntesDe(cruzados, data)) * 100) / 100;
}
