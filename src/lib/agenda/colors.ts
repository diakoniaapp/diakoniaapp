import type { EventoTipo, ColorBy, EventoRow, MinisterioOpt } from "./types";

// Paleta institucional (HSL → hex aproximado, mas usamos hex direto para inline styles)
const TIPO_COLORS: Record<EventoTipo, string> = {
  culto: "#2563eb",        // azul
  reuniao: "#16a34a",      // verde
  ensaio: "#d97706",       // âmbar
  acao_social: "#db2777",  // rosa
  curso: "#0d9488",        // teal
  outro: "#7c3aed",        // roxo (evento especial)
};

// Paleta determinística para ministérios (até 12 cores distintas)
const MINISTERIO_PALETTE = [
  "#2563eb", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0d9488",
  "#dc2626", "#0891b2", "#65a30d", "#9333ea", "#ea580c", "#0369a1",
];

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function colorForMinisterio(id: string | null | undefined): string {
  if (!id) return "#64748b";
  return MINISTERIO_PALETTE[hashId(id) % MINISTERIO_PALETTE.length];
}

export function colorForTipo(t: EventoTipo): string {
  return TIPO_COLORS[t] ?? "#7c3aed";
}

export function colorForEvento(
  ev: Pick<EventoRow, "cor" | "tipo" | "ministerio_principal_id">,
  colorBy: ColorBy,
  _ministerios?: MinisterioOpt[],
): string {
  if (ev.cor) return ev.cor;
  if (colorBy === "ministerio") return colorForMinisterio(ev.ministerio_principal_id);
  return colorForTipo(ev.tipo);
}

/** Retorna estilos inline (bg suave, borda forte, texto contrast) */
export function eventoStyles(color: string, cancelado = false) {
  return {
    backgroundColor: color + (cancelado ? "22" : "1f"),
    borderLeft: `3px solid ${color}`,
    color: cancelado ? "var(--muted-foreground)" : "#0f172a",
  } as React.CSSProperties;
}

export function chipStyles(color: string, cancelado = false) {
  return {
    backgroundColor: color,
    color: "#fff",
    opacity: cancelado ? 0.55 : 1,
    textDecoration: cancelado ? "line-through" : "none",
  } as React.CSSProperties;
}