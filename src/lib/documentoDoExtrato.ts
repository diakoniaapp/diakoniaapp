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
  /** favorecido-PESSOA (pastor, funcionário): a obrigação também é achada por ele */
  pessoa_id?: string | null;
  descricao?: string | null;
  fornecedor_nome?: string | null;
  /** a recorrência (contrato) que gerou este previsto, quando há */
  recorrencia_id?: string | null;
}

/** Um contrato ativo do favorecido (uma recorrência): o valor habitual e o nome que o distingue (ex.: "Templo"). */
export interface ContratoDoFornecedor { recorrenciaId: string; rotulo: string; valor: number; valorVariavel?: boolean }

export interface DocumentoDoExtrato {
  documento: PrevistoParaExtrato;
  /** pago − documento (positivo = pagou a mais). */
  diferenca: number;
  exato: boolean;
  /** O texto do extrato não identificou o favorecido: só valor e data apontam para este documento. */
  incerto: boolean;
  /** 0–100 */
  confianca: number;
  /** o nome do contrato (descrição do documento / rótulo da recorrência) */
  contrato: string | null;
  /** o valor bate com ESTE documento e o favorecido tem OUTRO documento aberto (outro contrato): possível segundo contrato */
  segundoContrato: boolean;
  /** vários documentos abertos do mesmo favorecido e nenhum com o valor do extrato: a tesouraria escolhe o contrato (não é desconto) */
  ambiguo: boolean;
  /** os outros documentos abertos do mesmo favorecido — os demais contratos, para mostrar lado a lado */
  outrosAbertos: PrevistoParaExtrato[];
  /** o valor do extrato é o valor habitual de um contrato que NÃO tem documento aberto (não é desconto nem parcial) */
  contratoSemDocumento: ContratoDoFornecedor | null;
  motivo: string;
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
  contratos: ContratoDoFornecedor[] = [],
): DocumentoDoExtrato[] {
  if (tx.tipo !== "saida" || !(tx.valor > 0)) return [];
  const incerto = !fornecedorId;
  const janela = incerto ? JANELA_SEM_FAVORECIDO : JANELA_COM_FAVORECIDO;
  const [min, max] = incerto ? [0.85, 1.15] : [0.5, 1.5];
  const candidatos = previstos
    .filter(p => (incerto || p.fornecedor_id === fornecedorId || p.pessoa_id === fornecedorId) && !jaUsados.has(p.id) && p.valor > 0
      && dias(p.data, tx.data) <= janela && tx.valor >= p.valor * min && tx.valor <= p.valor * max);

  // Os documentos ABERTOS do mesmo favorecido (qualquer valor), no mesmo entorno: são os outros contratos. Antes de chamar uma
  // diferença de "desconto" ou "pagamento parcial", é preciso olhar se o valor pertence a OUTRO documento/contrato dele.
  const abertos = incerto ? [] : previstos.filter(p => (p.fornecedor_id === fornecedorId || p.pessoa_id === fornecedorId) && !jaUsados.has(p.id) && p.valor > 0 && dias(p.data, tx.data) <= JANELA_COM_FAVORECIDO);
  const contratoDoValor = incerto ? null : contratos.find(k => !k.valorVariavel && Math.abs(k.valor - tx.valor) < 0.005) ?? null;
  const exatos = candidatos.filter(p => Math.abs(tx.valor - p.valor) < 0.005);
  const muitosAbertos = abertos.length >= 2;

  const ordenados = [...candidatos].sort((a, b) =>
    Number(Math.abs(tx.valor - b.valor) < 0.005) - Number(Math.abs(tx.valor - a.valor) < 0.005)
    || Math.abs(tx.valor - a.valor) - Math.abs(tx.valor - b.valor)
    || dias(a.data, tx.data) - dias(b.data, tx.data));

  return ordenados.slice(0, 5).map((p): DocumentoDoExtrato => {
    const exato = Math.abs(tx.valor - p.valor) < 0.005;
    const outros = abertos.filter(o => o.id !== p.id);
    const nome = p.descricao ?? null;
    const outroContrato = outros.length > 0 && (contratos.length >= 2 || outros.some(o => o.recorrencia_id && o.recorrencia_id !== p.recorrencia_id) || outros.some(o => Math.abs(o.valor - p.valor) >= 0.005));
    const segundoContrato = exato && !incerto && outroContrato;
    // sem valor igual e com vários documentos abertos: não decidir (nada de "desconto" automático) — a tesouraria escolhe o contrato
    const ambiguo = !exato && !incerto && muitosAbertos;
    const contratoSemDocumento = !exato && contratoDoValor && !abertos.some(a => a.recorrencia_id === contratoDoValor.recorrenciaId) ? contratoDoValor : null;
    let confianca: number, motivo: string;
    if (incerto) {
      confianca = exato ? 60 : 40;
      motivo = "o texto do extrato não identifica o favorecido: só o valor e a data apontam para este documento";
    } else if (exato) {
      confianca = exatos.length === 1 ? 98 : 90;
      motivo = exatos.length === 1
        ? (segundoContrato ? "o valor é igual ao deste documento, e o favorecido tem outro documento aberto (outro contrato)" : "o valor é igual ao do documento do mesmo favorecido")
        : "mais de um documento do favorecido tem este valor: vale o de vencimento mais próximo — confira o contrato";
    } else if (ambiguo) {
      confianca = 50;
      motivo = `o favorecido tem ${abertos.length} documentos em aberto e nenhum com este valor — escolha o contrato${contratoSemDocumento ? `; o valor é o do contrato «${contratoSemDocumento.rotulo}», que não tem documento aberto` : ""}`;
    } else {
      confianca = contratoSemDocumento ? 55 : 70;
      motivo = contratoSemDocumento
        ? `o valor é o habitual do contrato «${contratoSemDocumento.rotulo}», que não tem documento aberto — pode não ser desconto nem pagamento parcial deste documento`
        : "um só documento aberto do favorecido: a diferença é desconto, juros, multa ou pagamento parcial";
    }
    return { documento: p, diferenca: c(tx.valor - p.valor), exato, incerto, confianca, contrato: nome, segundoContrato, ambiguo, outrosAbertos: outros, contratoSemDocumento, motivo };
  });
}

/**
 * O pagamento do extrato deve virar "Liquidar obrigação prevista" (e não um lançamento novo)? Sim quando o favorecido é certo, OU quando,
 * mesmo com texto genérico de boleto, há UM só documento de valor IGUAL a até 5 dias (medido em 08/10/2026: 10 pagamentos assim foram
 * lançados como novos e as obrigações seguiram abertas na Mesa de Operações). Valor diferente sem favorecido continua só como dica.
 */
export function valeComoLiquidacao(documentos: DocumentoDoExtrato[]): boolean {
  if (documentos.length === 0) return false;
  if (!documentos[0].incerto) return true;
  return documentos[0].exato && documentos.filter(d => d.exato).length === 1;
}
