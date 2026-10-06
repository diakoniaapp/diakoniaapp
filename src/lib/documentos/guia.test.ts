import { describe, expect, it } from "vitest";
import { beneficiarioPadraoDaGuia, codigoDaReceita, identificarGuia } from "./guia";

describe("identificarGuia", () => {
  it("DARF e o IRRF pelo código da receita", () => {
    expect(identificarGuia("MINISTÉRIO DA FAZENDA\nDocumento de Arrecadação de Receitas Federais\nCódigo da receita 6912")).toBe("darf");
    expect(identificarGuia("DARF\nCódigo da Receita: 1708 Período de apuração 30/09/2026")).toBe("irrf");
    expect(codigoDaReceita("Código da Receita: 1708")).toBe("1708");
  });
  it("GPS (INSS)", () => {
    expect(identificarGuia("GUIA DA PREVIDÊNCIA SOCIAL - GPS\nCompetência 09/2026")).toBe("gps");
  });
  it("FGTS: só com a frase da guia", () => {
    expect(identificarGuia("Guia de Recolhimento do FGTS - GRF\nCompetência 09/2026")).toBe("fgts");
    expect(identificarGuia("FGTS Digital — guia gerada")).toBe("fgts");
  });
  it("ISS da Prefeitura (o exemplo dela)", () => {
    expect(identificarGuia("PREFEITURA DA CIDADE DO RIO DE JANEIRO\nGuia de recolhimento de ISS — ISSQN\nVencimento 12/10/2026")).toBe("iss");
  });
  it("Simples Nacional e taxa do Corpo de Bombeiros", () => {
    expect(identificarGuia("Documento de Arrecadação do Simples Nacional (DAS)")).toBe("das");
    expect(identificarGuia("FUNESBOM - Taxa de incêndio")).toBe("taxa");
  });
  it("guia genérica", () => {
    expect(identificarGuia("Documento de Arrecadação Municipal — DAM")).toBe("outra");
  });
  it("NÃO confunde folha de pagamento, NFS-e com ISS retido, boleto ou contrato", () => {
    expect(identificarGuia("Demonstrativo de Pagamento de Salário\nINSS 11%  FGTS 8% IRRF")).toBeNull();
    expect(identificarGuia("NFS-e Nota Fiscal de Serviço\nISS retido: R$ 12,00 — alíquota do ISS 5%")).toBeNull();
    expect(identificarGuia("Boleto bancário — Beneficiário Light — Linha digitável 34191...")).toBeNull();
    expect(identificarGuia("Contrato de prestação de serviços; o contratado recolherá o ISS e o INSS devidos")).toBeNull();
  });
});

describe("beneficiarioPadraoDaGuia", () => {
  it("federais têm destinatário fixo; municipais não", () => {
    expect(beneficiarioPadraoDaGuia("darf")).toBe("Receita Federal do Brasil");
    expect(beneficiarioPadraoDaGuia("fgts")).toMatch(/Caixa/);
    expect(beneficiarioPadraoDaGuia("iss")).toBeNull();
  });
});
