import { describe, expect, it } from "vitest";
import { lerNomeDeArquivo } from "./nomeArquivo";

// Nomes SINTÉTICOS no padrão da tesouraria (fornecedores inventados).

describe("convenção de nomes da tesouraria", () => {
  it("o padrão completo: data - R$valor _ NF _ FORNECEDOR _ PG forma", () => {
    expect(lerNomeDeArquivo("03.08.2026 - R$297,00 _ NF577 _ PAPELARIA EXEMPLO _ PG BANKLINE.pdf")).toEqual({
      data: "2026-08-03", valor: 297, nf: "577", fornecedor: "PAPELARIA EXEMPLO",
      forma: "BANKLINE", parcela: null, tipoDocumento: null, recibo: null,
    });
  });

  it("valor com milhar e vírgula; NF com pontos", () => {
    const r = lerNomeDeArquivo("25.08.2026 - R$5.400,00 _ NF000.051.078 _ PISOS EXEMPLO LTDA _ PG BANKLINE.pdf");
    expect(r.valor).toBe(5400);
    expect(r.nf).toBe("000051078");
  });

  it("valor sem centavos (R$2.420) e '.pdf.pdf'", () => {
    const r = lerNomeDeArquivo("24.08.2026 - R$2.420 _ NF157 _ PRESTADOR EXEMPLO _ PG BANKLINE.pdf.pdf");
    expect(r.valor).toBe(2420);
    expect(r.fornecedor).toBe("PRESTADOR EXEMPLO");
  });

  it("compra parcelada no cartão: parcela 04_10", () => {
    const r = lerNomeDeArquivo("10.08.2026 - R$129,90 _ NF311.998 _ INFORMATICA EXEMPLO LTDA _ 04_10 _ PG VISA.pdf");
    expect(r.parcela).toEqual({ numero: 4, total: 10 });
    expect(r.forma).toBe("VISA");
    expect(r.fornecedor).toBe("INFORMATICA EXEMPLO LTDA");
  });

  it("sem NF: fatura de concessionária", () => {
    const r = lerNomeDeArquivo("03.08.2026 - R$1.135,07 _ FATURA AGUAS EXEMPLO.pdf");
    expect(r.nf).toBeNull();
    expect(r.valor).toBe(1135.07);
    expect(r.fornecedor).toBe("FATURA AGUAS EXEMPLO");
  });

  it("tipo explícito: BOLETO", () => {
    const r = lerNomeDeArquivo("20.08.2026 - R$360,00 _ GRAFICA EXEMPLO _ BOLETO _ PG BANKLINE.pdf");
    expect(r.tipoDocumento).toBe("BOLETO");
    expect(r.fornecedor).toBe("GRAFICA EXEMPLO");
  });

  it("recibo de autônomo: o 'fornecedor' é a função", () => {
    const r = lerNomeDeArquivo("03.08.2026 - R$1.934,00 _ RPS _ FAXINEIRA _ PG BANKLINE.pdf");
    expect(r.recibo).toBe("RPS");
    expect(r.fornecedor).toBe("FAXINEIRA");
  });

  it("forma colada no fim, sem separador ('TIM SA PG BANKLINE')", () => {
    const r = lerNomeDeArquivo("31.08.2026 - R$114,18 TIM SA _ PG BANKLINE.pdf");
    expect(r.valor).toBe(114.18);
    expect(r.fornecedor).toBe("TIM SA");
    expect(r.forma).toBe("BANKLINE");
  });

  it("sem data no nome (a data estava só na pasta)", () => {
    const r = lerNomeDeArquivo("R$1.925,00 _ NF156 _ PRESTADOR EXEMPLO _ 3.3 _ PG BANKLINE.pdf");
    expect(r.data).toBeNull();
    expect(r.valor).toBe(1925);
    expect(r.nf).toBe("156");
    expect(r.fornecedor).toBe("PRESTADOR EXEMPLO");
  });

  it("aceita o caminho da pasta e ESPÉCIE com acento", () => {
    const r = lerNomeDeArquivo("02. CAIXA AUXILIAR/18.AGO/18.08.2026 - R$45,94 _ NF216234 _ MERCADO EXEMPLO _ PG ESPÉCIE.pdf");
    expect(r.forma).toBe("ESPECIE");
    expect(r.data).toBe("2026-08-18");
  });

  it("nome sem o padrão: não inventa nada", () => {
    expect(lerNomeDeArquivo("scan0001.pdf")).toEqual({
      data: null, valor: null, nf: null, fornecedor: "scan0001", forma: null, parcela: null, tipoDocumento: null, recibo: null,
    });
  });
});
