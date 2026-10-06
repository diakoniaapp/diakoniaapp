import { describe, expect, it } from "vitest";
import { montarPayloadPix } from "../pix";
import { dadosParaGuardar, lerDocumentoDePagamento, acharCodigosNumericos } from "./pagamento";

// ── montagem de códigos VÁLIDOS (o teste não depende de um documento real) ──
function modulo10(c: string) {
  let s = 0, p = 2;
  for (let i = c.length - 1; i >= 0; i--) { let x = Number(c[i]) * p; if (x > 9) x = Math.floor(x / 10) + (x % 10); s += x; p = p === 2 ? 1 : 2; }
  const r = s % 10;
  return r === 0 ? 0 : 10 - r;
}
/** Linha digitável de cobrança (47) com banco, vencimento (ciclo novo do fator) e valor. */
function linhaDeBoleto(banco: string, vencimento: string, centavos: number) {
  const dias = Math.round((Date.parse(vencimento + "T00:00:00Z") - Date.parse("2025-02-22T00:00:00Z")) / 86400000);
  const fator = String(1000 + dias);
  const livre = "1234567890123456789012345";
  const c1 = banco + "9" + livre.slice(0, 5), c2 = livre.slice(5, 15), c3 = livre.slice(15, 25);
  return c1 + modulo10(c1) + c2 + modulo10(c2) + c3 + modulo10(c3) + "1" + fator + String(centavos).padStart(10, "0");
}
function barrasDeArrecadacao(segmento: string, centavos: number, resto: string) {
  const semDv = "8" + segmento + "6" + String(centavos).padStart(11, "0") + resto.padEnd(29, "0");
  return semDv.slice(0, 3) + modulo10(semDv) + semDv.slice(3);
}
const linha48 = (b: string) => Array.from({ length: 4 }, (_, i) => { const x = b.slice(i * 11, i * 11 + 11); return x + modulo10(x); }).join(" ");

describe("boleto bancário", () => {
  const linha = linhaDeBoleto("341", "2026-10-12", 132090);
  const texto = `Itaú Unibanco S.A.  341-7  ${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} ${linha.slice(21, 26)}.${linha.slice(26, 32)} ${linha.slice(32, 33)} ${linha.slice(33)}
Beneficiário
F5 INFORMATICA LTDA
CNPJ: 12.345.678/0001-95
Nosso número 109/12345678-9
Vencimento 12/10/2026
Valor do documento 1.320,90
Pagador: QUARTA IGREJA BATISTA DO RIO DE JANEIRO CNPJ 27.639.285/0001-61`;

  it("extrai linha digitável, valor, vencimento, banco, beneficiário e CNPJ", () => {
    const d = lerDocumentoDePagamento(texto);
    expect(d).toMatchObject({
      tipo: "boleto", valor: 1320.9, vencimento: "2026-10-12", beneficiario: "F5 INFORMATICA LTDA",
      cnpjBeneficiario: "12345678000195", codigoValido: true,
    });
    expect(d.banco).toEqual({ codigo: "341", nome: "Itaú" });
    expect(d.linhaDigitavel).toBe(linha);
    expect(d.confianca).toBeGreaterThan(85);
    expect(d.avisos).toEqual([]);
  });

  it("nunca devolve o CNPJ da própria igreja como beneficiário", () => {
    const d = lerDocumentoDePagamento(`Pagador CNPJ 27.639.285/0001-61\n${linha}`);
    expect(d.cnpjBeneficiario).toBeNull();
  });

  it("valor impresso diferente do código: vale o do código e AVISA", () => {
    const d = lerDocumentoDePagamento(texto.replace("1.320,90", "1.400,00"));
    expect(d.valor).toBe(1320.9);
    expect(d.avisos.join(" ")).toMatch(/difere/);
  });

  it("dígito trocado na linha: não inventa valor do código, avisa e usa o do texto", () => {
    const errada = linha.slice(0, 3) + (linha[3] === "1" ? "2" : "1") + linha.slice(4);
    const d = lerDocumentoDePagamento(`Beneficiário\nLoja X LTDA\nValor do documento 50,00\n${errada}`);
    expect(d.codigoValido).toBe(false);
    expect(d.valor).toBe(50);
    expect(d.avisos.join(" ")).toMatch(/verificadores/);
  });
});

