// ─── lib/rolagemRestaurada.ts — onde a rolagem estava em cada tela do histórico ─────────────────────────────────────────────────────────────
//
// Pedido dela (22/10/2026): "voltar para onde eu estava" em TODAS as telas. O `<main>` do AppLayout é remontado a cada mudança de caminho (`key={location.pathname}`), então a rolagem
// nova sempre nasce em 0 e a posição de antes se perdia, mesmo com o histórico do navegador voltando à tela certa.
//
// Guardamos a posição por ENTRADA DO HISTÓRICO (`history.state.idx` — o mesmo índice que `useNavegacao` usa para a trilha; ele NÃO muda quando a tela só troca a URL com `replace`, como os
// filtros fazem), por NOME do contêiner rolável ("pagina" é o `<main>`; telas com rolagem interna dão o próprio nome) e com o CAMINHO da tela: um `replace` para outra rota reaproveita o
// índice, e a posição da tela anterior não pode ser aplicada à nova. sessionStorage: sobrevive a recarregar, morre com a aba — e a trilha também.
// Entrar numa tela NOVA (push) esquece o que havia daquele índice em diante: o "avançar" que existia deixou de existir, como em `registrarNaTrilha`.
// Aqui só há regra, sem React.

const CHAVE = "diakonia:rolagens";

export type Rolagens = Record<string, { y: number; p: string }>;
type Armazem = Pick<Storage, "getItem" | "setItem">;

const chaveDe = (idx: number, nome: string) => `${idx}|${nome}`;

function armazemPadrao(): Armazem | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

export function lerRolagens(a: Armazem | null = armazemPadrao()): Rolagens {
  try {
    const bruto = a?.getItem(CHAVE);
    return bruto ? (JSON.parse(bruto) as Rolagens) : {};
  } catch { return {}; }
}

function gravarRolagens(r: Rolagens, a: Armazem | null) {
  try { a?.setItem(CHAVE, JSON.stringify(r)); } catch { /* aba privada: segue sem restaurar */ }
}

/** Posição da entrada atual no histórico do navegador (`history.state.idx`, posto pelo React Router). */
export const posicaoNoHistorico = (): number =>
  typeof window === "undefined" ? 0 : ((window.history.state as { idx?: number } | null)?.idx ?? 0);

/** Guarda a rolagem de um contêiner nesta entrada do histórico. Zero apaga (a tela estava no topo: não há o que restaurar). */
export function gravarRolagem(idx: number, nome: string, caminho: string, y: number, a: Armazem | null = armazemPadrao()) {
  const r = lerRolagens(a);
  const k = chaveDe(idx, nome);
  if (y > 0) r[k] = { y: Math.round(y), p: caminho }; else delete r[k];
  gravarRolagens(r, a);
}

/** O que está guardado para este índice, contêiner e CAMINHO (outro caminho = outra tela no mesmo índice: 0). */
export function rolagemGuardada(idx: number, nome: string, caminho: string, a: Armazem | null = armazemPadrao()): number {
  const g = lerRolagens(a)[chaveDe(idx, nome)];
  return g && g.p === caminho ? g.y : 0;
}

/** Entrou numa tela nova no índice `idx`: o que estava guardado dele em diante já não vale. */
export function esquecerRolagemAPartir(idx: number, a: Armazem | null = armazemPadrao()) {
  const r = lerRolagens(a);
  let mudou = false;
  for (const k of Object.keys(r)) {
    if (Number(k.split("|")[0]) >= idx) { delete r[k]; mudou = true; }
  }
  if (mudou) gravarRolagens(r, a);
}

/**
 * A rolagem de um contêiner já alcança `alvo`? Antes de os dados chegarem a tela é curta (esqueleto) e rolar para 800 cairia no fim dela: espera-se a lista crescer.
 * Passou do prazo (`esperouMs` ≥ `prazoMs`), aceita o que der — a lista pode ter encolhido desde a última visita.
 */
export function podeRestaurar(alvo: number, rolavel: number, esperouMs: number, prazoMs = 4000): boolean {
  return rolavel >= alvo - 1 || esperouMs >= prazoMs;
}
