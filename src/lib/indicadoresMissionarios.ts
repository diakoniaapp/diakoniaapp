// ─── lib/indicadoresMissionarios.ts — as contas dos Indicadores Missionários ───
//
// Pedido dela (06/10/2026): a tela misturava duas perguntas. O indicador de
// cima seguia o filtro de período ("Hoje"), o cartão "Saldo Missionário —
// histórico completo" mostrava a vida inteira. Exemplo dela: período
// 01/01–05/10/2026 → arrecadado R$ 32.627,20; histórico → arrecadado
// R$ 145.947,09 e enviado R$ 162.554,89. Dois números de "arrecadado" lado a
// lado, sem o rótulo dizer qual é qual.
//
// Aqui as duas perguntas viram duas funções que nunca se misturam:
//   • `resumoDoPeriodo`  — o que aconteceu DENTRO do filtro (entrou, saiu, resultado);
//   • `fundoAcumulado`   — a conta da vida inteira, que NÃO muda com o filtro.
//
// Só entra aqui o que já é dinheiro de verdade (`realizado`/`conciliado`): um
// repasse ainda `previsto` não pode baixar um saldo que representa caixa. O dia
// de um lançamento é `data_pagamento ?? data` — a mesma regra do resto do
// Financeiro.

import { daquiADias, parseLocalDate } from "@/lib/data";

export interface LancamentoMissionario {
  id: string;
  valor: number | string;
  data: string;
  data_pagamento?: string | null;
  status: string;
}

export type PeriodoPreset = "hoje" | "7d" | "30d" | "60d" | "90d" | "mes" | "ano" | "custom";

export const ROTULO_DO_PERIODO: Record<PeriodoPreset, string> = {
  hoje: "Hoje", "7d": "7 dias", "30d": "30 dias", "60d": "60 dias", "90d": "90 dias",
  mes: "Mês atual", ano: "Ano atual", custom: "Personalizado",
};

/** Ordem dos botões do filtro. "Mês atual" é o padrão (ver `PERIODO_PADRAO`). */
export const PERIODOS_EM_ORDEM: PeriodoPreset[] = ["hoje", "7d", "30d", "60d", "90d", "mes", "ano", "custom"];

/**
 * "Hoje" abre vazio em quase todo dia da semana (as ofertas entram no domingo) e
 * não responde pergunta nenhuma. O mês corrente sempre tem movimento e fecha
 * com a prestação de contas mensal — por isso é o padrão.
 */
export const PERIODO_PADRAO: PeriodoPreset = "mes";

const REALIZADOS = new Set(["realizado", "conciliado"]);
export const ehRealizado = (l: { status: string }) => REALIZADOS.has(l.status);

export const diaDoLancamento = (l: LancamentoMissionario): string =>
  String(l.data_pagamento ?? l.data).slice(0, 10);

const valorDe = (l: LancamentoMissionario) => Number(l.valor) || 0;
const arredondar = (n: number) => Math.round(n * 100) / 100;

export function somar(ls: LancamentoMissionario[]): number {
  return arredondar(ls.reduce((s, l) => s + valorDe(l), 0));
}

export function periodoDoPreset(
  preset: PeriodoPreset, hoje: string, personalizado?: { inicio: string; fim: string },
): { inicio: string; fim: string } {
  switch (preset) {
    case "custom": {
      const p = personalizado ?? { inicio: hoje, fim: hoje };
      // De/Até invertidos pela digitação não devem virar um período negativo.
      return p.inicio <= p.fim ? p : { inicio: p.fim, fim: p.inicio };
    }
    case "hoje": return { inicio: hoje, fim: hoje };
    case "7d": return { inicio: daquiADias(hoje, -6), fim: hoje };
    case "30d": return { inicio: daquiADias(hoje, -29), fim: hoje };
    case "60d": return { inicio: daquiADias(hoje, -59), fim: hoje };
    case "90d": return { inicio: daquiADias(hoje, -89), fim: hoje };
    case "ano": return { inicio: hoje.slice(0, 4) + "-01-01", fim: hoje };
    default: return { inicio: hoje.slice(0, 7) + "-01", fim: hoje };
  }
}

export function diasDoPeriodo(inicio: string, fim: string): number {
  return Math.round((parseLocalDate(fim).getTime() - parseLocalDate(inicio).getTime()) / 86400000) + 1;
}

/** O período imediatamente anterior, com a mesma duração. */
export function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const dias = diasDoPeriodo(inicio, fim);
  const fimAnt = daquiADias(inicio, -1);
  return { inicio: daquiADias(fimAnt, -(dias - 1)), fim: fimAnt };
}

function noPeriodo(ls: LancamentoMissionario[], inicio: string, fim: string) {
  return ls.filter(l => {
    if (!ehRealizado(l)) return false;
    const d = diaDoLancamento(l);
    return d >= inicio && d <= fim;
  });
}

export type SituacaoDoPeriodo = "superavit" | "deficit" | "equilibrio";

export interface ResumoDoPeriodo {
  entradas: number;
  saidas: number;
  /** entradas − saídas. Positivo = superávit. */
  resultado: number;
  situacao: SituacaoDoPeriodo;
  qtdEntradas: number;
  qtdSaidas: number;
}