describe("guias", () => {
  it("DARF: tipo, receita, valor total, vencimento e competência — beneficiário padrão da Receita", () => {
    const d = lerDocumentoDePagamento(`MINISTÉRIO DA FAZENDA — Documento de Arrecadação de Receitas Federais
DARF
Período de Apuração 31/08/2026
Código da Receita 6912
Data de Vencimento 20/10/2026
Valor Total do Documento 1.234,56`);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "darf", valor: 1234.56, vencimento: "2026-10-20", competencia: "2026-08", beneficiario: "Receita Federal do Brasil" });
    expect(d.rotulo).toBe("DARF · receita 6912");
  });

  it("DARF de IRRF (código 1708)", () => {
    const d = lerDocumentoDePagamento("DARF\nCódigo da Receita 1708\nVencimento 20/10/2026\nValor total 420,00");
    expect(d.subtipoGuia).toBe("irrf");
    expect(d.valor).toBe(420);
  });

  it("GPS (INSS) e FGTS", () => {
    expect(lerDocumentoDePagamento("GUIA DA PREVIDÊNCIA SOCIAL - GPS\nCompetência 09/2026\nVencimento 20/10/2026\nValor total 1.100,00")).toMatchObject({ tipo: "guia", subtipoGuia: "gps", competencia: "2026-09" });
    const f = lerDocumentoDePagamento("Guia de Recolhimento do FGTS - GRF\nCompetência 09/2026\nVencimento 07/10/2026\nValor a recolher 612,45\nValor a pagar 612,45");
    expect(f).toMatchObject({ tipo: "guia", subtipoGuia: "fgts", valor: 612.45, vencimento: "2026-10-07" });
    expect(f.beneficiario).toMatch(/Caixa/);
  });

  it("ISS da Prefeitura, com código de arrecadação de 48 dígitos (o exemplo dela: R$ 1.250,00)", () => {
    const barras = barrasDeArrecadacao("1", 125000, "00394460");
    const d = lerDocumentoDePagamento(`PREFEITURA DA CIDADE DO RIO DE JANEIRO
Guia de recolhimento de ISS — ISSQN
Vencimento 12/10/2026
${linha48(barras)}`);
    expect(d).toMatchObject({ tipo: "guia", subtipoGuia: "iss", valor: 1250, vencimento: "2026-10-12", codigoValido: true });
    expect(d.beneficiario).toMatch(/Prefeitura/);
    expect(d.codigoBarras).toBe(barras);
  });

  it("guia por segmento (prefeitura) mesmo sem a palavra 'guia' no texto", () => {
    const d = lerDocumentoDePagamento(`Documento de pagamento\nVencimento 15/10/2026\n${linha48(barrasDeArrecadacao("5", 33000, "11111111"))}`);
    expect(d.tipo).toBe("guia");
    expect(d.valor).toBe(330);
  });
});

describe("faturas", () => {
  it("fatura de energia com código de arrecadação (segmento 3)", () => {
    const b = barrasDeArrecadacao("3", 281146, "00012345");
    const d = lerDocumentoDePagamento(`LIGHT SERVIÇOS DE ELETRICIDADE S/A
Fatura de energia elétrica — Unidade consumidora 123
Vencimento 15/10/2026
${linha48(b)}`);
    expect(d).toMatchObject({ tipo: "fatura", subtipoFatura: "energia", valor: 2811.46, vencimento: "2026-10-15" });
    expect(d.rotulo).toBe("Fatura de energia");
    expect(d.convenio).toBe("3-0001");
  });

  it("fatura de internet paga por boleto de cobrança continua fatura", () => {
    const linha = linhaDeBoleto("756", "2026-10-25", 14990);
    const d = lerDocumentoDePagamento(`Fatura Provedor Fibra Internet\nBeneficiário\nNET FIBRA LTDA\n${linha}`);
    expect(d.tipo).toBe("fatura");
    expect(d.subtipoFatura).toBe("internet");
    expect(d.valor).toBe(149.9);
  });
});

describe("Pix", () => {
  const payload = montarPayloadPix({ chave: "12345678000199", tipoChave: "cnpj", nomeRecebedor: "Prefeitura RJ", valor: 1250 });
  it("só Pix: tipo pix, valor e recebedor do próprio payload", () => {
    const d = lerDocumentoDePagamento(`Pix copia e cola\n${payload}`);
    expect(d).toMatchObject({ tipo: "pix", valor: 1250, beneficiario: "PREFEITURA RJ" });
    expect(d.pix?.crcValido).toBe(true);
  });
  it("boleto híbrido: boleto com Pix junto", () => {
    const linha = linhaDeBoleto("237", "2026-11-05", 50000);
    const d = lerDocumentoDePagamento(`Beneficiário\nCondomínio Edifício X\n${linha}\n${payload}`);
    expect(d.tipo).toBe("boleto");
    expect(d.pix).not.toBeNull();
  });
});

describe("outros", () => {
  it("texto sem nada de pagamento: desconhecido, sem inventar campos", () => {
    const d = lerDocumentoDePagamento("Ata da reunião de diretoria de 10/09/2026.");
    expect(d).toMatchObject({ tipo: "desconhecido", valor: null, vencimento: null, linhaDigitavel: null });
    expect(d.confianca).toBeLessThan(40);
  });
  it("folha de pagamento que cita INSS e FGTS NÃO é guia", () => {
    expect(lerDocumentoDePagamento("Demonstrativo de Pagamento de Salário\nINSS 11% FGTS 8% Vencimento 05/10/2026").tipo).not.toBe("guia");
  });
  it("achar códigos: ignora números que não têm 44/47/48 dígitos", () => {
    expect(acharCodigosNumericos("CNPJ 12.345.678/0001-95 tel 21 98399-1229")).toEqual([]);
  });
  it("dadosParaGuardar leva só o que serve para pagar depois", () => {
    const d = lerDocumentoDePagamento("DARF\nCódigo da Receita 1708\nVencimento 20/10/2026\nValor total 420,00");
    const g = dadosParaGuardar(d);
    expect(g).toMatchObject({ versao: 1, tipo: "guia", subtipoGuia: "irrf", valor: 420, vencimento: "2026-10-20" });
    expect(JSON.stringify(g)).not.toContain("MINISTÉRIO");
  });
});
