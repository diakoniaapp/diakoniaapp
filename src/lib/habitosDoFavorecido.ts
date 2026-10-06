// ─── habitosDoFavorecido.ts — o que o histórico já ensinou sobre um favorecido ──────
//
// Pedido da Telma (06/10/2026): ao escolher o favorecido de uma recorrência, mostrar "último
// pagamento, último valor, categoria habitual, centro habitual" — e, dos documentos que ele já
// teve (RPA, comprovantes PIX), sugerir os tipos. Sem tabela nova: é só o histórico de
// lançamentos pagos, resumido aqui (puro, testado).

export interface PagamentoDoHistorico {
  /** Dia em que foi pago (data_pagamento ?? data). */
  dia: string;
  valor: number;
  categoriaId: string | null;
  centroId: string | null;
  formaPagamento?: string | null;
  /** Os tipos dos anexos desse lançamento (nf, rpa, comprovante…). */
  tiposDeDocumento: string[];
}

export interface HabitosDoFavorecido {
  pagamentos: number;
  ultimoDia: string;
  ultimoValor: number;
  categoriaId: string | null;
  centroId: string | null;
  formaPagamento: string | null;
  /** Tipos de documento mais frequentes nos pagamentos mais recentes, do mais ao menos comum. */
  documentos: { tipo: string; vezes: number }[];
}

/** Quantos dos pagamentos mais recentes entram na conta dos documentos. */
export const PAGAMENTOS_PARA_DOCUMENTOS = 6;
/** E na do que é "habitual" (categoria, centro, forma). */
export const PAGAMENTOS_PARA_HABITO = 12;

/** O valor mais frequente; empate vai para o mais recente (a lista vem do mais novo ao mais velho). */
function maisFrequente<T extends string>(valores: (T | null | undefined)[]): T | null {
  const conta = new Map<T, { n: number; primeira: number }>();
  valores.forEach((v, i) => {
    if (!v) return;
    const c = conta.get(v);
    if (c) c.n += 1; else conta.set(v, { n: 1, primeira: i });
  });
  let melhor: { v: T; n: number; primeira: number } | null = null;
  for (const [v, c] of conta) {
    if (!melhor || c.n > melhor.n || (c.n === melhor.n && c.primeira < melhor.primeira)) melhor = { v, ...c };
  }
  return melhor?.v ?? null;
}

export function resumirHabitos(pagamentos: PagamentoDoHistorico[]): HabitosDoFavorecido | null {
  if (pagamentos.length === 0) return null;
  const recentes = [...pagamentos].sort((a, b) => b.dia.localeCompare(a.dia));
  const habito = recentes.slice(0, PAGAMENTOS_PARA_HABITO);
  const contaDocs = new Map<string, number>();
  for (const p of recentes.slice(0, PAGAMENTOS_PARA_DOCUMENTOS)) {
    // um tipo conta uma vez por pagamento (dois comprovantes no mesmo pagamento = um)
    for (const t of new Set(p.tiposDeDocumento)) contaDocs.set(t, (contaDocs.get(t) ?? 0) + 1);
  }
  return {
    pagamentos: pagamentos.length,
    ultimoDia: recentes[0].dia,
    ultimoValor: recentes[0].valor,
    categoriaId: maisFrequente(habito.map(p => p.categoriaId)),
    centroId: maisFrequente(habito.map(p => p.centroId)),
    formaPagamento: maisFrequente(habito.map(p => p.formaPagamento)),
    documentos: [...contaDocs.entries()].map(([tipo, vezes]) => ({ tipo, vezes })).sort((a, b) => b.vezes - a.vezes || a.tipo.localeCompare(b.tipo)),
  };
}
