import { describe, expect, it } from "vitest";
import { extrairNome } from "./identificacao";
import { encontrarCandidatoPorNome, normalizarNome } from "./fuzzyNome";

describe("extrairNome — o nome que a descrição já traz", () => {
  it("PIX recebido: o nome depois de REM:", () => {
    expect(extrairNome("PIX RECEBIDO REM: VANESSA DO NASCIMENTO")).toMatchObject({ nome: "VANESSA DO NASCIMENTO", forma: "pix" });
  });
  it("com a categoria escrita junto do nome (Missões)", () => {
    expect(extrairNome("PIX RECEBIDO REM: JOÃO SILVA MISSÕES")).toMatchObject({ nome: "JOÃO SILVA", categoria: "missoes", forma: "pix" });
  });
  it("PIX enviado: DES sem dois-pontos e o dia/mês colado no fim (0109) não são o nome", () => {
    expect(extrairNome("PIX ENVIADO DES MARCO ANTONIO HERCULA 0109").nome).toBe("MARCO ANTONIO HERCULA");
    expect(extrairNome("PIX ENVIADO DES L cio Paulo Paz Barre 0109").nome).toBe("L cio Paulo Paz Barre");
  });
  it("dízimo e oferta escritos na descrição viram dica de categoria, não parte do nome", () => {
    expect(extrairNome("Dízimo - Maria Souza")).toMatchObject({ nome: "Maria Souza", categoria: "dizimo" });
    expect(extrairNome("Oferta João Carlos")).toMatchObject({ nome: "João Carlos", categoria: "oferta" });
  });
  it("só o nome, como nos lançamentos do caixa de envelopes", () => {
    expect(extrairNome("Mª José Gregório").nome).toBe("Mª José Gregório");
    expect(extrairNome("Maria Jose Araujo Pereira").nome).toBe("Maria Jose Araujo Pereira");
  });
  it("anônimo: não é nome, e diz por quê", () => {
    expect(extrairNome("PIX RECEBIDO REM: ANÔNIMO")).toMatchObject({ nome: null, semNome: "anonimo", forma: "pix" });
  });
  it("transferência entre contas, guia de imposto e ofertas não identificadas não são nome", () => {
    expect(extrairNome("Transferência: Bradesco → Caixa de Aplicação (saída)").semNome).toBe("transferencia");
    for (const g of ["DARF PREVIDENCIARIO", "GRF FGTS", "GPS INSS COMPETENCIA 09", "ISS PREFEITURA"]) expect(extrairNome(g).semNome, g).toBe("guia");
    expect(extrairNome("OFERTAS NÃO IDENTIFICADAS").semNome).toBe("anonimo");
  });
  it("\"das\" de Maria das Dores NÃO é guia", () => {
    expect(extrairNome("Maria das Dores Silva")).toMatchObject({ nome: "Maria das Dores Silva" });
  });
  it("tarifa e rendimento: não procura no cadastro", () => {
    expect(extrairNome("TARIFA BANCARIA TRANSF PGTO PIX")).toMatchObject({ nome: null, semNome: "tarifa" });
    expect(extrairNome("RENDIMENTO APLICACAO AUTOMATICA").semNome).toBe("tarifa");
  });
  it("vazio, só números ou curto demais: nenhum nome", () => {
    for (const d of [null, undefined, "", "   ", "0109", "R$ 500,00", "Ab"]) expect(extrairNome(d).nome, String(d)).toBeNull();
  });
  it("CPF e documento no meio não entram no nome", () => {
    expect(extrairNome("TED REM: JOSE DA SILVA 123.456.789-00").nome).toBe("JOSE DA SILVA");
  });
  it("devolve a grafia original (maiúsculas e acento) quando a sequência está no texto", () => {
    expect(extrairNome("pix recebido rem: Vanessa do Nascimento").nome).toBe("Vanessa do Nascimento");
  });
});

describe("casar o nome extraído com o cadastro", () => {
  const cadastro = [
    { id: "1", nome: "Maria José Gregório" },
    { id: "2", nome: "Maria José Araujo Pereira" },
    { id: "3", nome: "Vanessa do Nascimento" },
    { id: "4", nome: "Marco Antonio Herculano" },
    { id: "5", nome: "Marcos Antonio Silva" },
  ];
  it("Mª é Maria (o caso do print)", () => {
    expect(normalizarNome("Mª José Gregório")).toBe("maria jose gregorio");
    expect(encontrarCandidatoPorNome("Mª José Gregório", cadastro)?.id).toBe("1");
    expect(encontrarCandidatoPorNome("M.ª José Gregório", cadastro)?.id).toBe("1");
  });
  it("nome idêntico, sem acento e em maiúsculas (como vem do banco)", () => {
    expect(encontrarCandidatoPorNome("VANESSA DO NASCIMENTO", cadastro)?.id).toBe("3");
  });
  it("nome TRUNCADO pelo banco (20 letras) acha o único que começa assim", () => {
    expect(encontrarCandidatoPorNome("MARCO ANTONIO HERCULA", cadastro)?.id).toBe("4");
  });
  it("truncado ambíguo ou curto demais: não adivinha", () => {
    expect(encontrarCandidatoPorNome("Maria José", cadastro)).toBeNull(); // 2 Marias José
    expect(encontrarCandidatoPorNome("MARCO ANTONIO", [{ id: "a", nome: "Marco Antonio Herculano" }, { id: "b", nome: "Marco Antonio Dias" }])).toBeNull();
  });
  it("sem correspondência: nada", () => {
    expect(encontrarCandidatoPorNome("Fulana de Tal Inexistente", cadastro)).toBeNull();
  });
});