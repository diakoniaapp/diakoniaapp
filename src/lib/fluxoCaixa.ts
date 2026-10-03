// ─── lib/fluxoCaixa.ts — regras PURAS do gráfico de Fluxo de Caixa ───────────
//
// Pedido dela (03/10/2026): a base do gráfico é SEMPRE DIÁRIA. Até ~120 dias o
// gráfico mostra um ponto por dia — 15 dias = 15 pontos, 90 dias = 90 pontos — e não
// consolida mais em semana ou mês por conta própria. Acima disso, o usuário escolhe:
// Automático · Diário · Semanal · Mensal. O gráfico é um "termômetro operacional":
// dias de maior arrecadação e de maior despesa, períodos de saldo negativo,
// concentração de pagamentos e de entradas.
//
// O que cada ponto carrega (e o tooltip mostra): data, entradas do dia, saídas do dia,
// resultado do dia (entradas − saídas) e SALDO ACUMULADO.
//
// SALDO ACUMULADO = o saldo real de caixa ao fim do dia, somando todas as contas
// ativas: `saldo_inicial` + movimento realizado/conciliado até aquele dia. É a mesma
// conta que o sistema usa em `fin_contas.saldo_atual` (gatilho `fin_recalc_saldo_conta`):
// medido em 03/10/2026, a soma reconstruída das 6 contas bate com o "Saldo total"
// oficial até o centavo (−R$ 36.101,10). Até hoje o gráfico chamava de "Saldo" o
// RESULTADO do mês (entradas − saídas) — outra coisa; o resultado agora tem nome
// próprio no tooltip.
//
// Entradas e saídas NÃO contam transferências entre contas (mesma regra do gráfico
// anterior e do Malote): dinheiro que muda de bolso não é receita nem despesa. O saldo
// conta tudo — as pernas de uma transferência se anulam (medido: 2.998 pernas, líquido
// zero no total e em todos os meses), então o saldo não se mexe.
//
// Aqui só há conta e agrupamento, sem rede e sem React.

export interface Movimento {
  /** `AAAA-MM-DD` */
  data: string;
  tipo: "entrada" | "saida";
  valor: number;
  /** `origem = 'transferencia'`: entra no saldo, não em entradas/saídas. */
  transferencia: boolean;
}

export interface DiaFluxo {
  dia: string;
  entradas: number;
  saidas: number;
  /** entradas − saídas do dia */
  resultado: number;
  /** saldo de caixa ao FIM do dia */
  saldo: number;
}

export type ModoFluxo = "automatico" | "diario" | "semanal" | "mensal";
export type Granularidade = "dia" | "semana" | "mes";

/** Até este número de dias o gráfico é sempre diário e o seletor nem aparece. */
export const LIMITE_DIARIO = 120;
/** No modo Automático: acima do limite diário até aqui → semanas; depois → meses.
 *  (180 dias mantém o padrão da tela — 12 meses — mensal, como sempre foi.) */
export const LIMITE_SEMANAL_AUTOMATICO = 180;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── datas (UTC puro: sem fuso, sem horário de verão) ────────────────────────

