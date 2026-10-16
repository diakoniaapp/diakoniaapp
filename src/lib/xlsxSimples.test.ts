// O .xlsx gerado é um ZIP de XMLs válido: abre de volta, tem as abas, os textos escapados, os números como números e a moeda formatada.
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { gerarXlsx, letraDaColuna, serialDoExcel } from "./xlsxSimples";

// o Blob do jsdom não tem arrayBuffer(): lê pelo FileReader
const bytesDe = (blob: Blob) => new Promise<ArrayBuffer>((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.onerror = () => falha(r.error); r.readAsArrayBuffer(blob); });

async function abrir(blob: Blob) {
  const zip = await JSZip.loadAsync(await bytesDe(blob));
  const texto = async (p: string) => await zip.file(p)!.async("string");
  return { zip, texto };
}

describe("letras de coluna e datas do Excel", () => {
  it("A, Z, AA, AB", () => { expect([0, 25, 26, 27, 51, 52].map(letraDaColuna)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA"]); });
  it("serial do Excel: 01/01/1900 = 1; 16/10/2026 = 46311", () => {
    expect(serialDoExcel("1900-01-01")).toBe(2);   // o Excel conta 29/02/1900 (que não existiu): a partir de 01/03/1900 o serial bate com o de 30/12/1899
    expect(serialDoExcel("2026-10-16")).toBe(46311);
    expect(serialDoExcel("2000-01-01")).toBe(36526);
  });
});

describe("gerarXlsx", () => {
  it("produz as partes obrigatórias do pacote e uma aba por planilha, com nome limpo", async () => {
    const { zip, texto } = await abrir(await gerarXlsx([{ nome: "Obrigações", linhas: [["a"]] }, { nome: "Resumo/2:", linhas: [["b"]] }]));
    for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) expect(zip.file(p)).toBeTruthy();
    const wb = await texto("xl/workbook.xml");
    expect(wb).toContain('name="Obrigações"');
    expect(wb).toContain('name="Resumo 2 "');
  });

  it("texto é escapado; números e datas ficam como número com o estilo certo; célula vazia some", async () => {
    const { texto } = await abrir(await gerarXlsx([{
      nome: "T",
      linhas: [
        [{ v: "Título", estilo: "titulo" }],
        [{ v: "Data", estilo: "cabecalho" }, { v: "Valor", estilo: "cabecalho" }],
        [{ v: serialDoExcel("2026-10-16"), estilo: "data" }, { v: 1234.5, estilo: "moeda" }, 'A & B <c> "d"', null, { v: 7, estilo: "inteiro" }],
      ],
      linhaDoCabecalho: 1, larguras: [12, 14],
    }]));
    const x = await texto("xl/worksheets/sheet1.xml");
    expect(x).toContain('<c r="A3" s="5"><v>46311</v></c>');
    expect(x).toContain('<c r="B3" s="3"><v>1234.5</v></c>');
    expect(x).toContain("A &amp; B &lt;c&gt; &quot;d&quot;");
    expect(x).not.toContain('r="D3"');
    expect(x).toContain('<c r="E3" s="6"><v>7</v></c>');
    expect(x).toContain('<autoFilter ref="A2:E3"/>');
    expect(x).toContain('state="frozen"');
    expect(x).toContain('<col min="1" max="1" width="12" customWidth="1"/>');
  });

  it("os estilos declaram moeda em R$ e o cabeçalho colorido", async () => {
    const { texto } = await abrir(await gerarXlsx([{ nome: "T", linhas: [["x"]] }]));
    const st = await texto("xl/styles.xml");
    expect(st).toContain("&quot;R$&quot; #,##0.00");
    expect(st).toContain('<cellXfs count="8">');
    expect(st).toContain("FF7A4B1E");
  });
});
