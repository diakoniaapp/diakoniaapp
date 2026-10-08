import { describe, expect, it } from "vitest";
import { favorecidoNoTexto, type CandidatoFavorecido } from "./favorecidoNoTexto";

const F: CandidatoFavorecido[] = [
  { id: "aguas", nome: "Aguas do Rio 4 Spe S.A", pj: true },
  { id: "claro", nome: "Claro S.A.", pj: true },
  { id: "light", nome: "Light Servicos de Eletricidade S.A", pj: true },
  { id: "amil", nome: "Amil Assistencia Medica Internacional S.A.", pj: true },
  { id: "rfb", nome: "Receita Federal do Brasil (RFB)", pj: true },
  { id: "fgts", nome: "FGTS Digital", pj: true },
  { id: "pref", nome: "Prefeitura da Cidade do Rio de Janeiro", pj: true },
  { id: "net1", nome: "Um Net Comercial LTDA", pj: true },
  { id: "net2", nome: "Net Acessorios - Net Cofres", pj: true },
  { id: "marco", nome: "Marco Antonio Hercula" },
  { id: "marco2", nome: "Marco Aurelio Souza" },
];
const ache = (memo: string) => favorecidoNoTexto(memo, F)?.candidato.id ?? null;

describe("o favorecido que o texto do extrato cita", () => {
  it("conta de consumo: o nome inteiro ou a marca da empresa", () => {
    expect(ache("CONTA DE AGUA AGUAS DO RIO 4-4000487182")).toBe("aguas");
    expect(ache("CONTA DE TELEFONE CLARO S/A - MOVEL-138094734")).toBe("claro");
    expect(ache("CONTA DE LUZ LIGHT-RJ-010063512257")).toBe("light");   // marca: "Light Serviços de Eletricidade" aparece só como LIGHT
    expect(ache("PAGTO ELETRON  COBRANCA AMIL")).toBe("amil");
  });
  it("tributos: a sigla leva ao favorecido oficial", () => {
    expect(favorecidoNoTexto("PAGTO ELETRONICO TRIBUTO DARF 1234", F)).toMatchObject({ candidato: { id: "rfb" }, via: "sigla" });
    expect(ache("PAGAMENTO GPS INSS COMPETENCIA 09")).toBe("rfb");
    expect(ache("PAGTO ELETRON FGTS DIGITAL")).toBe("fgts");
    expect(ache("TRIBUTO ISS PREFEITURA")).toBe("pref");
    expect(ache("PAGTO ELETRONICO TRIBUTO INTERNET --P.M RIO")).toBe("pref");   // como o Bradesco escreve a guia da Prefeitura
  });
  it("sigla sem favorecido oficial cadastrado: não adivinha", () => {
    expect(favorecidoNoTexto("TRIBUTO DARF", F.filter(f => f.id !== "rfb"))).toBeNull();
  });
  it("marca compartilhada por duas empresas NÃO decide (Net)", () => {
    expect(ache("PAGTO ELETRON COBRANCA NET EMPRESARIAL")).toBeNull();
  });
  it("texto genérico de banco não cita ninguém", () => {
    expect(ache("PAGTO ELETRON  COBRANCA PAG COBRANCA NET EMPR")).toBeNull();
    expect(ache("TARIFA BANCARIA TRANSF PGTO PIX")).toBeNull();
  });
  it("pessoa física (sem CNPJ) só casa com o nome inteiro, nunca pela primeira palavra", () => {
    expect(ache("PIX ENVIADO DES MARCO AURELIO SOUZA")).toBe("marco2");
    expect(ache("PIX ENVIADO DES MARCO PAULO")).toBeNull();
  });
  it("palavras comuns demais não valem sozinhas (Igreja, Rio, Prefeitura)", () => {
    const so = [{ id: "x", nome: "Igreja Batista", pj: true }, { id: "y", nome: "Rio Janeiro", pj: true }];
    expect(favorecidoNoTexto("PIX RECEBIDO REM IGREJA BATISTA DO RIO", so)).toBeNull();
  });
});
