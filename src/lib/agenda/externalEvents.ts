import type { EventoOcorrencia, EventoRow } from "./types";

// ── Cálculo da Páscoa (algoritmo de Meeus/Jones/Butcher) ──
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const HOLIDAY_COLOR = "#a16207"; // amarelo institucional
export const BATISTA_COLOR = "#0f766e"; // teal escuro
export const CRISTA_COLOR = "#6d28d9";
export const FAMILIAR_COLOR = "#be185d";
export const PROFISSIONAL_COLOR = "#475569";
export const INSTITUCIONAL_COLOR = "#1d4ed8";

// ─── As Datas Especiais ────────────────────────────────────────────────────
//
// Tudo o que entra na agenda sem ser evento da igreja nem data de pessoa.
// Seis categorias, cada uma com seu filtro (22/10/2026, a pedido dela —
// análise em docs/ANALISE_DATAS_ESPECIAIS_2026-10-22.md):
//
//   crista        — calendário cristão: Ramos, Páscoa, Pentecostes, Reforma, Advento
//   batista       — denominacionais (CBB, JMM, JMN). O id ficou "batista" porque
//                   é o que está gravado no filtro de cada navegador; renomear
//                   esconderia essas datas de quem já tinha filtro salvo.
//   familiar      — Mães, Pais, Mulher, Criança, Idoso, Juventude…
//   profissional  — Dia do Médico, do Professor… DESLIGADA POR PADRÃO: vinte
//                   linhas de "Dia do X" viram ruído na agenda de quem não pediu.
//   feriado       — cívicas: feriados nacionais e os do RJ
//   institucional — da própria igreja: o aniversário dela, a partir da
//                   data de fundação cadastrada na Identidade

export type CategoriaExterna = "crista" | "batista" | "familiar" | "profissional" | "feriado" | "institucional";

export interface ExternalCategoria {
  id: CategoriaExterna;
  label: string;
  color: string;
}

export const CATEGORIA_EXTERNAS: ExternalCategoria[] = [
  { id: "crista",        label: "Cristãs",            color: CRISTA_COLOR },
  { id: "batista",       label: "Denominacionais",    color: BATISTA_COLOR },
  { id: "familiar",      label: "Familiares",         color: FAMILIAR_COLOR },
  { id: "profissional",  label: "Profissionais",      color: PROFISSIONAL_COLOR },
  { id: "feriado",       label: "Cívicas e feriados", color: HOLIDAY_COLOR },
  { id: "institucional", label: "Institucionais",     color: INSTITUCIONAL_COLOR },
];

const COR_DA_CATEGORIA: Record<CategoriaExterna, string> =
  Object.fromEntries(CATEGORIA_EXTERNAS.map((c) => [c.id, c.color])) as Record<CategoriaExterna, string>;

function buildOcorrencia(opts: {
  id: string;
  titulo: string;
  data: string;
  descricao: string;
  categoria: CategoriaExterna;
  color: string;
}): EventoOcorrencia {
  const evento: EventoRow = {
    id: opts.id,
    titulo: opts.titulo,
    tipo: "outro",
    data: opts.data,
    hora_inicio: null,
    hora_fim: null,
    local: null,
    local_id: null,
    descricao: opts.descricao,
    status: "agendado",
    cor: opts.color,
    ministerio_principal_id: null,
    recorrencia_id: null,
    recorrencia_regra: null,
    is_excecao: false,
    ocorrencia_original_data: null,
    serie_origem_id: null,
  };
  return {
    key: opts.id,
    baseId: opts.id,
    serieId: null,
    isExcecao: false,
    isOcorrenciaVirtual: true,
    data: opts.data,
    ocorrencia_original_data: null,
    evento,
    categoria: opts.categoria,
    externalReadOnly: true,
  };
}

