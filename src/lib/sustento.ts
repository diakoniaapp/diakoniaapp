// ─── sustento.ts — Conta Corrente de Sustento: as regras puras ─────────────────────────────────────────────────
//
// Pedido dela (08/10/2026), a partir do Recibo de Sustento Pastoral (RSP) de setembro/2026: sustento − IRRF − adiantamentos =
// líquido a pagar, por COMPETÊNCIA mensal. `fin_lancamentos` continua sendo a verdade do dinheiro; aqui só se decide
// (1) QUEM usa a conta corrente e (2) a que competência um pagamento deve ser sugerido.
//
// QUEM USA — revisão dela em 08/10/2026: o que define a necessidade NÃO é o cargo, é a FORMA COMO A PESSOA RECEBE. Cada beneficiário
// tem a chave "Controle por competência" (`controleCompetencia`, padrão desligada). Ligada, vale competência mensal, adiantamento,
// complemento e saldo a pagar; desligada, a pessoa segue paga pelas recorrências de sempre e nada aqui se aplica. Qualquer tipo
// (pastor, funcionário, missionário, bolsista, PAM, convênio) pode ligar. O `tipo` é só rótulo — não decide comportamento.
// (A primeira versão derivava um "modo simples/avançado" do tipo; saiu antes de ir ao banco.)
// Sem React, sem banco — o serviço lê, a tela mostra, esta camada decide. Datas sempre "YYYY-MM-DD" (sem `Date`+UTC).

export type TipoBeneficiario =
  | "pastor_titular" | "pastor_missionario" | "funcionario" | "missionario_sustentado" | "pam"
  | "convenio_missionario" | "prebenda" | "bolsa" | "ajuda_de_custo";

export const ROTULO_TIPO: Record<TipoBeneficiario, string> = {
  pastor_titular: "Pastor titular",
  pastor_missionario: "Pastor missionário",
  funcionario: "Funcionário",
  missionario_sustentado: "Missionário sustentado",
  pam: "PAM",
  convenio_missionario: "Convênio missionário",
  prebenda: "Prebenda",
  bolsa: "Bolsa",
  ajuda_de_custo: "Ajuda de custo",
};

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
  liquidoPrevisto: number;
  saldoAPagar: number;
  /** Quantas rubricas do RSP foram lançadas (0 → o líquido é o valor previsto da competência). */
  nItens: number;
}

/**
 * A competência está APURADA e com dinheiro a pagar? Só então ela disputa o pagamento.
 *   · com rubricas do RSP: o saldo só vale depois do fechamento (RSP conferido). Uma competência "aberta" ainda recebe adiantamentos
 *     e o líquido dela é provisório — tratá-la como dívida faria todo adiantamento de setembro parecer pagamento de setembro.
 *   · só com valor previsto: vale desde que haja valor (o valor confirmado já é a apuração).
 */
export function temSaldoPendente(c: CompetenciaParaSugestao): boolean {
  if (c.status === "paga") return false;
  if (c.nItens > 0 && c.status !== "fechada") return false;
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
}

export type SituacaoDaCompetencia = "Aberta" | "Prevista" | "A pagar" | "Paga parcialmente" | "Paga";

/** Total já pago a esta competência, qualquer que seja o tipo do pagamento. */
export function totalPago(l: Pick<LinhaDaCompetencia, "adiantamentos" | "pagamentosFinais" | "complementos" | "pagamentosSimples">): number {
  return l.adiantamentos + l.pagamentosFinais + l.complementos + l.pagamentosSimples;
}

/**
 * Situação para exibir, a mesma para qualquer beneficiário (não há mais "modo"):
 *   · Aberta — a competência corre e recebe adiantamentos; ainda não há líquido apurado;
 *   · Paga — o líquido está apurado e o saldo zerou (ou passou de zero a menos, como os R$ 1,00 de arredondamento de agosto);
 *   · Paga parcialmente — já saiu parte do LÍQUIDO (pagamento final, complemento ou pagamento simples);
 *   · A pagar — a competência fechada (RSP conferido), com só adiantamentos ou nada pago;
 *   · Prevista — há valor previsto, mas a competência ainda não foi fechada e nada do líquido foi pago.
 * Adiantamento não conta como "pagamento parcial": é dinheiro que saiu antes da apuração e entra como abatimento dela.
 */
export function situacaoDaCompetencia(l: LinhaDaCompetencia): SituacaoDaCompetencia {
  if (l.liquidoPrevisto <= TOLERANCIA) return "Aberta";
  if (l.saldoAPagar <= TOLERANCIA) return "Paga";
  if (l.pagamentosFinais + l.complementos + l.pagamentosSimples > TOLERANCIA) return "Paga parcialmente";
  return l.status === "fechada" ? "A pagar" : "Prevista";
}

export interface ResumoDoBeneficiario {
  /** Soma dos saldos a pagar das competências que disputam pagamento (ver `temSaldoPendente`). */
  saldoPendente: number;
  /** Competências com saldo pendente, da mais antiga à mais nova. */
  pendentes: string[];
  /** Adiantamentos já dados em competências ainda abertas — dinheiro que sai antes do RSP. */
  adiantadoEmAberto: number;
}

export function resumirBeneficiario(linhas: LinhaDaCompetencia[]): ResumoDoBeneficiario {
  const pendentes = linhas.filter(temSaldoPendente).sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
  return {
    saldoPendente: arredonda(pendentes.reduce((s, l) => s + l.saldoAPagar, 0)),
    pendentes: pendentes.map((l) => l.competencia),
    adiantadoEmAberto: arredonda(
      linhas.filter((l) => l.status === "aberta").reduce((s, l) => s + l.adiantamentos, 0),
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

/**
 * Desligar o controle é sempre permitido, mas não com dinheiro devido: uma competência com saldo a pagar deixaria de aparecer
 * onde a tesouraria a procura, e o saldo ficaria esquecido. Devolve o motivo (para a tela explicar) ou null se pode desligar.
 * Nada é apagado ao desligar — as competências ficam guardadas como histórico.
 */
export function motivoParaNaoDesligar(linhas: LinhaDaCompetencia[]): string | null {
  const r = resumirBeneficiario(linhas);
  if (r.saldoPendente <= TOLERANCIA) return null;
  return `Ainda há ${brlCurto(r.saldoPendente)} a pagar em ${r.pendentes.map(rotuloCompetencia).join(", ")}. Quite ou feche essas competências antes de desligar o controle.`;
}
