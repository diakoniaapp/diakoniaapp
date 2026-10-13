// ─── recorrencia.ts — as datas e as parcelas de uma recorrência (puro, sem React) ───
//
// Pedido da Telma (06/10/2026): "criando recorrências com 3, 4, 5, 12 parcelas, mas o sistema
// gera lançamentos só até dezembro de 2026". Três causas, todas em `fin_gerar_recorrencias` (a
// função SQL que gerava os previstos), medidas lendo o corpo dela (supabase/baseline/schema.sql):
//
//   1. HORIZONTE DE 90 DIAS. `p_ate_data` vazio vira `current_date + 90 dias`, e o formulário
//      chamava a função sem data. Criada em 06/10, a série ia até ~04/01/2027 — na prática, até
//      dezembro. Doze parcelas viravam três.
//   2. IGNORAVA `data_inicio`. A primeira geração "começa do mês corrente" (`date_trunc('month',
//      current_date)`) e, se a data já passou, pula para a próxima: um início em 05/10 gerado em
//      06/10 perdia a parcela de 05/10 — exatamente o teste dela (05/10/2026 → 05/09/2027).
//   3. SEM CONTAGEM DE PARCELAS. Só `data_fim` encerrava a série; "12 parcelas" não existia.
//
// A geração agora acontece no app, usando as funções puras daqui (testadas com o caso dela), e
// grava os previstos com o vínculo `recorrencia_id` e o número da parcela.

import { daquiADias, toYmd } from "./data";

export type FrequenciaRec = "mensal" | "bimestral" | "trimestral" | "semestral" | "anual";
export type TipoDeRecorrencia = "continua" | "parcelamento";

const MESES_POR_FREQUENCIA: Record<FrequenciaRec, number> = {
  mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12,
};

export const mesesDaFrequencia = (f: FrequenciaRec): number => MESES_POR_FREQUENCIA[f] ?? 1;

/** O dia `dia` do mês (a, m1) — recuando para o último dia quando o mês é mais curto. */
export function diaNoMes(ano: number, mes1: number, dia: number): string {
  const ultimo = new Date(ano, mes1, 0).getDate();
  return toYmd(new Date(ano, mes1 - 1, Math.min(Math.max(dia, 1), ultimo)));
}

/** A data da ocorrência `k` (0 = a primeira) a partir do mês de `base` ("YYYY-MM-DD"). */
function ocorrenciaDoMes(base: string, k: number, dia: number, frequencia: FrequenciaRec): string {
  const [a, m] = base.split("-").map(Number);
  const total = (m - 1) + k * mesesDaFrequencia(frequencia);
  return diaNoMes(a + Math.floor(total / 12), (total % 12) + 1, dia);
}

/**
 * Data final a partir daqui NÃO é data de verdade: é o marcador de "sem fim" que o legado gravou (`2099-12-31`). Medido em
 * 08/10/2026: 34 das 37 recorrências tinham `data_fim = 2099-12-31` e o gerador a tratou como fim real — criou 29.917 lançamentos
 * previstos (≈ 880 por recorrência, até dezembro de 2099), 69% de todos os lançamentos do sistema, e fez a edição de recorrência
 * estourar o tempo limite do banco. Uma recorrência com data final nesse patamar é uma série SEM fim: janela de 12 meses.
 */
export const DATA_FIM_SEM_FIM = "2090-01-01";
export const dataFimReal = (d?: string | null): string | null => (d && d < DATA_FIM_SEM_FIM ? d : null);

/** Teto de ocorrências de uma série contínua numa só geração (20 anos de mensal): defesa contra data final absurda. */
export const MAXIMO_DE_OCORRENCIAS = 240;

export interface ParametrosDaSerie {
  /** Quando a série começa. */
  dataInicio: string;
  /** Dia do mês do vencimento (1–31; recua nos meses curtos). */
  diaVencimento: number;
  frequencia: FrequenciaRec;
  tipo?: TipoDeRecorrencia;
  /** Parcelamento: quantas parcelas ao todo. */
  totalParcelas?: number | null;
  /** Parcelamento: o número da parcela que cai em `dataInicio` (1 = a primeira). */
  parcelaInicial?: number | null;
  /** Contínua: encerra neste dia, inclusive. */
  dataFim?: string | null;
}

export interface Ocorrencia {
  data: string;
  /** Só em parcelamento. */
  parcela?: number;
  totalParcelas?: number;
}

/** A primeira data do dia-do-mês que não é anterior a `dataInicio`. */
export function primeiraData(dataInicio: string, diaVencimento: number): string {
  const [a, m] = dataInicio.split("-").map(Number);
  const noMesDeInicio = diaNoMes(a, m, diaVencimento);
  if (noMesDeInicio >= dataInicio) return noMesDeInicio;
  return diaNoMes(m === 12 ? a + 1 : a, m === 12 ? 1 : m + 1, diaVencimento);
}

/**
 * Todas as ocorrências da série, da primeira até o fim dela (parcelas, `dataFim`) ou até
 * `ate` — o que vier primeiro. Sem parcelas nem `dataFim`, a série não acaba: `ate` é quem
 * corta (o horizonte de geração).
 */
