// ─── documentacaoDaMesa — os chips "Documentos de Setembro/2026 · 24 pendências" da Mesa (23/10/2026) ───────────────────────────────────────────────────
// Decisão dela: a primeira tela da Tesouraria deve responder "qual mês ainda impede meu fechamento?", e não misturar meses sob "neste mês". Um chip POR MÊS, cada um levando à Auditoria de
// documentos DAQUELE mês (`?mes=AAAA-MM`), que já abre em "Pendências". Antes o chip somava o mês anterior e o corrente (dias 1–20) e dizia "neste mês".
//
// O número é o MESMO da Auditoria (a aba "Pendências"): incompletas (parciais + sem documentação) MAIS os ajustes administrativos. A Mesa contava só as incompletas (22 em setembro, enquanto a
// Auditoria mostrava 24) e o chip prometeria um número que a tela de destino não mostra.
import { rotuloDoMes } from "@/lib/fechamentoMensal";

/** O que a Mesa precisa de um resumo de documentação (o `ResumoDocumentacao` do serviço tem estes campos e outros). */
export interface ResumoParaChip { parciais: number; sem: number; administrativas: number }

/** Pendências como a Auditoria conta: as que têm gravidade (parciais, sem documentação e ajustes administrativos). */
export const pendenciasDaAuditoria = (r: ResumoParaChip): number => r.parciais + r.sem + r.administrativas;

export interface ChipDeDocumentacao {
  /** "Setembro/2026" */
  rotulo: string;
  /** "2026-09" — o `?mes=` da Auditoria */
  mes: string;
  pendencias: number;
  /** o texto do chip: "Documentos de Setembro/2026" */
  texto: string;
  /** "24 pendências" */
  detalhe: string;
  /** a Auditoria daquele mês, já nas pendências */
  para: string;
}

/** Até que dia do mês seguinte o mês anterior ainda é assunto (a janela do malote — a mesma do cartão "Documentos para a contabilidade"). */
export const ULTIMO_DIA_DA_JANELA = 20;

const dois = (n: number) => String(n).padStart(2, "0");

/** O `?mes=AAAA-MM` do mês de `hoje` (0) ou do anterior (−1). */
export function mesDaAuditoria(hoje: string, deslocamento: 0 | -1 = 0): string {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  if (deslocamento === 0) return `${ano}-${dois(mes)}`;
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${dois(mes - 1)}`;
}
/** A Auditoria de documentos de um mês, já na fila de pendências (que é a visão padrão). */
export const auditoriaDoMes = (mes: string) => `/financas/auditoria-anexos?mes=${mes}`;

/**
 * Um chip por mês com pendência: na janela de fechamento (dias 1–20) o mês anterior vem primeiro (é o que impede o fechamento) e depois o corrente; fora dela, só o corrente.
 * Mês sem pendência não vira chip (a Mesa já diz "documentos em dia").
 */
export function chipsDeDocumentacao(
  hoje: string,
  anterior: { rotulo: string; resumo: ResumoParaChip } | null,
  atual: ResumoParaChip | null,
): ChipDeDocumentacao[] {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dia = Number(hoje.slice(8, 10));
  const meses: { rotulo: string; mes: string; resumo: ResumoParaChip }[] = [];
  if (anterior && dia <= ULTIMO_DIA_DA_JANELA) {
    const a = mes === 1 ? ano - 1 : ano;
    const m = mes === 1 ? 12 : mes - 1;
    meses.push({ rotulo: anterior.rotulo, mes: `${a}-${dois(m)}`, resumo: anterior.resumo });
  }
  if (atual) meses.push({ rotulo: rotuloDoMes(ano, mes), mes: `${ano}-${dois(mes)}`, resumo: atual });
  return meses
    .map(x => ({ x, n: pendenciasDaAuditoria(x.resumo) }))
    .filter(({ n }) => n > 0)
    .map(({ x, n }) => ({
      rotulo: x.rotulo, mes: x.mes, pendencias: n,
      texto: `Documentos de ${x.rotulo}`,
      detalhe: `${n} ${n === 1 ? "pendência" : "pendências"}`,
      para: auditoriaDoMes(x.mes),
    }));
}
