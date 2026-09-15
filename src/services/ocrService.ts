// ─── ocrService.ts — leitura de comprovante/NF client-side ───────────────────
// Roda 100% no browser. Sem chave externa. Custo zero.
//
// Pedido da Telma (15/09/2026): "leitura mais precisa". Até aqui, TODO PDF
// anexado era rasterizado (`pdfParaImagem`) e lido por OCR (Tesseract) —
// mesmo quando o PDF já tinha uma camada de texto exata embutida (o caso
// comum de um DANFE/recibo gerado por sistema, não escaneado). Isso jogava
// fora a fonte mais precisa disponível pra usar a mais sujeita a erro.
//
// Agora, pra PDF, tenta primeiro `textoDoPdf` (extração exata via
// `pdfjs-dist`, já dependência do projeto — sem OCR nenhum). Só cai pro
// caminho antigo (rasterizar + Tesseract) quando o PDF não tem texto
// aproveitável (documento escaneado/fotografado como PDF). `fonte` no
// resultado diz qual caminho foi usado — a tela usa isso pra decidir o que
// pode travar (não-editável) e o que continua exigindo conferência.
export interface OcrResultado {
  textoBruto: string;
  valor: number | null;
  data: string | null;            // ISO YYYY-MM-DD
  cnpj: string | null;            // só dígitos
  cnpjFormatado: string | null;   // XX.XXX.XXX/XXXX-XX
  razaoSocial: string | null;     // melhor candidato
  numeroDoc: string | null;       // nº NF se identificado
  duracaoMs: number;
  confianca: number;              // 0-100
  /** De onde veio o texto lido — "pdf_texto" é extração exata (sem OCR),
      "ocr" é Tesseract (aproximado, sempre precisa de conferência). */
  fonte: "pdf_texto" | "ocr";
}

// Tesseract carrega só quando precisar (lazy load, evita inflar bundle inicial)
async function getWorker() {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1);
  return worker;
}

// Reformata string com /, -, ., espaços
function limparDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

// Regex pra valor monetário brasileiro
//   R$ 1.234,56 / 1234,56 / 1.234,56
const REGEX_VALOR = /(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;

// Data DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
const REGEX_DATA = /(\d{2})[/\-.](\d{2})[/\-.](20\d{2})/g;

// CNPJ XX.XXX.XXX/XXXX-XX (com ou sem máscara)
const REGEX_CNPJ = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
const REGEX_CNPJ_DIGITOS = /\b(\d{14})\b/;

// Número da nota
const REGEX_NF = /(?:n[°º]?\s*|nota\s+fiscal\s+n?[°º]?\s*|nf-?e?\s*n?[°º]?\s*)(\d{4,9})/i;

/** Encontra o maior valor — tipicamente o "TOTAL" da NF */
function extrairMaiorValor(texto: string): number | null {
  const ms = Array.from(texto.matchAll(REGEX_VALOR));
  if (ms.length === 0) return null;
  const valores = ms.map(m => {
    const raw = m[0].replace(/R\$\s*/, "").replace(/\./g, "").replace(",", ".");
    return parseFloat(raw);
  }).filter(v => !isNaN(v) && v > 0);
  if (valores.length === 0) return null;
  return Math.max(...valores);
}

/** Pega a data mais recente válida (não pode ser no futuro) */
function extrairMelhorData(texto: string): string | null {
  const hoje = new Date();
  const candidatas: Date[] = [];
  for (const m of texto.matchAll(REGEX_DATA)) {
    const [_, dd, mm, yyyy] = m;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isNaN(d.getTime())) continue;
    if (d > hoje) continue; // futuro não vale
    // razoável: nos últimos 5 anos
    const cincoAnos = new Date(hoje.getFullYear() - 5, 0, 1);
    if (d < cincoAnos) continue;
    candidatas.push(d);
  }
  if (candidatas.length === 0) return null;
  // Pega a mais recente
  candidatas.sort((a, b) => b.getTime() - a.getTime());
  return candidatas[0].toISOString().slice(0, 10);
}

