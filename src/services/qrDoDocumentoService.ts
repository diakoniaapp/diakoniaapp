// ─── qrDoDocumentoService.ts — o QR Code do Pix que vem DESENHADO no boleto/fatura ───────────────────────
//
// Medido em 06/10/2026 na fatura da Localiza Fleet: o PDF diz "Escaneie o QR Code abaixo para fazer um Pix", mas o
// "copia e cola" NÃO está no texto — só a imagem do QR. `lerDocumentoDePagamento` (texto) devolvia `pix: null` e a
// tela do Pagar ficava sem Pix. Aqui o QR é LIDO da imagem (pdf.js desenha a página; ZXing decodifica) e o conteúdo
// passa pelo mesmo `lerPixBrCode` do restante do sistema (confere o CRC): QR que não seja Pix é ignorado.
//
// Só procura quando o texto não trouxe Pix. Roda no navegador (canvas); sem canvas/erro devolve `null` — nunca
// atrapalha o anexo nem o "Pagar".

import { BinaryBitmap, DecodeHintType, HybridBinarizer, NotFoundException, QRCodeReader } from "@zxing/library";
import { HTMLCanvasElementLuminanceSource } from "@zxing/library/esm/browser/HTMLCanvasElementLuminanceSource";
import { lerPixBrCode, type PixLido } from "@/lib/pixBrCode";

const ESCALAS = [2.5, 4]; // página inteira; se o QR for pequeno, de novo com mais resolução
const MAX_PAGINAS = 3;

function decodificar(canvas: HTMLCanvasElement): string | null {
  const leitor = new QRCodeReader();
  const dicas = new Map<DecodeHintType, unknown>([[DecodeHintType.TRY_HARDER, true]]);
  try {
    const bitmap = new BinaryBitmap(new HybridBinarizer(new HTMLCanvasElementLuminanceSource(canvas)));
    return leitor.decode(bitmap, dicas).getText();
  } catch (e) {
    if (e instanceof NotFoundException) return null;
    return null; // checksum/format: imagem ruim — tenta a próxima escala
  }
}

/** Lê o conteúdo de um QR numa imagem já desenhada; `null` se não houver um QR legível. */
function pixNoCanvas(canvas: HTMLCanvasElement): PixLido | null {
  const texto = decodificar(canvas);
  return texto ? lerPixBrCode(texto) : null;
}

async function pixNoPdf(file: File): Promise<PixLido | null> {
  const pdfjs: any = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  for (const escala of ESCALAS) {
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGINAS); i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pix = pixNoCanvas(canvas);
      if (pix) return pix;
    }
  }
  return null;
}

async function pixNaImagem(file: File): Promise<PixLido | null> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  return pixNoCanvas(canvas);
}

/** O Pix do QR Code do arquivo (PDF ou imagem), ou `null`. Nunca lança. */
export async function pixDoQrDoArquivo(file: File): Promise<PixLido | null> {
  try {
    const nome = file.name.toLowerCase();
    if (file.type === "application/pdf" || nome.endsWith(".pdf")) return await pixNoPdf(file);
    if (file.type.startsWith("image/") || /\.(png|jpe?g)$/.test(nome)) return await pixNaImagem(file);
  } catch { /* melhoria: sem o QR o fluxo segue como antes */ }
  return null;
}
