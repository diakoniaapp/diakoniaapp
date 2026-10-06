import { describe, expect, it } from "vitest";
import {
  ORDEM_DOCUMENTAL, ddmmaaaa, documentoNoNome, formatoDoArquivo, idCurto, limparFornecedor,
  nomeBaseDoDossie, normalizarParaNome, ordenarPartes, tipoPrincipal, truncarFornecedor, valorNoNome,
} from "./dossie";
import { orientacaoExif } from "./reduzirImagem";

describe("normalização do nome (regra dela)", () => {
  it("sem acento, sem especial, espaço vira _, maiúsculas", () => {
    expect(normalizarParaNome("Ana Patrícia da Silva de Lima Oliveira")).toBe("ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA");
  });
  it("barras, aspas e caracteres inválidos do Windows somem", () => {
    expect(normalizarParaNome('A/B "C": D*E?F<G>H|I\\J')).toBe("A_B_C_D_E_F_G_H_I_J");
    expect(normalizarParaNome("  Café   &  Cia.  ")).toBe("CAFE_CIA");
    expect(normalizarParaNome(null)).toBe("");
  });
  it("tira o CNPJ-base que o Omie põe na frente do nome", () => {
    expect(normalizarParaNome(limparFornecedor("59.407.727 Marco Antonio Herculano"))).toBe("MARCO_ANTONIO_HERCULANO");
    expect(limparFornecedor("Banco Bradesco S.A. 237")).toBe("Banco Bradesco S.A. 237");
  });
});

describe("pedaços do nome", () => {
  it("DDMMAAAA", () => expect(ddmmaaaa("2026-09-01")).toBe("01092026"));
  it("valor: vírgula, sem milhar, sem moeda", () => {
    expect(valorNoNome(760)).toBe("760,00");
    expect(valorNoNome(12548.92)).toBe("12548,92");
    expect(valorNoNome(86.1)).toBe("86,10");
    expect(valorNoNome(0)).toBe("0,00");
    expect(valorNoNome(1234567.5)).toBe("1234567,50");
  });
  it("estorno (negativo) usa o valor absoluto — sem '-' no nome", () => {
    expect(valorNoNome(-45.9)).toBe("45,90");
  });
  it("com número: nota/fatura só o número; RPA/RSP/DPS mantêm a sigla depois", () => {
    expect(documentoNoNome("12345", "nota_fiscal")).toBe("12345");
    expect(documentoNoNome("98765", "fatura")).toBe("98765");
    expect(documentoNoNome("987", "rpa")).toBe("987_RPA");
    expect(documentoNoNome("456", "rsp")).toBe("456_RSP");
    expect(documentoNoNome("7", "dps")).toBe("7_DPS");
  });
  it("sem número: a sigla do tipo", () => {
    expect(documentoNoNome(null, "rpa")).toBe("RPA");
    expect(documentoNoNome("", "nota_fiscal")).toBe("NF");
    expect(documentoNoNome("   ", "fatura")).toBe("FATURA");
    expect(documentoNoNome("///", "boleto")).toBe("BOLETO"); // número que vira vazio ao normalizar
  });
  it("número com pontuação é normalizado e limitado a 20", () => {
    expect(documentoNoNome("000.123-4", "nota_fiscal")).toBe("000_123_4");
    expect(documentoNoNome("1".repeat(40), "nota_fiscal")).toHaveLength(20);
  });
  it("tipo principal: o 1º da ordem documental que não é comprovante", () => {
    expect(tipoPrincipal(["comprovante", "boleto", "nota_fiscal"])).toBe("nota_fiscal");
    expect(tipoPrincipal(["comprovante", "rpa"])).toBe("rpa");
    expect(tipoPrincipal(["comprovante"])).toBe("comprovante");
    expect(tipoPrincipal([])).toBe("nota_fiscal");
  });
  it("identificador curto: 6 primeiros do ID, maiúsculo", () => expect(idCurto("7a44cf11-aaaa")).toBe("7A44CF"));
});

describe("ordem documental", () => {
  it("a lista é exatamente a que ela definiu", () => {
    expect(ORDEM_DOCUMENTAL).toEqual(["nota_fiscal", "rpa", "rsp", "dps", "fatura", "boleto", "guia", "contrato", "outro", "comprovante"]);
  });
  it("comprovante vai sempre por último; 'documento' (antigo) conta como 'outro'", () => {
    const partes = [
      { tipo: "comprovante" as const, storagePath: "a" }, { tipo: "documento" as const, storagePath: "b" },
      { tipo: "nota_fiscal" as const, storagePath: "c" }, { tipo: "contrato" as const, storagePath: "d" },
    ];
    expect(ordenarPartes(partes).map(p => p.storagePath)).toEqual(["c", "d", "b", "a"]);
  });
  it("mesmo tipo: pela ordem de envio; empate total: pelo caminho (estável)", () => {
    const r = ordenarPartes([
      { tipo: "boleto" as const, storagePath: "z", enviadoEm: "2026-10-03T02" },
      { tipo: "boleto" as const, storagePath: "y", enviadoEm: "2026-10-03T01" },
      { tipo: "boleto" as const, storagePath: "a" },
    ]);
    expect(r.map(p => p.storagePath)).toEqual(["a", "y", "z"]); // sem data = vazio ordena primeiro
  });
});

