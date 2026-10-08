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
//
// TIPO DE CONTROLE — com o controle ligado, a igreja escolhe como administrar o compromisso: Automático (padrão), Simples ou
// Avançado. "Simples" é valor previsto, valor pago e saldo; "Avançado" acrescenta sustento bruto, IRRF, outros descontos,
// adiantamentos, complementos e líquido. "Automático" sugere um dos dois pelo histórico (ver `sugerirModo`) — e o rótulo do tipo
// (pastor titular → avançado, o resto → simples) só serve de ponto de partida quando ainda não há histórico. A troca vale SÓ para
// novas competências: cada competência guarda o modo com que nasceu e o banco recusa mudá-lo depois que há rubricas ou pagamentos.
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

export type ModoSustento = "simples" | "avancado";
export type TipoControle = "automatico" | "simples" | "avancado";

export const ROTULO_TIPO_CONTROLE: Record<TipoControle, string> = { automatico: "Automático", simples: "Simples", avancado: "Avançado" };
export const ROTULO_MODO: Record<ModoSustento, string> = { simples: "Simples", avancado: "Avançado" };

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

/** Primeiro dia do mês ANTERIOR ao da data (volta o ano em janeiro) — o líquido de um mês costuma sair no início do seguinte. */
export function mesAnterior(data: string): string {
  const [a, m] = data.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
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
  /** O modo com que a competência NASCEU — não muda com a configuração do beneficiário. */
  modo: ModoSustento;
  liquidoPrevisto: number;
  saldoAPagar: number;
  /** Quantas rubricas do RSP foram lançadas (0 → o líquido é o valor previsto da competência). */
  nItens: number;
}

/**
 * A competência está APURADA e com dinheiro a pagar? Só então ela disputa o pagamento.
 *   · avançada: o saldo só vale depois do fechamento (RSP conferido). Uma competência "aberta" ainda recebe adiantamentos e o
 *     líquido dela é provisório — tratá-la como dívida faria todo adiantamento de setembro parecer pagamento de setembro.
 *   · simples: vale desde que haja valor previsto (o valor confirmado já é a apuração).
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

// ── o modo do beneficiário: Automático, Simples ou Avançado ─────────────────────

export interface SugestaoDeModo {
  modo: ModoSustento;
  /** Frase para a tela: por que este modo. */
  motivo: string;
}

/** Quantas das últimas competências com movimento entram na leitura do histórico. */
const JANELA_DO_HISTORICO = 3;

/**
 * O modo que o "Automático" sugere, pelo HISTÓRICO do beneficiário (pedido dela, 08/10/2026):
 *   · olha as últimas 3 competências com movimento (rubricas, adiantamento ou pagamento);
 *   · com 2 ou mais delas: avançado se ao menos 2 tiveram adiantamento ou rubricas do RSP (uso REGULAR), senão simples;
 *   · com menos de 2 (beneficiário novo): o rótulo do tipo é só o ponto de partida — pastor titular → avançado, o resto → simples.
 * Quem passa a receber adiantamento regularmente vira avançado sozinho, sem mexer no cadastro da pessoa. É sugestão: o
 * "Simples" e o "Avançado" fixos da configuração têm precedência.
 */
export function sugerirModo(
  tipo: TipoBeneficiario,
  competencias: Array<Pick<LinhaDaCompetencia, "competencia" | "adiantamentos" | "nItens" | "pagamentosFinais" | "complementos" | "pagamentosSimples">>,
): SugestaoDeModo {
  const comMovimento = competencias
    .filter((c) => c.adiantamentos > TOLERANCIA || c.nItens > 0 || c.pagamentosFinais + c.complementos + c.pagamentosSimples > TOLERANCIA)
    .sort((a, b) => (a.competencia < b.competencia ? 1 : -1))
    .slice(0, JANELA_DO_HISTORICO);
  if (comMovimento.length >= 2) {
    const regulares = comMovimento.filter((c) => c.adiantamentos > TOLERANCIA || c.nItens > 0).length;
    return regulares >= 2
      ? { modo: "avancado", motivo: `adiantamentos ou RSP em ${regulares} das últimas ${comMovimento.length} competências` }
      : { modo: "simples", motivo: `sem adiantamentos regulares nas últimas ${comMovimento.length} competências` };
  }
  return tipo === "pastor_titular"
    ? { modo: "avancado", motivo: "ainda sem histórico — o pastor titular costuma receber com adiantamento e IRRF" }
    : { modo: "simples", motivo: "ainda sem histórico — começa pelo mais simples" };
}

export interface ModoVigente extends SugestaoDeModo {
  /** Verdadeiro quando veio do Automático; falso quando a igreja fixou Simples ou Avançado. */
  automatico: boolean;
}