/**
 * Feriados para um determinado ano: os nacionais e os do Rio de Janeiro.
 *
 * ── O QUE MUDOU EM 22/10/2026 ──────────────────────────────────────────────
 *
 * · **Consciência Negra (20/11)** faltava. É feriado nacional desde a Lei
 *   14.759/2023 — dia sem banco, que a Tesouraria precisa ver.
 * · **Feriados do RJ** entraram: São Sebastião (municipal, Rio) e São Jorge
 *   (estadual). Estão fixos aqui porque o banco é de UMA igreja, a QIBRJ, e a
 *   Identidade não guarda cidade nem UF. Se um dia houver outra igreja, a
 *   lista local tem de sair do endereço dela — não desta constante.
 * · **Páscoa saiu daqui** e foi para o calendário cristão: não é feriado (cai
 *   sempre num domingo); estava na lista de feriados por comodidade do cálculo.
 */
export function feriadosBrasil(year: number): EventoOcorrencia[] {
  const easter = easterSunday(year);
  const nacional = "Feriado nacional";
  const list: { d: Date; nome: string; desc?: string }[] = [
    { d: new Date(year, 0, 1), nome: "Ano Novo" },
    { d: new Date(year, 0, 20), nome: "Dia de São Sebastião", desc: "Feriado municipal (Rio de Janeiro)" },
    { d: addDays(easter, -48), nome: "Carnaval (segunda)" },
    { d: addDays(easter, -47), nome: "Carnaval (terça)" },
    { d: addDays(easter, -2), nome: "Sexta-feira Santa" },
    { d: new Date(year, 3, 21), nome: "Tiradentes" },
    { d: new Date(year, 3, 23), nome: "Dia de São Jorge", desc: "Feriado estadual (RJ)" },
    { d: new Date(year, 4, 1), nome: "Dia do Trabalho" },
    { d: addDays(easter, 60), nome: "Corpus Christi" },
    { d: new Date(year, 8, 7), nome: "Independência do Brasil" },
    { d: new Date(year, 9, 12), nome: "Nossa Senhora Aparecida" },
    { d: new Date(year, 10, 2), nome: "Finados" },
    { d: new Date(year, 10, 15), nome: "Proclamação da República" },
    // Nacional só a partir de 2024 (Lei 14.759/2023).
    ...(year >= 2024 ? [{ d: new Date(year, 10, 20), nome: "Dia Nacional de Zumbi e da Consciência Negra" }] : []),
    { d: new Date(year, 11, 25), nome: "Natal" },
  ];
  return list.map((h) =>
    buildOcorrencia({
      id: `feriado-${year}-${ymd(h.d)}`,
      titulo: h.nome,
      data: ymd(h.d),
      descricao: h.desc ?? nacional,
      categoria: "feriado",
      color: HOLIDAY_COLOR,
    }),
  );
}

