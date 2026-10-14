import { describe, expect, it } from "vitest";
import { fraseDaIntencao, montarDeclaracaoPdf, montarReciboPdf, textoDaDeclaracao, textoDoRecibo, valorPorExtenso, type ConteudoDaDeclaracao, type DadosDoRecibo } from "./declaracaoDoTerceiro";

const conteudo = (o: Partial<ConteudoDaDeclaracao["declarado"]> = {}): ConteudoDaDeclaracao => ({
  declarado: {
    intencao: "reembolso", declarante_nome: "Ana Souza", declarante_documento: "123.456.789-00", fornecedor_nome: "Papelaria Central", fornecedor_documento: "12.345.678/0001-95",
    nota_numero: "4521", nota_chave: null, nota_data: "2026-10-05", valor: 240.5, forma_pagamento: "dinheiro", data_pagamento: "2026-10-05", chave_pix: "ana@exemplo.com", tipo_chave_pix: "email", ...o,
  },
  informativo: { centro: "Ministério de Ensino", categoria: "Material de consumo" },
});
const via = { numero: "DT-2026-0007", versao: 2, codigo: "a1b2c3d4e5f6" };

describe("a Declaração do Terceiro gerada pelo sistema", () => {
  it("cada via traz UMA frase só, a da intenção: reembolso OU oferta, sem caixas para marcar", () => {
    const re = fraseDaIntencao(conteudo().declarado);
    const of = fraseDaIntencao(conteudo({ intencao: "oferta" }).declarado);
    expect(re).toMatch(/Eu, Ana Souza, declaro que realizei o pagamento .* SOLICITO O REEMBOLSO do valor pago\./);
    expect(re).not.toMatch(/OFERTANDO/);
    expect(of).toMatch(/ESTOU OFERTANDO esta despesa, sem solicitar reembolso\./);
    expect(of).not.toMatch(/REEMBOLSO do valor/);
    for (const t of [re, of]) expect(t).not.toMatch(/\(\s*\)|☐|\[ \]/);
  });
  it("o reembolso leva a chave PIX; a oferta não", () => {
    const re = textoDaDeclaracao(via, conteudo());
    const of = textoDaDeclaracao(via, conteudo({ intencao: "oferta", chave_pix: null }));
    expect(re.campos.map(c => c[0])).toContain("Chave PIX");
    expect(re.campos.find(c => c[0] === "Chave PIX")?.[1]).toBe("ana@exemplo.com");
    expect(of.campos.map(c => c[0])).not.toContain("Chave PIX");
  });
  it("reembolso sem chave PIX (recebimento em espécie ou por TED) também gera, dizendo como será combinado", () => {
    const t = textoDaDeclaracao(via, conteudo({ chave_pix: null, tipo_chave_pix: null }));
    expect(t.campos.map(c => c[0])).not.toContain("Chave PIX");
    expect(t.campos.find(c => c[0] === "Recebimento do reembolso")?.[1]).toMatch(/espécie, com recibo assinado, ou transferência/);
  });
  it("mostra número, versão e código de verificação, a forma de pagamento por extenso e o valor em reais", () => {
    const t = textoDaDeclaracao(via, conteudo({ forma_pagamento: "cartao_debito" }));
    expect(t.identificacao).toBe("nº DT-2026-0007 · versão 2 · código de verificação a1b2c3d4e5f6");
    expect(t.campos.find(c => c[0] === "Forma de pagamento")?.[1]).toBe("Cartão de débito");
    expect(t.campos.find(c => c[0] === "Valor")?.[1].replace(/\u00a0/g, " ")).toBe("R$ 240,50");
    expect(t.campos.find(c => c[0] === "Data do pagamento")?.[1]).toBe("05/10/2026");
  });
  it("centro e categoria saem como informação da igreja, fora do que o terceiro assina", () => {
    const t = textoDaDeclaracao(via, conteudo());
    expect(t.informativos).toEqual([["Centro de custo", "Ministério de Ensino"], ["Categoria", "Material de consumo"]]);
    expect(t.campos.map(c => c[0])).not.toContain("Centro de custo");
  });
  it("o PDF sai em UMA folha A4 (duas vias A5) e começa como PDF", async () => {
    const bytes = await montarDeclaracaoPdf(via, conteudo());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
 }, 30_000);
  it("a assinatura tem data e assinatura do declarante", () => {
    const t = textoDaDeclaracao(via, conteudo());
    expect(t.assinaturas.map(a => a.rotulo)).toEqual(["Data da assinatura", "Assinatura do declarante"]);
    expect(t.assinaturas[1].apoio).toBe("Ana Souza");
  });
});

describe("valorPorExtenso", () => {
  it("escreve reais e centavos em português", () => {
    expect(valorPorExtenso(1500)).toBe("mil e quinhentos reais");
    expect(valorPorExtenso(240.5)).toBe("duzentos e quarenta reais e cinquenta centavos");
    expect(valorPorExtenso(2345.67)).toBe("dois mil, trezentos e quarenta e cinco reais e sessenta e sete centavos");
    expect(valorPorExtenso(1)).toBe("um real");
  });
});

describe("o Recibo de Reembolso", () => {
  const dados: DadosDoRecibo = {
    beneficiarioNome: "Lucio Paulo", beneficiarioDocumento: "712.042.024-00", valor: 1500, dataDoPagamento: "2026-10-14", formaDeRecebimento: "Espécie",
    fornecedor: "Leandro Dias", notaNumero: "0017", notaData: "2026-09-22", declaracaoNumero: "DT-2026-0001", saldoDepois: null,
  };
  it("o beneficiário declara ter recebido, com o valor por extenso, e liga à Declaração", () => {
    const t = textoDoRecibo(dados);
    expect(t.titulo).toBe("RECIBO DE REEMBOLSO");
    expect(t.frase).toMatch(/Eu, Lucio Paulo, declaro que recebi .* \(mil e quinhentos reais\)/);
    expect(t.campos.find(c => c[0] === "Declaração do Terceiro")?.[1]).toBe("DT-2026-0001");
    expect(t.campos.map(c => c[0])).not.toContain("Saldo a reembolsar");
  });
  it("reembolso parcial mostra o saldo que falta", () => {
    const t = textoDoRecibo({ ...dados, valor: 1000, saldoDepois: 500 });
    expect(t.campos.find(c => c[0] === "Saldo a reembolsar")?.[1]).toMatch(/500,00.*parcial/);
  });
  it("sai em uma folha A4 com duas vias", async () => {
    const bytes = await montarReciboPdf(dados);
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
 }, 30_000);
});
