// ─── prestacaoIndicadores.ts — resumo executivo, despesas financeiras, fluxo de caixa e indicadores da Prestação de Contas ────────────────────────────
//
// Regras PURAS (sem React, sem rede) que leem o resultado de `gerarPrestacaoContas` e o transformam no que a Diretoria, o Conselho Fiscal e o escritório de contabilidade
// querem ver primeiro. NADA aqui recalcula a demonstração: tudo sai dos mesmos totais que a tabela já mostra (receitas, despesas, financeiras, resultado, saldos), então
// o resumo, o gráfico e os cartões nunca discordam da tabela.
//
// O gráfico de fluxo de caixa usa os MESMOS lançamentos que formam a demonstração (os que entram nas categorias do Plano de Contas Oficial) e, em cada mês, parte do
// "Saldo Anterior" daquele mês: o saldo acumulado do último dia do mês é, por construção, o "Saldo Final" da tabela.
import { agrupar, diasNoPeriodo, serieDiaria, type DiaFluxo, type Granularidade, type PontoFluxo } from "@/lib/fluxoCaixa";

export interface MovimentoDaPrestacao {
  /** `AAAA-MM-DD` */
  data: string;
  tipo: "entrada" | "saida";
  valor: number;
}

export interface IndicadoresDeDizimos {
  /** dizimistas ÚNICOS no período inteiro (por nome normalizado), não a soma dos meses */
  dizimistasUnicos: number;
  /** todos os dízimos do período (inclusive os depositados sem identificação) */
  valorTotal: number;
  /** a parte de `valorTotal` sem nome de quem deu ("Ofertas não identificadas", ou sem nome) — não entra na média */
  valorNaoIdentificado: number;
  /** (valorTotal − valorNaoIdentificado) ÷ dizimistasUnicos: a média só de quem tem nome (0 quando não há dizimista) */
  valorMedio: number;
}

