// ─── A aparência de um evento na agenda ───────────────────────────────────
//
// Um lugar só para dizer com que cara cada tipo de evento aparece. Existe
// porque agora há DUAS agendas — a do Painel Pastoral e a da Home — e elas
// mostram os mesmos eventos, no mesmo dia, com os mesmos números.
//
// Duas telas que mostram o mesmo dado com aparências diferentes ensinam que a
// aparência não significa nada. E este repositório já tem a cicatriz do
// caminho oposto, registrada em `AgendaDoDia.onJanela`: quando a contagem foi
// feita duas vezes, as duas divergiram na primeira conferência.
//
// ── POR QUE ÍCONE, E NÃO SÓ A ETIQUETA ─────────────────────────────────────
//
// A etiqueta de texto ("Culto", "Ação social") já existia e continua. O ícone
// resolve outra coisa: numa lista de oito itens de um domingo, ele deixa a
// pessoa achar o que procura sem ler oito linhas. É a mesma razão pela qual os
// seis atalhos do painel mantêm ícone — "num painel de seis atalhos ele ajuda
// a mirar sem ler".
//
// ── A CATEGORIA VEM ANTES DO TIPO ──────────────────────────────────────────
//
// Um feriado nacional e a Semana de Oração da CBB entram na agenda por
// `eventosExternos`, e a reserva do Bazar por `reservasComoOcorrencias`.
// Nenhum dos três é evento da igreja: o `tipo` deles é o que a estrutura
// exigiu preencher, não uma decisão de ninguém. Ler o tipo primeiro os
// mostraria todos como "Outro".

import {
  Church, Users, Music, HandHeart, GraduationCap, Radio, Presentation,
  Coffee, CalendarDays, Landmark, Flag, Store, type LucideIcon,
} from "lucide-react";
import type { EventoTipo, EventoOcorrencia } from "./types";

/**
 * O ícone de cada tipo de evento da igreja.
 *
 * As chaves são as do enum `evento_tipo` no banco — as nove, nem uma a mais.
 * O comentário de `AgendaDoDia` conta o que acontece quando sobra: um mapa
 * anterior listava "estudo", "visita", "oracao" e "retiro", que não existem,
 * e "descreve um sistema que não é este".
 */
export const ICONE_DO_TIPO: Record<EventoTipo, LucideIcon> = {
  culto:       Church,
  reuniao:     Users,
  ensaio:      Music,
  acao_social: HandHeart,
  curso:       GraduationCap,
  live:        Radio,
  palestra:    Presentation,
  comunhao:    Coffee,
  outro:       CalendarDays,
};

/** O ícone do que NÃO é evento da igreja. Ver a nota do cabeçalho. */
export const ICONE_DA_CATEGORIA: Record<string, LucideIcon> = {
  batista:     Landmark,   // calendário da denominação
  feriado:     Flag,
  arrecadacao: Store,      // reserva de espaço — Bazar, Cantina
};

/**
 * Os rótulos curtos, como aparecem na agenda.
 *
 * ── ESTES NÃO SÃO OS DE `types.ts`, E É DE PROPÓSITO ───────────────────────
 *
 * `types.ts` exporta um `TIPO_LABEL` mais longo — "Ação Social",
 * "Curso/Treinamento" — usado pelos filtros, pelo diálogo de evento e pela
 * impressão, onde a pessoa está ESCOLHENDO um tipo e o nome inteiro ajuda.
 *
 * Aqui a etiqueta acompanha um título dentro de um cartão estreito, e o nome
 * inteiro empurraria o título. São dois contextos, e a divergência é
 * deliberada — o que não era deliberado é ela existir em duas cópias, que é o
 * que este arquivo encerra.
 */
export const TIPO_CURTO: Record<string, string> = {
  culto:       "Culto",
  reuniao:     "Reunião",
  ensaio:      "Ensaio",
  acao_social: "Ação social",
  curso:       "Curso",
  live:        "Live",
  palestra:    "Palestra",
  comunhao:    "Comunhão",
  outro:       "Outro",
};

export const CATEGORIA_CURTA: Record<string, string> = {
  batista:     "Calendário batista",
  feriado:     "Feriado",
  arrecadacao: "Reserva de espaço",
};

/** O ícone desta ocorrência: categoria primeiro, tipo depois. */
export function iconeDaOcorrencia(o: Pick<EventoOcorrencia, "categoria" | "evento">): LucideIcon {
  const daCategoria = o.categoria ? ICONE_DA_CATEGORIA[o.categoria] : undefined;
  if (daCategoria) return daCategoria;
  const tipo = o.evento?.tipo as EventoTipo | undefined;
  return (tipo && ICONE_DO_TIPO[tipo]) || CalendarDays;
}

/** A etiqueta desta ocorrência, pela mesma regra do ícone. */
export function rotuloDaOcorrencia(
  o: Pick<EventoOcorrencia, "categoria" | "evento">,
): string | null {
  if (o.categoria && CATEGORIA_CURTA[o.categoria]) return CATEGORIA_CURTA[o.categoria];
  const tipo = o.evento?.tipo as string | undefined;
  return tipo ? (TIPO_CURTO[tipo] ?? tipo) : null;
}
