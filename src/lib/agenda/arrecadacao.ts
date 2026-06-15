// src/lib/agenda/arrecadacao.ts
// ────────────────────────────────────────────────────────────────────────
// F13 — converte reservas da arrecadação em ocorrências da agenda principal
// (camada externa, somente leitura na Eventos.tsx).
// ────────────────────────────────────────────────────────────────────────
import type { EventoOcorrencia, EventoRow } from "./types";
import { supabase } from "@/integrations/supabase/client";

/** Cor ocre/dourada (combina com o gold da identidade) */
export const ARRECADACAO_COLOR = "#b45309"; // amber-700

export interface ReservaAgenda {
  id: string;
  finalidade: string;
  status: string;
  periodo: string;
  local_id: string | null;
  espaco_nome: string | null;
  espaco_codigo: string | null;
}

/**
 * Lê reservas que tocam o intervalo [from, to] e que devem aparecer
 * na agenda pública. Inclui aprovada, em_uso e encerrada — todas
 * representam compromisso real no espaço.
 *
 * Não usa a vw_agenda_igreja porque queremos campos específicos da reserva
 * (status, finalidade) pra renderização e link.
 */
export async function fetchReservasAgenda(from: Date, to: Date): Promise<ReservaAgenda[]> {
  const fromIso = from.toISOString();
  const toIso   = to.toISOString();
  // tstzrange.overlaps com [fromIso, toIso) — usamos representação OR:
  // (lower(periodo) <= to) AND (upper(periodo) >= from)
  const { data, error } = await supabase
    .from("arr_reservas")
    .select(`
      id, finalidade, status, periodo,
      espaco:arr_espacos!espaco_id(codigo, nome)
    `)
    .in("status", ["aprovada", "em_uso", "encerrada"])
    .is("arquivado_em", null);
  if (error) {
    // se a tabela ou RLS estiverem ausentes, fail silently
    console.warn("[agenda] reservas indisponíveis:", error.message);
    return [];
  }
  // filtra no JS pelo overlap (período é texto tstzrange — parseamos)
  const inIntervalo = (data ?? []).filter((r: any) => {
    const p = parseTstzrange(r.periodo);
    if (!p) return false;
    return p.lower <= toIso && p.upper >= fromIso;
  });
  return inIntervalo.map((r: any) => ({
    id: r.id,
    finalidade: r.finalidade,
    status: r.status,
    periodo: r.periodo,
    local_id: null,    // resolvido depois via mapEspacoParaLocal()
    espaco_nome: r.espaco?.nome ?? null,
    espaco_codigo: r.espaco?.codigo ?? null,
  }));
}

function parseTstzrange(s: string): { lower: string; upper: string } | null {
  // formato típico: ["2026-06-21 06:00:00-03","2026-06-21 12:00:00-03")
  const m = s.match(/[\[(]"?([^",]+)"?,\s*"?([^",)]+)"?[\])]/);
  if (!m) return null;
  return {
    lower: new Date(m[1]).toISOString(),
    upper: new Date(m[2]).toISOString(),
  };
}

/**
 * Cache simples de mapeamento espaco_codigo -> local_id (locais_fisicos).
 * A F7 garantiu sincronização Bazar/Cozinha em locais_fisicos por nome.
 */
let _cacheMapEspacoLocal: Record<string, string> | null = null;

export async function mapEspacoCodigoParaLocalId(): Promise<Record<string, string>> {
  if (_cacheMapEspacoLocal) return _cacheMapEspacoLocal;
  const { data } = await supabase
    .from("locais_fisicos")
    .select("id, nome")
    .in("nome", ["Bazar", "Cozinha"]);
  const map: Record<string, string> = {};
  for (const l of (data ?? []) as Array<{ id: string; nome: string }>) {
    if (l.nome === "Bazar") map["BAZAR"] = l.id;
    if (l.nome === "Cozinha") map["CANTINA"] = l.id;
  }
  _cacheMapEspacoLocal = map;
  return map;
}

/**
 * Converte ReservaAgenda → EventoOcorrencia compatível com o renderer
 * existente. Cor ocre, externalReadOnly, categoria=arrecadacao.
 */
export function reservasComoOcorrencias(
  reservas: ReservaAgenda[],
  mapLocal: Record<string, string>,
): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  for (const r of reservas) {
    const p = parseTstzrange(r.periodo);
    if (!p) continue;
    const dt = new Date(p.lower);
    const dtFim = new Date(p.upper);
    const data = ymd(dt);
    const hora_inicio = hhmm(dt);
    const hora_fim = hhmm(dtFim);
    const localId = r.espaco_codigo ? (mapLocal[r.espaco_codigo] ?? null) : null;
    const evento: EventoRow = {
      id: `arr_${r.id}`,
      titulo: `🛍️ ${r.finalidade}`,
      tipo: "outro",
      data,
      hora_inicio,
      hora_fim,
      local: r.espaco_nome,
      local_id: localId,
      descricao: `Reserva da Arrecadação · ${r.espaco_nome ?? ""} · status: ${r.status}`,
      status: r.status === "encerrada" ? "realizado" : "agendado",
      cor: ARRECADACAO_COLOR,
      ministerio_principal_id: null,
      recorrencia_id: null,
      recorrencia_regra: null,
      is_excecao: false,
      ocorrencia_original_data: null,
      serie_origem_id: null,
    };
    out.push({
      key: `arr_${r.id}_${data}`,
      baseId: r.id,
      serieId: null,
      isExcecao: false,
      isOcorrenciaVirtual: true,
      data,
      ocorrencia_original_data: null,
      evento,
      categoria: "arrecadacao",
      externalReadOnly: true,
    });
  }
  return out;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
