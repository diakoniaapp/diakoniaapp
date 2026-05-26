import { RRule, Frequency, Weekday } from "rrule";
import type { EventoRow, EventoOcorrencia, RecorrenciaRegra } from "./types";

function parseLocalDate(yyyyMmDd: string): Date {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function buildRule(reg: RecorrenciaRegra, dtstart: Date): RRule {
  const freqMap: Record<RecorrenciaRegra["freq"], Frequency> = {
    diario: RRule.DAILY,
    semanal: RRule.WEEKLY,
    mensal: RRule.MONTHLY,
    anual: RRule.YEARLY,
    personalizado: RRule.DAILY,
  };
  const opts: ConstructorParameters<typeof RRule>[0] = {
    freq: freqMap[reg.freq],
    interval: Math.max(1, reg.intervalo || 1),
    dtstart,
  };
  if (reg.freq === "semanal" && reg.dias_semana?.length) {
    // rrule: 0=MO..6=SU; aqui usamos JS 0=Sun..6=Sat → mapear
    const map = [RRule.SU, RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA] as Weekday[];
    opts.byweekday = reg.dias_semana.map((d) => map[d]);
  }
  if (reg.fim.tipo === "data") opts.until = parseLocalDate(reg.fim.data);
  if (reg.fim.tipo === "ocorrencias") opts.count = reg.fim.n;
  return new RRule(opts);
}

/** Expande todos os eventos (mestres + exceções) na janela [from, to] inclusiva. */
export function expandirOcorrencias(
  eventos: EventoRow[],
  from: Date,
  to: Date,
): EventoOcorrencia[] {
  const out: EventoOcorrencia[] = [];
  // Mapa de exceções por (serieOrigemId | data)
  const excecoesPorChave = new Map<string, EventoRow>();
  for (const ev of eventos) {
    if (ev.is_excecao && ev.serie_origem_id && ev.ocorrencia_original_data) {
      excecoesPorChave.set(`${ev.serie_origem_id}|${ev.ocorrencia_original_data}`, ev);
    }
  }
  for (const ev of eventos) {
    // Exceções já são linhas reais — emitir somente as exceções (não-canceladas e canceladas) na data atual
    if (ev.is_excecao) {
      const d = parseLocalDate(ev.data);
      if (d >= from && d <= to) {
        out.push({
          key: `${ev.id}`,
          baseId: ev.id,
          serieId: ev.serie_origem_id,
          isExcecao: true,
          isOcorrenciaVirtual: false,
          data: ev.data,
          ocorrencia_original_data: ev.ocorrencia_original_data,
          evento: ev,
        });
      }
      continue;
    }
    if (!ev.recorrencia_regra) {
      const d = parseLocalDate(ev.data);
      if (d >= from && d <= to) {
        out.push({
          key: ev.id,
          baseId: ev.id,
          serieId: ev.recorrencia_id,
          isExcecao: false,
          isOcorrenciaVirtual: false,
          data: ev.data,
          ocorrencia_original_data: null,
          evento: ev,
        });
      }
      continue;
    }
    // Mestre com regra → gerar ocorrências entre from..to
    const dtstart = parseLocalDate(ev.data);
    let rule: RRule;
    try {
      rule = buildRule(ev.recorrencia_regra, dtstart);
    } catch {
      continue;
    }
    const occs = rule.between(from, to, true);
    const serieId = ev.recorrencia_id || ev.id;
    for (const occ of occs) {
      const ymd = toYmd(occ);
      // Pular se existe exceção para esta data
      if (excecoesPorChave.has(`${serieId}|${ymd}`)) continue;
      out.push({
        key: `${ev.id}|${ymd}`,
        baseId: ev.id,
        serieId,
        isExcecao: false,
        isOcorrenciaVirtual: ymd !== ev.data,
        data: ymd,
        ocorrencia_original_data: ymd,
        evento: { ...ev, data: ymd },
      });
    }
  }
  // Ordenar por data + hora_inicio
  out.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const ha = a.evento.hora_inicio || "";
    const hb = b.evento.hora_inicio || "";
    return ha < hb ? -1 : ha > hb ? 1 : 0;
  });
  return out;
}

export function descreverRegra(reg: RecorrenciaRegra | null): string {
  if (!reg) return "Não se repete";
  const i = reg.intervalo || 1;
  const base = (() => {
    switch (reg.freq) {
      case "diario": return i === 1 ? "Diariamente" : `A cada ${i} dias`;
      case "semanal": {
        const dias = (reg.dias_semana || [])
          .map((d) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d])
          .join(", ");
        const pref = i === 1 ? "Semanalmente" : `A cada ${i} semanas`;
        return dias ? `${pref} (${dias})` : pref;
      }
      case "mensal": return i === 1 ? "Mensalmente" : `A cada ${i} meses`;
      case "anual": return i === 1 ? "Anualmente" : `A cada ${i} anos`;
      case "personalizado": return "Personalizado";
    }
  })();
  const fim =
    reg.fim.tipo === "nunca" ? "" :
    reg.fim.tipo === "data" ? ` até ${reg.fim.data}` :
    ` por ${reg.fim.n} ocorrências`;
  return `${base}${fim}`;
}