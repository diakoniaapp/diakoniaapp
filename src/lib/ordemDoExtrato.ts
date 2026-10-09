// ─── lib/ordemDoExtrato.ts — a ORDEM do extrato do banco, levada para os lançamentos (puro, testado) ───────────────────────────
//
// O extrato do banco traz as linhas de cada dia numa sequência (a do OFX e a do PDF; conferido: igual em 22 dos 24 dias de set/out de 2026 — as
// 2 diferenças eram conteúdo, não ordem). O sistema ordenava por data → entrada antes de saída → created_at → id, que dentro do mesmo tipo é
// arbitrário: o extrato do sistema não batia linha por linha com o do banco. `ordem_banco` guarda a POSIÇÃO da linha dentro do dia no extrato
// do banco (1 = primeira). O pareamento banco × sistema é o mesmo da Auditoria (marca do OFX → mesmo dia → …), que fecha com resíduo zero.
import type { LinhaBanco, Par } from "@/lib/auditoriaExtrato";

/** Numera as linhas por dia, na ordem em que vieram (a do arquivo do banco): 1, 2, 3… recomeçando a cada data. Não reordena. */
export function numerarPorDia<T extends { data: string }>(linhas: T[]): (T & { ordem: number })[] {
  const vistos = new Map<string, number>();
  return linhas.map(l => {
    const n = (vistos.get(l.data) ?? 0) + 1;
    vistos.set(l.data, n);
    return { ...l, ordem: n };
  });
}

export interface ItemDeOrdem { id: string; ordem: number }

/**
 * Para cada lançamento do sistema pareado com linha(s) do banco NO MESMO DIA, a ordem dessa linha no extrato do banco (a menor, se o par é agrupado).
 * Pares de dias diferentes ficam de fora: a posição "dentro do dia do banco" não diz nada sobre o outro dia — a linha segue pela regra de sempre.
 */
export function planejarOrdem(pares: Par[]): ItemDeOrdem[] {
  const out = new Map<string, number>();
  for (const p of pares) {
    const bancoComOrdem = p.banco.filter((b): b is LinhaBanco & { ordem: number } => typeof b.ordem === "number");
    if (bancoComOrdem.length === 0) continue;
    for (const s of p.sistema) {
      const doMesmoDia = bancoComOrdem.filter(b => b.data === s.data);
      if (doMesmoDia.length === 0) continue;
      const ordem = Math.min(...doMesmoDia.map(b => b.ordem));
      const antes = out.get(s.id);
      out.set(s.id, antes === undefined ? ordem : Math.min(antes, ordem));
    }
  }
  return [...out].map(([id, ordem]) => ({ id, ordem }));
}
