// ─── lib/ofxCandidatas.ts — o OFX nunca cria uma despesa nova em silêncio quando existe uma obrigação candidata (puro, testado) ──────────────
//
// Decisão D3 (13/10/2026): quando uma linha do extrato tem uma conta em aberto compatível, ela nunca é ligada sozinha E nunca vira lançamento novo sem
// que a tesouraria diga, com um clique, "é outro pagamento". Foi o clique sem aviso em "registrar como novo" que duplicou Ana, Carlos e Denise.
//
// Quais linhas pedem esse clique: as que seguem como "nova" (a análise não teve certeza o bastante para propor a liquidação) mas trazem a DICA de um
// documento a pagar provável. As que a análise já propõe como liquidação ("documento") não criam lançamento — só liquidam, no diálogo próprio.

import type { DocumentoDoExtrato } from "@/lib/documentoDoExtrato";

export interface LinhaParaGuarda {
  tx: { fitid: string; tipo: string; valor: number; data: string; memo: string };
  situacao: string;
  documentos?: DocumentoDoExtrato[];
}

/** O documento a pagar mais provável de uma linha que vai virar lançamento NOVO; null quando não há candidato (ou a linha não cria nada novo). */
export function candidataDaLinha(l: Pick<LinhaParaGuarda, "situacao" | "documentos">): DocumentoDoExtrato | null {
  return l.situacao === "nova" && l.documentos && l.documentos.length > 0 ? l.documentos[0] : null;
}

export interface PedidoDeConfirmacao {
  fitid: string;
  /** o que o extrato diz */
  memo: string;
  valor: number;
  data: string;
  /** a conta em aberto que ele provavelmente pagou */
  conta: string;
  vencimento: string;
  valorDaConta: number;
  /** o valor do extrato é exatamente o da conta */
  exato: boolean;
}

/**
 * Das linhas que estão para virar lançamento novo, as que têm candidata e ainda NÃO foram reconhecidas como "outro pagamento" pela tesouraria.
 * `reconhecidas` = os FITIDs em que ela já disse "criar mesmo assim" — a pergunta não se repete.
 */
export function pedidosDeConfirmacao(linhas: LinhaParaGuarda[], reconhecidas: { has(fitid: string): boolean }): PedidoDeConfirmacao[] {
  const out: PedidoDeConfirmacao[] = [];
  for (const l of linhas) {
    const c = candidataDaLinha(l);
    if (!c || reconhecidas.has(l.tx.fitid)) continue;
    out.push({
      fitid: l.tx.fitid, memo: l.tx.memo, valor: l.tx.valor, data: l.tx.data,
      conta: c.documento.fornecedor_nome ?? c.documento.descricao ?? "conta a pagar", vencimento: c.documento.data, valorDaConta: c.documento.valor, exato: c.exato,
    });
  }
  return out;
}
