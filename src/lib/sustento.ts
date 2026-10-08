// ─── sustento.ts — Conta Corrente de Sustento: as regras puras ─────────────────────────────────────────────────
//
// Pedido dela (08/10/2026), a partir do Recibo de Sustento Pastoral (RSP) de setembro/2026: sustento − IRRF − adiantamentos =
// líquido a pagar, por COMPETÊNCIA mensal. `fin_lancamentos` continua sendo a verdade do dinheiro; aqui só se decide
// (1) em que MODO a competência de um beneficiário é tratada e (2) a que competência um pagamento deve ser sugerido.
// Sem React, sem banco — o serviço lê, a tela mostra, esta camada decide. Datas sempre "YYYY-MM-DD" (sem `Date`+UTC).

export type TipoBeneficiario =
  | "pastor_titular" | "pastor_missionario" | "missionario_sustentado" | "pam"
  | "convenio_missionario" | "prebenda" | "bolsa" | "ajuda_de_custo";

export type ModoSustento = "simples" | "avancado";

export const ROTULO_TIPO: Record<TipoBeneficiario, string> = {
  pastor_titular: "Pastor titular",
  pastor_missionario: "Pastor missionário",
  missionario_sustentado: "Missionário sustentado",
  pam: "PAM",
  convenio_missionario: "Convênio missionário",
  prebenda: "Prebenda",
  bolsa: "Bolsa",
  ajuda_de_custo: "Ajuda de custo",
};

/**
 * O MODO nasce do TIPO: só o pastor titular tem RSP com rubricas, IRRF e adiantamentos (avançado); os demais acompanham só o
 * valor previsto do mês (simples). A exceção manual vale a partir de `modo_manual_desde` — competências anteriores não são
 * reinterpretadas (mudar o modo hoje não pode reescrever setembro).
 */
export function modoDoBeneficiario(
  b: { tipo: TipoBeneficiario; modoManual?: ModoSustento | null; modoManualDesde?: string | null },
  competencia?: string,
): ModoSustento {
  if (b.modoManual && b.modoManualDesde && (!competencia || competencia >= b.modoManualDesde)) return b.modoManual;
  return b.tipo === "pastor_titular" ? "avancado" : "simples";
}

// ── competência ──────────────────────────────────────────────────────────────