function extrairCnpj(texto: string): { digitos: string | null; formatado: string | null } {
  const mFmt = texto.match(REGEX_CNPJ);
  if (mFmt) {
    const dig = limparDigitos(mFmt[1]);
    if (dig.length === 14) {
      return { digitos: dig, formatado: formatarCnpj(dig) };
    }
  }
  const mDig = texto.match(REGEX_CNPJ_DIGITOS);
  if (mDig) {
    return { digitos: mDig[1], formatado: formatarCnpj(mDig[1]) };
  }
  return { digitos: null, formatado: null };
}

function formatarCnpj(digitos: string): string {
  if (digitos.length !== 14) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
}

/** Heurística: a razão social fica perto do CNPJ, geralmente 1-3 linhas acima */
function extrairRazaoSocial(texto: string, cnpjBruto: string | null): string | null {
  if (!cnpjBruto) return null;
  const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // Encontra a linha que contém o CNPJ
  const idx = linhas.findIndex(l => limparDigitos(l).includes(cnpjBruto));
  if (idx === -1) return null;
  // Pega até 3 linhas acima — escolhe a mais longa que parece nome de empresa
  const candidatas = linhas.slice(Math.max(0, idx - 3), idx);
  // Heurística: linha com 2+ palavras, em maiúsculo ou misto, sem só números
  let melhor: string | null = null;
  for (const l of candidatas) {
    if (l.length < 4) continue;
    if (/^\d+$/.test(l)) continue;
    const palavras = l.split(/\s+/).filter(Boolean);
    if (palavras.length < 2) continue;
    if (!melhor || l.length > melhor.length) melhor = l;
  }
  return melhor;
}

function extrairNumeroNf(texto: string): string | null {
  const m = texto.match(REGEX_NF);
  return m ? m[1] : null;
}

/** As mesmas heurísticas de campo, aplicadas a QUALQUER texto de origem —
    exato (camada de texto do PDF) ou aproximado (OCR). O texto em si que
    muda de precisão; a extração de campo é a mesma nos dois casos.
    Exportada (não só usada internamente) pra dar pra testar as heurísticas
    de regex direto, sem precisar simular um PDF ou rodar Tesseract. */
export function extrairCamposDoTexto(texto: string) {
  const valor = extrairMaiorValor(texto);
  const data = extrairMelhorData(texto);
  const { digitos: cnpj, formatado: cnpjFormatado } = extrairCnpj(texto);
  const razaoSocial = extrairRazaoSocial(texto, cnpj);
  const numeroDoc = extrairNumeroNf(texto);
  return { valor, data, cnpj, cnpjFormatado, razaoSocial, numeroDoc };
}

/** Roda o OCR (Tesseract) sobre uma imagem/PDF rasterizado — o caminho
    antigo, agora só usado quando não há texto aproveitável no PDF, ou o
    arquivo já é imagem (foto). */
async function ocrPorImagem(file: File): Promise<{ texto: string; confianca: number }> {
  let arquivoParaOcr: File = file;
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    arquivoParaOcr = await pdfParaImagem(file);
  }
  const worker = await getWorker();
  try {
    const { data } = await worker.recognize(arquivoParaOcr);
    return { texto: data.text, confianca: data.confidence ?? 0 };
  } finally {
    await worker.terminate();
  }
}

/** Função principal — lê o comprovante/NF e devolve dados estruturados.
    PDF tenta texto exato primeiro (`textoDoPdf`); só recorre a OCR quando
    não há camada de texto aproveitável, ou o arquivo é imagem. */