export function calcularOcorrencias(p: ParametrosDaSerie, ate: string): Ocorrencia[] {
  const parcelado = p.tipo === "parcelamento" && !!p.totalParcelas && p.totalParcelas > 0;
  const total = parcelado ? p.totalParcelas! : 0;
  const parcelaInicial = parcelado ? Math.min(Math.max(p.parcelaInicial ?? 1, 1), total) : 1;
  const primeira = primeiraData(p.dataInicio, p.diaVencimento);
  const out: Ocorrencia[] = [];
  const limite = parcelado ? total - parcelaInicial + 1 : MAXIMO_DE_OCORRENCIAS;
  const dataFim = parcelado ? null : dataFimReal(p.dataFim);
  for (let k = 0; k < limite; k++) {
    const data = ocorrenciaDoMes(primeira, k, p.diaVencimento, p.frequencia);
    if (data > ate) break;
    if (dataFim && data > dataFim) break;
    out.push(parcelado ? { data, parcela: parcelaInicial + k, totalParcelas: total } : { data });
  }
  return out;
}

/** O horizonte de geração das séries SEM fim: 12 meses à frente (parcelamento ignora isto). */
export const MESES_DE_HORIZONTE = 12;

/**
 * Até onde gerar agora. Parcelamento e série com `dataFim` geram TUDO de uma vez (a pessoa
 * espera ver as 12 parcelas); a contínua sem fim gera 12 meses à frente.
 */
export function limiteDeGeracao(p: ParametrosDaSerie, hoje: string): string {
  if (p.tipo === "parcelamento" && p.totalParcelas) return "9999-12-31";
  const fim = dataFimReal(p.dataFim);
  if (fim) return fim;
  const [a, m, d] = hoje.split("-").map(Number);
  return toYmd(new Date(a, m - 1 + MESES_DE_HORIZONTE, d));
}

/** A série não tem fim (contínua, sem data final): o horizonte é só um recorte técnico, que se renova. */
export const serieSemFim = (p: Pick<ParametrosDaSerie, "tipo" | "dataFim" | "totalParcelas">): boolean =>
  !(p.tipo === "parcelamento" && !!p.totalParcelas) && !dataFimReal(p.dataFim);

/** Precisa gerar mais? Sim quando faltam menos de ~11 meses à frente (ou nunca gerou). */
export function precisaRenovar(p: ParametrosDaSerie, ultimoGeradoAte: string | null, hoje: string): boolean {
  if (!serieSemFim(p)) return false;
  if (!ultimoGeradoAte) return true;
  const [a, m, d] = hoje.split("-").map(Number);
  const alvo = toYmd(new Date(a, m - 1 + (MESES_DE_HORIZONTE - 1), d));
  return ultimoGeradoAte < alvo;
}

/**
 * Contínua que começou há muito tempo: não despejar meses de previstos ATRASADOS de uma vez.
 * Ocorrências anteriores a esta data só são geradas em parcelamento (onde a pessoa escolheu
 * explicitamente a parcela inicial).
 */
export const DIAS_DE_PASSADO_TOLERADO = 31;

/** Uma linha que a série já tem no banco (em qualquer situação): o que basta para saber QUAL ocorrência ela ocupa. */
export interface LinhaDaSerie {
  data: string;
  /** Mês da competência (a data fica "YYYY-MM-01"); NÃO muda quando a despesa é paga em outro dia. */
  competencia?: string | null;
  /** Parcelamento: o número da parcela que a linha representa. */
  parcela?: number | null;
}

const mesDe = (ymd: string) => ymd.slice(0, 7);

/**
 * Qual linha ocupa a ocorrência `o`? A data EXATA não basta: a despesa paga em outro dia (a `data` vira a do pagamento) e a
 * recorrência que mudou de dia deixam a ocorrência com outra data, e o gerador, vendo a vaga, criava uma segunda — medido em
 * 13/10/2026: Carreta Missionária e ABC com dois previstos em outubro, Prefeitura com a parcela 1/3 paga em 30/09 e recriada
 * em 06/09 ("atrasada há 37 dias" sem estar). A ocorrência é identificada pela data, pela parcela (parcelamento) ou pelo MÊS DA
 * COMPETÊNCIA, que não anda com o pagamento.
 */
export function ocupanteDaOcorrencia(o: Ocorrencia, linhas: readonly LinhaDaSerie[]): LinhaDaSerie | undefined {
  return linhas.find(l => l.data === o.data)
    ?? (o.parcela != null ? linhas.find(l => l.parcela === o.parcela) : undefined)
    ?? linhas.find(l => !!l.competencia && mesDe(l.competencia) === mesDe(o.data));
}

