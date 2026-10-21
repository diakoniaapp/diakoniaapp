// ─── calendarioDeVencimentos — a grade do mês da Mesa (regras puras, testadas) ─────────────────────────────────────────────────────────────────────────
// Fase A da simplificação do Financeiro (20/10/2026): a Agenda Financeira era a Mesa com outra roupa (mesma fonte, mesmo horizonte de 30 dias, mesma ação). Seu único valor próprio era
// VER o mês de uma vez. Ela virou a visão "Calendário" da Mesa: cada dia mostra o total e o tom do que há nele; clicar abre as obrigações do dia, com as mesmas linhas e ações do Livro.
import type { DiaDoExtrato } from "@/lib/extratoDeObrigacoes";

/** O pior que há no dia, do mais urgente ao mais calmo. */
export type TomDoDia = "atraso" | "aguardando" | "aberto" | "terceiro" | "pago" | "vazio";

export const ROTULO_DO_TOM: Record<TomDoDia, string> = {
  atraso: "Atrasado ou possível falha no débito", aguardando: "Aguardando confirmação bancária", aberto: "Em aberto", terceiro: "Quitada por terceiro", pago: "Tudo pago", vazio: "Sem obrigações",
};

/** Dia sem obrigação nenhuma (ou só canceladas) = vazio. Débito automático não confirmado conta pelo acompanhamento (🟡/🔴); o resto, pelo vencimento. */
export function tomDoDia(dia: Pick<DiaDoExtrato, "linhas"> | null | undefined, hoje: string): TomDoDia {
  const linhas = (dia?.linhas ?? []).filter(l => l.situacao !== "cancelada");
  if (linhas.length === 0) return "vazio";
  const emAberto = linhas.filter(l => l.situacao === "em_aberto" || l.situacao === "paga_parcialmente" || (l.situacao === "reembolso" && l.reembolsoAPagar));
  if (linhas.some(l => l.debito === "nao_encontrado")) return "atraso";
  if (linhas.some(l => l.debito === "aguardando")) return "aguardando";
  if (emAberto.some(l => !l.debito && ((l.diasEmAtraso ?? 0) > 0 || l.data < hoje))) return "atraso";
  if (emAberto.length > 0) return "aberto";
  if (linhas.every(l => l.situacao === "quitada_por_terceiro")) return "terceiro";
  return "pago";
}

/**
 * O que pede atenção NO dia, em números (a "linha de alerta" da célula do calendário, 21/10/2026): o tom só diz "há algo urgente"; o tesoureiro precisa saber QUANTAS.
 * Mesmas regras de `tomDoDia`, contadas em vez de só detectadas: débito automático não encontrado = possível falha; débito aguardando = a conferir;
 * conta em aberto (ou reembolso a pagar) vencida e sem débito automático = vencida.
 */
export interface AlertasDoDia { vencidas: number; possivelFalha: number; aConferir: number }

export function alertasDoDia(dia: Pick<DiaDoExtrato, "linhas"> | null | undefined, hoje: string): AlertasDoDia {
  const linhas = (dia?.linhas ?? []).filter(l => l.situacao !== "cancelada");
  const emAberto = (l: (typeof linhas)[number]) => l.situacao === "em_aberto" || l.situacao === "paga_parcialmente" || (l.situacao === "reembolso" && l.reembolsoAPagar);
  return {
    possivelFalha: linhas.filter(l => l.debito === "nao_encontrado").length,
    aConferir: linhas.filter(l => l.debito === "aguardando").length,
    vencidas: linhas.filter(l => emAberto(l) && !l.debito && ((l.diasEmAtraso ?? 0) > 0 || l.data < hoje)).length,
  };
}

export interface CelulaDoCalendario { data: string | null; dia: number | null }

const dois = (n: number) => String(n).padStart(2, "0");

/** As semanas do mês (domingo a sábado), com células vazias (`data: null`) antes do dia 1 e depois do último. */
export function gradeDoMes(ano: number, mes: number): CelulaDoCalendario[][] {
  const primeiro = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const celulas: CelulaDoCalendario[] = [];
  for (let i = 0; i < primeiro; i++) celulas.push({ data: null, dia: null });
  for (let d = 1; d <= ultimo; d++) celulas.push({ data: `${ano}-${dois(mes)}-${dois(d)}`, dia: d });
  while (celulas.length % 7 !== 0) celulas.push({ data: null, dia: null });
  const semanas: CelulaDoCalendario[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

export interface MesDoCalendario { ano: number; mes: number }
export const mesDe = (ymd: string): MesDoCalendario => ({ ano: Number(ymd.slice(0, 4)), mes: Number(ymd.slice(5, 7)) });
export const somarMeses = (m: MesDoCalendario, n: number): MesDoCalendario => {
  const t = m.ano * 12 + (m.mes - 1) + n;
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
};
export const limitesDoMesDoCalendario = (m: MesDoCalendario): { de: string; ate: string } => ({
  de: `${m.ano}-${dois(m.mes)}-01`, ate: `${m.ano}-${dois(m.mes)}-${dois(new Date(Date.UTC(m.ano, m.mes, 0)).getUTCDate())}`,
});
export const NOMES_DOS_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