interface LinhaBase { categoriaId: string; nome: string; valores: number[]; total: number; temNota: boolean }
/** O que estes cálculos precisam do resultado da prestação (o `PrestacaoContasResultado` do serviço cumpre isto). */
export interface BaseDaPrestacao {
  meses: { ano: number; numero: number; nome: string }[];
  saldoAnterior: number[];
  totalReceitas: number[];
  totalDespesas: number[];
  grupoDespesasFinanceiras: { linhas: LinhaBase[]; valores: number[]; total: number } | null;
  grupoOutrasDespesas: { valores: number[]; total: number } | null;
  resultado: number[];
  saldoFinal: number[];
  comprasOfertadas: { itens: unknown[]; total: number };
  fluxo?: MovimentoDaPrestacao[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const soma = (v: number[]) => round2(v.reduce((s, x) => s + x, 0));

// ── nomenclatura institucional ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Padroniza, só na APRESENTAÇÃO, os nomes que vêm do cadastro (categorias e centros de custo): acentos que faltam, crase indevida e a abreviação "Min.".
 * Não muda o cadastro nem os cálculos (que usam os identificadores): o relatório sai correto sem nenhuma migração.
 */
export function rotuloInstitucional(texto: string): string {
  let t = texto.trim().replace(/\s+/g, " ");
  t = t.replace(/\bDizimos\b/g, "Dízimos").replace(/\bDizimo\b/g, "Dízimo");
  t = t.replace(/\bResidencia\b/g, "Residência");
  // crase não se usa diante de palavra masculina: "Ofertas à Preletores" → "Ofertas a Preletores"
  // (sem \b: "à" não é letra ASCII e o \b do JavaScript não enxerga a fronteira antes dela)
  t = t.replace(/(^|\s)à(\s+)(Preletor|Pregador|Convidad|Missionári|Pastor|Músic|Louvor|Professor)/g, "$1a$2$3");
  // "Min. Música" → "Ministério de Música"; "Min. Celebrando a Transformação" → "Ministério Celebrando a Transformação"
  t = t.replace(/^Min\.\s*(.+)$/, (_m, resto: string) => (/^(Celebrando|Comunhão|Pastoral)\b/.test(resto) ? `Ministério ${resto}` : `Ministério de ${resto}`));
  return t;
}

// ── 1) resumo executivo ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SituacaoDoResultado = "superavit" | "deficit" | "equilibrio";

export interface ResumoExecutivo {
  receitaTotal: number;
  /** despesas dos ministérios + financeiras + outras (a conta que fecha com o resultado) */
  despesaTotal: number;
  despesasDosMinisterios: number;
  despesasFinanceiras: number;
  outrasDespesas: number;
  resultado: number;
  situacao: SituacaoDoResultado;
  saldoInicial: number;
  saldoFinal: number;
  comprasOfertadasQtd: number;
  comprasOfertadasValor: number;
}

export function resumoExecutivo(r: BaseDaPrestacao): ResumoExecutivo {
  const receitaTotal = soma(r.totalReceitas);
  const despesasDosMinisterios = soma(r.totalDespesas);
  const despesasFinanceiras = round2(r.grupoDespesasFinanceiras?.total ?? 0);
  const outrasDespesas = round2(r.grupoOutrasDespesas?.total ?? 0);
  const resultado = soma(r.resultado);
  return {
    receitaTotal,
    despesaTotal: round2(despesasDosMinisterios + despesasFinanceiras + outrasDespesas),
    despesasDosMinisterios, despesasFinanceiras, outrasDespesas,
    resultado,
    situacao: resultado > 0.004 ? "superavit" : resultado < -0.004 ? "deficit" : "equilibrio",
    saldoInicial: round2(r.saldoAnterior[0] ?? 0),
    saldoFinal: round2(r.saldoFinal[r.saldoFinal.length - 1] ?? 0),
    comprasOfertadasQtd: r.comprasOfertadas.itens.length,
    comprasOfertadasValor: round2(r.comprasOfertadas.total),
  };
}

// ── 2) despesas financeiras: tarifas · título de capitalização · outros encargos ────────────────────────────────────────────────────────────────────

export type ChaveFinanceira = "tarifas" | "capitalizacao" | "outros";
export interface SubgrupoFinanceiro { chave: ChaveFinanceira; titulo: string; linhas: LinhaBase[]; valores: number[]; total: number }
export interface DespesasFinanceiras { subgrupos: SubgrupoFinanceiro[]; valores: number[]; total: number }

export function chaveFinanceira(nomeDaCategoria: string): ChaveFinanceira {
  const n = nomeDaCategoria.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/\btarifa/.test(n)) return "tarifas";
  if (/capitaliza/.test(n)) return "capitalizacao";
  return "outros";
}

const TITULO_FINANCEIRA: Record<ChaveFinanceira, string> = { tarifas: "Tarifas Bancárias", capitalizacao: "Título de Capitalização", outros: "Outros encargos financeiros" };

/** Os três blocos, SEMPRE (mesmo zerados: o Conselho vê que não houve), cada um com subtotal, e o total das despesas financeiras. */
export function despesasFinanceiras(r: Pick<BaseDaPrestacao, "grupoDespesasFinanceiras" | "meses">): DespesasFinanceiras {
  const qtd = r.meses.length;
  const linhas = r.grupoDespesasFinanceiras?.linhas ?? [];
  const subgrupos = (["tarifas", "capitalizacao", "outros"] as const).map<SubgrupoFinanceiro>(chave => {
    const ls = linhas.filter(l => chaveFinanceira(l.nome) === chave);
    const valores = Array.from({ length: qtd }, (_, i) => round2(ls.reduce((s, l) => s + (l.valores[i] ?? 0), 0)));
    return { chave, titulo: TITULO_FINANCEIRA[chave], linhas: ls, valores, total: soma(valores) };
  });
  const valores = Array.from({ length: qtd }, (_, i) => round2(subgrupos.reduce((s, g) => s + g.valores[i], 0)));
  return { subgrupos, valores, total: soma(valores) };
}

// ── 3) fluxo de caixa ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ModoDoGrafico = "automatico" | "diario" | "semanal" | "mensal";
export const MODOS_DO_GRAFICO: { id: ModoDoGrafico; rotulo: string }[] = [
  { id: "automatico", rotulo: "Automático" }, { id: "diario", rotulo: "Diário" }, { id: "semanal", rotulo: "Semanal" }, { id: "mensal", rotulo: "Mensal" },
];
/** Automático: até 2 meses → um ponto por dia; até 6 meses → por semana; acima → por mês. */
export const LIMITE_AUTOMATICO_DIARIO = 62;
export const LIMITE_AUTOMATICO_SEMANAL = 186;

/** O que o modo escolhido vira. Diferente do gráfico da Visão Executiva (que fixa a visão diária até 120 dias), aqui a escolha vale sempre. */
export function granularidadeDoRelatorio(dias: number, modo: ModoDoGrafico): Granularidade {
  if (modo === "diario") return "dia";
  if (modo === "semanal") return "semana";
  if (modo === "mensal") return "mes";
  return dias <= LIMITE_AUTOMATICO_DIARIO ? "dia" : dias <= LIMITE_AUTOMATICO_SEMANAL ? "semana" : "mes";
}

const ultimoDiaDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

/** Uma linha por dia do período; cada mês parte do seu "Saldo Anterior", então o saldo do último dia do mês é o "Saldo Final" da tabela. */
export function serieDoRelatorio(r: Pick<BaseDaPrestacao, "meses" | "saldoAnterior" | "fluxo">): DiaFluxo[] {
  const movs = (r.fluxo ?? []).map(m => ({ data: m.data, tipo: m.tipo, valor: m.valor, transferencia: false }));
  return r.meses.flatMap((m, i) => {
    const mm = String(m.numero).padStart(2, "0");
    return serieDiaria(movs, r.saldoAnterior[i] ?? 0, `${m.ano}-${mm}-01`, `${m.ano}-${mm}-${String(ultimoDiaDoMes(m.ano, m.numero)).padStart(2, "0")}`);
  });
}

export interface FluxoDoRelatorio { serie: DiaFluxo[]; pontos: PontoFluxo[]; granularidade: Granularidade; dias: number }

export function fluxoDoRelatorio(r: Pick<BaseDaPrestacao, "meses" | "saldoAnterior" | "fluxo">, modo: ModoDoGrafico): FluxoDoRelatorio {
  const serie = serieDoRelatorio(r);
  const dias = serie.length > 0 ? diasNoPeriodo(serie[0].dia, serie[serie.length - 1].dia) : 0;
  const granularidade = granularidadeDoRelatorio(dias, modo);
  return { serie, pontos: agrupar(serie, granularidade), granularidade, dias };
}

// ── 4) indicadores gerenciais ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface MarcoMensal { valor: number; mes: string }
export interface IndicadoresGerenciais {
  maiorArrecadacao: MarcoMensal | null;
  maiorDespesa: MarcoMensal | null;
  menorSaldo: MarcoMensal | null;
  /** meses cujo Saldo Final da tabela ficou abaixo de zero */
  mesesComSaldoNegativo: number;
  totalDeMeses: number;
  mediaMensalReceitas: number;
  mediaMensalDespesas: number;
}

/** "Setembro" · "Setembro/2026" quando o período cruza o ano. */
export function rotuloDoMes(m: { ano: number; nome: string }, anoBase: number): string {
  return m.ano !== anoBase ? `${m.nome}/${m.ano}` : m.nome;
}

/** A despesa de cada mês: ministérios + financeiras + outras (a conta que fecha com o resultado). */
export function despesaTotalPorMes(r: Pick<BaseDaPrestacao, "meses" | "totalDespesas" | "grupoDespesasFinanceiras" | "grupoOutrasDespesas">): number[] {
  return r.meses.map((_m, i) => round2((r.totalDespesas[i] ?? 0) + (r.grupoDespesasFinanceiras?.valores[i] ?? 0) + (r.grupoOutrasDespesas?.valores[i] ?? 0)));
}

export function indicadoresGerenciais(r: BaseDaPrestacao, serie: DiaFluxo[]): IndicadoresGerenciais {
  const qtd = r.meses.length;
  const anoBase = r.meses[0]?.ano ?? 0;
  const rotulo = (i: number) => rotuloDoMes(r.meses[i], anoBase);
  const despesas = despesaTotalPorMes(r);
  const despesaDoMes = (i: number) => despesas[i];

  let maiorArrecadacao: MarcoMensal | null = null;
  let maiorDespesa: MarcoMensal | null = null;
  for (let i = 0; i < qtd; i++) {
    const rec = r.totalReceitas[i] ?? 0;
    if (rec > 0 && (!maiorArrecadacao || rec > maiorArrecadacao.valor)) maiorArrecadacao = { valor: round2(rec), mes: rotulo(i) };
    const des = despesaDoMes(i);
    if (des > 0 && (!maiorDespesa || des > maiorDespesa.valor)) maiorDespesa = { valor: des, mes: rotulo(i) };
  }

  // o menor saldo é o do DIA mais baixo do período (a série diária); o mês é o do dia
  let menorSaldo: MarcoMensal | null = null;
  for (const d of serie) {
    if (!menorSaldo || d.saldo < menorSaldo.valor) {
      const i = r.meses.findIndex(m => `${m.ano}-${String(m.numero).padStart(2, "0")}` === d.dia.slice(0, 7));
      menorSaldo = { valor: d.saldo, mes: i >= 0 ? rotulo(i) : d.dia.slice(0, 7) };
    }
  }

  return {
    maiorArrecadacao, maiorDespesa, menorSaldo,
    mesesComSaldoNegativo: r.saldoFinal.filter(s => s < -0.004).length,
    totalDeMeses: qtd,
    mediaMensalReceitas: qtd > 0 ? round2(soma(r.totalReceitas) / qtd) : 0,
    mediaMensalDespesas: qtd > 0 ? round2(r.meses.reduce((s, _m, i) => s + despesaDoMes(i), 0) / qtd) : 0,
  };
}

// ── 5) tendência ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Tendencia { sentido: "alta" | "queda" | "estavel"; /** variação % da média da 2ª metade dos meses sobre a da 1ª */ variacao: number }

/** Compara a média da segunda metade dos meses com a da primeira. Menos de 3 meses, ou primeira metade zerada: não há o que dizer (null). Dentro de ±5% é "estável". */
export function tendenciaMensal(valores: number[]): Tendencia | null {
  if (valores.length < 3) return null;
  const meio = Math.floor(valores.length / 2);
  const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const primeira = media(valores.slice(0, meio));
  const segunda = media(valores.slice(valores.length - meio));
  if (primeira <= 0) return null;
  const variacao = Math.round(((segunda / primeira) - 1) * 1000) / 10;
  return { sentido: variacao > 5 ? "alta" : variacao < -5 ? "queda" : "estavel", variacao };
}

// ── 6) posição financeira das contas ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface PosicaoDaConta { id: string; nome: string; saldoInicial: number; saldoFinal: number }
export interface PosicaoDasContas {
  contas: PosicaoDaConta[];
  totalInicial: number;
  totalFinal: number;
}

/**
 * O saldo de cada conta no primeiro e no último dia do período, e o consolidado. Entram as contas ativas e, mesmo inativas, as que ainda têm saldo em algum dos
 * dois dias (senão o consolidado deixaria de bater com o "Saldo Inicial" do relatório, que soma todas). Conta inativa e zerada nos dois dias fica de fora.
 */
export function montarPosicaoDasContas(contas: { id: string; nome: string; ativo: boolean; saldoInicial: number; saldoFinal: number }[]): PosicaoDasContas {
  const lista = contas
    .filter(c => c.ativo || Math.abs(c.saldoInicial) >= 0.005 || Math.abs(c.saldoFinal) >= 0.005)
    .map(c => ({ id: c.id, nome: c.nome, saldoInicial: round2(c.saldoInicial), saldoFinal: round2(c.saldoFinal) }));
  return { contas: lista, totalInicial: soma(lista.map(c => c.saldoInicial)), totalFinal: soma(lista.map(c => c.saldoFinal)) };
}

/** Quanto o saldo final consolidado difere do "Saldo Final" da demonstração (0 quando fecham). Difere quando há lançamento realizado que a demonstração ainda não inclui. */
export function diferencaParaADemonstracao(posicao: Pick<PosicaoDasContas, "totalFinal">, saldoFinalDaDemonstracao: number): number {
  const d = round2(posicao.totalFinal - saldoFinalDaDemonstracao);
  return Math.abs(d) < 0.01 ? 0 : d;
}
