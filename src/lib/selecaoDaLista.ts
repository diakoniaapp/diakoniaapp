// ─── lib/selecaoDaLista.ts — qual movimento está selecionado na Central de decisões (puro, testado) ───────────────────────────────────────────────────────────
//
// A conciliação é uma LISTA (à esquerda) com um PAINEL de decisão (à direita), como no Omie. Quem decide para onde a seleção vai — ao abrir, ao apertar ↑/↓, ao resolver uma linha
// e ao mudar o filtro — mora aqui, onde se testa.

export interface ItemSelecionavel { fitid: string; /** já foi resolvida (lançada agora, ignorada, já registrada): não há o que decidir */ resolvida: boolean }

/** ↑/↓: o vizinho (sem dar a volta); sem seleção, o primeiro (↓) ou o último (↑). */
export function moverSelecao(itens: readonly ItemSelecionavel[], atual: string | null, passo: 1 | -1): string | null {
  if (itens.length === 0) return null;
  const i = atual ? itens.findIndex(x => x.fitid === atual) : -1;
  if (i < 0) return itens[passo === 1 ? 0 : itens.length - 1].fitid;
  return itens[Math.min(itens.length - 1, Math.max(0, i + passo))].fitid;
}

/**
 * A linha selecionada saiu da tela (foi resolvida e o filtro a tirou, ou a página mudou): fica na MESMA posição — que agora é a linha seguinte — ou na última.
 * `indiceAnterior` = onde ela estava.
 */
export function selecaoAposSumir(itens: readonly ItemSelecionavel[], indiceAnterior: number): string | null {
  if (itens.length === 0) return null;
  return itens[Math.min(Math.max(0, indiceAnterior), itens.length - 1)].fitid;
}

/** Resolveu a linha selecionada (continua na lista, só mudou de estado): vai para a PRÓXIMA ainda por decidir; não havendo, para a anterior; não havendo, fica. */
export function proximaPorDecidir(itens: readonly ItemSelecionavel[], atual: string): string {
  const i = itens.findIndex(x => x.fitid === atual);
  if (i < 0) return atual;
  const depois = itens.slice(i + 1).find(x => !x.resolvida);
  if (depois) return depois.fitid;
  const antes = [...itens.slice(0, i)].reverse().find(x => !x.resolvida);
  return antes ? antes.fitid : atual;
}
