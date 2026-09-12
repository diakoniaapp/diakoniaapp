import { describe, it, expect } from "vitest";
import { parseOFX, encodingDoOFX, casarComLancamentos, inferirFormaPagamento, type OFXTransacao } from "./ofxService";
import type { FinLancamentoExtenso } from "./finService";

// Amostra sintética — mesma estrutura do arquivo real do Bradesco
// (header OFX 1.02/SGML, CHARSET:1252, TRNAMT com vírgula), nomes e
// valores inventados.
const OFX_AMOSTRA = `
OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260901120000
<TRNAMT>500,00
<FITID>ABC123
<CHECKNUM>111
<MEMO>PIX RECEBIDO REM: FULANO DE TAL 01/09
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260902120000
<TRNAMT>-9,80
<FITID>ABC124
<CHECKNUM>112
<MEMO>TARIFA BANCARIA TRANSF PGTO PIX
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260903120000
<TRNAMT>1234,56
<FITID>ABC125
<CHECKNUM>113
<MEMO>PIX RECEBIDO REM: CICLANA DA SILVA 03/09
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

describe("parseOFX", () => {
  it("extrai as três transações da amostra", () => {
    const t = parseOFX(OFX_AMOSTRA);
    expect(t).toHaveLength(3);
  });

  it("converte CREDIT/DEBIT em entrada/saida", () => {
    const t = parseOFX(OFX_AMOSTRA);
    expect(t[0].tipo).toBe("entrada");
    expect(t[1].tipo).toBe("saida");
  });

  it("converte DTPOSTED (yyyyMMdd...) em YYYY-MM-DD", () => {
    const t = parseOFX(OFX_AMOSTRA);
    expect(t[0].data).toBe("2026-09-01");
    expect(t[2].data).toBe("2026-09-03");
  });

  it("lê TRNAMT com vírgula decimal e sempre devolve valor positivo", () => {
    const t = parseOFX(OFX_AMOSTRA);
    expect(t[0].valor).toBeCloseTo(500);
    expect(t[1].valor).toBeCloseTo(9.8); // DEBIT vinha negativo
    expect(t[2].valor).toBeCloseTo(1234.56);
  });

  it("preserva o FITID e o MEMO", () => {
    const t = parseOFX(OFX_AMOSTRA);
    expect(t[0].fitid).toBe("ABC123");
    expect(t[0].memo).toContain("FULANO DE TAL");
  });

  it("devolve lista vazia para texto sem STMTTRN", () => {
    expect(parseOFX("nada aqui")).toEqual([]);
  });
});

describe("encodingDoOFX", () => {
  const ascii = (s: string) => new TextEncoder().encode(s);

  it("reconhece CHARSET:1252 como windows-1252", () => {
    expect(encodingDoOFX(ascii("CHARSET:1252\n<OFX>"))).toBe("windows-1252");
  });

  it("reconhece ISO-8859-1", () => {
    expect(encodingDoOFX(ascii("CHARSET:ISO-8859-1\n<OFX>"))).toBe("iso-8859-1");
  });

  it("cai em utf-8 quando não declara CHARSET reconhecido", () => {
    expect(encodingDoOFX(ascii("<OFX><BANKMSGSRSV1>"))).toBe("utf-8");
  });
});

describe("casarComLancamentos", () => {
  function lanc(over: Partial<FinLancamentoExtenso>): FinLancamentoExtenso {
    return {
      id: over.id ?? "id",
      data: over.data ?? "2026-09-01",
      data_competencia: null,
      tipo: over.tipo ?? "entrada",
      status: "realizado",
      conta_id: "conta1",
      categoria_id: null,
      centro_custo_id: null,
      fornecedor_id: null,
      pessoa_id: null,
      familia_id: null,
      valor: over.valor ?? 100,
      descricao: over.descricao ?? "lançamento",
      forma_pagamento: null,
      documento_numero: null,
      observacoes: null,
      comprovante_url: null,
      data_pagamento: null,
      origem: "manual",
    } as FinLancamentoExtenso;
  }
  function txn(over: Partial<OFXTransacao>): OFXTransacao {
    return {
      fitid: over.fitid ?? "F1",
      tipo: over.tipo ?? "entrada",
      data: over.data ?? "2026-09-01",
      valor: over.valor ?? 100,
      memo: over.memo ?? "memo",
    };
  }

  it("casa quando tipo, valor e data (mesmo dia) batem", () => {
    const r = casarComLancamentos([txn({})], [lanc({ id: "L1" })]);
    expect(r[0].status).toBe("encontrado");
    expect(r[0].lancamentoId).toBe("L1");
  });

  it("casa dentro da janela de dias (extrato com data de processamento atrasada)", () => {
    const r = casarComLancamentos(
      [txn({ data: "2026-09-08" })],
      [lanc({ id: "L1", data: "2026-09-05" })], // 3 dias de diferença, dentro da janela de 5
    );
    expect(r[0].status).toBe("encontrado");
  });

  it("não casa fora da janela de dias", () => {
    const r = casarComLancamentos(
      [txn({ data: "2026-09-20" })],
      [lanc({ id: "L1", data: "2026-09-01" })], // 19 dias de diferença
    );
    expect(r[0].status).toBe("sem_correspondencia");
  });

  it("não casa quando o tipo é diferente", () => {
    const r = casarComLancamentos(
      [txn({ tipo: "entrada" })],
      [lanc({ id: "L1", tipo: "saida" })],
    );
    expect(r[0].status).toBe("sem_correspondencia");
  });

  it("sem candidato nenhum vira sem_correspondencia", () => {
    const r = casarComLancamentos([txn({ valor: 999 })], [lanc({ id: "L1", valor: 100 })]);
    expect(r[0].status).toBe("sem_correspondencia");
  });

  it("dois candidatos idênticos disponíveis vira ambíguo", () => {
    const r = casarComLancamentos(
      [txn({})],
      [lanc({ id: "L1" }), lanc({ id: "L2" })],
    );
    expect(r[0].status).toBe("ambiguo");
    expect(r[0].candidatos).toHaveLength(2);
  });

  it("é guloso: um lançamento já casado não serve para a próxima transação igual", () => {
    const r = casarComLancamentos(
      [txn({ fitid: "F1" }), txn({ fitid: "F2" })],
      [lanc({ id: "L1" })], // só um lançamento disponível para duas transações iguais
    );
    expect(r[0].status).toBe("encontrado");
    expect(r[1].status).toBe("sem_correspondencia");
  });
});

describe("inferirFormaPagamento", () => {
  it("reconhece PIX", () => {
    expect(inferirFormaPagamento("PIX RECEBIDO REM: FULANO 01/09")).toBe("pix");
  });

  it("reconhece TED/transferência", () => {
    expect(inferirFormaPagamento("TED-TRANSF ELET DISPON REMET.FULANO")).toBe("transferencia");
    expect(inferirFormaPagamento("TRANSF AUTORIZ ENTRE AGS FULANO")).toBe("transferencia");
  });

  it("reconhece boleto/pagamento eletrônico", () => {
    expect(inferirFormaPagamento("PAGTO ELETRONICO TRIBUTO INTERNET")).toBe("boleto");
  });

  it("não chuta quando o padrão não é óbvio", () => {
    expect(inferirFormaPagamento("TITULO DE CAPITALIZACAO CAPITALIZACAO")).toBeUndefined();
  });
});