// ─── O calendário da Convenção Batista Brasileira ──────────────────────────
//
// ── POR QUE ISTO FOI REESCRITO ─────────────────────────────────────────────
//
// A versão anterior guardava DIA FIXO DO MÊS para datas que a CBB define por
// REGRA. Duas consequências, e a segunda é a pior:
//
// 1. As datas estavam erradas. Conferido em 26/08/2026 contra o calendário
//    publicado pela CBB, nenhuma das cinco datas denominacionais batia:
//
//      no código                          na CBB 2026
//      ────────────────────────────────────────────────────────────────────
//      Sem. Missões Mundiais 01–07/02     Dia de Missões Mundiais 08/03
//      Dia do Pastor Batista 09/06        Dia do Pastor 14/06
//      Semana da Bíblia 24–30/06          Dia da Bíblia 13/12
//      Dia Nacional do Evangélico 08/07   não existe no calendário da CBB
//      Sem. Missões Nacionais 01–07/09    Dia de Missões Nacionais 13/09
//      Dia do Batista Brasileiro 10/11    Dia Batista do Brasil 15/10
//
// 2. Elas apodreciam sozinhas. "2º domingo de junho" cai num dia diferente
//    todo ano; dia fixo, não. E o estrago passava despercebido porque uma
//    data errada continua sendo uma data — a tela mostrava algo, e ninguém
//    tinha como saber que era o dia errado.
//
//    Dava para ver na forma, também: as "semanas" começavam em qualquer dia
//    da semana. A Semana de Oração pelas Missões Nacionais de 2026 ia de
//    terça a segunda; a de Missões Mundiais de 2027 ia de segunda a domingo.
//    Semana de oração que não começa no domingo não é a semana da igreja.
//
// ── COMO ESTÁ AGORA ────────────────────────────────────────────────────────
//
// Cada data guarda a REGRA ("2º domingo de junho"), não o dia. E guarda
// junto a data que a CBB publicou para 2026, em `cbb2026`.
//
// Esse segundo campo não é documentação: `externalEvents.test.ts` percorre a
// lista inteira e exige que a regra produza exatamente aquela data. Se
// alguém trocar "2º domingo" por "3º", o teste quebra citando o dia oficial.
// É a única defesa possível contra o defeito que existia aqui — um erro que
// não dá erro, só uma data plausível e errada.
//
// Fonte: https://www.convencaobatista.com.br/site/pagina.php?MEN_ID=61
// (Atividades 2026, lida em 26/08/2026)
//
// ── O QUE FICOU DE FORA, DE PROPÓSITO ──────────────────────────────────────
//
// O calendário da CBB tem ~200 linhas. A maior parte é assembleia de
// convenção estadual, congresso e aniversário de instituição — Assembleia da
// Convenção Batista Sul-Mato-Grossense não é data da QIBRJ. Aqui ficam as
// datas denominacionais que uma igreja local celebra.
//
// Também ficaram de fora as campanhas de mês inteiro (Oração pela Família em
// maio, 31 Dias de Oração pelas Escolas em agosto) e os temas mensais ("Mês
// da Bíblia"): viram 30 linhas na agenda cada uma e afogam o que tem dia
// marcado. Cabem numa faixa de contexto no topo do mês, não na lista.

type Regra =
  /** Dia fixo do mês, todo ano. Aniversários e datas cravadas em lei. */
  | { tipo: "fixa"; mes: number; dia: number }
  /** "2º domingo de junho": `semana` 1–4, `diaSemana` 0=domingo. */
  | { tipo: "nth"; mes: number; semana: 1 | 2 | 3 | 4; diaSemana: number }
  /** "última quinta-feira de novembro". */
  | { tipo: "ultima"; mes: number; diaSemana: number };

/**
 * O n-ésimo `diaSemana` do mês.
 *
 * `(alvo - primeiro.getDay() + 7) % 7` é o pulo até o primeiro dia da semana
 * procurado; o `+ 7` existe para o caso de o alvo já ter passado no domingo
 * do dia 1, quando a subtração daria negativo e o `%` do JavaScript
 * devolveria negativo também — ao contrário do que se espera de um módulo.
 */
function nthDiaDaSemana(ano: number, mes: number, diaSemana: number, semana: number): Date {
  const primeiro = new Date(ano, mes - 1, 1);
  const pulo = (diaSemana - primeiro.getDay() + 7) % 7;
  return new Date(ano, mes - 1, 1 + pulo + (semana - 1) * 7);
}

/** O último `diaSemana` do mês. `new Date(ano, mes, 0)` é o último dia dele. */
function ultimoDiaDaSemana(ano: number, mes: number, diaSemana: number): Date {
  const ultimo = new Date(ano, mes, 0);
  const recuo = (ultimo.getDay() - diaSemana + 7) % 7;
  return new Date(ano, mes - 1, ultimo.getDate() - recuo);
}

/**
 * As regras do calendário cristão, que a CBB não usa.
 *
 * Ficam num tipo à parte, e não somadas a `Regra`, porque o teste do
 * calendário batista lê `regra.diaSemana` de toda regra que não é fixa —
 * uma regra "Páscoa + 49" ali não teria dia da semana para conferir.
 */
