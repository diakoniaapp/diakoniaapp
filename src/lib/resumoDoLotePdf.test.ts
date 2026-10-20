// "00 RESUMO.pdf": o índice do lote — conteúdo (puro) e geração do PDF.
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { montarItemDeEnvio, type ItemDeEnvio } from "@/lib/envioDePagamentos";
import { blocosDoResumo, gerarResumoDoLotePdf, seguroParaPdf, type DadosDoResumo } from "./resumoDoLotePdf";

const BRADESCO = "23790226079000020134447008430002715980000030000";
const mk = (id: string, fornecedor: string, valor: number, l: Partial<Parameters<typeof montarItemDeEnvio>[1]> = {}): ItemDeEnvio =>
  montarItemDeEnvio({ id, fornecedor, descricao: null, categoria: "Energia", centro: "Administração", valor, vencimento: "2026-10-13", diasParaVencer: 0 },
    { linha: BRADESCO, pix: null, valorDoDocumento: valor, vencimentoDoDocumento: null, codigoValido: true, documentos: 1, ...l });

const boleto = mk("a", "Junta de Missões Nacionais", 300);
const pixDoc = mk("b", "Ana Patrícia", 800, { linha: null, pix: "00020126580014br.gov.bcb.pix0136abc", origemDoPix: "documento" });
const pixCad = mk("c", "Caio Marcelo", 500, { linha: null, pix: "00020126580014br.gov.bcb.pix0136xyz", origemDoPix: "cadastro", favorecidoDoPix: "Caio Marcelo Mendes" });
const sem = mk("s", "ABC Associação", 37.8, { linha: null, pix: null, documentos: 0 });

const dados = (o: Partial<DadosDoResumo> = {}): DadosDoResumo => ({
  hojeYmd: "2026-10-20", itens: [boleto, pixDoc, pixCad], semMeio: [sem],
  arquivosPorItem: new Map([["a", ["01 Bradesco - Junta - 300,00 - boleto.pdf"]], ["b", ["02 Ana - 800,00 - fatura.pdf"]]]), ...o,
});

describe("conteúdo do resumo", () => {
  const b = blocosDoResumo(dados());
  it("título e linha do lote: pagamentos, valor, boletos, Pix, sem meio e documentos", () => {
    expect(b.titulo).toBe("Arquivos de pagamento | Vencimento 20.10.2026");
    expect(b.linhaDoLote).toBe("3 pagamentos · R$ 1.600,00 · 1 boleto · 2 Pix · 1 sem meio automático · 3 documentos");
  });
  it("cada pagamento diz DE ONDE veio o código, traz o código e os arquivos do ZIP", () => {
    expect(b.itens.map(i => i.origem)).toEqual(["Linha digitável do documento", "PIX do documento", "PIX do cadastro do favorecido"]);
    expect(b.itens[0].codigo).toBe("23790 22607 90000 20134 44700 84300 02715 98000 00300 00");
    expect(b.itens[1].codigo).toBe("00020126580014br.gov.bcb.pix0136abc");
    expect(b.itens[0].cabecalho).toBe("Boleto bancário · Bradesco · R$ 300,00 · vence 13/10/2026");
    expect(b.itens[1].cabecalho).toBe("Pix · R$ 800,00 · vence 13/10/2026");
    // as colunas da tabela: favorecido e meio · ORIGEM · valor · vence
    expect(b.itens.map(i => [i.meio, i.valor, i.vencimento])).toEqual([
      ["Boleto bancário · Bradesco", "R$ 300,00", "13/10/2026"], ["Pix", "R$ 800,00", "13/10/2026"], ["Pix", "R$ 500,00", "13/10/2026"],
    ]);
    expect(b.itens[0].arquivos).toEqual(["01 Bradesco - Junta - 300,00 - boleto.pdf"]);
    expect(b.itens[2].arquivos).toEqual([]);                       // sem documento: o PDF avisa
  });
  it("sem meio automático em seção própria, numerado depois dos pagamentos", () => {
    expect(b.semMeio).toEqual([{ numero: 4, texto: "ABC Associação · R$ 37,80 · vence 13/10/2026", arquivos: [] }]);
  });
  it("a linha do beneficiário editada à mão vale no resumo; aviso de conferência e assinatura vêm no fim", () => {
    expect(blocosDoResumo(dados({ linhasDeDescricao: { a: "Carteira" } })).itens[0].beneficiario).toBe("CARTEIRA");
    expect(b.aviso).toBe("Confira sempre os valores e vencimentos antes de efetuar os pagamentos.");
    expect(b.assinatura[0]).toBe("Documento gerado automaticamente pelo DiakoniaApp.");
  });
  it("emoji e sinais fora do Latin-1 saem do texto (as fontes do PDF não os conhecem), acento fica", () => {
    expect(seguroParaPdf("➡️ Missões — R$ 1,00 · ok 🧾")).toBe(" Missões — R$ 1,00 · ok ");
    expect(seguroParaPdf("Missões ç ã — · 🧾")).toBe("Missões ç ã — · ");
  });
});

describe("o PDF", () => {
  it("gera um PDF A4 válido de uma página com 3 pagamentos e 1 sem meio", async () => {
    const bytes = await gerarResumoDoLotePdf(dados());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595); expect(Math.round(height)).toBe(842);
  });

  it("um lote grande vira várias páginas, sem estourar nem perder item", async () => {
    const muitos = Array.from({ length: 60 }, (_, n) => mk(`m${n}`, `Fornecedor número ${n} com um nome bem comprido para testar a quebra de linha`, 100 + n, n % 2 ? { linha: null, pix: "0".repeat(190), origemDoPix: "documento" as const } : {}));
    const bytes = await gerarResumoDoLotePdf(dados({ itens: muitos, semMeio: [] }));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it("nomes com emoji, aspas e acentos não derrubam a geração", async () => {
    const estranho = mk("e", "Café “Ação” 🧾 – São João", 10);
    await expect(gerarResumoDoLotePdf(dados({ itens: [estranho], semMeio: [] }))).resolves.toBeInstanceOf(Uint8Array);
  });
});