const MS_DIA = 86_400_000;
const paraUtc = (ymd: string) => {
  const [a, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};
const deUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Quantos dias tem o período, contando os dois extremos. */
export function diasNoPeriodo(de: string, ate: string): number {
  return Math.round((paraUtc(ate) - paraUtc(de)) / MS_DIA) + 1;
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_LONGO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const ddmmaaaa = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

// ── a série diária ──────────────────────────────────────────────────────────

/**
 * Uma linha por dia do período — TODOS os dias, inclusive os sem movimento (entradas e
 * saídas zero, saldo igual ao do dia anterior): é o que mostra a concentração. O
 * `saldoAbertura` é o saldo de caixa ANTES do primeiro dia.
 */
export function serieDiaria(movs: Movimento[], saldoAbertura: number, de: string, ate: string): DiaFluxo[] {
  const n = diasNoPeriodo(de, ate);
  if (n <= 0) return [];
  const porDia = new Map<string, { e: number; s: number; liquido: number }>();
  for (const m of movs) {
    if (m.data < de || m.data > ate) continue;
    const d = porDia.get(m.data) ?? { e: 0, s: 0, liquido: 0 };
    const v = Number(m.valor);
    d.liquido += m.tipo === "entrada" ? v : -v; // o saldo conta tudo
    if (!m.transferencia) { if (m.tipo === "entrada") d.e += v; else d.s += v; }
    porDia.set(m.data, d);
  }
  const base = paraUtc(de);
  const out: DiaFluxo[] = [];
  let saldo = saldoAbertura;
  for (let i = 0; i < n; i++) {
    const dia = deUtc(base + i * MS_DIA);
    const d = porDia.get(dia);
    saldo += d?.liquido ?? 0;
    const entradas = round2(d?.e ?? 0);
    const saidas = round2(d?.s ?? 0);
    out.push({ dia, entradas, saidas, resultado: round2(entradas - saidas), saldo: round2(saldo) });
  }
  return out;
}

// ── escolha da granularidade ────────────────────────────────────────────────

/**
 * Até 120 dias: sempre diário (o modo escolhido é ignorado — o seletor nem aparece).
 * Acima: `diario`/`semanal`/`mensal` valem como escolhidos; `automatico` decide pelo
 * tamanho (até 180 dias semanas, depois meses).
 */
export function granularidadeDe(dias: number, modo: ModoFluxo): Granularidade {
  if (dias <= LIMITE_DIARIO) return "dia";
  if (modo === "diario") return "dia";
  if (modo === "semanal") return "semana";
  if (modo === "mensal") return "mes";
  return dias <= LIMITE_SEMANAL_AUTOMATICO ? "semana" : "mes";
}

// ── pontos do gráfico ───────────────────────────────────────────────────────

export interface PontoFluxo {
  chave: string;
  /** Rótulo curto do eixo X. */
  rotulo: string;
  /** Título do tooltip ("sex, 01/09/2026", "Semana de 31/08 a 06/09/2026", "Setembro de 2026"). */
  titulo: string;
  inicio: string;
  fim: string;
  /** Quantos dias do período caem neste ponto. */
  dias: number;
  entradas: number;
  saidas: number;
  resultado: number;
  /** Saldo ao FIM do ponto. */
  saldo: number;
}

export function agrupar(serie: DiaFluxo[], g: Granularidade): PontoFluxo[] {
  if (serie.length === 0) return [];
  if (g === "dia") {
    return serie.map(d => ({
      chave: d.dia, rotulo: ddmm(d.dia),
      titulo: `${SEMANA[new Date(paraUtc(d.dia)).getUTCDay()]}, ${ddmmaaaa(d.dia)}`,
      inicio: d.dia, fim: d.dia, dias: 1,
      entradas: d.entradas, saidas: d.saidas, resultado: d.resultado, saldo: d.saldo,
    }));
  }
  // semana = segunda a domingo, recortada nos extremos do período escolhido
  const chaveDe = (dia: string): string => {
    if (g === "mes") return dia.slice(0, 7);
    const dow = (new Date(paraUtc(dia)).getUTCDay() + 6) % 7; // segunda = 0
    return deUtc(paraUtc(dia) - dow * MS_DIA);
  };
  const grupos = new Map<string, DiaFluxo[]>();
  for (const d of serie) {
    const k = chaveDe(d.dia);
    const l = grupos.get(k) ?? [];
    l.push(d);
    grupos.set(k, l);
  }
  return [...grupos.entries()].map(([chave, dias]) => {
    const inicio = dias[0].dia;
    const fim = dias[dias.length - 1].dia;
    const entradas = round2(dias.reduce((s, d) => s + d.entradas, 0));
    const saidas = round2(dias.reduce((s, d) => s + d.saidas, 0));
    const mes = Number(inicio.slice(5, 7)) - 1;
    return {
      chave,
      rotulo: g === "mes" ? `${MESES[mes]}/${inicio.slice(2, 4)}` : ddmm(inicio),
      titulo: g === "mes"
        ? `${MESES_LONGO[mes][0].toUpperCase()}${MESES_LONGO[mes].slice(1)} de ${inicio.slice(0, 4)}`
        : `Semana de ${ddmm(inicio)} a ${ddmmaaaa(fim)}`,
      inicio, fim, dias: dias.length,
      entradas, saidas, resultado: round2(entradas - saidas), saldo: dias[dias.length - 1].saldo,
    };
  });
}

// ── os destaques do "termômetro" ────────────────────────────────────────────

export interface Destaques {
  maiorEntrada: PontoFluxo | null;
  maiorSaida: PontoFluxo | null;
  /** Pontos com saldo ao fim abaixo de zero. */
  negativos: number;
  total: number;
  menorSaldo: PontoFluxo | null;
}

/** Em caso de empate vale o mais antigo (a ordem natural da série). */
export function destaques(pontos: PontoFluxo[]): Destaques {
  let maiorEntrada: PontoFluxo | null = null;
  let maiorSaida: PontoFluxo | null = null;
  let menorSaldo: PontoFluxo | null = null;
  let negativos = 0;
  for (const p of pontos) {
    if (p.entradas > 0 && (!maiorEntrada || p.entradas > maiorEntrada.entradas)) maiorEntrada = p;
    if (p.saidas > 0 && (!maiorSaida || p.saidas > maiorSaida.saidas)) maiorSaida = p;
    if (!menorSaldo || p.saldo < menorSaldo.saldo) menorSaldo = p;
    if (p.saldo < 0) negativos += 1;
  }
  return { maiorEntrada, maiorSaida, negativos, total: pontos.length, menorSaldo };
}
