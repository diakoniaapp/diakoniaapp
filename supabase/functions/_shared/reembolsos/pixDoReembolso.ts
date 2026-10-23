// ─── pixDoReembolso — o meio de pagamento do reembolso é o de QUEM RECEBE, nunca o do fornecedor da nota (puro: sem rede) ───────────────────────────────────────────────────────
//
// Pedido dela (23/10/2026): no e-mail diário, o reembolso a pagar traz a informação de pagamento de quem vai receber o dinheiro (o terceiro que quitou a despesa), e não a do prestador. A chave vem de
// `resumo_reembolsos_a_pagar()` já resolvida para a pessoa/favorecido que RECEBE; aqui só vira texto — o fornecedor da nota não tem como entrar, porque este módulo nem recebe o Pix dele.
import { formatarChavePix, montarPayloadPix, type TipoChavePix } from "../pagamentos/pix.ts";
import { quemRecebe, type ReembolsoParaExibir } from "./apresentacao.ts";

export const AVISO_SEM_PIX = "sem chave Pix cadastrada — pague pela forma combinada com quem recebe (espécie, com recibo assinado, ou transferência) e registre no DiakoniaApp";

export interface PixDoReembolso {
  /** "Pix de Lúcio" */
  rotulo: string;
  /** a chave como a pessoa a conhece (CPF com pontos, telefone com DDD…) */
  chave: string;
  /** o "copia e cola" já com o valor do reembolso; nulo se a chave não deu para codificar */
  copiaECola: string | null;
}

const tiposValidos = ["cpf", "cnpj", "telefone", "email", "aleatoria"];
const tipoDaChave = (t?: string | null): TipoChavePix | null => (t && tiposValidos.includes(t) ? (t as TipoChavePix) : null);

/**
 * Regra dela (23/10/2026): se a conta de onde o reembolso sai NÃO é o Bradesco, o pagamento é SEMPRE em espécie (caixa físico) — não adianta mostrar Pix.
 * Só vale com a conta conhecida: conta "a definir" (despesa na conta estrutural das ofertas) não permite concluir nada, e o e-mail segue mostrando o Pix, se houver.
 * "Banco" é pelo NOME da conta (Bradesco ou "Banco…"), o mesmo critério do aviso de extrato (`ehContaDeBanco`): conta de banco nova precisa ter um desses nomes.
 */
export const ehContaBancariaDoReembolso = (nome: string): boolean => /bradesco|banco/i.test(nome);
export function pagamentoEmEspecie(r: Pick<ReembolsoParaExibir, "conta_prevista">): boolean {
  const conta = r.conta_prevista?.trim();
  return !!conta && !ehContaBancariaDoReembolso(conta);
}

/** A frase do e-mail: dinheiro do caixa, com o Recibo de Reembolso assinado que a Política exige em espécie. */
export const textoEmEspecie = (r: Pick<ReembolsoParaExibir, "conta_prevista">): string =>
  `pagamento em ESPÉCIE, retirado da conta ${r.conta_prevista!.trim()} — colher o recibo de reembolso assinado por quem recebe`;

/** O Pix de quem recebe; nulo quando o cadastro dele não tem chave. */
export function pixDoReembolso(r: ReembolsoParaExibir): PixDoReembolso | null {
  const chave = r.chave_pix?.trim();
  if (!chave) return null;
  const tipo = tipoDaChave(r.tipo_chave_pix);
  let copiaECola: string | null = null;
  try {
    copiaECola = montarPayloadPix({ chave, tipoChave: tipo, nomeRecebedor: quemRecebe(r), valor: r.valor });
  } catch {
    copiaECola = null;
  }
  return { rotulo: `Pix de ${quemRecebe(r)}`, chave: formatarChavePix(chave, tipo), copiaECola };
}