/** (A) Resultado do período: só o que cabe dentro do filtro. */
export function resumoDoPeriodo(
  entradas: LancamentoMissionario[], saidas: LancamentoMissionario[], inicio: string, fim: string,
): ResumoDoPeriodo {
  const e = noPeriodo(entradas, inicio, fim);
  const s = noPeriodo(saidas, inicio, fim);
  const totalE = somar(e), totalS = somar(s);
  const resultado = arredondar(totalE - totalS);
  return {
    entradas: totalE, saidas: totalS, resultado,
    situacao: resultado > 0 ? "superavit" : resultado < 0 ? "deficit" : "equilibrio",
    qtdEntradas: e.length, qtdSaidas: s.length,
  };
}

export interface FundoAcumulado {
  arrecadado: number;
  enviado: number;
  /** arrecadado − enviado. Negativo = a igreja enviou mais do que arrecadou para missões. */
  saldo: number;
}

/** (B) Fundo Missionário Acumulado: a vida inteira, até `ate` (padrão: tudo). Não depende do filtro. */
export function fundoAcumulado(
  entradas: LancamentoMissionario[], saidas: LancamentoMissionario[], ate?: string,
): FundoAcumulado {
  const ate_ = (ls: LancamentoMissionario[]) =>
    ls.filter(l => ehRealizado(l) && (!ate || diaDoLancamento(l) <= ate));
  const arrecadado = somar(ate_(entradas));
  const enviado = somar(ate_(saidas));
  return { arrecadado, enviado, saldo: arredondar(arrecadado - enviado) };
}

export type Granularidade = "dia" | "semana" | "mes";

/** Até ~5 semanas: um ponto por dia; até ~4 meses: por semana; acima disso: por mês. */
export function granularidadeDoPeriodo(inicio: string, fim: string): Granularidade {
  const dias = diasDoPeriodo(inicio, fim);
  return dias <= 35 ? "dia" : dias <= 120 ? "semana" : "mes";
}

export interface PontoDaSerie {
  /** Primeiro dia coberto pelo ponto (recortado ao período). */
  inicio: string;
  fim: string;
  rotulo: string;
  entradas: number;
  saidas: number;
  /** Resultado do ponto (entradas − saídas). */
  saldo: number;
  /** Resultado acumulado DENTRO do período, até o fim deste ponto. */
  acumulado: number;
}

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Fatias contíguas do período, sem sobra nem repetição de dia. */
function fatias(inicio: string, fim: string, g: Granularidade): { inicio: string; fim: string }[] {
  const out: { inicio: string; fim: string }[] = [];
  let atual = inicio;
  while (atual <= fim) {
    let ate: string;
    if (g === "dia") ate = atual;
    else if (g === "semana") ate = daquiADias(atual, 6);
    else {
      // fim do mês do `atual`
      const [a, m] = atual.split("-").map(Number);
      const ultimo = new Date(a, m, 0).getDate();
      ate = `${atual.slice(0, 8)}${String(ultimo).padStart(2, "0")}`;
    }
    if (ate > fim) ate = fim;
    out.push({ inicio: atual, fim: ate });
    atual = daquiADias(ate, 1);
  }
  return out;
}

/** O gráfico: entradas, saídas e saldo, na granularidade que cabe no período. */
export function serieDoPeriodo(
  entradas: LancamentoMissionario[], saidas: LancamentoMissionario[], inicio: string, fim: string,
): PontoDaSerie[] {
  const g = granularidadeDoPeriodo(inicio, fim);
  const e = noPeriodo(entradas, inicio, fim);
  const s = noPeriodo(saidas, inicio, fim);
  let acumulado = 0;
  return fatias(inicio, fim, g).map(f => {
    const te = somar(e.filter(l => diaDoLancamento(l) >= f.inicio && diaDoLancamento(l) <= f.fim));
    const ts = somar(s.filter(l => diaDoLancamento(l) >= f.inicio && diaDoLancamento(l) <= f.fim));
    acumulado = arredondar(acumulado + te - ts);
    const rotulo = g === "mes"
      ? `${MESES[Number(f.inicio.slice(5, 7)) - 1]}/${f.inicio.slice(2, 4)}`
      : g === "semana" ? `${ddmm(f.inicio)}–${ddmm(f.fim)}` : ddmm(f.inicio);
    return { inicio: f.inicio, fim: f.fim, rotulo, entradas: te, saidas: ts, saldo: arredondar(te - ts), acumulado };
  });
}

/** Variação percentual em relação ao período anterior (0 → 100% quando só há o atual). */
export function variacaoPercentual(atual: number, anterior: number): number {
  if (anterior > 0) return ((atual - anterior) / anterior) * 100;
  return atual > 0 ? 100 : 0;
}

/**
 * Categorias de repasse missionário. O Plano de Contas oficial (migration
 * 20260912190000) chama a categoria de "Outros Repasses Missionários"; a tela
 * procurava só "Repasses Missionários" — se a categoria antiga for desativada,
 * o painel inteiro some em silêncio. Aceita as duas, e qualquer variação de
 * acento/caixa.
 */
export function ehCategoriaDeRepasse(nome: string): boolean {
  const n = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return /(^|\s)repasses?\s+missionari/.test(n);
}

/** A categoria que o formulário "Registrar remessa" abre marcada: a oficial, e só na falta dela a antiga. */
export function categoriaPadraoDeRepasse<T extends { id: string; nome: string }>(cats: T[]): T | null {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return cats.find(c => norm(c.nome) === "outros repasses missionarios")
    ?? cats.find(c => norm(c.nome) === "repasses missionarios")
    ?? cats[0] ?? null;
}