describe("formato do arquivo", () => {
  it("lê pela extensão do caminho, depois pela do nome", () => {
    expect(formatoDoArquivo({ url: "p/1.PDF" })).toBe("pdf");
    expect(formatoDoArquivo({ url: "p/1.jpeg" })).toBe("jpg");
    expect(formatoDoArquivo({ url: "p/1.png" })).toBe("png");
    expect(formatoDoArquivo({ url: "p/1.XML" })).toBe("xml");
    expect(formatoDoArquivo({ url: "p/1.bin" })).toBe("outro");
    expect(formatoDoArquivo({ url: "p/semext", nome: "x.pdf" })).toBe("pdf");
  });
});

describe("truncamento inteligente do fornecedor", () => {
  it("nome que cabe não é mexido", () => {
    expect(truncarFornecedor("ANA_PATRICIA_DA_SILVA_DE_LIMA_DE_OLIVEIRA", 60)).toBe("ANA_PATRICIA_DA_SILVA_DE_LIMA_DE_OLIVEIRA");
  });
  it("1º degrau: tira os conectivos", () => {
    expect(truncarFornecedor("ANA_PATRICIA_DA_SILVA_DE_LIMA_DE_OLIVEIRA", 32)).toBe("ANA_PATRICIA_SILVA_LIMA_OLIVEIRA");
  });
  it("2º degrau: mantém o primeiro e o ÚLTIMO nome", () => {
    const r = truncarFornecedor("MARIA_DAS_GRACAS_FERNANDES_ALBUQUERQUE_CAVALCANTI_NASCIMENTO", 30);
    expect(r.startsWith("MARIA_")).toBe(true);
    expect(r.endsWith("_NASCIMENTO")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(30);
  });
  it("3º degrau: corte seco, sem _ pendurado, e nunca vazio", () => {
    const r = truncarFornecedor("SUPERCALIFRAGILISTICOEXPIALIDOCIOUS_X", 10);
    expect(r).toHaveLength(10);
    expect(r.endsWith("_")).toBe(false);
    expect(truncarFornecedor("ABC", 0).length).toBeGreaterThan(0);
  });
});

describe("nome-base do dossiê", () => {
  const base = { dia: "2026-09-01", valor: 86.13, raiz: "Pacote_Contabil_2026_09", conta: "Bradesco" };
  it("exemplos dela", () => {
    expect(nomeBaseDoDossie({ ...base, numero: "12345", principal: "nota_fiscal", fornecedor: "Mundial" })).toBe("01092026_86,13_12345_MUNDIAL");
    expect(nomeBaseDoDossie({ ...base, dia: "2026-09-15", valor: 281.46, numero: "98765", principal: "fatura", fornecedor: "Light" })).toBe("15092026_281,46_98765_LIGHT");
    expect(nomeBaseDoDossie({ ...base, dia: "2026-09-04", valor: 760, numero: null, principal: "rpa", fornecedor: "Ana Patrícia da Silva de Lima Oliveira" }))
      .toBe("04092026_760,00_RPA_ANA_PATRICIA_DA_SILVA_DE_LIMA_OLIVEIRA");
    expect(nomeBaseDoDossie({ ...base, dia: "2026-09-12", valor: 1200, numero: "456", principal: "rsp", fornecedor: "Apoio Contábil Ltda" }))
      .toBe("12092026_1200,00_456_RSP_APOIO_CONTABIL_LTDA");
  });
  it("fornecedor ausente não gera nome quebrado", () => {
    expect(nomeBaseDoDossie({ ...base, numero: null, principal: "boleto", fornecedor: null })).toBe("01092026_86,13_BOLETO_SEM_FORNECEDOR");
  expect(nomeBaseDoDossie({ ...base, dia: "2026-10-12", valor: 1250, numero: null, principal: "guia", fornecedor: "PREFEITURA DO RIO DE JANEIRO" })).toBe("12102026_1250,00_GUIA_PREFEITURA_DO_RIO_DE_JANEIRO"); // o exemplo dela: Guia + Comprovante
  });
  it("data, valor e documento NUNCA são cortados, por maior que seja o nome", () => {
    const n = nomeBaseDoDossie({ ...base, numero: "987", principal: "rpa", fornecedor: "X".repeat(300) });
    expect(n.startsWith("01092026_86,13_987_RPA_")).toBe(true);
    expect(n.length).toBeLessThan(200);
  });
});

describe("orientação EXIF do JPEG", () => {
  it("sem EXIF ou não-JPEG: 1", () => {
    expect(orientacaoExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(orientacaoExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(1);
  });
  it("lê a orientação 6 (foto de celular em pé), little-endian", () => {
    // SOI, APP1 "Exif\0\0", TIFF II*\0, IFD0 com 1 entrada: tag 0x0112, tipo 3, contagem 1, valor 6
    const b = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ]);
    expect(orientacaoExif(b)).toBe(6);
  });
});
