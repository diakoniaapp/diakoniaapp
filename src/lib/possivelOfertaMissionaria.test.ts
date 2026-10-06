import { describe, expect, it } from "vitest";
import { possivelOfertaMissionaria, terminaEmDezCentavos, type LancamentoParaOferta } from "./possivelOfertaMissionaria";

const pix = (p: Partial<LancamentoParaOferta> = {}): LancamentoParaOferta => ({
  tipo: "entrada", valor: 2000.1, origem: "importado_omie", categoriaNome: "Dizimos",
  texto: "FULANA DE TAL |  TRANSFERENCIA PIX REM FULANA DE TAL 290", ...p,
});

describe("terminaEmDezCentavos", () => {
  it("lê os centavos sem erro de ponto flutuante", () => {
    expect(terminaEmDezCentavos(2000.1)).toBe(true);
    expect(terminaEmDezCentavos(600.1)).toBe(true);
    expect(terminaEmDezCentavos(1100.1)).toBe(true);     // 1100.1*100 = 110010.00000000001 em ponto flutuante
    expect(terminaEmDezCentavos(500.01)).toBe(false);    // a marca é ",10", não ",01"
    expect(terminaEmDezCentavos(500.11)).toBe(false);
    expect(terminaEmDezCentavos(500)).toBe(false);
  });
});

describe("possivelOfertaMissionaria — só sinaliza Pix ',10' fora de missões", () => {
  it("Dízimo recebido por Pix com ,10 → sinaliza (os 3 de Mundiais 2025)", () => {
    expect(possivelOfertaMissionaria(pix())).toBe(true);
    expect(possivelOfertaMissionaria(pix({ valor: 600.1 }))).toBe(true);
    expect(possivelOfertaMissionaria(pix({ valor: 500.1, categoriaNome: "Ofertas" }))).toBe(true);
  });

  it("já em Ofertas para Missões (ou repasse) → não sinaliza", () => {
    expect(possivelOfertaMissionaria(pix({ categoriaNome: "Ofertas para Missões" }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ categoriaNome: "Repasses Missionários" }))).toBe(false);
  });

  it("não é Pix (espécie, TED) → não sinaliza: a convenção foi descrita para Pix", () => {
    expect(possivelOfertaMissionaria(pix({ texto: "Envelope do culto" }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ texto: "LUCIA |  TEDTRANSF ELET DISPON REMET" }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ texto: null }))).toBe(false);
  });

  it("repasse de maquininha (Cielo) → não sinaliza: ,10 ali é soma de vendas", () => {
    expect(possivelOfertaMissionaria(pix({ valor: 97.1, texto: "CIELO S.A - INSTITUICAO DE PAGAMENTO |  BAZAR MISSÕES TRANSFERENCIA PIX" }))).toBe(false);
  });

  it("rendimento, centavo solto, saída e transferência → não sinaliza", () => {
    expect(possivelOfertaMissionaria(pix({ valor: 0.1, categoriaNome: "Rendimentos de Aplicações" }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ valor: 1.1 }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ tipo: "saida" }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ origem: "transferencia" }))).toBe(false);
  });

  it("valor sem ,10 → não sinaliza", () => {
    expect(possivelOfertaMissionaria(pix({ valor: 2000 }))).toBe(false);
    expect(possivelOfertaMissionaria(pix({ valor: 1630.01 }))).toBe(false);
  });
});
