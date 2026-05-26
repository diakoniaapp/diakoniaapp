import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  format,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import type { EventoOcorrencia, ColorBy, MinisterioOpt, AgendaView } from "@/lib/agenda/types";
import { TIPO_LABEL, STATUS_LABEL } from "@/lib/agenda/types";
import { colorForEvento, chipStyles, eventoStyles } from "@/lib/agenda/colors";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, RepeatIcon } from "lucide-react";

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06..23
const SLOT_H = 48; // px por hora

// Convert snake_case location parts to Title Case
function formatLocal(local: string | null | undefined): string {
  if (!local) return "";
  return local
    .split(" - ")
    .map((part) =>
      part
        .replace(/_/g, " ")
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" - ");
}

interface Common {
  ocorrencias: EventoOcorrencia[];
  colorBy: ColorBy;
  ministerios: MinisterioOpt[];
  onEventClick: (o: EventoOcorrencia) => void;
  onSlotClick?: (date: Date, hora?: string) => void;
}

function evChipCls(o: EventoOcorrencia) {
  return o.evento.status === "cancelado" ? "opacity-60" : "";
}

function timeRange(o: EventoOcorrencia) {
  const hi = o.evento.hora_inicio?.slice(0, 5);
  const hf = o.evento.hora_fim?.slice(0, 5);
  if (hi && hf) return `${hi}–${hf}`;
  if (hi) return hi;
  return "Dia todo";
}

