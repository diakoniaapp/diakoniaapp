// ─── lib/documentos/dossiePdf.ts — monta o PDF consolidado do Dossiê ─────────
//
// Recebe as partes JÁ NA ORDEM DOCUMENTAL (ver `dossie.ts`) e devolve UM PDF.
// Regras dela (03/10/2026):
//   · só os documentos originais consolidados: SEM marca d'água, SEM número de
//     página, SEM "página X de Y", SEM rodapé, SEM cabeçalho, SEM nome do sistema;
//   · JPG e PNG viram página de PDF (a foto entra na página correspondente);
//   · foto grande é REDUZIDA só na cópia do dossiê — o arquivo guardado no sistema
//     nunca é alterado (aqui só recebemos bytes; nada é regravado);
//   · o que não puder ser mesclado NÃO se perde: volta em `falhas` e quem chama
//     entrega o original ao lado + ERROS.txt.
//
// Um dossiê de UMA parte em PDF sai com os bytes ORIGINAIS, sem reprocessar: não há
// o que mesclar, e assim preserva assinatura digital, metadados e tamanho.
// (Mesclar vários PDFs invalida a assinatura digital de cada cópia — os originais
// continuam no sistema e a pasta do XML segue ao lado.)
//
// `pdf-lib` é carregado sob demanda: só quem gera o pacote paga o peso.

export type FormatoParte = "pdf" | "jpg" | "png";

export interface ParteBytes {
  bytes: Uint8Array;
  formato: FormatoParte;
  /** Nome legível (rótulo do tipo / arquivo) — só pra mensagem de erro e mapa de páginas. */
  rotulo: string;
}

export interface Reducao { bytes: Uint8Array; formato: "jpg" | "png" }
/** `forcar`: passa pelo canvas mesmo sem precisar encolher (JPEG que o pdf-lib não abre). */
export type ReduzirImagem = (bytes: Uint8Array, formato: "jpg" | "png", forcar?: boolean) => Promise<Reducao>;

export interface PaginasDaParte {
  rotulo: string;
  /** Primeira e última página (1-based); `0` e `0` = o PDF não pôde ser contado. */
  de: number;
  ate: number;
}

export interface ResultadoMerge {
  /** `null` se nenhuma parte pôde entrar. */
  bytes: Uint8Array | null;
  paginas: PaginasDaParte[];
  falhas: { indice: number; rotulo: string; motivo: string }[];
}

// A4 em pontos; margem fina pra foto não ser cortada na impressão.
const A4_L = 595.28;
const A4_A = 841.89;
const MARGEM = 24;

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function montarDossiePdf(
  partes: ParteBytes[], opcoes: { reduzirImagem?: ReduzirImagem } = {},
): Promise<ResultadoMerge> {
  const { PDFDocument } = await import("pdf-lib");
  const resultado: ResultadoMerge = { bytes: null, paginas: [], falhas: [] };
  if (partes.length === 0) return resultado;

  // Uma parte só, em PDF: devolve o original. A contagem de páginas é só informativa.
  if (partes.length === 1 && partes[0].formato === "pdf") {
    let n = 0;
    try { n = (await PDFDocument.load(partes[0].bytes, { ignoreEncryption: true, updateMetadata: false })).getPageCount(); }
    catch { /* abre no leitor do contador mesmo assim */ }
    resultado.bytes = partes[0].bytes;
    resultado.paginas.push({ rotulo: partes[0].rotulo, de: n ? 1 : 0, ate: n });
    return resultado;
  }

  const saida = await PDFDocument.create();
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    const antes = saida.getPageCount();
    try {
      if (p.formato === "pdf") {
        const origem = await PDFDocument.load(p.bytes, { ignoreEncryption: true, updateMetadata: false });
        if (origem.isEncrypted) throw new Error("PDF protegido por senha");
        const copiadas = await saida.copyPages(origem, origem.getPageIndices());
        if (copiadas.length === 0) throw new Error("PDF sem páginas");
        for (const pg of copiadas) saida.addPage(pg);
      } else {
        await acrescentarImagem(saida, p, opcoes.reduzirImagem);
      }
      resultado.paginas.push({ rotulo: p.rotulo, de: antes + 1, ate: saida.getPageCount() });
    } catch (e) {
      // não deixa página pela metade no dossiê
      while (saida.getPageCount() > antes) saida.removePage(saida.getPageCount() - 1);
      resultado.falhas.push({ indice: i, rotulo: p.rotulo, motivo: mensagem(e) });
    }
  }
  if (saida.getPageCount() > 0) {
    // Metadados neutros: o pdf-lib se grava como produtor/criador por padrão; isto
    // não é carimbo na página, mas também não precisa levar o nome da biblioteca.
    saida.setProducer("");
    saida.setCreator("");
    resultado.bytes = await saida.save();
  }
  return resultado;
}

async function acrescentarImagem(
  saida: import("pdf-lib").PDFDocument, p: ParteBytes, reduzir?: ReduzirImagem,
): Promise<void> {
  const formato = p.formato as "jpg" | "png";
  let bytes = p.bytes;
  let fmt = formato;
  if (reduzir) {
    const r = await reduzir(bytes, formato);
    bytes = r.bytes; fmt = r.formato;
  }
  const embutir = (b: Uint8Array, f: "jpg" | "png") => (f === "png" ? saida.embedPng(b) : saida.embedJpg(b));
  let img;
  try {
    img = await embutir(bytes, fmt);
  } catch (e) {
    // JPEG em CMYK/progressivo estranho: refaz pelo canvas, se houver
    if (!reduzir) throw e;
    const r = await reduzir(p.bytes, formato, true);
    img = await embutir(r.bytes, r.formato);
  }
  const paisagem = img.width > img.height;
  const [pw, ph] = paisagem ? [A4_A, A4_L] : [A4_L, A4_A];
  const escala = Math.min((pw - 2 * MARGEM) / img.width, (ph - 2 * MARGEM) / img.height, 1);
  const w = img.width * escala;
  const h = img.height * escala;
  const pagina = saida.addPage([pw, ph]);
  pagina.drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
}

/** Mapa de páginas legível: `Nota Fiscal: 1-2 · Comprovante de Pagamento: 3`. */
export function textoDePaginas(paginas: PaginasDaParte[]): string {
  return paginas.map(p => {
    const onde = p.ate === 0 ? "sem contagem" : p.de === p.ate ? String(p.de) : `${p.de}-${p.ate}`;
    return `${p.rotulo}: ${onde}`;
  }).join(" · ");
}