/** O que gerar de fato: tira o que já foi gerado e, na contínua, o passado distante. */
export function ocorrenciasAGerar(
  p: ParametrosDaSerie, hoje: string, jaGeradas: ReadonlySet<string>, linhas: readonly LinhaDaSerie[] = [],
): Ocorrencia[] {
  const corte = daquiADias(hoje, -DIAS_DE_PASSADO_TOLERADO);
  return calcularOcorrencias(p, limiteDeGeracao(p, hoje))
    .filter(o => !jaGeradas.has(o.data) && !ocupanteDaOcorrencia(o, linhas))
    .filter(o => p.tipo === "parcelamento" || o.data >= corte);
}

/** A agenda da série mudou (dia, frequência ou início)? Só então os previstos já gerados precisam andar de data. */
export function mudouAAgenda(
  antes: Pick<ParametrosDaSerie, "diaVencimento" | "frequencia" | "dataInicio">,
  depois: Pick<ParametrosDaSerie, "diaVencimento" | "frequencia" | "dataInicio">,
): boolean {
  return antes.diaVencimento !== depois.diaVencimento || antes.frequencia !== depois.frequencia || antes.dataInicio !== depois.dataInicio;
}

export interface PrevistoDaSerie extends LinhaDaSerie { id: string }

/**
 * Editou o dia da recorrência: cada previsto ABERTO (deste mês em diante) passa para a data que a agenda nova dá à ocorrência dele.
 * Sem isso o previsto de 13/10 sobrevive ao "agora é dia 10" e a série fica com duas ocorrências no mesmo mês. Só mexe em quem
 * tem ocorrência correspondente na agenda nova e cuja data realmente muda; se a data de destino já é de OUTRA linha da série,
 * não mexe (quem resolve a duplicata é a tesouraria, não um UPDATE às cegas).
 */
export function redatarPrevistos(
  p: ParametrosDaSerie, hoje: string, previstos: readonly PrevistoDaSerie[], todas: readonly LinhaDaSerie[] = previstos,
): { id: string; de: string; para: string }[] {
  const primeiroMes = `${mesDe(hoje)}-01`;
  const agenda = calcularOcorrencias(p, limiteDeGeracao(p, hoje));
  const ocupadas = new Set(todas.map(l => l.data));
  const out: { id: string; de: string; para: string }[] = [];
  const jaUsadas = new Set<string>();
  for (const pr of [...previstos].sort((a, b) => a.data.localeCompare(b.data))) {
    if (pr.competencia && pr.competencia < primeiroMes) continue;
    const o = (pr.parcela != null ? agenda.find(x => x.parcela === pr.parcela) : undefined)
      ?? agenda.find(x => mesDe(x.data) === mesDe(pr.competencia ?? pr.data));
    if (!o || o.data === pr.data || ocupadas.has(o.data) || jaUsadas.has(o.data)) continue;
    jaUsadas.add(o.data);
    out.push({ id: pr.id, de: pr.data, para: o.data });
  }
  return out;
}

// ── o que mostrar no cartão da recorrência ─────────────────────────────────

export interface SituacaoDaSerie {
  /** Parcelamento: "4/12" — a última parcela que já venceu (ou a primeira, se nenhuma venceu). */
  parcelaAtual: { numero: number; total: number } | null;
  /** Parcelamento: a seguinte, ou null se acabou. */
  proximaParcela: { numero: number; total: number; data: string } | null;
  /** Parcelamento: data da última parcela. */
  termino: string | null;
  /** O próximo vencimento a partir de `hoje` (inclusive), ou null se a série já acabou. */
  proximoVencimento: string | null;
  /** Parcelamento: parcelas que ainda faltam vencer depois de hoje. */
  restantes: number | null;
}

export function situacaoDaSerie(p: ParametrosDaSerie, hoje: string): SituacaoDaSerie {
  const parcelado = p.tipo === "parcelamento" && !!p.totalParcelas && p.totalParcelas > 0;
  const todas = calcularOcorrencias(p, parcelado ? "9999-12-31" : daquiADias(hoje, 400));
  const proximo = todas.find(o => o.data >= hoje) ?? null;
  if (!parcelado) {
    return { parcelaAtual: null, proximaParcela: null, termino: dataFimReal(p.dataFim), proximoVencimento: proximo?.data ?? null, restantes: null };
  }
  const total = p.totalParcelas!;
  // "atual" é a última que já venceu (inclusive hoje); "próxima", a primeira DEPOIS de hoje
  const jaVencidas = todas.filter(o => o.data <= hoje);
  const aVencer = todas.filter(o => o.data > hoje);
  const atual = jaVencidas.length > 0 ? jaVencidas[jaVencidas.length - 1] : todas[0];
  const seguinte = aVencer[0] ?? null;
  return {
    parcelaAtual: atual ? { numero: atual.parcela!, total } : null,
    proximaParcela: seguinte ? { numero: seguinte.parcela!, total, data: seguinte.data } : null,
    termino: todas.length > 0 ? todas[todas.length - 1].data : null,
    proximoVencimento: proximo?.data ?? null,
    restantes: aVencer.length,
  };
}
/** "Parcela 5/12" — para a descrição/linha de um lançamento gerado. */
export const rotuloDaParcela = (numero: number, total: number): string => `${numero}/${total}`;