type RegraLiturgica =
  | Regra
  /** Dias contados a partir do domingo de Páscoa (negativo = antes). */
  | { tipo: "pascoa"; dias: number }
  /** 1º domingo do Advento: o quarto domingo antes do Natal. */
  | { tipo: "advento" };

export function resolverRegra(regra: RegraLiturgica, ano: number): Date {
  if (regra.tipo === "pascoa")  return addDays(easterSunday(ano), regra.dias);
  if (regra.tipo === "advento") {
    // O domingo de 24/12 para trás é o 4º do Advento; o 1º vem 21 dias antes.
    // Partir do dia 24, e não do 25, é o que acerta o ano em que o Natal cai
    // num domingo: aí o 4º domingo é o dia 18, não o próprio Natal.
    const vespera = new Date(ano, 11, 24);
    return addDays(vespera, -vespera.getDay() - 21);
  }
  if (regra.tipo === "fixa")   return new Date(ano, regra.mes - 1, regra.dia);
  if (regra.tipo === "ultima") return ultimoDiaDaSemana(ano, regra.mes, regra.diaSemana);
  return nthDiaDaSemana(ano, regra.mes, regra.diaSemana, regra.semana);
}

const DOM = 0, SEG = 1, QUI = 4;

export interface DataBatista {
  nome: string;
  desc: string;
  regra: Regra;
  /** Dias de duração. Ausente = um dia só. */
  dias?: number;
  /** A data que a CBB publicou para 2026. O teste confere a regra contra ela. */
  cbb2026: string;
  /**
   * As siglas das instituições que trazem esta data para a agenda: basta a
   * igreja estar vinculada a UMA delas, na Identidade. Ausente = só a CBB.
   *
   * O Dia de Missões Mundiais é da JMM, mas é a CBB que o publica e toda
   * igreja da CBB o celebra — por isso a JMM vem acompanhada da CBB, e não
   * no lugar dela. Uma igreja vinculada só à JMM também o vê.
   */
  de?: string[];
}

