// ─── itensDoDia — das obrigações que o banco devolve ao "item de pagamento" do e-mail diário (puro: sem rede, sem Deno) ───────────────────────────────────
//
// É a versão SERVIDOR de `lerItem` (services/envioDePagamentosService.ts), com as MESMAS regras do "Preparar envio", mas lendo só o que já está no banco:
//   · o documento: a leitura que ficou guardada no anexo (`dados_extraidos`, versão 1) — o servidor NÃO lê PDF (a leitura do QR Code precisa desenhar a página num canvas);
//   · ordem do meio de pagamento (a que ela aprovou em 20/10/2026): 1 linha digitável do documento · 2 Pix do documento · 3 Pix do cadastro do favorecido LIGADO à obrigação;
//   · diferente do envio manual: o palpite pelo NOME do favorecido NÃO existe aqui. Lá a tesoureira confirma na tela; um e-mail automático não tem quem confirme, então sem favorecido ligado
//     não há Pix de cadastro (o item cai em "sem meio automático").
// Cada item vai para UMA seção do e-mail (`secaoDoItem`): pagar · conferir antes · sem meio · sigiloso.
import { entraNoZip, montarItemDeEnvio, type ItemDeEnvio } from "./envioDePagamentos.ts";
import { montarPayloadPix, type TipoChavePix } from "./pix.ts";

/** Tipos de anexo que se pagam (os mesmos de `documentoPagamentoService`). */
export const TIPOS_QUE_SE_PAGAM: readonly string[] = ["boleto", "guia", "fatura", "outro", "documento"];
const MAX_DOCUMENTOS = 3;

export interface AnexoDoDia { tipo: string; nome: string | null; dados: Record<string, any> | null }

/** Uma obrigação como `resumo_diario_dados()` (SQL) a devolve. */
export interface CandidataDoDia {
  id: string; data: string; valor: number; dias_para_vencer: number;
  fornecedor_id: string | null; fornecedor_nome: string | null; pessoa_nome: string | null; descricao: string | null;
  categoria: string | null; centro: string | null; chave_pix: string | null; tipo_chave_pix: string | null;
  /** quando esta obrigação foi listada pela última vez num resumo diário enviado */
  ultimo_envio: string | null;
  anexos: AnexoDoDia[];
}

export interface ItemDoDia extends ItemDeEnvio { diasParaVencer: number; ultimoEnvio: string | null }
export type SecaoDoDia = "pagar" | "conferir" | "sem_meio" | "sigiloso";

interface DocumentoLido { linhaDigitavel: string | null; pix: string | null; valor: number | null; vencimento: string | null; codigoValido: boolean | null }

/** A leitura GUARDADA de um anexo (a mesma regra de `dadosDeGuardado`: só a versão 1). */
function lerGuardado(g: Record<string, any> | null | undefined): DocumentoLido | null {
  if (!g || g.versao !== 1) return null;
  return {
    linhaDigitavel: g.linhaDigitavel ?? null, pix: g.pix?.payload ?? null, valor: g.valor ?? null,
    vencimento: g.vencimento ?? null, codigoValido: g.codigoValido ?? null,
  };
}

export function itemDoDia(c: CandidataDoDia): ItemDoDia {
  const fornecedor = c.fornecedor_nome || c.pessoa_nome || c.descricao || c.categoria || "Sem favorecido";
  const docs = c.anexos.filter(a => TIPOS_QUE_SE_PAGAM.includes(a.tipo)).map(a => lerGuardado(a.dados)).filter((d): d is DocumentoLido => d !== null).slice(0, MAX_DOCUMENTOS);
  const comLinha = docs.find(d => d.linhaDigitavel);
  const comPix = docs.find(d => d.pix);
  const doc = comLinha ?? comPix ?? docs[0] ?? null;

  let pix: string | null = comLinha ? null : comPix?.pix ?? null;
  let origemDoPix: "documento" | "cadastro" | null = pix ? "documento" : null;
  let favorecidoDoPix: string | null = null;
  if (!comLinha && !pix && c.fornecedor_id && (c.chave_pix ?? "").trim()) {
    try {
      pix = montarPayloadPix({ chave: c.chave_pix!, tipoChave: c.tipo_chave_pix as TipoChavePix | null, nomeRecebedor: c.fornecedor_nome ?? fornecedor, valor: Number(c.valor) });
      origemDoPix = "cadastro"; favorecidoDoPix = c.fornecedor_nome;
    } catch { /* chave inválida: sem Pix */ }
  }

  const item = montarItemDeEnvio(
    { id: c.id, fornecedor, descricao: c.descricao, categoria: c.categoria, centro: c.centro, valor: Number(c.valor), vencimento: String(c.data).slice(0, 10), diasParaVencer: c.dias_para_vencer },
    {
      linha: comLinha?.linhaDigitavel ?? null, pix, origemDoPix, favorecidoDoPix, documentos: c.anexos.filter(a => entraNoZip(a.tipo)).length,
      valorDoDocumento: doc?.valor ?? null, vencimentoDoDocumento: doc?.vencimento ? String(doc.vencimento).slice(0, 10) : null, codigoValido: comLinha?.codigoValido ?? null,
    },
  );
  return { ...item, diasParaVencer: c.dias_para_vencer, ultimoEnvio: c.ultimo_envio };
}

/** Atrasadas primeiro (a mais antiga antes), depois as de hoje e as dos próximos dias; no mesmo dia, o maior valor primeiro. */
export const ordemDoDia = (a: ItemDoDia, b: ItemDoDia) => a.vencimento.localeCompare(b.vencimento) || b.valor - a.valor || a.fornecedor.localeCompare(b.fornecedor, "pt-BR");

export function montarItensDoDia(candidatas: readonly CandidataDoDia[]): ItemDoDia[] {
  return candidatas.map(itemDoDia).sort(ordemDoDia);
}

/**
 * Para onde o item vai no e-mail:
 *  · sigiloso (prebenda, folha, Sustento, RPA) — fora do corpo;
 *  · sem meio automático — "pague pelo documento";
 *  · com meio, mas valor ou código do documento diferem da obrigação (o que decide o dinheiro) — "conferir antes": o código NÃO vai, para ninguém pagar errado por pressa;
 *  · com meio e sem divergência — "pagar". Só a data do boleto diferente da da obrigação apenas informa (como no envio manual).
 */
export function secaoDoItem(i: ItemDeEnvio): SecaoDoDia {
  if (i.grupo === "sigiloso") return "sigiloso";
  if (i.grupo === "sem_dado") return "sem_meio";
  return i.avisos.some(a => !a.startsWith("o boleto vence")) ? "conferir" : "pagar";
}
