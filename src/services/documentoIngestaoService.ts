// ============================================================
// documentoIngestaoService.ts
// Upload de PDF/DOCX para Supabase Storage + extração de texto
// Fluxo: File → Storage → texto extraído → documentos.texto_extraido
// ============================================================

import { supabase } from "@/integrations/supabase/client";

// ── Utilitários ───────────────────────────────────────────────

/** Promise com timeout — evita "Salvando..." infinito (Fase E). */
function comTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(msg + " (timeout " + ms + "ms)")), ms)
    ),
  ]);
}

// ── Tipos ────────────────────────────────────────────────────

export interface ResultadoIngestao {
  storagePath: string;
  arquivoNome: string;
  arquivoMime: string;
  arquivoTamanhoBytes: number;
  textoExtraido: string;
  paginas?: number;
}

export interface ProgressoIngestao {
  etapa: "upload" | "extracao" | "salvando" | "concluido" | "erro";
  mensagem: string;
  progresso?: number; // 0-100
}

// ── Validação de arquivo ─────────────────────────────────────

export function validarArquivo(file: File): string | null {
  const MIME_ACEITOS = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];
  const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

  if (!MIME_ACEITOS.includes(file.type)) {
    return `Tipo não suportado: ${file.type}. Aceitos: PDF, DOCX.`;
  }
  if (file.size > MAX_BYTES) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo: 20 MB.`;
  }
  return null;
}

// ── Extração de texto: PDF ───────────────────────────────────
// Usa PDF.js via import dinâmico do CDN (sem dependência npm)

async function extrairTextoPDF(file: File): Promise<{ texto: string; paginas: number }> {
  const arrayBuffer = await file.arrayBuffer();

  // Carrega PDF.js dinamicamente (CDN) — com timeout para não travar (Fase E).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib = await comTimeout(
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs" as any),
    15000,
    "Falha ao carregar leitor de PDF"
  );
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const totalPaginas = pdf.numPages;

  const textos: string[] = [];
  for (let i = 1; i <= totalPaginas; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) textos.push(pageText);
  }

  return { texto: textos.join("\n\n"), paginas: totalPaginas };
}

// ── Extração de texto: DOCX ──────────────────────────────────
// Lê o XML interno do DOCX (formato ZIP) sem bibliotecas externas
// Usa DecompressionStream + parsing de word/document.xml

async function extrairTextoDOCX(file: File): Promise<{ texto: string }> {
  // Carrega mammoth.js dinamicamente para extração precisa de DOCX
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mammoth = await comTimeout(
      import("https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.esm.js" as any),
      15000,
      "Falha ao carregar leitor de DOCX"
    );
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return { texto: result.value || "" };
  } catch {
    // Fallback: extração manual via XML
    return extrairTextoDOCXManual(file);
  }
}

async function extrairTextoDOCXManual(file: File): Promise<{ texto: string }> {
  try {
    // DOCX é um ZIP — buscamos word/document.xml dentro dele
    // Usa DecompressionStream nativo se disponível, senão tenta FileReader
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Localiza o arquivo word/document.xml dentro do ZIP
    // Assinatura ZIP: PK\x03\x04 no início
    const xmlTexto = await extrairArquivoDoZip(bytes, "word/document.xml");
    if (!xmlTexto) {
      throw new Error("word/document.xml não encontrado no DOCX");
    }

    // Remove tags XML e extrai apenas texto
    const texto = xmlTexto
      .replace(/<w:p[ >][^>]*>/g, "\n")  // quebra de parágrafo
      .replace(/<[^>]+>/g, "")             // remove todas as tags
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { texto };
  } catch (e) {
    console.warn("[documentoIngestaoService] Fallback DOCX falhou:", e);
    return { texto: "" };
  }
}

// Extrai um arquivo específico de um ZIP em memória
function extrairArquivoDoZip(zipBytes: Uint8Array, caminhoAlvo: string): string | null {
  const enc = new TextDecoder("utf-8");
  let pos = 0;

  while (pos < zipBytes.length - 4) {
    // Local file header signature: 50 4B 03 04
    if (zipBytes[pos] !== 0x50 || zipBytes[pos+1] !== 0x4b ||
        zipBytes[pos+2] !== 0x03 || zipBytes[pos+3] !== 0x04) {
      pos++;
      continue;
    }

    const compressionMethod = zipBytes[pos+8] | (zipBytes[pos+9] << 8);
    const compressedSize   = zipBytes[pos+18] | (zipBytes[pos+19] << 8) |
                             (zipBytes[pos+20] << 16) | (zipBytes[pos+21] << 24);
    const filenameLen      = zipBytes[pos+26] | (zipBytes[pos+27] << 8);
    const extraLen         = zipBytes[pos+28] | (zipBytes[pos+29] << 8);
    const filenameBytes    = zipBytes.slice(pos+30, pos+30+filenameLen);
    const filename         = enc.decode(filenameBytes);
    const dataStart        = pos + 30 + filenameLen + extraLen;

    if (filename === caminhoAlvo && compressionMethod === 0) {
      // Stored (não comprimido)
      const data = zipBytes.slice(dataStart, dataStart + compressedSize);
      return enc.decode(data);
    }

    pos = dataStart + compressedSize;
  }

  return null;
}

// ── Upload para Supabase Storage ─────────────────────────────

async function uploadParaStorage(
  file: File,
  documentoId: string
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const timestamp = Date.now();
  const path = `${documentoId}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  const { error } = await comTimeout(
    supabase.storage
      .from("documentos")
      .upload(path, file, { contentType: file.type, upsert: true }),
    60000,
    "Upload do arquivo demorou demais"
  );

  if (error) throw new Error("Erro no upload: " + error.message);
  return path;
}

