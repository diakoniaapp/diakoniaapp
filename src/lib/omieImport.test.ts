// ─── Testes de `omieImport.ts` ───────────────────────────────────────────
//
// Nenhum arquivo real do Omie vira fixture aqui — o arquivo de verdade
// tem nome, CPF e valor de doadores reais (mesma razão de
// `ofxService.test.ts` não usar o extrato real do Bradesco). A planilha
// abaixo é montada na hora, no mesmo formato de cabeçalho confirmado com
// o arquivo real (13/09/2026).
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseOmieXlsx, separarCategoriaEPercentuais, ehTransferencia } from "./omieImport";

const CABECALHO = [
  "Situação", "Data", "Cliente ou Fornecedor", "Conta Corrente", "Categoria",
  "Valor (R$)", "Saldo (R$)", "Saldo Previsto (R$)", "Opções", "Tipo de Documento",
  "Documento", "Nota Fiscal", "Parcela", "Nosso Número", "Origem", "Pedido",
  "Vendedor", "Projeto", "Cliente ou Fornecedor (Razão Social)",
  "Cliente ou Fornecedor (CNPJ/CPF)", "Observações",
];

function montarXlsx(linhasDados: any[][]): ArrayBuffer {
  const aoa = [
    ["QUARTA IGREJA BATISTA — Finanças — Movimentação da Conta Corrente"],
    ["Emitido por Teste em 13/09/2026 00:00"],
    CABECALHO,
    ...linhasDados,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return out;
}

// Índices seguindo CABECALHO: 0 Situação,1 Data,2 Cliente,3 Conta,4 Categoria,
// 5 Valor, ...10 Documento, ...19 CNPJ/CPF, 20 Observações
function linha(opts: {
  situacao?: string; dataSerial?: number; cliente?: string; conta?: string;
  categoria?: string; valor?: number; documento?: string; cpfCnpj?: string; obs?: string;
}): any[] {
  const l = new Array(21).fill(null);
  l[0] = opts.situacao ?? "Conciliado";
  l[1] = opts.dataSerial ?? 46024;
  l[2] = opts.cliente ?? "FULANO DE TAL";
  l[3] = opts.conta ?? "Bradesco  111342";
  l[4] = opts.categoria ?? "Dizimos";
  l[5] = opts.valor ?? 100;
  l[10] = opts.documento ?? null;
  l[19] = opts.cpfCnpj ?? null;
  l[20] = opts.obs ?? null;
  return l;
}

describe("parseOmieXlsx", () => {
  it("lê linhas de lançamento normal e descarta linhas SALDO/SALDO ANTERIOR", () => {
    const linhaSaldoAnterior = new Array(21).fill(null);
    linhaSaldoAnterior[1] = 46022; linhaSaldoAnterior[2] = "SALDO ANTERIOR"; linhaSaldoAnterior[5] = 0;
    const linhaSaldo = new Array(21).fill(null);
    linhaSaldo[1] = 46023; linhaSaldo[2] = "SALDO"; linhaSaldo[5] = 0;

    linhaSaldoAnterior[6] = 1; // coluna "Saldo (R$)"
    const buf = montarXlsx([
      linhaSaldoAnterior,
      linhaSaldo,
      linha({ cliente: "CLAUDIA VILELA DE ALMEIDA", categoria: "Dizimos", valor: 780, documento: "2013980" }),
    ]);
    const { linhas: r, saldoAnterior } = parseOmieXlsx(buf);
    expect(r).toHaveLength(1);
    expect(r[0].clienteFornecedor).toBe("CLAUDIA VILELA DE ALMEIDA");
    expect(r[0].categoriaBruta).toBe("Dizimos");
    expect(r[0].valor).toBe(780);
    expect(r[0].documento).toBe("2013980");
    expect(saldoAnterior).toBe(1);
  });

  it("converte a data serial do Excel corretamente (46024 = 02/01/2026)", () => {
    const buf = montarXlsx([linha({ dataSerial: 46024 })]);
    const { linhas: r } = parseOmieXlsx(buf);
    expect(r[0].data).toBe("2026-01-02");
  });

  it("extrai só dígitos do CNPJ/CPF", () => {
    const buf = montarXlsx([linha({ cpfCnpj: "091.314.177-10" })]);
    const { linhas: r } = parseOmieXlsx(buf);
    expect(r[0].cpfCnpj).toBe("09131417710");
  });

  it("mantém valor negativo (despesa) com o sinal", () => {
    const buf = montarXlsx([linha({ categoria: "Tarifas Bancárias", valor: -9.8, cliente: "BANCO BRADESCO S.A. 237" })]);
    const { linhas: r } = parseOmieXlsx(buf);
    expect(r[0].valor).toBe(-9.8);
  });

  it("rejeita planilha sem coluna Categoria", () => {
    const semCategoria = CABECALHO.filter(c => c !== "Categoria");
    const aoa = [["título"], ["emitido"], semCategoria, ["Conciliado", 46024, "Fulano"]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    expect(() => parseOmieXlsx(buf)).toThrow(/Categoria/);
  });
});

describe("separarCategoriaEPercentuais", () => {
  it("devolve a categoria inteira quando não há rateio", () => {
    const r = separarCategoriaEPercentuais("Dizimos", 500);
    expect(r).toEqual([{ categoria: "Dizimos", valor: 500 }]);
  });

  it("quebra em duas categorias proporcionais quando há rateio por percentual", () => {
    const r = separarCategoriaEPercentuais("Dizimos (70,000000%); Ofertas (30,000000%)", 1000);
    expect(r).toEqual([
      { categoria: "Dizimos", valor: 700 },
      { categoria: "Ofertas", valor: 300 },
    ]);
  });
});

describe("ehTransferencia", () => {
  it("reconhece as duas direções de transferência", () => {
    expect(ehTransferencia("Saída de Transferência")).toBe(true);
    expect(ehTransferencia("Entrada de Transferência")).toBe(true);
    expect(ehTransferencia("Dizimos")).toBe(false);
  });
});
