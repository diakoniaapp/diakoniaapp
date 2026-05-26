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

/**
 * Datas e campanhas relevantes da Convenção Batista Brasileira.
 * Curadoria estática (datas e semanas fixas/aproximadas). Pode ser ampliada
 * conforme a CBB publicar oficialmente o calendário do ano.
 * Fontes: convencaobatista.com.br, missoesmundiais.com.br, missoesnacionais.org.br
 */
export function eventosBatistas(year: number): EventoOcorrencia[] {
  const items: { mes: number; dia: number; dias?: number; nome: string; desc: string }[] = [
    { mes: 2, dia: 1, dias: 7, nome: "Semana de Oração pelas Missões Mundiais", desc: "Campanha JMM — Missões Mundiais" },
    { mes: 6, dia: 9, nome: "Dia do Pastor Batista", desc: "Convenção Batista Brasileira" },
    { mes: 6, dia: 24, dias: 7, nome: "Semana da Bíblia", desc: "Convenção Batista Brasileira" },
    { mes: 7, dia: 8, nome: "Dia Nacional do Evangélico", desc: "Convenção Batista Brasileira" },
    { mes: 9, dia: 1, dias: 7, nome: "Semana de Oração pelas Missões Nacionais", desc: "Campanha JMN — Missões Nacionais" },
    { mes: 10, dia: 31, nome: "Dia da Reforma Protestante", desc: "Datas comemorativas batistas" },
    { mes: 11, dia: 10, nome: "Dia do Batista Brasileiro", desc: "Convenção Batista Brasileira" },
  ];
  const out: EventoOcorrencia[] = [];
  for (const it of items) {
    const dias = it.dias ?? 1;
    for (let i = 0; i < dias; i++) {
      const d = new Date(year, it.mes - 1, it.dia + i);
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