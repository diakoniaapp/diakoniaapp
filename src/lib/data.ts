// ─── data.ts — datas no fuso de quem está olhando ──────────────────────────
//
// `new Date().toISOString()` converte pra UTC ANTES de formatar — e UTC
// está 3h à frente de Brasília. Qualquer "hoje" (ou "daqui a N dias/meses",
// ou "agora" num campo de hora) calculado assim lê AMANHÃ das 21h à
// meia-noite, horário de Brasília. Medido de verdade mais de uma vez:
// 27/08/2026 21h22 (formulário de evento sugeria a data errada) e
// 04/09/2026 ~21h59 (chamada da EBD criando aula pra segunda em vez de
// domingo, e uma assembleia geral marcada pra segunda em vez de domingo).
//
// Os helpers daqui leem os componentes de data (getFullYear/getMonth/
// getDate[/getHours/getMinutes]) direto no fuso LOCAL do navegador — nunca
// por `.toISOString()` — e por isso nunca viram o dia sozinhos.
//
// Nasceu em `src/lib/agenda/recurrence.ts` (onde o primeiro incidente foi
// corrigido) e foi promovido pra cá em 04/09/2026, depois de uma auditoria
// achar a mesma causa em ~55 outros lugares do sistema — ver a memória
// `bug-fuso-horario-datas.md` pro inventário completo e o que ainda falta
// trocar. `recurrence.ts` reexporta os quatro primeiros pra não quebrar
// quem já importa de lá.

/** "YYYY-MM-DD" a partir de uma `Date`, no fuso local. */
export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Hoje, no fuso de quem está olhando. */
export function hojeLocal(): string {
  return toYmd(new Date());
}

/**
 * "YYYY-MM-DD" → meia-noite LOCAL — não UTC, como `new Date(str)` faria
 * pra uma string sem hora (que o motor JS trata como UTC por spec).
 */
export function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Uma data local somada de N meses — para sugerir fim de série, vencimento, etc. */
export function daquiAMeses(isoInicio: string, meses: number): string {
  const [a, m, d] = isoInicio.split("-").map(Number);
  return toYmd(new Date(a, m - 1 + meses, d));
}

/** Uma data local somada (ou subtraída, com N negativo) de N dias. */
export function daquiADias(isoInicio: string, dias: number): string {
  const [a, m, d] = isoInicio.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  dt.setDate(dt.getDate() + dias);
  return toYmd(dt);
}

/** O mesmo que `daquiADias`, mas a partir de agora (não de uma data-string). */
export function hojeMaisDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return toYmd(d);
}

/**
 * Formato que `<input type="datetime-local">` espera — sempre no fuso
 * local. Passar `.toISOString()` pra esse tipo de input é outra variante
 * do mesmo bug: a string vem em UTC e o input a lê como se fosse local,
 * sem converter nada (achado em `ReunioesFinanceiras.tsx` — o horário
 * sugerido pra nova reunião aparecia 3h adiantado, o dia inteiro, não só
 * à noite).
 */
export function formatarDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${toYmd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
