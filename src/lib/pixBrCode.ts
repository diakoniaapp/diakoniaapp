// ─── pixBrCode.ts — LER um BR Code / "Pix copia e cola" (o contrário de montarPayloadPix) ───
//
// `pix.ts` MONTA o payload para a igreja cobrar/pagar um fornecedor. Aqui o caminho inverso: um
// boleto híbrido, uma fatura ou uma guia traz o "Pix copia e cola" (ou o QR Code, que é o mesmo
// texto em desenho) e o sistema lê dele quem recebe, quanto e a chave — sem digitar nada.
//
// Formato (Manual de Padrões para Iniciação do Pix, Bacen): sequência TLV — id de 2 dígitos,
// tamanho de 2 dígitos, valor —, terminando em `6304` + CRC16-CCITT de tudo até ali. O CRC é a
// prova de que o texto veio inteiro: um PDF que quebrou a linha no meio ou um OCR que trocou um
// caractere NÃO passa, e aí o sistema avisa em vez de oferecer um Pix errado para pagar.

import { crc16ccitt } from "./pix";

export interface PixLido {
  /** O texto completo, sem espaços/quebras — o que vai no "copiar". */
  payload: string;
  /** Chave Pix (estático) ou null (dinâmico: o dado está na URL). */
  chave: string | null;
  /** URL do payload dinâmico (`pix.exemplo.com/qr/...`), sem esquema. */
  url: string | null;
  valor: number | null;
  nomeRecebedor: string | null;
  cidade: string | null;
  txid: string | null;
  /** `true` = o CRC16 confere; `false` = texto adulterado/incompleto. */
  crcValido: boolean;
}

/** TLV simples; devolve `null` se o tamanho declarado passa do fim (texto cortado). */
function lerTlv(texto: string): Map<string, string> | null {
  const m = new Map<string, string>();
  let i = 0;
  while (i < texto.length) {
    if (i + 4 > texto.length) return null;
    const id = texto.slice(i, i + 2);
    const tam = Number(texto.slice(i + 2, i + 4));
    if (!Number.isInteger(tam) || !/^\d{2}$/.test(id)) return null;
    if (i + 4 + tam > texto.length) return null;
    m.set(id, texto.slice(i + 4, i + 4 + tam));
    i += 4 + tam;
  }
  return m;
}

/** As formas de "limpar" o texto que um PDF/OCR entrega: o nome do recebedor TEM espaços
 *  ("LIGHT SERVICOS") e as quebras de linha podem ter comido (ou inventado) um espaço. */
function variantes(bruto: string): string[] {
  const t = bruto.trim();
  return [...new Set([t.replace(/[\r\n]+/g, ""), t.replace(/[\r\n]+/g, " ").replace(/ {2,}/g, " "), t.replace(/\s+/g, "")])];
}

/** Lê um BR Code. `null` quando nem a estrutura básica (`000201` … `6304XXXX`) está lá. */
export function lerPixBrCode(bruto: string): PixLido | null {
  let primeiro: PixLido | null = null;
  for (const v of variantes(bruto)) {
    const lido = lerPayload(v);
    if (!lido) continue;
    if (lido.crcValido) return lido;
    primeiro ??= lido;
  }
  return primeiro;
}

function lerPayload(payload: string): PixLido | null {
  if (!/^000201/.test(payload)) return null;
  const fim = payload.match(/6304([0-9A-Fa-f]{4})$/);
  if (!fim) return null;
  const crcValido = crc16ccitt(payload.slice(0, -4)) === fim[1].toUpperCase();
  const campos = lerTlv(payload);
  if (!campos) return null;

  // a conta do recebedor mora num template 26–51 cujo sub-campo 00 é "br.gov.bcb.pix"
  let chave: string | null = null, url: string | null = null;
  for (let id = 26; id <= 51; id++) {
    const conteudo = campos.get(String(id));
    if (!conteudo) continue;
    const sub = lerTlv(conteudo);
    if (!sub || !/br\.gov\.bcb\.pix/i.test(sub.get("00") ?? "")) continue;
    chave = sub.get("01") ?? null;
    url = sub.get("25") ?? null;
    break;
  }
  if (!chave && !url) return null;

  const valorTexto = campos.get("54");
  const valor = valorTexto && /^\d+(\.\d{1,2})?$/.test(valorTexto) ? Number(valorTexto) : null;
  const adicional = campos.get("62") ? lerTlv(campos.get("62")!) : null;
  const txid = adicional?.get("05") ?? null;

  return {
    payload, chave, url, valor: valor && valor > 0 ? valor : null,
    nomeRecebedor: campos.get("59") ?? null, cidade: campos.get("60") ?? null,
    txid: txid && txid !== "***" ? txid : null, crcValido,
  };
}

/**
 * Acha um "Pix copia e cola" dentro do texto de um PDF/OCR — mesmo quebrado em várias linhas ou
 * com espaços no meio. Devolve só o que TERMINA em `6304` + 4 hex.
 */
export function acharPixNoTexto(texto: string): PixLido | null {
  let achado: PixLido | null = null;
  for (const v of [texto.replace(/[\r\n]+/g, ""), texto.replace(/[\r\n]+/g, " "), texto.replace(/\s+/g, "")]) {
    for (const m of v.matchAll(/000201[^\n]{20,800}?6304[0-9A-Fa-f]{4}/g)) {
      const lido = lerPixBrCode(m[0]);
      if (lido && (!achado || (lido.crcValido && !achado.crcValido))) achado = lido;
      if (achado?.crcValido) return achado;
    }
  }
  return achado;
}