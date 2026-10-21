import { describe, expect, it } from "vitest";
import { resolverMovimento, temCandidata, type LinhaResolvivel } from "./resolverMovimento";
import type { DocumentoDoExtrato } from "./documentoDoExtrato";

const doc = (extra: Partial<DocumentoDoExtrato> = {}): DocumentoDoExtrato => ({
  documento: { id: "ob-1", valor: 278.22, data: "2026-10-05", fornecedor_id: "f1" }, diferenca: 0, exato: true, incerto: false, confianca: 98, contrato: null,
  segundoContrato: false, ambiguo: false, outrosAbertos: [], contratoSemDocumento: null, motivo: "", ...extra,
});
const linha = (extra: Partial<LinhaResolvivel> = {}): LinhaResolvivel => ({ tx: { tipo: "saida" }, situacao: "nova", ...extra });
const jaReg = { lancamento: { id: "l1", tipo: "saida", valor: 1, data: "2026-10-05", fitids: ["N1"], origem: "recorrencia", status: "conciliado", criadoEm: "" }, fitidAntigo: "N1", mesmoDiaDePagamento: true, motivo: "x" } as never;
const rec = { recorrenciaId: "r1", rotulo: "Light", valor: 100, valorVariavel: false, vencimento: "2026-10-15", diferenca: 0, motivo: "x" };

describe("resolverMovimento — a ordem H0 → H4", () => {
  it("H0: a linha que parece já registrada (outro arquivo) → vincular", () => {
    expect(resolverMovimento(linha({ situacao: "vincular", lancamentoId: "l1", jaRegistrado: jaReg }))).toMatchObject({ h: "H0", modo: "vincular", lancamentoId: "l1" });
  });
  it("H0: casa com um realizado/conferido → conciliar (com ou sem vínculo prévio)", () => {
    expect(resolverMovimento(linha({ situacao: "conciliar", lancamentoId: "l2", semVinculo: true }))).toMatchObject({ h: "H0", modo: "conciliar", semVinculo: true });
  });
  it("H0: vários parecidos → ambígua (a pessoa busca e associa)", () => {
    expect(resolverMovimento(linha({ situacao: "ambigua" }))).toEqual({ h: "H0", modo: "ambigua" });
  });
  it("H1: a análise já propôs a liquidação ('documento') ou é só a dica numa linha 'nova'", () => {
    expect(resolverMovimento(linha({ situacao: "documento", documentos: [doc()] }))).toMatchObject({ h: "H1", proposta: true, exato: true });
    expect(resolverMovimento(linha({ documentos: [doc({ exato: false, diferenca: 12 })] }))).toMatchObject({ h: "H1", proposta: false, exato: false });
    expect(resolverMovimento(linha({ documentos: [doc({ ambiguo: true })] }))).toMatchObject({ h: "H1", ambiguo: true });
  });
  it("H1 vem antes de H2 e de H3", () => {
    const r = resolverMovimento(linha({ documentos: [doc()], recorrenciaCompativel: rec, sugestao: { transferencia: true } }));
    expect(r.h).toBe("H1");
  });
  it("H2: recorrência compatível sem conta aberta", () => {
    expect(resolverMovimento(linha({ recorrenciaCompativel: rec }))).toMatchObject({ h: "H2", recorrencia: { recorrenciaId: "r1" } });
  });
  it("H2 vem antes de H3 (um contrato conhecido não é transferência por coincidência de valor)", () => {
    expect(resolverMovimento(linha({ recorrenciaCompativel: rec, transferenciaProvavel: { confianca: 90 } })).h).toBe("H2");
  });
  it("H3: débito automático encontrado; transferência sugerida ou provável a partir de 75%", () => {
    expect(resolverMovimento(linha({ situacao: "debito_encontrado", lancamentoId: "d1" }))).toMatchObject({ h: "H3", modo: "debito", lancamentoId: "d1" });
    expect(resolverMovimento(linha({ sugestao: { transferencia: true } }))).toMatchObject({ h: "H3", modo: "transferencia" });
    expect(resolverMovimento(linha({ transferenciaProvavel: { confianca: 75 } }))).toMatchObject({ h: "H3", modo: "transferencia" });
    expect(resolverMovimento(linha({ transferenciaProvavel: { confianca: 60 } })).h).toBe("H4");
  });
  it("H4: nada encontrado", () => {
    expect(resolverMovimento(linha())).toEqual({ h: "H4" });
    expect(resolverMovimento(linha({ situacao: "documento" })).h).toBe("H4");   // proposta sem documento nenhum não se sustenta
  });
  it("resolvidas: mesmo identificador ou ignorada — nada a decidir", () => {
    expect(resolverMovimento(linha({ situacao: "ja_registrada" }))).toEqual({ h: "resolvida", motivo: "ja_registrada" });
    expect(resolverMovimento(linha({ situacao: "ignorada" }))).toEqual({ h: "resolvida", motivo: "ignorada" });
  });
  it("só H0 (vincular), H1 e H2 têm candidata: criar despesa nova pede o motivo", () => {
    expect(temCandidata(resolverMovimento(linha({ situacao: "vincular", lancamentoId: "l1", jaRegistrado: jaReg })))).toBe(true);
    expect(temCandidata(resolverMovimento(linha({ documentos: [doc()] })))).toBe(true);
    expect(temCandidata(resolverMovimento(linha({ recorrenciaCompativel: rec })))).toBe(true);
    expect(temCandidata(resolverMovimento(linha()))).toBe(false);
    expect(temCandidata(resolverMovimento(linha({ situacao: "conciliar", lancamentoId: "l2" })))).toBe(false);
  });
});
