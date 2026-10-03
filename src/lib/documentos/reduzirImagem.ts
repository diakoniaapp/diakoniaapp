// ─── lib/documentos/reduzirImagem.ts — foto grande, só na cópia do dossiê ─────
//
// Decisão dela (03/10/2026): reduzir foto grande APENAS na cópia criada para o
// Dossiê Contábil; o PDF, JPG e PNG guardados no sistema nunca são alterados. Esta
// função recebe bytes e devolve bytes novos — não escreve em lugar nenhum.
//
// Regras:
//   · lado maior até 1.600 px: fica como está (a menos que o JPEG tenha rotação
//     EXIF, que o pdf-lib ignora: foto de celular em pé sairia deitada no PDF);
//   · maior que isso: redesenhada no canvas com o lado maior em 1.600 px;
//   · JPG sai como JPEG qualidade 0,85; PNG continua PNG (pode ter transparência).
// Precisa de navegador (createImageBitmap + canvas). Em teste, injete outra função.

import type { Reducao, ReduzirImagem } from "@/lib/documentos/dossiePdf";

export const LADO_MAXIMO = 1600;
const QUALIDADE_JPEG = 0.85;

/** Orientação EXIF (1–8) de um JPEG; `1` se não houver. Só lê o cabeçalho. */
export function orientacaoExif(b: Uint8Array): number {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) return 1;
    const marcador = b[i + 1];
    const tam = (b[i + 2] << 8) | b[i + 3];
    if (marcador === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
      const t = i + 10; // início do TIFF
      const le = b[t] === 0x49; // "II" = little-endian
      const u16 = (o: number) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (le
        ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
        : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      const ifd = t + u32(t + 4);
      const n = u16(ifd);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > b.length) return 1;
        if (u16(e) === 0x0112) return u16(e + 8) || 1;
      }
      return 1;
    }
    if (marcador === 0xda) return 1; // começou a imagem: sem EXIF
    i += 2 + tam;
  }
  return 1;
}

export const reduzirImagemNoNavegador: ReduzirImagem = async (bytes, formato, forcar = false): Promise<Reducao> => {
  const mime = formato === "png" ? "image/png" : "image/jpeg";
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const bitmap = await createImageBitmap(blob); // aplica a rotação EXIF por padrão
  const maior = Math.max(bitmap.width, bitmap.height);
  const girada = formato === "jpg" && orientacaoExif(bytes) !== 1;
  if (!forcar && !girada && maior <= LADO_MAXIMO) {
    bitmap.close();
    return { bytes, formato };
  }
  const escala = Math.min(1, LADO_MAXIMO / maior);
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); throw new Error("Canvas não suportado"); }
  if (formato === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); } // JPEG não tem transparência
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const saida: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("Falha ao reduzir a imagem"))), mime, QUALIDADE_JPEG));
  return { bytes: new Uint8Array(await saida.arrayBuffer()), formato };
};