export const DATAS_BATISTAS: DataBatista[] = [
  { nome: "Aniversário de O Jornal Batista",              desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 1, dia: 10 },                     cbb2026: "2026-01-10" },
  { nome: "Dia da Aliança Batista Mundial",               desc: "Mês da Aliança Batista Mundial", regra: { tipo: "nth", mes: 2, semana: 1, diaSemana: DOM },  cbb2026: "2026-02-01" },
  { nome: "Dia Nacional do Conselheiro de Embaixador do Rei", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 2, dia: 14 },                 cbb2026: "2026-02-14" },
  { nome: "Dia da Esposa de Pastor",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 3, semana: 1, diaSemana: DOM },    cbb2026: "2026-03-01" },
  { nome: "Dia de Oração pelos Filhos de Pastores",       desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 3, semana: 1, diaSemana: SEG },    cbb2026: "2026-03-02" },
  { nome: "Dia de Missões Mundiais",                      desc: "Mês de Missões Mundiais — JMM", regra: { tipo: "nth", mes: 3, semana: 2, diaSemana: DOM },   cbb2026: "2026-03-08", de: ["JMM", "CBB"] },
  { nome: "Dia Mundial de Oração e Testemunho do Homem Batista", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 4, dia: 22 },              cbb2026: "2026-04-22" },
  { nome: "Dia da Escola Bíblica Dominical",              desc: "Mês da Escola Bíblica Dominical", regra: { tipo: "nth", mes: 4, semana: 4, diaSemana: DOM }, cbb2026: "2026-04-26" },
  { nome: "Dia Batista de Ação Social",                   desc: "Mês da Família", regra: { tipo: "nth", mes: 5, semana: 1, diaSemana: DOM },                  cbb2026: "2026-05-03" },
  { nome: "Dia da Comunicação Batista",                   desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 5, semana: 4, diaSemana: DOM },    cbb2026: "2026-05-24" },
  { nome: "Dia do Homem Batista",                         desc: "Mês do Pastor", regra: { tipo: "nth", mes: 6, semana: 1, diaSemana: DOM },                   cbb2026: "2026-06-07" },
  { nome: "Dia do Pastor",                                desc: "Mês do Pastor", regra: { tipo: "nth", mes: 6, semana: 2, diaSemana: DOM },                   cbb2026: "2026-06-14" },
  { nome: "Dia de Educação Cristã Missionária",           desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 6, dia: 23 },                     cbb2026: "2026-06-23" },
  { nome: "Aniversário da Convenção Batista Brasileira",  desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 6, dia: 25 },                     cbb2026: "2026-06-25" },
  { nome: "Dia do Missionário Batista",                   desc: "Mês de Missões Estaduais", regra: { tipo: "nth", mes: 7, semana: 2, diaSemana: DOM },        cbb2026: "2026-07-12", de: ["CBB", "CBERJ"] },
  { nome: "Dia de O Jornal Batista",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 7, semana: 3, diaSemana: DOM },    cbb2026: "2026-07-19" },
  { nome: "Dia Nacional de Oração pela Juventude Batista", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 7, dia: 31 },                    cbb2026: "2026-07-31" },
  { nome: "Dia dos Pequenos Missionários",                desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "fixa", mes: 8, dia: 2 },                 cbb2026: "2026-08-02" },
  { nome: "Dia do Adolescente Batista",                   desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 1, diaSemana: DOM }, cbb2026: "2026-08-02" },
  { nome: "Dia do Jovem Batista",                         desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 3, diaSemana: DOM }, cbb2026: "2026-08-16" },
  { nome: "Dia do Líder de Juventude",                    desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 4, diaSemana: DOM }, cbb2026: "2026-08-23" },
  { nome: "Dia Nacional do Embaixador do Rei",            desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 8, dia: 25 },                     cbb2026: "2026-08-25" },
  { nome: "7 dias de Oração pela Pátria",                 desc: "Mês de Missões Nacionais — JMN", regra: { tipo: "fixa", mes: 9, dia: 1 }, dias: 7,           cbb2026: "2026-09-01", de: ["JMN", "CBB"] },
  { nome: "Início do Trabalho Batista no Brasil",         desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 9, dia: 10 },                     cbb2026: "2026-09-10" },
  { nome: "Dia de Missões Nacionais",                     desc: "Mês de Missões Nacionais — JMN", regra: { tipo: "nth", mes: 9, semana: 2, diaSemana: DOM },  cbb2026: "2026-09-13", de: ["JMN", "CBB"] },
  { nome: "Semana de Oração pelas Crianças",              desc: "Mês das Crianças — Mulheres Batistas", regra: { tipo: "fixa", mes: 10, dia: 5 }, dias: 5,    cbb2026: "2026-10-05" },
  { nome: "Dia da Criança Batista",                       desc: "Mês das Crianças", regra: { tipo: "nth", mes: 10, semana: 2, diaSemana: DOM },               cbb2026: "2026-10-11" },
  { nome: "Impacto Brasil — Dia Batista de Evangelismo Pessoal", desc: "Mês das Crianças — JMN", regra: { tipo: "fixa", mes: 10, dia: 12 },                   cbb2026: "2026-10-12", de: ["JMN", "CBB"] },
  { nome: "Dia Batista do Brasil",                        desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 10, dia: 15 },                    cbb2026: "2026-10-15" },
  { nome: "Dia do Educador Cristão",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 10, semana: 3, diaSemana: DOM },   cbb2026: "2026-10-18" },
  { nome: "Dia do Plano Cooperativo",                     desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 10, semana: 4, diaSemana: DOM },   cbb2026: "2026-10-25" },
  { nome: "Dia Batista de Oração Mundial",                desc: "Mês da Educação Teológica", regra: { tipo: "nth", mes: 11, semana: 1, diaSemana: SEG },      cbb2026: "2026-11-02" },
  { nome: "Dia do Diácono Batista",                       desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 11, semana: 2, diaSemana: DOM },   cbb2026: "2026-11-08" },
  { nome: "Dia Nacional das Mensageiras do Rei",          desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 11, dia: 9 },                     cbb2026: "2026-11-09" },
  { nome: "Dia da Educação Teológica",                    desc: "Mês da Educação Teológica", regra: { tipo: "nth", mes: 11, semana: 3, diaSemana: DOM },      cbb2026: "2026-11-15" },
  { nome: "Dia do Ministro de Música Batista",            desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 11, semana: 4, diaSemana: DOM },   cbb2026: "2026-11-22" },
  { nome: "Dia Nacional de Ação de Graças",               desc: "Convenção Batista Brasileira", regra: { tipo: "ultima", mes: 11, diaSemana: QUI },           cbb2026: "2026-11-26" },
  { nome: "Dia da Bíblia",                                desc: "Mês da Bíblia", regra: { tipo: "nth", mes: 12, semana: 2, diaSemana: DOM },                  cbb2026: "2026-12-13" },
];

