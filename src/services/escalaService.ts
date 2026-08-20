// ─── escalaService.ts ────────────────────────────────────────────────────────
// A escala: quem serve, em qual área, em qual evento.
//
// Sprint 4. Escreve nas tabelas `escalas` e `escala_voluntarios`, que existiam
// no banco desde o começo, com zero linhas e zero código. Nenhuma tabela nova.
//
// ── A ESCALA NASCE DE UM EVENTO, NÃO DE UMA AGENDA PARALELA ──────────────────
//
// `escalas.evento_id` existe justamente para isso. Data, hora e local vêm do
// evento que já está na agenda — nada é redigitado, e nada pode divergir. Se o
// culto mudar de horário, a escala não fica apontando para o horário velho,
// porque ela não guarda horário: guarda o evento.
//
// Os campos `data_evento`, `hora_inicio`, `hora_fim` e `local` de `escalas`
// são preenchidos por conveniência de leitura (a view `v_proximas_escalas` os
// usa), mas a verdade é o evento.

import { supabase } from "@/integrations/supabase/client";
import { conferir, type ResultadoEscrita } from "@/lib/escritaConferida";

export type StatusEscala = "planejada" | "confirmada" | "realizada" | "cancelada";
export type StatusPresenca = "pendente" | "confirmado" | "recusado" | "ausente" | "presente";

export const ROTULO_PRESENCA: Record<StatusPresenca, string> = {
  pendente:   "Aguardando",
  confirmado: "Confirmou",
  recusado:   "Recusou",
  presente:   "Veio",
  ausente:    "Faltou",
};

export interface Escalado {
  id: string;
  pessoa_id: string;
  nome_completo: string;
  telefone: string | null;
  funcao: string | null;
  status: StatusPresenca;
  motivo_recusa: string | null;
  notificado_em: string | null;
  sugerido_automaticamente: boolean;
  score_sugestao: number | null;
}

export interface EscalaDaArea {
  id: string;
  titulo: string;
  area_id: string;
  area_nome: string;
  status: StatusEscala;
  escalados: Escalado[];
}

/** O que o motor devolve. Espelha o RETURNS TABLE da função. */
export interface Sugestao {
  pessoa_id: string;
  nome_completo: string;
  score: number;
  motivo: string;
  ultima_escala_em: string | null;
  total_escalas_mes: number;
  carga_atual: number;
  nivel_sobrecarga: number;
  disponivel: boolean;
  em_descanso: boolean;
}

const DIA_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;

/** O dia da semana de uma data, no vocabulário do enum `dia_semana`. */
export function diaSemanaDe(dataISO: string): string {
  return DIA_SEMANA[new Date(dataISO + "T12:00:00").getDay()];
}

/**
 * O turno de um horário, no vocabulário do enum `turno_disponibilidade`.
 *
 * Os cortes são os do dia de uma igreja, não os do relógio: a "manhã" vai até
 * o almoço, a "tarde" até o fim do expediente, e tudo depois disso é noite —
 * que é quando acontece a maior parte dos cultos.
 */
