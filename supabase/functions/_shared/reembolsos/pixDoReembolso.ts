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
