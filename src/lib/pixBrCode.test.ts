import { describe, expect, it } from "vitest";
import { montarPayloadPix } from "./pix";
import { acharPixNoTexto, lerPixBrCode } from "./pixBrCode";

describe("lerPixBrCode — o contrário de montarPayloadPix", () => {
  it("lê o que o próprio sistema monta, e o CRC confere", () => {
    const p = montarPayloadPix({ chave: "12345678000199", tipoChave: "cnpj", nomeRecebedor: "Light Servicos", cidade: "Rio de Janeiro", valor: 281.46, identificador: "FAT202610" });
    const r = lerPixBrCode(p)!;
    expect(r).toMatchObject({ chave: "12345678000199", valor: 281.46, nomeRecebedor: "LIGHT SERVICOS", cidade: "RIO DE JANEIRO", txid: "FAT202610", crcValido: true });
  });
  it("sem valor (Pix em aberto) e sem identificador", () => {
    const r = lerPixBrCode(montarPayloadPix({ chave: "pix@igreja.org.br", nomeRecebedor: "Igreja" }))!;
    expect(r.valor).toBeNull();
    expect(r.txid).toBeNull();
    expect(r.chave).toBe("pix@igreja.org.br");
  });
  it("um caractere trocado (OCR) NÃO passa no CRC — o sistema avisa em vez de oferecer o Pix errado", () => {
    const p = montarPayloadPix({ chave: "12345678000199", nomeRecebedor: "Light", valor: 100 });
    const ruim = p.replace("100.00", "180.00");
    expect(lerPixBrCode(ruim)!.crcValido).toBe(false);
  });
  it("texto que não é BR Code", () => {
    expect(lerPixBrCode("qualquer coisa")).toBeNull();
    expect(lerPixBrCode("0002010102")).toBeNull();
  });
});

describe("acharPixNoTexto", () => {
  const p = montarPayloadPix({ chave: "12345678000199", tipoChave: "cnpj", nomeRecebedor: "Prefeitura RJ", valor: 1250 });
  it("acha dentro do texto de um PDF, mesmo quebrado em linhas", () => {
    const quebrado = p.match(/.{1,40}/g)!.join("\n");
    const r = acharPixNoTexto(`Pague com Pix\nCopia e Cola:\n${quebrado}\nObrigado`)!;
    expect(r.crcValido).toBe(true);
    expect(r.valor).toBe(1250);
  });
  it("sem Pix no texto: null", () => {
    expect(acharPixNoTexto("Boleto 34191.79001 01043.510047")).toBeNull();
  });
});
