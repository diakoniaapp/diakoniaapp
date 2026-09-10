// ─── whatsapp.ts — para onde os links de conversa do WhatsApp apontam ──────
//
// ── AS DUAS OPÇÕES, E POR QUE A ESCOLHA É POR APARELHO ─────────────────────
//
// Há dois jeitos de um link abrir uma conversa do WhatsApp:
//
//   · **WhatsApp Web** — `https://web.whatsapp.com/send`. É o site do WhatsApp
//     Web e nada mais: o navegador abre direto nele, sem redirecionamento, e
//     o aplicativo instalado nunca entra na jogada. Bom para quem usa o
//     sistema num computador SEM o WhatsApp Desktop, ou para quem prefere
//     manter tudo no navegador.
//
//   · **Aplicativo** — `https://wa.me`. É o redirecionador OFICIAL do
//     WhatsApp, e a primeira coisa que ele tenta é abrir o APLICATIVO
//     instalado (celular ou WhatsApp Desktop), caindo para o navegador só se
//     não achar nenhum. Bom para quem usa no celular ou tem o app no
//     computador.
//
// Nenhum dos dois é "o certo": depende do aparelho de quem está usando. Por
// isso a escolha é uma **preferência local, por navegador/aparelho** — mesmo
// lugar e mesma natureza do tema claro/escuro (`localStorage`), e não um dado
// de conta que viaja entre dispositivos: o celular da secretária tem o app,
// o computador compartilhado da recepção talvez não.
//
// Histórico: em 09/09/2026 a Telma pediu para TUDO abrir no WhatsApp Web
// ("não no aplicativo"). Em 10/09/2026 reviu: "mostre as duas opções... e o
// usuário escolhe". O padrão continua Web — a preferência dela —, agora
// trocável no menu do usuário (ver `UserMenuButton.tsx`).

import { normalizarTelefone } from "@/lib/telefone";

export type DestinoWhatsApp = "web" | "app";

const CHAVE = "diakonia-whatsapp-destino";
const PADRAO: DestinoWhatsApp = "web";

export const DESTINO_WHATSAPP_LABEL: Record<DestinoWhatsApp, string> = {
  web: "Abrir no WhatsApp Web",
  app: "Abrir no aplicativo",
};

/** O destino escolhido neste navegador. Padrão: WhatsApp Web. */
export function getDestinoWhatsApp(): DestinoWhatsApp {
  if (typeof window === "undefined") return PADRAO;
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "web" || v === "app" ? v : PADRAO;
  } catch {
    // Modo privado / storage bloqueado — cai no padrão sem quebrar.
    return PADRAO;
  }
}

export function setDestinoWhatsApp(destino: DestinoWhatsApp): void {
  try {
    localStorage.setItem(CHAVE, destino);
  } catch {
    // A preferência só não persiste entre sessões; nada quebra.
  }
}

/**
 * O link de conversa do WhatsApp, no destino que o usuário escolheu.
 *
 * - Passe o **texto cru**: a função codifica (`encodeURIComponent`).
 * - Sem `telefone` (ou telefone inválido), monta o link de "escolher o
 *   contato na hora" — com o texto já pronto, se houver.
 * - O número passa por `normalizarTelefone`, que garante o DDI 55 — sem ele
 *   o WhatsApp Web "abre conversa com ninguém".
 */
export function montarLinkWhatsApp(
  opts: { telefone?: string | null; texto?: string | null } = {},
): string {
  const num = normalizarTelefone(opts.telefone);
  const texto = opts.texto ? encodeURIComponent(opts.texto) : "";

  if (getDestinoWhatsApp() === "app") {
    const base = num ? `https://wa.me/${num}` : "https://wa.me/";
    return texto ? `${base}?text=${texto}` : base;
  }

  const params = [num && `phone=${num}`, texto && `text=${texto}`]
    .filter(Boolean)
    .join("&");
  return params
    ? `https://web.whatsapp.com/send?${params}`
    : "https://web.whatsapp.com/send";
}
