// ─── lib/transferenciaOfx.ts — reconhecer, no extrato, o que é MOVIMENTO ENTRE CONTAS da própria igreja (puro, testado) ──
//
// Pedido dela (08/10/2026): "DEP DINHEIRO ATM" de R$ 535, 345, 500, 250 era oferecido como Oferta/Dízimo/Missões, mas muitas
// dessas entradas são o dinheiro do Caixa de Envelopes, da Caixinha ou do Caixa sendo depositado no banco — transferência
// interna, não receita. A ordem de tentativa do motor passa a ser: 1) transferência interna, 2) receita, 3) o resto.
//
// Como se reconhece: existe, em OUTRA conta, um lançamento de tipo oposto, mesmo valor (ao centavo), em data próxima, que ainda
// não faz parte de nenhum par de transferência. Entrada no banco ↔ saída do caixa; saída do banco ↔ entrada na aplicação.
// Só SUGERE: quem confirma é a tesouraria, e "não é transferência" devolve a linha à fila de receita/despesa.

/** Um lançamento de outra conta que poderia ser a outra perna. */
export interface CandidatoContraparte {
  id: string;
  contaId: string;
  contaNome: string;
  tipo: "entrada" | "saida";
  data: string;
  valor: number;
}

export interface ProvavelTransferencia {
  /** a OUTRA conta: origem se a linha do extrato é entrada, destino se é saída */
  contaId: string;
  contaNome: string;
  /** o lançamento da outra conta que será ligado (sem ele, a confirmação cria as duas pernas) */
  lancamentoId: string;
  data: string;
  valor: number;
  /** 0–100 */
  confianca: number;
  /** outras contas com um lançamento igualmente compatível: pede confirmação com mais atenção */
  outras: { contaId: string; contaNome: string }[];
}

/** A outra conta da transferência e, se já existe, o lançamento dela que será ligado a esta linha do extrato. */
export interface OutraPonta { contaId: string; contaNome: string; lancamentoId?: string }

/** O que a tesouraria decidiu, na própria linha, sobre ela ser (ou não) uma transferência. */
export interface EscolhaDeTransferencia {
  /** a outra conta escolhida (ou a sugerida, confirmada) */
  transferirPara?: OutraPonta;
  /** "não é transferência": devolve a linha à fila de receita/despesa */
  naoETransferencia?: boolean;
  /** abriu o seletor de contas (Transferência entre contas) */
  abrirTransferencia?: boolean;
}

/**
 * A linha está sendo tratada como transferência? Para qual conta? Vale o que a pessoa escolheu; senão o que o motor sugeriu
 * (se a sugestão marcou a linha como transferência e ainda não foi descartada).
 */
export function alvoDaTransferencia(
  sugeridaComoTransferencia: boolean, provavel: ProvavelTransferencia | undefined, e?: EscolhaDeTransferencia,
): { modo: boolean; alvo: OutraPonta | null; sugerida: boolean } {
  const sugerida = sugeridaComoTransferencia && !e?.naoETransferencia;
  const modo = sugerida || !!e?.abrirTransferencia || !!e?.transferirPara;
  if (e?.transferirPara) return { modo: true, alvo: e.transferirPara, sugerida: false };
  if (sugerida && provavel) return { modo: true, alvo: { contaId: provavel.contaId, contaNome: provavel.contaNome, lancamentoId: provavel.lancamentoId }, sugerida: true };
  return { modo, alvo: null, sugerida };
}

export interface LinhaParaTransferencia {
  fitid: string;
  tipo: "entrada" | "saida";
  data: string;
  valor: number;
  memo: string;
  /** o motor já identificou uma pessoa/fornecedor: um PIX de alguém pesa contra "ser transferência" */
  temFavorecido: boolean;
}

/** Quantos dias de diferença o banco leva para compensar um depósito/transferência que a tesouraria lançou antes. */
export const JANELA_DE_DIAS = 5;

/** Depósito em dinheiro / envelope / caixa eletrônico: a marca de dinheiro vivo que saiu de um caixa da igreja. */
export function ehDepositoEmDinheiro(memo: string): boolean {
  const t = memo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /\bdep(osito)?\.?\s+(em\s+)?(dinheiro|especie|envelope|caixa)\b|\bdep\s+dinheiro\b|\bcaixa\s+eletronico\b|\batm\b|\benvelope\b/.test(t);
}

const diasEntre = (a: string, b: string) =>
  Math.abs(Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86_400_000));

function confiancaPorDias(dias: number): number {
  return dias === 0 ? 95 : dias === 1 ? 92 : dias <= 3 ? 85 : 75;
}

/**
 * Casa cada linha do extrato com, no máximo, UMA perna de outra conta; cada perna serve a uma só linha (a de menor
 * diferença de dias fica com ela). Devolve fitid → transferência provável.
 */
export function acharContrapartes(
  linhas: LinhaParaTransferencia[], candidatos: CandidatoContraparte[],
): Map<string, ProvavelTransferencia> {
  const pares: { fitid: string; cand: CandidatoContraparte; dias: number }[] = [];
  const porLinha = new Map<string, CandidatoContraparte[]>();
  for (const l of linhas) {
    for (const c of candidatos) {
      if (c.tipo === l.tipo) continue;                                  // a outra perna é do tipo oposto
      if (Math.abs(c.valor - l.valor) >= 0.005) continue;
      const dias = diasEntre(c.data, l.data);
      if (dias > JANELA_DE_DIAS) continue;
      pares.push({ fitid: l.fitid, cand: c, dias });
      porLinha.set(l.fitid, [...(porLinha.get(l.fitid) ?? []), c]);
    }
  }
  pares.sort((a, b) => a.dias - b.dias);
  const usadas = new Set<string>(), resolvidas = new Set<string>();
  const out = new Map<string, ProvavelTransferencia>();
  const porFitid = new Map(linhas.map(l => [l.fitid, l]));
  for (const p of pares) {
    if (resolvidas.has(p.fitid) || usadas.has(p.cand.id)) continue;
    const l = porFitid.get(p.fitid)!;
    const todas = (porLinha.get(p.fitid) ?? []).filter(c => c.id !== p.cand.id && !usadas.has(c.id));
    const outras = [...new Map(todas.filter(c => c.contaId !== p.cand.contaId).map(c => [c.contaId, { contaId: c.contaId, contaNome: c.contaNome }])).values()];
    let confianca = confiancaPorDias(p.dias);
    if (outras.length > 0) confianca -= 10;                              // mais de uma conta serviria: confirmar com atenção
    if (l.temFavorecido && !ehDepositoEmDinheiro(l.memo)) confianca = Math.min(confianca, 70);   // PIX de alguém conhecido: provavelmente é receita
    resolvidas.add(p.fitid); usadas.add(p.cand.id);
    out.set(p.fitid, {
      contaId: p.cand.contaId, contaNome: p.cand.contaNome, lancamentoId: p.cand.id, data: p.cand.data, valor: p.cand.valor, confianca, outras,
    });
  }
  return out;
}