/** O modo que vale para as PRÓXIMAS competências do beneficiário. As existentes guardam o modo com que nasceram. */
export function modoVigente(
  tipoControle: TipoControle,
  tipo: TipoBeneficiario,
  competencias: Parameters<typeof sugerirModo>[1],
): ModoVigente {
  if (tipoControle === "simples") return { modo: "simples", motivo: "definido pela igreja", automatico: false };
  if (tipoControle === "avancado") return { modo: "avancado", motivo: "definido pela igreja", automatico: false };
  return { ...sugerirModo(tipo, competencias), automatico: true };
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

// ── ligar um pagamento a uma competência (Fase 2) ────────────────────────────────

export type TipoDoPagamento = "adiantamento" | "pagamento_final" | "complemento" | "pagamento";

export const ROTULO_PAGAMENTO: Record<TipoDoPagamento, string> = {
  adiantamento: "Adiantamento", pagamento_final: "Pagamento final", complemento: "Complemento", pagamento: "Pagamento",
};

/**
 * Que tipos de pagamento cada modo aceita — o mesmo desenho da escolha dela: Simples é só valor previsto, pago e saldo (um tipo,
 * "pagamento"); Avançado distingue adiantamento, pagamento final e complemento. O banco aceita qualquer um dos quatro em qualquer
 * competência; esta regra é da tela, para a competência simples nunca ganhar um "adiantamento" que ela não sabe mostrar.
 */
export function tiposPermitidos(modo: ModoSustento): TipoDoPagamento[] {
  return modo === "avancado" ? ["adiantamento", "pagamento_final", "complemento"] : ["pagamento"];
}

/**
 * O tipo que a tela sugere. Avançado: antes do RSP fechar o dinheiro que sai é adiantamento; depois, pagamento final do líquido
 * (um complemento só se a pessoa escolher, porque depende de saber que o líquido já foi pago). Simples: pagamento.
 */
export function tipoSugerido(c: { modo: ModoSustento; status: "aberta" | "fechada" | "paga" }): TipoDoPagamento {
  if (c.modo === "simples") return "pagamento";
  return c.status === "aberta" ? "adiantamento" : "pagamento_final";
}

/** Uma competência já paga não recebe mais nada: o saldo zerou e qualquer coisa a mais viraria "pago a maior" sem querer. */
export function podeReceberPagamento(c: { status: "aberta" | "fechada" | "paga" }): boolean {
  return c.status !== "paga";
}

/** A competência sugerida existe? Se não, a tela oferece abri-la antes de ligar. */
export function competenciaExiste(competencia: string, existentes: Array<{ competencia: string }>): boolean {
  return existentes.some((c) => c.competencia === competencia);
}

// ── criar e fechar a competência (Fase 2, parte 2) ───────────────────────────────

/**
 * Lê um valor digitado em reais: "17.451,84", "17451,84", "17451.84", "R$ 1.234,50", "4000". Devolve null se não for um número
 * válido e maior ou igual a zero. O ponto sozinho só vale como milhar quando há grupos de três dígitos ("1.234" = 1234; "12.5" = 12,5).
 */
export function parseValorBR(texto: string): number | null {
  let t = (texto ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export type RubricaDoRsp = "sustento" | "arredondamento" | "outro_provento" | "irrf" | "inss" | "outro_desconto";
export type NaturezaDaRubrica = "provento" | "desconto";

/** As linhas que o editor oferece. O arredondamento aparece duas vezes porque no RSP ele pode ser crédito (+0,48) ou débito (−0,77). */
export const OPCOES_DE_RUBRICA: Array<{ chave: string; rubrica: RubricaDoRsp; natureza: NaturezaDaRubrica; rotulo: string; descricao: string }> = [
  { chave: "sustento", rubrica: "sustento", natureza: "provento", rotulo: "Sustento pastoral (provento)", descricao: "Sustento pastoral" },
  { chave: "outro_provento", rubrica: "outro_provento", natureza: "provento", rotulo: "Outro provento", descricao: "Outro provento" },
  { chave: "arredondamento_credito", rubrica: "arredondamento", natureza: "provento", rotulo: "Arredondamento — crédito", descricao: "Arredondamento (crédito)" },
  { chave: "irrf", rubrica: "irrf", natureza: "desconto", rotulo: "IRRF (desconto)", descricao: "IRRF" },
  { chave: "inss", rubrica: "inss", natureza: "desconto", rotulo: "INSS (desconto)", descricao: "INSS" },
  { chave: "outro_desconto", rubrica: "outro_desconto", natureza: "desconto", rotulo: "Outro desconto", descricao: "Outro desconto" },
  { chave: "arredondamento_debito", rubrica: "arredondamento", natureza: "desconto", rotulo: "Arredondamento — débito", descricao: "Arredondamento (débito)" },
];

/**
 * O status que a competência deve ter depois de uma mudança de valores. Só a "aberta" nunca muda sozinha (quem a fecha é a pessoa, ao
 * conferir o RSP). Fechada com o líquido todo pago vira "paga"; "paga" que voltou a ter saldo (um pagamento desligado, uma rubrica nova)
 * volta a "fechada". É o que mantém "Saldo a pagar" e a situação sempre contando a mesma história.
 */
export function statusPeloSaldo(c: { status: "aberta" | "fechada" | "paga"; liquidoPrevisto: number; saldoAPagar: number }): "aberta" | "fechada" | "paga" {
  if (c.status === "aberta") return "aberta";
  if (c.liquidoPrevisto > TOLERANCIA && c.saldoAPagar <= TOLERANCIA) return "paga";
  return "fechada";
}

/** Uma competência só fecha com apuração: avançada, com o sustento lançado; simples, com valor previsto. Devolve o motivo ou null. */
export function motivoParaNaoFechar(c: { modo: ModoSustento; nItens: number; sustento: number; liquidoPrevisto: number }): string | null {
  if (c.modo === "avancado") {
    if (c.nItens === 0 || c.sustento <= TOLERANCIA) return "Lance primeiro o sustento pastoral do RSP.";
    if (c.liquidoPrevisto <= TOLERANCIA) return "O líquido do RSP precisa ser maior que zero (confira o IRRF e os descontos).";
    return null;
  }
  return c.liquidoPrevisto > TOLERANCIA ? null : "Informe o valor previsto antes de fechar.";
}

/** O vencimento da obrigação de uma competência: o dia habitual do líquido, no mês seguinte (setembro, dia 5 → 05/10). Dia 1 a 28. */
export function vencimentoDaObrigacao(competencia: string, diaDoLiquido: number | null): string {
  const dia = Math.min(Math.max(diaDoLiquido ?? 5, 1), 28);
  return `${mesSeguinte(competencia).slice(0, 8)}${String(dia).padStart(2, "0")}`;
}
