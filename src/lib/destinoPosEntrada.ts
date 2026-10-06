// ─── destinoPosEntrada.ts — para onde voltar depois das "portas" de entrada ─────
//
// Achado em 06/10/2026 ("Extrato completo me joga para a Home"): o botão abria a conta numa
// ABA NOVA (`target="_blank"`). Aba nova = `sessionStorage` vazio, e o portão da LGPD
// (`AppLayout`) lê justamente a marca `lgpd_ok_<uid>` do `sessionStorage` (CLAUDE.md §5.8).
// Sem a marca, `AppLayout` manda para `/aceite-lgpd`; essa tela confere o aceite no banco, vê
// que já existe e segue para `rotaInicialPorPapel` — a Home do papel. O destino original se
// perdia no caminho. Isso valia para QUALQUER endereço aberto numa aba/janela nova (favorito,
// link colado, janela do aplicativo instalado), não só para o extrato.
//
// A correção: quem desvia carrega o endereço de origem em `location.state.de`; quem libera
// (aceite da LGPD, troca de senha, login) volta para ele — se for um endereço interno e seguro.

/** Telas que fazem parte da própria entrada: voltar para elas seria andar em círculo. */
const TELAS_DE_ENTRADA = ["/auth", "/aceite-lgpd", "/primeiro-acesso", "/esqueci-senha", "/convite"];

/** Aceita só caminho interno (`/algo`), nunca outro site (`//x`, `http:`), nem tela de entrada. */
export function destinoSeguro(de: unknown): string | null {
  if (typeof de !== "string" || de.length === 0 || de.length > 2000) return null;
  if (!de.startsWith("/") || de.startsWith("//") || de.includes("\\") || /[\u0000-\u001f]/.test(de)) return null;
  const caminho = de.split(/[?#]/)[0];
  if (TELAS_DE_ENTRADA.some(t => caminho === t || caminho.startsWith(t + "/"))) return null;
  return de;
}

/** O endereço que a pessoa pediu — ou `null` quando é a Home (nada a lembrar). */
export function destinoDeOndeEstava(loc: { pathname: string; search?: string; hash?: string }): string | null {
  const completo = `${loc.pathname}${loc.search ?? ""}${loc.hash ?? ""}`;
  if (loc.pathname === "/" || loc.pathname === "") return null;
  return destinoSeguro(completo);
}

/** O `state` do `navigate` que desvia para uma tela de entrada. */
export function estadoDeDesvio(loc: { pathname: string; search?: string; hash?: string }): { de: string } | undefined {
  const de = destinoDeOndeEstava(loc);
  return de ? { de } : undefined;
}

/** Lê `state.de` de um `location.state` qualquer (que pode ser nulo ou de outro formato). */
export function destinoDoEstado(state: unknown): string | null {
  return destinoSeguro((state as { de?: unknown } | null | undefined)?.de);
}
