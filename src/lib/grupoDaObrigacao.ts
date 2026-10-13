// ─── lib/grupoDaObrigacao.ts — uma obrigação, várias parcelas, UM conjunto de documentos (puro, testado) ───────────────────────────────────
//
// Uma obrigação comum é uma linha de `fin_lancamentos`. Num pagamento PARCIAL a obrigação vira um grupo: a linha original continua (com o saldo ou
// já paga) e nascem outras, todas com `obrigacao_id` = a linha RAIZ (a original). O boleto da obrigação foi anexado à raiz; o comprovante de cada
// parcela, à parcela. Quem olha uma linha só enxerga metade do dossiê — por isso o detalhe da despesa lê o GRUPO (análise de 13/10/2026, Fase A-2).

export interface LinhaDoGrupo {
  id: string;
  obrigacao_id?: string | null;
  data: string;
  data_pagamento?: string | null;
  status: string;
  valor: number | string;
  comprovante_url?: string | null;
}

/** A linha raiz do grupo: a própria linha quando não há `obrigacao_id` (obrigação comum, ou ainda sem baixa parcial). */
export const raizDaObrigacao = (l: { id: string; obrigacao_id?: string | null }) => l.obrigacao_id ?? l.id;

export interface ParcelaDoGrupo { id: string; atual: boolean; raiz: boolean; data: string; valor: number; status: string }

/** As linhas do grupo em ordem de leitura (dia do pagamento, senão o vencimento); a raiz e a linha aberta ficam marcadas. */
export function parcelasDoGrupo(linhas: LinhaDoGrupo[], atualId: string, raizId: string): ParcelaDoGrupo[] {
  return linhas
    .map(l => ({ id: l.id, atual: l.id === atualId, raiz: l.id === raizId, data: String(l.data_pagamento ?? l.data).slice(0, 10), valor: Number(l.valor) || 0, status: l.status }))
    .sort((a, b) => a.data.localeCompare(b.data) || Number(b.raiz) - Number(a.raiz) || a.id.localeCompare(b.id));
}

/** "desta parcela" / "da parcela de 08/10" — de onde veio um anexo, para quem lê o dossiê do grupo. */
export function origemDoAnexo(lancamentoId: string, atualId: string, parcelas: ParcelaDoGrupo[]): string | null {
  if (lancamentoId === atualId || parcelas.length <= 1) return null;
  const p = parcelas.find(x => x.id === lancamentoId);
  if (!p) return null;
  const [, mes, dia] = p.data.split("-");
  return p.raiz ? "da obrigação" : `da parcela de ${dia}/${mes}`;
}

/**
 * De uma lista de linhas com `obrigacao_id`, quem tem IRMÃS: cada linha de um grupo com mais de uma linha aponta para as outras. A raiz entra no grupo
 * mesmo quando a consulta só trouxe as filhas (o `obrigacao_id` dela pode ser nulo). Linha sozinha não aparece no resultado.
 */
export function irmaosPorLinha(linhas: { id: string; obrigacao_id?: string | null }[]): Map<string, string[]> {
  const grupos = new Map<string, Set<string>>();
  for (const l of linhas) {
    if (!l.obrigacao_id) continue;
    const g = grupos.get(l.obrigacao_id) ?? new Set<string>([l.obrigacao_id]);
    g.add(l.id);
    grupos.set(l.obrigacao_id, g);
  }
  const irmaos = new Map<string, string[]>();
  for (const g of grupos.values()) {
    if (g.size < 2) continue;
    for (const id of g) irmaos.set(id, [...g].filter(x => x !== id));
  }
  return irmaos;
}
