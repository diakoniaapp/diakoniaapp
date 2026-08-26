import type { EventoTipo, ColorBy, EventoRow, MinisterioOpt } from "./types";

// Paleta institucional (HSL → hex aproximado, mas usamos hex direto para inline styles)
const TIPO_COLORS: Record<EventoTipo, string> = {
  culto: "#2563eb",        // azul
  reuniao: "#16a34a",      // verde
  ensaio: "#d97706",       // âmbar
  acao_social: "#db2777",  // rosa
  curso: "#0d9488",        // teal
  live: "#dc2626",         // vermelho — a cor do "ao vivo"
  palestra: "#0891b2",     // ciano
  comunhao: "#ea580c",     // laranja
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
    // Sem fundo tingido: a cor do evento ja esta na barra da esquerda, e
    // pintar a linha inteira era o mesmo dado duas vezes. Numa agenda com 42
    // itens isso virava uma parede de cor — cada linha reivindicando destaque,
    // e portanto nenhuma destacada. A barra sozinha continua agrupando por
    // ministerio ou tipo, que e para o que a cor serve aqui.
    borderLeft: `3px solid ${color}`,
    // A cor do texto volta a ser a do tema. Era "#0f172a" fixo, quase preto,
    // que so funcionava sobre o fundo claro tingido: no modo escuro ficava
    // texto escuro sobre fundo escuro.
    color: cancelado ? "var(--muted-foreground)" : undefined,
    opacity: cancelado ? 0.6 : undefined,
  } as React.CSSProperties;
}

export function chipStyles(color: string, cancelado = false) {
  return {
    // Fundo sólido virou marca à esquerda.
    //
    // No mês, cada evento era um bloco de cor cheia com texto branco. Numa
    // grade de 42 eventos isso vira um mosaico: a cor deixa de codificar e
    // passa a ser só ruído, porque tudo grita no mesmo volume. A barra de 3px
    // codifica igual — é o mesmo dado, na mesma cor — e devolve o texto ao
    // contraste normal, que é mais legível que branco sobre amarelo.
    borderLeft: `3px solid ${color}`,
    opacity: cancelado ? 0.55 : 1,
    textDecoration: cancelado ? "line-through" : "none",
  } as React.CSSProperties;
}