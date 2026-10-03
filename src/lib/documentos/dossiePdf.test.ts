import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { montarDossiePdf, textoDePaginas, type ParteBytes } from "./dossiePdf";

// PNG 1x1 válido
const PNG_1x1 = Uint8Array.from(atob(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
), c => c.charCodeAt(0));

/** PDF de teste: cada página com tamanho próprio, pra reconhecer de onde veio. */
async function pdf(...larguras: number[]): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (const w of larguras) d.addPage([w, 400]);
  return d.save();
}
const parte = (bytes: Uint8Array, formato: ParteBytes["formato"], rotulo: string): ParteBytes => ({ bytes, formato, rotulo });
const larguras = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map(p => Math.round(p.getWidth()));

describe("montarDossiePdf", () => {
  it("junta os PDFs NA ORDEM RECEBIDA e devolve o mapa de páginas", async () => {
    const nf = await pdf(101, 102);   // 2 páginas
    const comp = await pdf(201);      // 1 página
    const r = await montarDossiePdf([parte(nf, "pdf", "Nota Fiscal"), parte(comp, "pdf", "Comprovante de Pagamento")]);
    expect(await larguras(r.bytes!)).toEqual([101, 102, 201]);
    expect(r.paginas).toEqual([
      { rotulo: "Nota Fiscal", de: 1, ate: 2 },
      { rotulo: "Comprovante de Pagamento", de: 3, ate: 3 },
    ]);
    expect(textoDePaginas(r.paginas)).toBe("Nota Fiscal: 1-2 · Comprovante de Pagamento: 3");
    expect(r.falhas).toEqual([]);
  });

  it("NÃO acrescenta nada: nº de páginas = soma das páginas dos originais (sem carimbo, capa ou rodapé)", async () => {
    const a = await pdf(100, 100, 100), b = await pdf(100), c = await pdf(100, 100);
    const r = await montarDossiePdf([parte(a, "pdf", "A"), parte(b, "pdf", "B"), parte(c, "pdf", "C")]);
    expect((await PDFDocument.load(r.bytes!)).getPageCount()).toBe(6);
  });

  it("uma parte só em PDF: devolve os bytes ORIGINAIS, sem reprocessar", async () => {
    const um = await pdf(333, 334);
    const r = await montarDossiePdf([parte(um, "pdf", "Fatura")]);
    expect(r.bytes).toBe(um); // a mesma referência: nada foi regravado
    expect(r.paginas).toEqual([{ rotulo: "Fatura", de: 1, ate: 2 }]);
  });

  it("PNG vira uma página de PDF (A4), entre os PDFs", async () => {
    const nf = await pdf(101);
    const r = await montarDossiePdf([parte(nf, "pdf", "Nota Fiscal"), parte(PNG_1x1, "png", "Comprovante de Pagamento")]);
    const w = await larguras(r.bytes!);
    expect(w).toHaveLength(2);
    expect(w[0]).toBe(101);
    expect(w[1]).toBe(595); // A4 em pé: foto quadrada/estreita não deita a página
    expect(r.paginas[1]).toEqual({ rotulo: "Comprovante de Pagamento", de: 2, ate: 2 });
  });

  it("foto grande passa pela redução ANTES de entrar — e só ela é reduzida, nunca o PDF", async () => {
    const reduzir = vi.fn(async (b: Uint8Array, f: "jpg" | "png") => ({ bytes: PNG_1x1, formato: f }));
    const nf = await pdf(101);
    await montarDossiePdf([parte(nf, "pdf", "NF"), parte(PNG_1x1, "png", "Foto")], { reduzirImagem: reduzir });
    expect(reduzir).toHaveBeenCalledTimes(1); // só a imagem
    expect(reduzir.mock.calls[0][1]).toBe("png");
  });

  it("um PDF corrompido NÃO derruba o dossiê: as outras partes entram e a falha é devolvida", async () => {
    const nf = await pdf(101), comp = await pdf(201);
    const lixo = new TextEncoder().encode("isto não é um pdf");
    const r = await montarDossiePdf([parte(nf, "pdf", "Nota Fiscal"), parte(lixo, "pdf", "Boleto"), parte(comp, "pdf", "Comprovante de Pagamento")]);
    expect(await larguras(r.bytes!)).toEqual([101, 201]);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toMatchObject({ indice: 1, rotulo: "Boleto" });
    expect(r.paginas.map(p => p.rotulo)).toEqual(["Nota Fiscal", "Comprovante de Pagamento"]);
  });

  it("tudo falhou: bytes nulo (quem chama entrega os originais ao lado)", async () => {
    const lixo = new TextEncoder().encode("nada");
    const r = await montarDossiePdf([parte(lixo, "pdf", "A"), parte(lixo, "pdf", "B")]);
    expect(r.bytes).toBeNull();
    expect(r.falhas).toHaveLength(2);
  });

  it("imagem que o pdf-lib não abre e sem canvas de reserva: falha só dela", async () => {
    const nf = await pdf(101);
    const r = await montarDossiePdf([parte(nf, "pdf", "NF"), parte(new Uint8Array([1, 2, 3]), "png", "Foto")]);
    expect(await larguras(r.bytes!)).toEqual([101]);
    expect(r.falhas).toHaveLength(1);
  });

  it("sem partes: nada", async () => {
    expect(await montarDossiePdf([])).toEqual({ bytes: null, paginas: [], falhas: [] });
  });
});
