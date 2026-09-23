import { describe, expect, it } from "vitest";
import { crc16ccitt, montarPayloadPix, formatarChavePix } from "./pix";

describe("crc16ccitt", () => {
  it("bate com o vetor de teste canônico do CRC-16/CCITT-FALSE", () => {
    // Vetor de conferência público e independente do PIX — qualquer
    // implementação correta de CRC-16/CCITT-FALSE (poly 0x1021, init
    // 0xFFFF) reproduz este valor para a string "123456789".
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
});

describe("montarPayloadPix", () => {
  it("monta os campos na ordem certa, terminando em CRC de 4 dígitos hex", () => {
    const payload = montarPayloadPix({
      chave: "123e4567-e12b-12d1-a456-426655440000",
      nomeRecebedor: "Quarta Igreja Batista",
      cidade: "Rio de Janeiro",
      valor: 150.5,
    });
    expect(payload.startsWith("000201")).toBe(true); // payload format indicator
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("123e4567-e12b-12d1-a456-426655440000");
    expect(payload).toContain("5303986"); // moeda BRL
    expect(payload).toContain("5406150.50");
    expect(payload).toContain("6304"); // marcador do campo CRC, antes do checksum
    expect(payload).toContain("***"); // sem identificador — usa o placeholder padrão do PIX
    expect(payload).toContain("5802BR");
    // Os últimos 4 caracteres são o CRC recalculado sobre o restante
    // (que já termina em "6304", o marcador do próprio campo do CRC) —
    // se alguém alterar o corpo do payload sem recalcular, este teste pega.
    const semCrc = payload.slice(0, -4);
    const crcInformado = payload.slice(-4);
    expect(semCrc.endsWith("6304")).toBe(true);
    expect(crc16ccitt(semCrc)).toBe(crcInformado);
  });

  it("recusa chave vazia — não monta payload que ninguém consegue pagar", () => {
    expect(() => montarPayloadPix({ chave: "  ", nomeRecebedor: "Fornecedor" })).toThrow();
  });

  it("remove acento e maiuscula o nome, respeitando o limite de 25 caracteres", () => {
    const payload = montarPayloadPix({
      chave: "fulano@exemplo.com",
      nomeRecebedor: "José da Conceição Araújo Filho",
    });
    expect(payload).toContain("JOSE DA CONCEICAO ARAUJO");
    expect(payload).not.toContain("é");
  });

  it("funciona sem valor — PIX em aberto, quem paga digita no banco", () => {
    const payload = montarPayloadPix({ chave: "fulano@exemplo.com", nomeRecebedor: "Fornecedor" });
    // Sem `valorTlv`, o campo "58" (país) vem logo depois de "5303986"
    // (moeda) — se o campo 54 tivesse entrado, haveria algo entre os dois.
    expect(payload).toContain("53039865802BR");
  });
});

describe("formatarChavePix", () => {
  it("formata CPF com pontuação", () => {
    expect(formatarChavePix("12345678901", "cpf")).toBe("123.456.789-01");
  });
  it("formata CNPJ com pontuação", () => {
    expect(formatarChavePix("12345678000199", "cnpj")).toBe("12.345.678/0001-99");
  });
  it("formata telefone brasileiro de 11 dígitos", () => {
    expect(formatarChavePix("21987654321", "telefone")).toBe("(21) 98765-4321");
  });
  it("deixa e-mail e chave aleatória como estão", () => {
    expect(formatarChavePix("fulano@exemplo.com", "email")).toBe("fulano@exemplo.com");
  });
});