/** Dia do mês até o qual um adiantamento ainda pertence ao mês corrente; depois dele, ao mês seguinte. */
export const DIA_LIMITE_ADIANTAMENTO = 20;
/** Meio centavo: abaixo disto o saldo é zero (numeric(14,2) não tem fração menor). */
export const TOLERANCIA = 0.005;

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-09-01" → "setembro/2026". */
export function rotuloCompetencia(iso: string): string {
  const [a, m] = iso.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

/** Primeiro dia do mês de uma data "YYYY-MM-DD". */
export function primeiroDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/** Primeiro dia do mês seguinte ao da data (vira o ano em dezembro). */
export function mesSeguinte(data: string): string {
  const [a, m] = data.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** O que a regra precisa saber de uma competência — o resto da linha da visão não importa para sugerir. */
export interface CompetenciaParaSugestao {
  competencia: string;                      // "YYYY-MM-01"
  status: "aberta" | "fechada" | "paga";
  modo: ModoSustento;
  liquidoPrevisto: number;
  saldoAPagar: number;
}

/**
 * A competência está APURADA e com dinheiro a pagar? Só então ela disputa o pagamento.
 *   · avançado: o saldo só vale depois do fechamento (RSP conferido). Uma competência "aberta" ainda recebe adiantamentos e o
 *     líquido dela é provisório — tratá-la como dívida faria todo adiantamento de setembro parecer pagamento de setembro.
 *   · simples: vale desde que haja valor previsto (o RSP/valor confirmado já é a apuração).
 */
export function temSaldoPendente(c: CompetenciaParaSugestao): boolean {
  if (c.status === "paga") return false;
  if (c.modo === "avancado" && c.status !== "fechada") return false;
  return c.liquidoPrevisto > TOLERANCIA && c.saldoAPagar > TOLERANCIA;
}

export type MotivoDaSugestao = "saldo_pendente" | "atual" | "proxima";

export interface SugestaoDeCompetencia {
  competencia: string;
  motivo: MotivoDaSugestao;
  /** Frase para a tela: por que esta e não outra — a sugestão é sempre editável. */
  explicacao: string;
}

/**
 * A que competência sugerir um pagamento (adiantamento OU pagamento do líquido) — pedido dela em 08/10/2026:
 *
 *   1. a competência MAIS ANTIGA com saldo pendente (agosto com R$ 3.428,00 a pagar e PIX em 01/09 → agosto);
 *   2. a competência ATUAL — o mês da data do pagamento — se o dia for até o dia 20;
 *   3. a PRÓXIMA competência, se o dia for depois do dia 20.
 *
 * O dia 20 só decide entre 2 e 3, e só quando não existe saldo pendente: com agosto em aberto, um PIX de 25/09 ainda quita agosto.
 * Só disputam o item 1 as competências até o mês da data (a de um mês futuro nunca é "mais antiga que o pagamento").
 * Nunca decide sozinha: devolve a sugestão e o motivo, e a tela deixa trocar.
 */
export function sugerirCompetencia(dataPagamento: string, competencias: CompetenciaParaSugestao[]): SugestaoDeCompetencia {
  const doMes = primeiroDoMes(dataPagamento);

  const pendente = competencias
    .filter((c) => c.competencia <= doMes && temSaldoPendente(c))
    .sort((a, b) => (a.competencia < b.competencia ? -1 : 1))[0];
  if (pendente) {
    return {
      competencia: pendente.competencia,
      motivo: "saldo_pendente",
      explicacao: `${capitalizar(rotuloCompetencia(pendente.competencia))} ainda tem ${brlCurto(pendente.saldoAPagar)} a pagar — é a competência mais antiga em aberto.`,
    };
  }

  const dia = Number(dataPagamento.slice(8, 10));
  if (dia <= DIA_LIMITE_ADIANTAMENTO) {
    return {
      competencia: doMes,
      motivo: "atual",
      explicacao: `Sem saldo pendente; pagamento até o dia ${DIA_LIMITE_ADIANTAMENTO} fica na competência do próprio mês.`,
    };
  }
  const prox = mesSeguinte(dataPagamento);
  return {
    competencia: prox,
    motivo: "proxima",
    explicacao: `Sem saldo pendente; pagamento depois do dia ${DIA_LIMITE_ADIANTAMENTO} fica na competência seguinte.`,
  };
}

// ── a conta corrente de uma competência (o que a tela mostra) ───────────────────

export interface LinhaDaCompetencia extends CompetenciaParaSugestao {
  adiantamentos: number;
  pagamentosFinais: number;
  complementos: number;
  pagamentosSimples: number;
  /** Quantas rubricas do RSP foram lançadas (0 → o líquido é o valor previsto do modo simples). */
  nItens: number;
}

export type SituacaoDaCompetencia =
  | "Prevista" | "Paga parcialmente" | "Paga integralmente"       // modo simples
  | "Aberta" | "A pagar" | "Paga";                                  // modo avançado

/** Total já pago a esta competência, qualquer que seja o tipo do pagamento. */
export function totalPago(l: Pick<LinhaDaCompetencia, "adiantamentos" | "pagamentosFinais" | "complementos" | "pagamentosSimples">): number {
  return l.adiantamentos + l.pagamentosFinais + l.complementos + l.pagamentosSimples;
}

/**
 * Situação para exibir. Simples: o que já foi pago decide (Prevista → parcial → integral). Avançado: segue o ciclo do RSP —
 * "Aberta" corre e recebe adiantamentos; "A pagar" é a fechada com saldo; "Paga" quando o saldo zera (ou passa de zero a menos,
 * como os R$ 1,00 do arredondamento de agosto).
 */
export function situacaoDaCompetencia(l: LinhaDaCompetencia): SituacaoDaCompetencia {
  const pago = totalPago(l);
  if (l.modo === "simples") {
    if (pago <= TOLERANCIA) return "Prevista";
    return l.saldoAPagar > TOLERANCIA ? "Paga parcialmente" : "Paga integralmente";
  }
  if (l.status === "aberta") return "Aberta";
  return l.saldoAPagar > TOLERANCIA ? "A pagar" : "Paga";
}

export interface ResumoDoBeneficiario {
  /** Soma dos saldos a pagar das competências que disputam pagamento (ver `temSaldoPendente`). */
  saldoPendente: number;
  /** Competências com saldo pendente, da mais antiga à mais nova. */
  pendentes: string[];
  /** Adiantamentos já dados em competências ainda não fechadas (avançado) — dinheiro que sai antes do RSP. */
  adiantadoEmAberto: number;
}

export function resumirBeneficiario(linhas: LinhaDaCompetencia[]): ResumoDoBeneficiario {
  const pendentes = linhas.filter(temSaldoPendente).sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
  return {
    saldoPendente: arredonda(pendentes.reduce((s, l) => s + l.saldoAPagar, 0)),
    pendentes: pendentes.map((l) => l.competencia),
    adiantadoEmAberto: arredonda(
      linhas.filter((l) => l.modo === "avancado" && l.status === "aberta").reduce((s, l) => s + l.adiantamentos, 0),
    ),
  };
}

function arredonda(v: number): number {
  return Math.round(v * 100) / 100;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function brlCurto(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
