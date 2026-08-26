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

export interface ExternalCategoria {
  id: "feriado" | "batista";
  label: string;
  color: string;
}

export const CATEGORIA_EXTERNAS: ExternalCategoria[] = [
  { id: "feriado", label: "Feriado Nacional", color: HOLIDAY_COLOR },
  { id: "batista", label: "Evento Institucional Batista", color: BATISTA_COLOR },
];

function buildOcorrencia(opts: {
  id: string;
  titulo: string;
  data: string;
  descricao: string;
  categoria: "feriado" | "batista";
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

/** Feriados nacionais brasileiros para um determinado ano. */
export function feriadosBrasil(year: number): EventoOcorrencia[] {
  const easter = easterSunday(year);
  const list: { d: Date; nome: string }[] = [
    { d: new Date(year, 0, 1), nome: "Ano Novo" },
    { d: addDays(easter, -48), nome: "Carnaval (segunda)" },
    { d: addDays(easter, -47), nome: "Carnaval (terça)" },
    { d: addDays(easter, -2), nome: "Sexta-feira Santa" },
    { d: easter, nome: "Páscoa" },
    { d: new Date(year, 3, 21), nome: "Tiradentes" },
    { d: new Date(year, 4, 1), nome: "Dia do Trabalho" },
    { d: addDays(easter, 60), nome: "Corpus Christi" },
    { d: new Date(year, 8, 7), nome: "Independência do Brasil" },
    { d: new Date(year, 9, 12), nome: "Nossa Senhora Aparecida" },
    { d: new Date(year, 10, 2), nome: "Finados" },
    { d: new Date(year, 10, 15), nome: "Proclamação da República" },
    { d: new Date(year, 11, 25), nome: "Natal" },
  ];
  return list.map((h) =>
    buildOcorrencia({
      id: `feriado-${year}-${ymd(h.d)}`,
      titulo: h.nome,
      data: ymd(h.d),
      descricao: "Feriado Nacional",
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

export function resolverRegra(regra: Regra, ano: number): Date {
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
}

export const DATAS_BATISTAS: DataBatista[] = [
  { nome: "Aniversário de O Jornal Batista",              desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 1, dia: 10 },                     cbb2026: "2026-01-10" },
  { nome: "Dia da Aliança Batista Mundial",               desc: "Mês da Aliança Batista Mundial", regra: { tipo: "nth", mes: 2, semana: 1, diaSemana: DOM },  cbb2026: "2026-02-01" },
  { nome: "Dia Nacional do Conselheiro de Embaixador do Rei", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 2, dia: 14 },                 cbb2026: "2026-02-14" },
  { nome: "Dia da Esposa de Pastor",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 3, semana: 1, diaSemana: DOM },    cbb2026: "2026-03-01" },
  { nome: "Dia de Oração pelos Filhos de Pastores",       desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 3, semana: 1, diaSemana: SEG },    cbb2026: "2026-03-02" },
  { nome: "Dia de Missões Mundiais",                      desc: "Mês de Missões Mundiais — JMM", regra: { tipo: "nth", mes: 3, semana: 2, diaSemana: DOM },   cbb2026: "2026-03-08" },
  { nome: "Dia Mundial de Oração e Testemunho do Homem Batista", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 4, dia: 22 },              cbb2026: "2026-04-22" },
  { nome: "Dia da Escola Bíblica Dominical",              desc: "Mês da Escola Bíblica Dominical", regra: { tipo: "nth", mes: 4, semana: 4, diaSemana: DOM }, cbb2026: "2026-04-26" },
  { nome: "Dia Batista de Ação Social",                   desc: "Mês da Família", regra: { tipo: "nth", mes: 5, semana: 1, diaSemana: DOM },                  cbb2026: "2026-05-03" },
  { nome: "Dia da Comunicação Batista",                   desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 5, semana: 4, diaSemana: DOM },    cbb2026: "2026-05-24" },
  { nome: "Dia do Homem Batista",                         desc: "Mês do Pastor", regra: { tipo: "nth", mes: 6, semana: 1, diaSemana: DOM },                   cbb2026: "2026-06-07" },
  { nome: "Dia do Pastor",                                desc: "Mês do Pastor", regra: { tipo: "nth", mes: 6, semana: 2, diaSemana: DOM },                   cbb2026: "2026-06-14" },
  { nome: "Dia de Educação Cristã Missionária",           desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 6, dia: 23 },                     cbb2026: "2026-06-23" },
  { nome: "Aniversário da Convenção Batista Brasileira",  desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 6, dia: 25 },                     cbb2026: "2026-06-25" },
  { nome: "Dia do Missionário Batista",                   desc: "Mês de Missões Estaduais", regra: { tipo: "nth", mes: 7, semana: 2, diaSemana: DOM },        cbb2026: "2026-07-12" },
  { nome: "Dia de O Jornal Batista",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 7, semana: 3, diaSemana: DOM },    cbb2026: "2026-07-19" },
  { nome: "Dia Nacional de Oração pela Juventude Batista", desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 7, dia: 31 },                    cbb2026: "2026-07-31" },
  { nome: "Dia dos Pequenos Missionários",                desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "fixa", mes: 8, dia: 2 },                 cbb2026: "2026-08-02" },
  { nome: "Dia do Adolescente Batista",                   desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 1, diaSemana: DOM }, cbb2026: "2026-08-02" },
  { nome: "Dia do Jovem Batista",                         desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 3, diaSemana: DOM }, cbb2026: "2026-08-16" },
  { nome: "Dia do Líder de Juventude",                    desc: "Mês dos Jovens e dos Adolescentes", regra: { tipo: "nth", mes: 8, semana: 4, diaSemana: DOM }, cbb2026: "2026-08-23" },
  { nome: "Dia Nacional do Embaixador do Rei",            desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 8, dia: 25 },                     cbb2026: "2026-08-25" },
  { nome: "7 dias de Oração pela Pátria",                 desc: "Mês de Missões Nacionais — JMN", regra: { tipo: "fixa", mes: 9, dia: 1 }, dias: 7,           cbb2026: "2026-09-01" },
  { nome: "Início do Trabalho Batista no Brasil",         desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 9, dia: 10 },                     cbb2026: "2026-09-10" },
  { nome: "Dia de Missões Nacionais",                     desc: "Mês de Missões Nacionais — JMN", regra: { tipo: "nth", mes: 9, semana: 2, diaSemana: DOM },  cbb2026: "2026-09-13" },
  { nome: "Semana de Oração pelas Crianças",              desc: "Mês das Crianças — Mulheres Batistas", regra: { tipo: "fixa", mes: 10, dia: 5 }, dias: 5,    cbb2026: "2026-10-05" },
  { nome: "Dia da Criança Batista",                       desc: "Mês das Crianças", regra: { tipo: "nth", mes: 10, semana: 2, diaSemana: DOM },               cbb2026: "2026-10-11" },
  { nome: "Impacto Brasil — Dia Batista de Evangelismo Pessoal", desc: "Mês das Crianças — JMN", regra: { tipo: "fixa", mes: 10, dia: 12 },                   cbb2026: "2026-10-12" },
  { nome: "Dia Batista do Brasil",                        desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 10, dia: 15 },                    cbb2026: "2026-10-15" },
  { nome: "Dia do Educador Cristão",                      desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 10, semana: 3, diaSemana: DOM },   cbb2026: "2026-10-18" },
  { nome: "Dia do Plano Cooperativo",                     desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 10, semana: 4, diaSemana: DOM },   cbb2026: "2026-10-25" },
  { nome: "Dia da Reforma Protestante",                   desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 10, dia: 31 },                    cbb2026: "2026-10-31" },
  { nome: "Dia Batista de Oração Mundial",                desc: "Mês da Educação Teológica", regra: { tipo: "nth", mes: 11, semana: 1, diaSemana: SEG },      cbb2026: "2026-11-02" },
  { nome: "Dia do Diácono Batista",                       desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 11, semana: 2, diaSemana: DOM },   cbb2026: "2026-11-08" },
  { nome: "Dia Nacional das Mensageiras do Rei",          desc: "Convenção Batista Brasileira", regra: { tipo: "fixa", mes: 11, dia: 9 },                     cbb2026: "2026-11-09" },
  { nome: "Dia da Educação Teológica",                    desc: "Mês da Educação Teológica", regra: { tipo: "nth", mes: 11, semana: 3, diaSemana: DOM },      cbb2026: "2026-11-15" },
  { nome: "Dia do Ministro de Música Batista",            desc: "Convenção Batista Brasileira", regra: { tipo: "nth", mes: 11, semana: 4, diaSemana: DOM },   cbb2026: "2026-11-22" },
  { nome: "Dia Nacional de Ação de Graças",               desc: "Convenção Batista Brasileira", regra: { tipo: "ultima", mes: 11, diaSemana: QUI },           cbb2026: "2026-11-26" },
  { nome: "Dia da Bíblia",                                desc: "Mês da Bíblia", regra: { tipo: "nth", mes: 12, semana: 2, diaSemana: DOM },                  cbb2026: "2026-12-13" },
];

/** As datas denominacionais da CBB para um determinado ano. */
export function eventosBatistas(year: number): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  for (const it of DATAS_BATISTAS) {
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

/** Combina todos os eventos externos para o intervalo de anos relevante. */
export function eventosExternos(from: Date, to: Date): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    out.push(...feriadosBrasil(y), ...eventosBatistas(y));
  }
  const a = ymd(from), b = ymd(to);
  return out.filter((o) => o.data >= a && o.data <= b);
}