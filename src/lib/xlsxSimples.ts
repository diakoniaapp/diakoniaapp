// ─── xlsxSimples — um .xlsx de verdade (planilha do Excel) sem biblioteca de planilhas ────────────────────────────────────────────────────────────────
// O projeto já tem `jszip`; um .xlsx é um ZIP de XMLs. Isto escreve só o necessário: abas, texto, números, datas, moeda, negrito, largura de coluna, filtro e linha fixa.
// Texto vai como `inlineStr` (sem tabela de textos compartilhados). Nada de fórmulas: os totais são valores já calculados.
import JSZip from "jszip";

export type EstiloDeCelula = "padrao" | "negrito" | "titulo" | "moeda" | "moedaNegrito" | "data" | "inteiro" | "cabecalho";
export type Celula = string | number | null | { v: string | number | null; estilo?: EstiloDeCelula };

export interface Aba {
  nome: string;
  linhas: Celula[][];
  /** largura de cada coluna, em caracteres */
  larguras?: number[];
  /** índice (base 0) da linha de cabeçalho: ganha filtro automático e fica fixa ao rolar */
  linhaDoCabecalho?: number;
}

const ESTILO: Record<EstiloDeCelula, number> = { padrao: 0, negrito: 1, titulo: 2, moeda: 3, moedaNegrito: 4, data: 5, inteiro: 6, cabecalho: 7 };

const esc = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string))
  // caracteres de controle não são válidos em XML 1.0
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** Letra da coluna (0 → A, 25 → Z, 26 → AA). */
export function letraDaColuna(i: number): string {
  let n = i, s = "";
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

/** AAAA-MM-DD → número de série do Excel (dias desde 30/12/1899). */
export function serialDoExcel(ymd: string): number {
  return Math.round((Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function celulaXml(ref: string, c: Celula): string {
  const bruto: string | number | null = c !== null && typeof c === "object" ? c.v : (c as string | number | null);
  const estilo: EstiloDeCelula = c !== null && typeof c === "object" ? (c.estilo ?? "padrao") : "padrao";
  if (bruto === null || bruto === undefined || bruto === "") return estilo === "padrao" ? "" : `<c r="${ref}" s="${ESTILO[estilo]}"/>`;
  if (typeof bruto === "number") {
    return `<c r="${ref}" s="${ESTILO[estilo]}"><v>${Number.isFinite(bruto) ? bruto : 0}</v></c>`;
  }
  return `<c r="${ref}" s="${ESTILO[estilo]}" t="inlineStr"><is><t xml:space="preserve">${esc(bruto)}</t></is></c>`;
}

function abaXml(a: Aba): string {
  const linhas = a.linhas.map((cs, r) => {
    const cel = cs.map((c, i) => celulaXml(`${letraDaColuna(i)}${r + 1}`, c)).join("");
    return cel ? `<row r="${r + 1}">${cel}</row>` : "";
  }).join("");
  const colunas = a.larguras ? `<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
  const h = a.linhaDoCabecalho;
  const largura = Math.max(0, ...a.linhas.map(l => l.length));
  const painel = h !== undefined ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${h + 1}" topLeftCell="A${h + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
  const filtro = h !== undefined && largura > 0 ? `<autoFilter ref="A${h + 1}:${letraDaColuna(largura - 1)}${Math.max(h + 1, a.linhas.length)}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${painel}${colunas}<sheetData>${linhas}</sheetData>${filtro}</worksheet>`;
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00;[Red]\\-&quot;R$&quot; #,##0.00"/></numFmts>
<fonts count="4">
<font><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="10"/><name val="Arial"/></font>
<font><b/><sz val="14"/><name val="Arial"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7A4B1E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const nomeDeAba = (n: string) => n.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha";

/** Monta o .xlsx. Devolve o Blob (para `saveAs`). */
export async function gerarXlsx(abas: Aba[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((a, i) => `<sheet name="${esc(nomeDeAba(a.nome))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", ESTILOS_XML);
  abas.forEach((a, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, abaXml(a)));
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
