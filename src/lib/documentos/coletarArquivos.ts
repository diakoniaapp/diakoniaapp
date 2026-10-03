// ─── lib/documentos/coletarArquivos.ts — arrastar uma PASTA inteira ──────────
//
// O objetivo da Central é a Telma "selecionar uma pasta com dezenas ou centenas de
// PDFs e concluir em poucos minutos". Dois caminhos entregam a pasta:
//   · arrastar e soltar (a pasta vem como `FileSystemEntry`, que se percorre
//     recursivamente — `readEntries` devolve no MÁXIMO 100 por chamada, então é
//     preciso repetir até vir vazio);
//   · o botão "Escolher pasta" (`<input webkitdirectory>`), que já entrega todos os
//     arquivos com `webkitRelativePath`.
//
// Só aceita o que o sistema aceita hoje: PDF, JPG, PNG e XML. O resto é contado
// em `ignorados` pra a tela avisar — nunca descartado em silêncio.

export const EXTENSOES_ACEITAS = [".pdf", ".png", ".jpg", ".jpeg", ".xml"];

export interface ArquivoColetado { file: File; caminho: string }
export interface Coleta { arquivos: ArquivoColetado[]; ignorados: string[] }

const aceita = (nome: string) => EXTENSOES_ACEITAS.some(e => nome.toLowerCase().endsWith(e));

/** Arquivos já escolhidos (botão "Escolher arquivos" ou "Escolher pasta"). */
export function coletarDeLista(lista: FileList | File[]): Coleta {
  const out: Coleta = { arquivos: [], ignorados: [] };
  for (const file of Array.from(lista)) {
    const caminho = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (aceita(file.name)) out.arquivos.push({ file, caminho });
    else out.ignorados.push(caminho);
  }
  return out;
}

type Entrada = {
  isFile: boolean; isDirectory: boolean; name: string; fullPath: string;
  file?: (ok: (f: File) => void, erro: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (e: Entrada[]) => void, erro: (e: unknown) => void) => void };
};

async function percorrer(e: Entrada, out: Coleta): Promise<void> {
  if (e.isFile && e.file) {
    const file = await new Promise<File>((ok, erro) => e.file!(ok, erro));
    const caminho = e.fullPath.replace(/^\//, "");
    if (aceita(file.name)) out.arquivos.push({ file, caminho });
    else out.ignorados.push(caminho);
  } else if (e.isDirectory && e.createReader) {
    const leitor = e.createReader();
    // `readEntries` devolve no máximo ~100 por chamada: repete até vir vazio.
    for (;;) {
      const lote = await new Promise<Entrada[]>((ok, erro) => leitor.readEntries(ok, erro));
      if (lote.length === 0) break;
      for (const filho of lote) await percorrer(filho, out);
    }
  }
}

/** Soltar arquivos e/ou pastas na zona de arrasto. */
export async function coletarDoArrasto(dt: DataTransfer): Promise<Coleta> {
  const entradas: Entrada[] = [];
  for (const i of Array.from(dt.items ?? [])) {
    const e = (i as unknown as { webkitGetAsEntry?: () => Entrada | null }).webkitGetAsEntry?.();
    if (e) entradas.push(e);
  }
  if (entradas.length === 0) return coletarDeLista(dt.files);
  const out: Coleta = { arquivos: [], ignorados: [] };
  for (const e of entradas) await percorrer(e, out);
  return out;
}