/** A quem pertence uma data denominacional. Ver `DataBatista.de`. */
export function instituicoesDaData(it: Pick<DataBatista, "de">): string[] {
  return it.de ?? ["CBB"];
}

/**
 * Quantas datas da agenda cada sigla traz. É o que a Identidade mostra ao
 * lado de cada instituição — "vincular" só faz sentido para quem sabe o que
 * liga. Uma instituição fora desta lista pode ser vinculada, mas ainda não
 * tem calendário cadastrado no sistema.
 */
export function datasPorInstituicao(): Record<string, number> {
  const conta: Record<string, number> = {};
  for (const it of DATAS_BATISTAS) {
    for (const sigla of instituicoesDaData(it)) conta[sigla] = (conta[sigla] ?? 0) + 1;
  }
  return conta;
}

/**
 * As datas denominacionais de um ano.
 *
 * @param vinculadas siglas das instituições vinculadas na Identidade, em
 *   maiúsculas. `null` quer dizer "não se sabe" — a consulta ainda não voltou
 *   ou falhou — e aí todas aparecem: esconder o Dia de Missões de uma igreja
 *   batista por uma falha de rede é pior do que mostrar uma data a mais.
 */
export function eventosBatistas(year: number, vinculadas: ReadonlySet<string> | null = null): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  for (const it of DATAS_BATISTAS) {
    if (vinculadas && !instituicoesDaData(it).some((s) => vinculadas.has(s))) continue;
    const inicio = resolverRegra(it.regra, year);
    const dias = it.dias ?? 1;
    for (let i = 0; i < dias; i++) {
      const d = addDays(inicio, i);
      out.push(
        buildOcorrencia({
          id: `batista-${year}-${it.nome.replace(/\s+/g, "_")}-${i}`,
          titulo: dias > 1 ? `${it.nome} (dia ${i + 1}/${dias})` : it.nome,
          data: ymd(d),
          descricao: it.desc,
          categoria: "batista",
          color: BATISTA_COLOR,
        }),
      );
    }
  }
  return out;
}

// ─── Cristãs, familiares e profissionais ───────────────────────────────────
//
// Valem para qualquer igreja: não dependem de vínculo na Identidade.
//
// As datas fixas aqui são as instituídas em lei ou de uso nacional
// consolidado. Onde a mesma data tem duas versões, as duas ficam, cada uma na
// sua categoria: o Dia Internacional da Juventude (12/08, ONU) é familiar; o
// Dia do Jovem Batista (3º domingo de agosto) é denominacional e já está acima.
//
// Ficaram de fora, de propósito, Quarta-feira de Cinzas e Quaresma: tradição
// litúrgica que a igreja batista não guarda.

export interface DataEspecial {
  nome: string;
  desc: string;
  regra: RegraLiturgica;
  categoria: "crista" | "familiar" | "profissional";
}

