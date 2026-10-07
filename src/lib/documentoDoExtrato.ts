// ─── lib/documentoDoExtrato.ts — qual documento a pagar uma linha do extrato (OFX) quitou? ─────────────────
//
// Pedido dela (06/10/2026): quando o pagamento vem do OFX e o valor é DIFERENTE do documento, abrir o fluxo de
// divergência (Documento R$ 1.418,00 × OFX R$ 1.538,00 → ⚠ Diferença R$ 120,00 → Juros/Multa/Outro documento/Ajuste).
//
// Antes, uma saída do extrato sem lançamento realizado virava "nova": o sistema criava OUTRO lançamento e o previsto
// ficava aberto. Aqui se procura o PREVISTO que a linha provavelmente pagou — só como SUGESTÃO: quem confirma é a
// pessoa, no diálogo (nada é liquidado sozinho).
//
// Dois níveis de certeza, porque o texto do extrato nem sempre diz quem foi pago (medido: boleto aparece como
// "PAGTO ELETRON COBRANCA PAG COBRANCA NET EMPRESA", sem nome nenhum):
//   · COM favorecido identificado: mesmo favorecido, vencimento a até 20 dias, valor de 50% a 150% do documento;
//   · SEM favorecido (texto genérico): vencimento a até 5 dias e valor de 85% a 115% do documento — `incerto`.
// Exatos primeiro, depois o vencimento mais próximo.

export interface PrevistoParaExtrato {
  id: string;
  valor: number;
  /** vencimento AAAA-MM-DD */
  data: string;
  fornecedor_id: string | null;
  descricao?: string | null;
  fornecedor_nome?: string | null;
}

export interface DocumentoDoExtrato {
  documento: PrevistoParaExtrato;
  /** pago − documento (positivo = pagou a mais). */
  diferenca: number;
  exato: boolean;
  /** O texto do extrato não identificou o favorecido: só valor e data apontam para este documento. */
  incerto: boolean;
}

const JANELA_COM_FAVORECIDO = 20;
const JANELA_SEM_FAVORECIDO = 5;
const c = (n: number) => Math.round(n * 100) / 100;
const dias = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000));

export function acharDocumentosDoExtrato(
  tx: { valor: number; data: string; tipo: string },
  previstos: PrevistoParaExtrato[],
  fornecedorId: string | null | undefined,
  jaUsados: ReadonlySet<string> = new Set(),
): DocumentoDoExtrato[] {
  if (tx.tipo !== "saida" || !(tx.valor > 0)) return [];
  const incerto = !fornecedorId;
  const janela = incerto ? JANELA_SEM_FAVORECIDO : JANELA_COM_FAVORECIDO;
  const [min, max] = incerto ? [0.85, 1.15] : [0.5, 1.5];
  return previstos
    .filter(p => (incerto || p.fornecedor_id === fornecedorId) && !jaUsados.has(p.id) && p.valor > 0
      && dias(p.data, tx.data) <= janela && tx.valor >= p.valor * min && tx.valor <= p.valor * max)
    .map(p => ({ documento: p, diferenca: c(tx.valor - p.valor), exato: Math.abs(tx.valor - p.valor) < 0.005, incerto }))
    .sort((a, b) => Number(b.exato) - Number(a.exato) || dias(a.documento.data, tx.data) - dias(b.documento.data, tx.data))
    .slice(0, 5);
}