export function turnoDe(hora: string | null): string | null {
  if (!hora) return null;
  const h = parseInt(hora.slice(0, 2), 10);
  if (Number.isNaN(h)) return null;
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * As escalas já montadas para uma OCORRÊNCIA, com quem está em cada uma.
 *
 * A data não é enfeite. Evento recorrente tem duas formas no banco: a série,
 * com `recorrencia_regra` preenchida, e as ocorrências materializadas, criadas
 * quando alguém edita uma data específica. Numa ocorrência NÃO materializada,
 * o `evento_id` é o da série — e todas as datas compartilham o mesmo.
 *
 * Sem filtrar por data, a escala do culto de 23/08 apareceria também no de
 * 30/08, no de 06/09, e em todo domingo até o fim da série. Uma equipe
 * escalada uma vez pareceria escalada para sempre.
 *
 * A escala pertence a (série, data), e `escalas.data_evento` já guardava isso.
 */
export async function escalasDoEvento(eventoId: string, dataOcorrencia?: string): Promise<EscalaDaArea[]> {
  let q = supabase
    .from("escalas")
    .select("id, titulo, area_id, status")
    .eq("evento_id", eventoId);
  if (dataOcorrencia) q = q.eq("data_evento", dataOcorrencia);
  const { data: escalas } = await q.order("created_at");

  if (!escalas || escalas.length === 0) return [];

  // Sem embed em nenhum dos dois lados: `escala_voluntarios` não declara FK
  // para `membros`, e `escalas` não declara para `areas`. Três consultas, e
  // o join em memória.
  const ids = escalas.map(e => e.id);
  const areaIds = [...new Set(escalas.map(e => e.area_id).filter(Boolean))];

  const [{ data: vols }, { data: areas }] = await Promise.all([
    supabase.from("escala_voluntarios")
      .select("id, escala_id, pessoa_id, funcao, status, motivo_recusa, notificado_em, sugerido_automaticamente, score_sugestao")
      .in("escala_id", ids),
    areaIds.length
      ? supabase.from("areas").select("id, nome").in("id", areaIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const pessoaIds = [...new Set((vols ?? []).map((v: any) => v.pessoa_id).filter(Boolean))];
  const { data: pessoas } = pessoaIds.length
    ? await supabase.from("membros").select("id, nome_completo, telefone_celular").in("id", pessoaIds)
    : { data: [] as any[] };

  const nomeArea = new Map((areas ?? []).map((a: any) => [a.id, a.nome]));
  const pessoa   = new Map((pessoas ?? []).map((p: any) => [p.id, p]));

  return escalas.map((e: any) => ({
    id:        e.id,
    titulo:    e.titulo,
    area_id:   e.area_id,
    area_nome: (nomeArea.get(e.area_id) ?? "—").trim(),
    status:    e.status as StatusEscala,
    escalados: (vols ?? [])
      .filter((v: any) => v.escala_id === e.id)
      .map((v: any) => ({
        id:            v.id,
        pessoa_id:     v.pessoa_id,
        nome_completo: pessoa.get(v.pessoa_id)?.nome_completo ?? "—",
        telefone:      pessoa.get(v.pessoa_id)?.telefone_celular ?? null,
        funcao:        v.funcao,
        status:        (v.status ?? "pendente") as StatusPresenca,
        motivo_recusa: v.motivo_recusa,
        notificado_em: v.notificado_em,
        sugerido_automaticamente: !!v.sugerido_automaticamente,
        score_sugestao: v.score_sugestao,
      }))
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo)),
  }));
}

/** Cria a escala de uma área para um evento. Devolve o id. */
export async function criarEscala(params: {
  eventoId: string;
  areaId: string;
  ministerioId: string | null;
  titulo: string;
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  local: string | null;
}): Promise<{ ok: boolean; id?: string; erro?: string }> {
  const { data, error } = await supabase
    .from("escalas")
    .insert({
      evento_id:     params.eventoId,
      area_id:       params.areaId,
      ministerio_id: params.ministerioId,
      titulo:        params.titulo,
      data_evento:   params.data,
      hora_inicio:   params.horaInicio,
      hora_fim:      params.horaFim,
      local:         params.local,
      status:        "planejada",
    })
    .select("id")
    .single();

  if (error) return { ok: false, erro: error.message };
  if (!data)  return { ok: false, erro: "A escala não foi criada — seu perfil pode não ter permissão." };
  return { ok: true, id: data.id };
}

/** Quem o motor sugere para esta área, neste dia e turno. */
export async function sugestoesPara(
  areaId: string, dataEvento: string, hora: string | null, limite = 12,
): Promise<{ sugestoes: Sugestao[]; erro?: string }> {
  const { data, error } = await supabase.rpc("sugerir_voluntarios_escala", {
    p_area_id:     areaId,
    p_data_evento: dataEvento,
    p_dia_semana:  diaSemanaDe(dataEvento),
    p_turno:       turnoDe(hora),
    p_limite:      limite,
  });
  if (error) return { sugestoes: [], erro: error.message };
  return { sugestoes: (data ?? []) as Sugestao[] };
}

/**
 * Coloca alguém na escala.
 *
 * `sugerido_automaticamente` e `score_sugestao` são gravados para que um dia
 * se possa conferir se a sugestão acertava — a diferença entre um motor que
 * se pode auditar e um oráculo.
 *
 * Entra como `pendente`: ninguém está escalado até dizer que vem. É essa
 * distinção que faz o ciclo de confirmação existir, e é ela que o gatilho
 * `trg_atualizar_carga` respeita ao só contar carga em confirmado/presente.
 */
export async function escalar(
  escalaId: string,
  pessoaId: string,
  opts: { funcao?: string | null; sugerido?: boolean; score?: number | null } = {},
): Promise<ResultadoEscrita> {
  return conferir(
    await supabase.from("escala_voluntarios").insert({
      escala_id:  escalaId,
      pessoa_id:  pessoaId,
      funcao:     opts.funcao ?? null,
      status:     "pendente",
      sugerido_automaticamente: opts.sugerido ?? false,
      score_sugestao: opts.score ?? null,
    }).select("id"),
    "A pessoa",
  );
}

export async function tirarDaEscala(escalaVolId: string): Promise<ResultadoEscrita> {
  return conferir(
    await supabase.from("escala_voluntarios").delete().eq("id", escalaVolId).select("id"),
    "A remoção",
  );
}

/**
 * Confirma, recusa ou marca presença.
 *
 * `motivo_recusa` só é gravado na recusa, e apagado em qualquer outro estado:
 * guardar "não posso, estarei viajando" numa linha que depois virou
 * "confirmado" faria a igreja ler uma recusa que não existe mais.
 */
export async function responderEscala(
  escalaVolId: string,
  status: StatusPresenca,
  motivo?: string | null,
): Promise<ResultadoEscrita> {
  return conferir(
    await supabase.from("escala_voluntarios")
      .update({
        status,
        motivo_recusa: status === "recusado" ? (motivo?.trim() || null) : null,
        respondido_em: new Date().toISOString(),
      })
      .eq("id", escalaVolId)
      .select("id"),
    "A resposta",
  );
}

export async function marcarNotificado(escalaVolId: string): Promise<void> {
  // Sem conferir: é um carimbo de "já mandei mensagem". Se falhar, o líder
  // manda de novo — derrubar a ação por causa do carimbo seria pior.
  await supabase.from("escala_voluntarios")
    .update({ notificado_em: new Date().toISOString() })
    .eq("id", escalaVolId);
}

export async function excluirEscala(escalaId: string): Promise<ResultadoEscrita> {
  return conferir(
    await supabase.from("escalas").delete().eq("id", escalaId).select("id"),
    "A escala",
  );
}