function minutesOf(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Calcula faixas (lanes) para eventos que se sobrepõem no tempo.
// Retorna, para cada ocorrência, qual coluna ocupa e quantas colunas o
// grupo de sobreposição tem — permitindo render lado a lado.
function computeLanes(list: EventoOcorrencia[]) {
  const items = list
    .map((o) => {
      const s = minutesOf(o.evento.hora_inicio);
      const e = minutesOf(o.evento.hora_fim);
      if (s == null) return null;
      return { o, start: s, end: e != null && e > s ? e : s + 30 };
    })
    .filter((x): x is { o: EventoOcorrencia; start: number; end: number } => !!x)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  type Placed = { o: EventoOcorrencia; start: number; end: number; col: number; groupId: number };
  const placed: Placed[] = [];
  const groupCols = new Map<number, number>(); // groupId -> total de colunas
  let groupSeq = 0;
  let currentGroup: Placed[] = [];
  let currentGroupId = -1;
  let currentGroupEnd = -1;

  for (const it of items) {
    if (it.start >= currentGroupEnd) {
      currentGroupId = ++groupSeq;
      currentGroup = [];
      currentGroupEnd = it.end;
    } else {
      currentGroupEnd = Math.max(currentGroupEnd, it.end);
    }
    // encontra primeira coluna livre no grupo
    const usedCols = new Set(currentGroup.filter((p) => p.end > it.start).map((p) => p.col));
    let col = 0;
    while (usedCols.has(col)) col++;
    const p: Placed = { ...it, col, groupId: currentGroupId };
    currentGroup.push(p);
    placed.push(p);
    groupCols.set(currentGroupId, Math.max(groupCols.get(currentGroupId) ?? 1, col + 1));
  }

  return placed.map((p) => ({
    o: p.o,
    start: p.start,
    end: p.end,
    col: p.col,
    cols: groupCols.get(p.groupId) ?? 1,
  }));
}

// ───────────────────────────── Month View ─────────────────────────────
export function MonthView({
  refDate,
  ocorrencias,
  colorBy,
  ministerios,
  onEventClick,
  onSlotClick,
}: Common & { refDate: Date }) {
  const start = startOfWeek(startOfMonth(refDate), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(refDate), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const byDate = useMemo(() => {
    const map = new Map<string, EventoOcorrencia[]>();
    ocorrencias.forEach((o) => {
      const arr = map.get(o.data) || [];
      arr.push(o);
      map.set(o.data, arr);
    });
    return map;
  }, [ocorrencias]);

  const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="animate-fade-in">
      <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground border-b">
        {weekdayLabels.map((w) => (
          <div key={w} className="px-2 py-1.5 text-center">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-[repeat(6,minmax(110px,1fr))]">
        {days.map((d) => {
          const ymd = format(d, "yyyy-MM-dd");
          const list = byDate.get(ymd) || [];
          const outMonth = !isSameMonth(d, refDate);
          const today = isToday(d);
          return (
            <div
              key={ymd}
              onClick={() => onSlotClick?.(d)}
              className={cn(
                "border-r border-b p-1.5 cursor-pointer transition-colors hover:bg-accent/30 overflow-hidden",
                outMonth && "bg-muted/30 text-muted-foreground",
                today && "bg-primary/5",
              )}
            >
              <div
                className={cn(
                  "inline-flex items-center justify-center text-xs font-medium w-6 h-6 rounded-full",
                  today && "bg-primary text-primary-foreground",
                )}
              >
                {d.getDate()}
              </div>
              <div className="mt-1 space-y-0.5">
                {list.slice(0, 3).map((o) => {
                  const color = colorForEvento(o.evento, colorBy, ministerios);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick(o);
                      }}
                      className={cn("w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded", evChipCls(o))}
                      style={chipStyles(color, o.evento.status === "cancelado")}
                    >
                      {o.evento.hora_inicio?.slice(0, 5)} {o.evento.titulo}
                    </button>
                  );
                })}
                {list.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">+ {list.length - 3} mais</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── Week / Day View ─────────────────────────────
function TimeGrid({ days, ocorrencias, colorBy, ministerios, onEventClick, onSlotClick }: Common & { days: Date[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, EventoOcorrencia[]>();
    ocorrencias.forEach((o) => {
      const arr = map.get(o.data) || [];
      arr.push(o);
      map.set(o.data, arr);
    });
    return map;
  }, [ocorrencias]);

  return (
    <div className="animate-fade-in border rounded-md overflow-hidden flex flex-col" style={{ maxHeight: "75vh" }}>
      <div className="grid" style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}>
        <div className="bg-muted/30 border-b" />
        {days.map((d) => {
          const today = isToday(d);
          return (
            <div
              key={d.toISOString()}
              className={cn("border-l border-b px-2 py-1.5 text-center", today && "bg-primary/5")}
            >
              <div className="text-[10px] uppercase text-muted-foreground">{format(d, "EEE", { locale: ptBR })}</div>
              <div
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium",
                  today && "bg-primary text-primary-foreground",
                )}
              >
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div
        className="grid relative overflow-y-auto flex-1"
        style={{ gridTemplateColumns: `60px repeat(${days.length}, 1fr)` }}
      >
        {/* Coluna de horas */}
        <div>
          {HOURS.map((h) => (
            <div
              key={h}
              className="h-12 border-b border-dashed text-[10px] text-muted-foreground pr-1 text-right pt-0.5"
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const ymd = format(d, "yyyy-MM-dd");
          const list = byDate.get(ymd) || [];
          const lanes = computeLanes(list);
          return (
            <div key={ymd} className="relative border-l">
              {HOURS.map((h) => (
                <div
                  key={h}
                  className="h-12 border-b border-dashed hover:bg-accent/20 cursor-pointer"
                  onClick={() => onSlotClick?.(d, `${String(h).padStart(2, "0")}:00`)}
                />
              ))}
              {lanes.map(({ o, start, end, col, cols }) => {
                const top = ((start - HOURS[0] * 60) / 60) * SLOT_H;
                const height = Math.max(20, ((end - start) / 60) * SLOT_H);
                const color = colorForEvento(o.evento, colorBy, ministerios);
                const gapPct = 1; // % entre colunas
                const widthPct = (100 - gapPct * (cols - 1)) / cols;
                const leftPct = col * (widthPct + gapPct);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(o);
                    }}
                    className={cn(
                      "absolute rounded-md p-1 text-left text-[11px] overflow-hidden",
                      "hover:shadow-md hover:z-20 transition-shadow z-10 border border-background/40",
                      evChipCls(o),
                    )}
                    style={{
                      top,
                      height,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 4px)`,
                      ...eventoStyles(color, o.evento.status === "cancelado"),
                    }}
                  >
                    <div className="font-semibold truncate">{o.evento.titulo}</div>
                    <div className="opacity-80 truncate">{timeRange(o)}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeekView(p: Common & { refDate: Date }) {
  const start = startOfWeek(p.refDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return <TimeGrid {...p} days={days} />;
}
export function DayView(p: Common & { refDate: Date }) {
  return <TimeGrid {...p} days={[p.refDate]} />;
}

// ───────────────────────────── List View ─────────────────────────────
export function ListView({ ocorrencias, colorBy, ministerios, onEventClick }: Common) {
  const grupos = useMemo(() => {
    const map = new Map<string, EventoOcorrencia[]>();
    ocorrencias.forEach((o) => {
      const arr = map.get(o.data) || [];
      arr.push(o);
      map.set(o.data, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ocorrencias]);

  if (!grupos.length) {
    return (
      <div className="rounded-md border p-12 text-center text-muted-foreground animate-fade-in">
        Nenhum evento neste período.
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {grupos.map(([ymd, list]) => {
        const d = parseISO(ymd);
        const today = isToday(d);
        return (
          <div key={ymd}>
            <div className={cn("flex items-baseline gap-3 mb-2 pb-1.5 border-b", today && "border-primary")}>
              <span className={cn("text-2xl font-serif", today && "text-primary")}>{d.getDate()}</span>
              <span className="text-sm text-muted-foreground capitalize">
                {format(d, "EEEE, MMMM yyyy", { locale: ptBR })}
              </span>
              {today && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  Hoje
                </Badge>
              )}
            </div>
            <div className="space-y-1.5">
              {list.map((o) => {
                const color = colorForEvento(o.evento, colorBy, ministerios);
                const cancelado = o.evento.status === "cancelado";
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onEventClick(o)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-md px-3 py-2 text-left hover:shadow-sm transition-all",
                      cancelado && "opacity-60",
                    )}
                    style={eventoStyles(color, cancelado)}
                  >
                    <div className="w-1 h-10 rounded" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className={cn("font-medium truncate", cancelado && "line-through")}>
                        {o.evento.titulo}
                        {o.serieId && <RepeatIcon className="w-3 h-3 inline ml-1.5 opacity-60" />}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {timeRange(o)}
                        </span>
                        {o.evento.local && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {formatLocal(o.evento.local)}
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] py-0">
                          {TIPO_LABEL[o.evento.tipo]}
                        </Badge>
                        {cancelado && (
                          <Badge variant="outline" className="text-[10px] py-0 border-destructive text-destructive">
                            Cancelado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const VIEW_LABELS: Record<AgendaView, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
  lista: "Agenda",
};

// Silence unused-import warnings for shared types
export const __STATUS_LABEL_UNUSED = STATUS_LABEL;
export const __isSameDay_UNUSED = isSameDay;