export async function extrairDadosDoComprovante(file: File): Promise<OcrResultado> {
  const t0 = performance.now();
  const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  let texto: string;
  let confianca: number;
  let fonte: OcrResultado["fonte"];

  const textoExato = ehPdf ? await textoDoPdf(file) : null;
  if (textoExato) {
    texto = textoExato;
    confianca = 100; // extração exata — não é probabilidade, é o texto real do arquivo
    fonte = "pdf_texto";
  } else {
    const r = await ocrPorImagem(file);
    texto = r.texto;
    confianca = Math.round(r.confianca);
    fonte = "ocr";
  }

  return {
    textoBruto: texto,
    ...extrairCamposDoTexto(texto),
    duracaoMs: Math.round(performance.now() - t0),
    confianca,
    fonte,
  };
}

// ─── PDF → texto exato (todas as páginas) ────────────────────────────────
// `pdfjs-dist` já lazy-carregado (mesma lib de `pdfParaImagem`, abaixo).
// Devolve `null` quando o PDF não tem camada de texto aproveitável — um
// PDF gerado a partir de escaneamento/foto tem zero (ou quase zero) itens
// de texto reais, só a imagem da página; nesse caso o único caminho
// possível continua sendo OCR (`ocrPorImagem`).
const TEXTO_MINIMO_UTIL = 30;
const TOLERANCIA_Y = 2; // px de variação ainda considerados "a mesma linha"

/** Agrupa fragmentos de texto posicionados (x, y — do `item.transform` do
    pdf.js) em linhas visuais, topo→baixo e esquerda→direita dentro de cada
    linha. Extraída à parte de `textoDoPdf` pra poder testar a lógica de
    agrupamento sem precisar simular um PDF de verdade. */
export function agruparEmLinhas(itens: { texto: string; x: number; y: number }[]): string[] {
  const ordenados = [...itens].sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const linhas: string[] = [];
  let buffer: string[] = [];
  let refY: number | null = null;
  for (const it of ordenados) {
    if (refY === null || Math.abs(it.y - refY) <= TOLERANCIA_Y) {
      buffer.push(it.texto);
      refY = refY === null ? it.y : refY;
    } else {
      linhas.push(buffer.join(" "));
      buffer = [it.texto];
      refY = it.y;
    }
  }
  if (buffer.length > 0) linhas.push(buffer.join(" "));
  return linhas;
}

export async function textoDoPdf(file: File): Promise<string | null> {
  const pdfjs: any = await import("pdfjs-dist");
  const v = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;

  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;

  const paginas: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const conteudo = await page.getTextContent();
    // `item.str` sozinho não basta — vem em ORDEM DE DESENHO no PDF, não em
    // ordem de leitura, e sem quebra de linha nenhuma (juntar tudo com
    // espaço vira UMA linha gigante por página). Isso quebrava
    // `extrairRazaoSocial`, que procura texto "1-3 linhas acima do CNPJ" —
    // sem linha nenhuma pra contar, a heurística comparava página com
    // página, não linha com linha. `item.transform` traz a posição (x, y)
    // de cada fragmento; `agruparEmLinhas` reconstrói a linha visual.
    const itens = (conteudo.items as any[])
      .filter(it => typeof it.str === "string" && it.str.length > 0)
      .map(it => ({ texto: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number }));

    paginas.push(agruparEmLinhas(itens).join("\n"));
  }

  const textoCompleto = paginas.join("\n\n").replace(/[ \t]+/g, " ").trim();
  return textoCompleto.length >= TEXTO_MINIMO_UTIL ? textoCompleto : null;
}

// ─── PDF → imagem (primeira página) ──────────────────────────────────────
// Carrega pdfjs lazy. Renderiza a página 1 em um canvas e devolve blob/file.
export async function pdfParaImagem(file: File, escala = 2): Promise<File> {
  const pdfjs: any = await import("pdfjs-dist");
  // Configura worker via CDN (não precisa bundlar)
  const v = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`;

  const arrayBuf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado");

  await page.render({ canvasContext: ctx, viewport }).promise;

  // Canvas → blob PNG
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("Falha no toBlob")), "image/png", 0.92);
  });

  // Wrap como File pra Tesseract aceitar
  const nome = file.name.replace(/\.pdf$/i, ".png");
  return new File([blob], nome, { type: "image/png" });
}