// ── Função principal ─────────────────────────────────────────

export async function ingerirDocumento(
  file: File,
  documentoId: string,
  onProgresso?: (p: ProgressoIngestao) => void
): Promise<ResultadoIngestao> {
  const progress = (etapa: ProgressoIngestao["etapa"], mensagem: string, progresso?: number) => {
    onProgresso?.({ etapa, mensagem, progresso });
  };

  // 1. Validar
  const erro = validarArquivo(file);
  if (erro) throw new Error(erro);

  // 2. Upload para Storage
  progress("upload", "Enviando arquivo...", 10);
  const storagePath = await uploadParaStorage(file, documentoId);
  progress("upload", "Arquivo enviado.", 40);

  // 3. Extração de texto
  progress("extracao", "Extraindo texto do documento...", 50);
  let textoExtraido = "";
  let paginas: number | undefined;

  try {
    if (file.type === "application/pdf") {
      const resultado = await extrairTextoPDF(file);
      textoExtraido = resultado.texto;
      paginas = resultado.paginas;
    } else {
      const resultado = await extrairTextoDOCX(file);
      textoExtraido = resultado.texto;
    }
    progress("extracao", `Texto extraído (${textoExtraido.length} caracteres).`, 80);
  } catch (e) {
    // Extração falhou mas upload foi ok — salva sem texto
    console.warn("[documentoIngestaoService] Extração falhou:", e);
    progress("extracao", "Extração parcial — texto não disponível.", 80);
  }

  // 4. Salvar metadados no banco
  progress("salvando", "Salvando no banco...", 90);
  const { error: dbErr } = await comTimeout(
    supabase.from("documentos").update({
      arquivo_storage_path: storagePath,
      arquivo_nome: file.name,
      arquivo_mime: file.type,
      arquivo_tamanho_bytes: file.size,
      texto_extraido: textoExtraido || null,
      ingestao_status: textoExtraido ? "concluido" : "erro",
      ingestao_erro: textoExtraido ? null : "Extração de texto falhou",
      ingestao_em: new Date().toISOString(),
      // Limpa arquivo_url legado quando ingestao termina com sucesso
      ...(textoExtraido ? { arquivo_url: null } : {}),
    }).eq("id", documentoId),
    30000,
    "Salvar metadados demorou demais"
  );

  if (dbErr) throw new Error("Erro ao salvar metadados: " + dbErr.message);

  progress("concluido", "Ingestão concluída com sucesso!", 100);

  return {
    storagePath,
    arquivoNome: file.name,
    arquivoMime: file.type,
    arquivoTamanhoBytes: file.size,
    textoExtraido,
    paginas,
  };
}

// ── Obter URL assinada para download ─────────────────────────

export async function obterUrlDownload(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("documentos")
    .createSignedUrl(storagePath, 3600); // 1 hora
  if (error) return null;
  return data.signedUrl;
}

// ── Remover arquivo do storage ───────────────────────────────

export async function removerArquivoStorage(storagePath: string): Promise<void> {
  await supabase.storage.from("documentos").remove([storagePath]);
}

// ── Formatar tamanho legível ─────────────────────────────────

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