const fixa = (mes: number, dia: number): Regra => ({ tipo: "fixa", mes, dia });

export const DATAS_ESPECIAIS: DataEspecial[] = [
  // Cristãs
  { nome: "Domingo de Ramos",           desc: "Calendário cristão", regra: { tipo: "pascoa", dias: -7 }, categoria: "crista" },
  { nome: "Páscoa",                     desc: "Calendário cristão", regra: { tipo: "pascoa", dias: 0 },  categoria: "crista" },
  { nome: "Ascensão de Cristo",         desc: "Calendário cristão", regra: { tipo: "pascoa", dias: 39 }, categoria: "crista" },
  { nome: "Pentecostes",                desc: "Calendário cristão", regra: { tipo: "pascoa", dias: 49 }, categoria: "crista" },
  { nome: "Dia da Reforma Protestante", desc: "Calendário cristão", regra: fixa(10, 31),                 categoria: "crista" },
  { nome: "Início do Advento",          desc: "Calendário cristão", regra: { tipo: "advento" },          categoria: "crista" },

  // Familiares e sociais
  { nome: "Dia Internacional da Mulher",    desc: "Data familiar e social", regra: fixa(3, 8),   categoria: "familiar" },
  { nome: "Dia das Mães",                   desc: "Data familiar e social", regra: { tipo: "nth", mes: 5, semana: 2, diaSemana: DOM }, categoria: "familiar" },
  { nome: "Dia dos Namorados",              desc: "Data familiar e social", regra: fixa(6, 12),  categoria: "familiar" },
  { nome: "Dia dos Avós",                   desc: "Data familiar e social", regra: fixa(7, 26),  categoria: "familiar" },
  { nome: "Dia dos Pais",                   desc: "Data familiar e social", regra: { tipo: "nth", mes: 8, semana: 2, diaSemana: DOM }, categoria: "familiar" },
  { nome: "Dia Internacional da Juventude", desc: "Data familiar e social", regra: fixa(8, 12),  categoria: "familiar" },
  { nome: "Dia Nacional da Pessoa Idosa",   desc: "Data familiar e social", regra: fixa(10, 1),  categoria: "familiar" },
  { nome: "Dia das Crianças",               desc: "Data familiar e social", regra: fixa(10, 12), categoria: "familiar" },
  { nome: "Dia Nacional da Família",        desc: "Data familiar e social", regra: fixa(12, 8),  categoria: "familiar" },

  // Profissionais — desligadas por padrão
  { nome: "Dia do Farmacêutico",       desc: "Data profissional", regra: fixa(1, 20),  categoria: "profissional" },
  { nome: "Dia do Jornalista",         desc: "Data profissional", regra: fixa(4, 7),   categoria: "profissional" },
  { nome: "Dia da Enfermagem",         desc: "Data profissional", regra: fixa(5, 12),  categoria: "profissional" },
  { nome: "Dia do Assistente Social",  desc: "Data profissional", regra: fixa(5, 15),  categoria: "profissional" },
  { nome: "Dia do Bombeiro",           desc: "Data profissional", regra: fixa(7, 2),   categoria: "profissional" },
  { nome: "Dia do Advogado",           desc: "Data profissional", regra: fixa(8, 11),  categoria: "profissional" },
  { nome: "Dia do Psicólogo",          desc: "Data profissional", regra: fixa(8, 27),  categoria: "profissional" },
  { nome: "Dia do Nutricionista",      desc: "Data profissional", regra: fixa(8, 31),  categoria: "profissional" },
  { nome: "Dia do Administrador",      desc: "Data profissional", regra: fixa(9, 9),   categoria: "profissional" },
  { nome: "Dia do Médico Veterinário", desc: "Data profissional", regra: fixa(9, 9),   categoria: "profissional" },
  { nome: "Dia do Contador",           desc: "Data profissional", regra: fixa(9, 22),  categoria: "profissional" },
  { nome: "Dia da Secretária",         desc: "Data profissional", regra: fixa(9, 30),  categoria: "profissional" },
  { nome: "Dia do Fisioterapeuta",     desc: "Data profissional", regra: fixa(10, 13), categoria: "profissional" },
  { nome: "Dia do Professor",          desc: "Data profissional", regra: fixa(10, 15), categoria: "profissional" },
  { nome: "Dia do Médico",             desc: "Data profissional", regra: fixa(10, 18), categoria: "profissional" },
  { nome: "Dia do Dentista",           desc: "Data profissional", regra: fixa(10, 25), categoria: "profissional" },
  { nome: "Dia do Servidor Público",   desc: "Data profissional", regra: fixa(10, 28), categoria: "profissional" },
  { nome: "Dia do Músico",             desc: "Data profissional", regra: fixa(11, 22), categoria: "profissional" },
  { nome: "Dia do Engenheiro",         desc: "Data profissional", regra: fixa(12, 11), categoria: "profissional" },
  { nome: "Dia do Arquiteto",          desc: "Data profissional", regra: fixa(12, 15), categoria: "profissional" },
];

