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

describe("apelido: a sigla em maiúsculas dentro do nome cadastrado (08/10/2026)", () => {
  const G: CandidatoFavorecido[] = [
    { id: "ceg", nome: "Companhia Distribuidora de Gás do Rio de Janeiro - CEG", pj: true },
    { id: "abc", nome: "ABC - Associação de Benefícios e Convênios", pj: true },
    { id: "x1", nome: "Outra Empresa EPP", pj: true },
  ];
  it("'CONTA DE GAS CEG CAPITAL/GDE RIO' é a CEG", () => {
    const r = favorecidoNoTexto("CONTA DE GAS CEG CAPITAL/GDE RIO-09325622", G);
    expect(r?.candidato.id).toBe("ceg");
    expect(r?.via).toBe("apelido");
  });
  it("sufixos societários e UF não são apelido; sigla repetida em dois fornecedores não decide", () => {
    expect(favorecidoNoTexto("PAGTO EPP LTDA RJ", G)).toBeNull();
    expect(favorecidoNoTexto("CONTA CEG", [...G, { id: "ceg2", nome: "Outra CEG Ltda", pj: true }])).toBeNull();
  });
});

describe("apelido só vale em nome cadastrado com maiúsculas e minúsculas (08/10/2026)", () => {
  it("nome TODO em maiúsculas (Omie/CPF) não vira sigla: 'SOUZA' não é apelido de ninguém", () => {
    const G: CandidatoFavorecido[] = [{ id: "josimar", nome: "JOSIMAR BIANCHI DE SOUZA 01341978605" }, { id: "ceg", nome: "Companhia Distribuidora de Gás - CEG", pj: true }];
    expect(favorecidoNoTexto("PIX ENVIADO DES: DANIEL ALVES SOUZA 09/09", G)).toBeNull();
    expect(favorecidoNoTexto("CONTA DE GAS CEG CAPITAL", G)?.candidato.id).toBe("ceg");
  });
  it("o nome inteiro vence o apelido: o apelido é o último recurso", () => {
    const G: CandidatoFavorecido[] = [{ id: "daniel", nome: "Daniel Alves Souza" }, { id: "ceg", nome: "Companhia Distribuidora de Gás - CEG", pj: true }];
    expect(favorecidoNoTexto("PIX ENVIADO DES: DANIEL ALVES SOUZA CEG", G)?.candidato.id).toBe("daniel");
  });
});