/** As datas cristãs, familiares e profissionais de um ano. */
export function datasEspeciais(year: number): EventoOcorrencia[] {
  return DATAS_ESPECIAIS.map((it) =>
    buildOcorrencia({
      id: `${it.categoria}-${year}-${it.nome.replace(/\s+/g, "_")}`,
      titulo: it.nome,
      data: ymd(resolverRegra(it.regra, year)),
      descricao: it.desc,
      categoria: it.categoria,
      color: COR_DA_CATEGORIA[it.categoria],
    }),
  );
}

// ─── O que vem da Identidade da Igreja ─────────────────────────────────────

/**
 * O que a agenda precisa saber da Identidade da Igreja. Carregado por
 * `services/calendarioDaIgreja.ts`; aqui só se usa, para esta função seguir
 * pura e testável sem banco.
 */
export interface ContextoDoCalendario {
  /** Siglas das instituições vinculadas, em maiúsculas. `null` = não se sabe. */
  vinculadas: ReadonlySet<string> | null;
  /** A data de fundação (yyyy-mm-dd) e o nome, para o aniversário da igreja. */
  fundacao: { data: string; nomeIgreja: string } | null;
}

export const CONTEXTO_DESCONHECIDO: ContextoDoCalendario = { vinculadas: null, fundacao: null };

/** O aniversário da igreja, se a data de fundação estiver cadastrada. */
export function aniversarioDaIgreja(year: number, fundacao: ContextoDoCalendario["fundacao"]): EventoOcorrencia[] {
  if (!fundacao) return [];
  const [ano, mes, dia] = fundacao.data.split("-").map(Number);
  const anos = year - ano;
  if (!ano || !mes || !dia || anos <= 0) return [];
  return [
    buildOcorrencia({
      id: `institucional-${year}-aniversario`,
      titulo: `Aniversário da igreja — ${anos} ${anos === 1 ? "ano" : "anos"}`,
      data: ymd(new Date(year, mes - 1, dia)),
      descricao: `Fundação da ${fundacao.nomeIgreja} em ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`,
      categoria: "institucional",
      color: INSTITUCIONAL_COLOR,
    }),
  ];
}

/**
 * Todas as Datas Especiais do intervalo, de todas as categorias.
 *
 * Devolve inclusive as profissionais: quem decide o que aparece é o filtro de
 * cada tela (`CATEGORIAS_PADRAO` em `types.ts`), não esta função.
 */
export function eventosExternos(from: Date, to: Date, ctx: ContextoDoCalendario = CONTEXTO_DESCONHECIDO): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    out.push(
      ...feriadosBrasil(y),
      ...eventosBatistas(y, ctx.vinculadas),
      ...datasEspeciais(y),
      ...aniversarioDaIgreja(y, ctx.fundacao),
    );
  }
  const a = ymd(from), b = ymd(to);
  return out.filter((o) => o.data >= a && o.data <= b);
}

