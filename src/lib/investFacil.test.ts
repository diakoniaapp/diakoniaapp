import { describe, expect, it } from "vitest";
import {
  alertaDoInvest, chavesPorAssinatura, fitidDaChave, chavesNaObservacao, classificarLinhasInvest, direcaoDoHistorico, lerEvidencia, linhasDoInvestFacil, montarEvidencia, resumirLote,
  validarPdfParaSugestoes, type LinhaInvestFacil, type TransferenciaExistente,
} from "./investFacil";
import type { ExtratoLido, LancamentoDoExtrato } from "./extratoConsolidadoPdf";

const l = (data: string, historico: string, valor: number, documento = "1000"): LancamentoDoExtrato => ({ data, historico, documento, valor, saldo: 0, bloco: 0 });
const extrato = (lancs: LancamentoDoExtrato[], o: Partial<ExtratoLido> = {}): ExtratoLido => ({
  contas: [{ agencia: "2013", conta: "0199094-2" }], lancamentos: lancs, blocos: [{ dataSaldoAnterior: "2026-08-31", saldoAnterior: 1, n: lancs.length, total: { creditos: 0, debitos: 0, saldo: 1 } }],
  saldosInvest: [], quebras: [], totaisDivergentes: [], ...o,
});

describe("direção e chave das linhas do Invest Fácil", () => {
  it("reconhece as seis formas de aplicação e as três de resgate, e ignora o resto", () => {
    for (const h of ["APLIC.INVEST FACIL", "TRANSF PGTO PIX APLIC.INVEST FACIL", "LIQUIDACAO QRCODE PIX APLIC.INVEST FACIL PIX QR CODE ESTATIC", "DE APLIC.INVEST FACIL", "TRANSF PGTO PIX APLIC.INVEST FACIL DEP DINHEIRO ATM", "TRANSF PGTO PIX APLIC.INVEST FACIL TED-TRANSF ELET DISPON"]) expect(direcaoDoHistorico(h)).toBe("aplicacao");
    for (const h of ["RESGATE INVEST FACIL", "RESGATE INVEST FACIL DEP DINHEIRO ATM", "RESG.AUTOM.INVEST FACIL*"]) expect(direcaoDoHistorico(h)).toBe("resgate");
    for (const h of ["RENTAB.INVEST FACILCRED*", "PIX RECEBIDO REM: FULANO", "TARIFA BANCARIA"]) expect(direcaoDoHistorico(h)).toBeNull();
  });

  it("a chave é estável e legível; linhas idênticas ganham #2", () => {
    const r = linhasDoInvestFacil([
      l("2026-09-09", "RESGATE INVEST FACIL", 5936.77, "1067645"), l("2026-09-02", "APLIC.INVEST FACIL", -5936.77, "1067645"),
      l("2026-09-09", "RESGATE INVEST FACIL", 5936.77, "1067645"), l("2026-09-09", "RENTAB.INVEST FACILCRED*", 0.05, "1067645"),
    ]);
    expect(r.map(x => x.chave)).toEqual(["2026-09-09:RESGATE:1067645:5936.77", "2026-09-02:APLICACAO:1067645:5936.77", "2026-09-09:RESGATE:1067645:5936.77#2"]);
    expect(r[1]).toMatchObject({ direcao: "aplicacao", valor: 5936.77 });                // valor sempre positivo
    expect(linhasDoInvestFacil([l("2026-09-09", "RESGATE INVEST FACIL", 5936.77, "1067645")])[0].chave).toBe(r[0].chave);   // mesma entrada → mesma chave
  });
});

describe("validação do PDF — sem leitura confiável, sem sugestão", () => {
  const ctx = { ofxDe: "2026-09-01", ofxAte: "2026-10-05", contaNumero: "0199094-2" };
  const bom = extrato([l("2026-09-02", "APLIC.INVEST FACIL", -100), l("2026-10-02", "RESGATE INVEST FACIL", 50)]);

  it("um PDF que fecha passa", () => { expect(validarPdfParaSugestoes(bom, ctx)).toMatchObject({ ok: true, problemas: [] }); });

  it("cadeia de saldos quebrada reprova", () => {
    const v = validarPdfParaSugestoes({ ...bom, quebras: [{ data: "2026-09-02", historico: "APLIC.INVEST FACIL", valor: -100, saldoLido: 5, saldoEsperado: 1 }] }, ctx);
    expect(v.ok).toBe(false); expect(v.problemas[0]).toContain("cadeia de saldos");
  });
  it("total impresso diferente do lido reprova", () => {
    const v = validarPdfParaSugestoes({ ...bom, totaisDivergentes: [{ bloco: 0, campo: "creditos", lido: 1, impresso: 2 }] }, ctx);
    expect(v.ok).toBe(false);
  });
  it("bloco sem o Total impresso reprova (não há como conferir)", () => {
    const v = validarPdfParaSugestoes(extrato(bom.lancamentos, { blocos: [{ dataSaldoAnterior: "2026-08-31", saldoAnterior: 1, n: 2, total: null }] }), ctx);
    expect(v.ok).toBe(false);
  });
  it("aplicação com sinal de crédito (ou resgate com sinal de débito) reprova", () => {
    expect(validarPdfParaSugestoes(extrato([l("2026-09-02", "APLIC.INVEST FACIL", 100)]), ctx).ok).toBe(false);
    expect(validarPdfParaSugestoes(extrato([l("2026-09-02", "RESGATE INVEST FACIL", -100)]), ctx).ok).toBe(false);
  });
  it("PDF de OUTRA conta reprova; sem número de conta na Mesa não confere", () => {
    expect(validarPdfParaSugestoes(bom, { ...ctx, contaNumero: "0061094-1" }).ok).toBe(false);
    expect(validarPdfParaSugestoes(bom, { ...ctx, contaNumero: "199094-2" }).ok).toBe(true);     // zeros à esquerda não contam
    expect(validarPdfParaSugestoes(bom, { ...ctx, contaNumero: null }).ok).toBe(true);
  });
  it("período sem nada em comum reprova; cobertura parcial só avisa", () => {
    expect(validarPdfParaSugestoes(bom, { ...ctx, ofxDe: "2026-12-01", ofxAte: "2026-12-31" }).ok).toBe(false);
    const v = validarPdfParaSugestoes(bom, { ...ctx, ofxAte: "2026-10-30" });
    expect(v.ok).toBe(true); expect(v.avisos.join(" ")).toContain("termina em");
  });
  it("PDF vazio reprova", () => { expect(validarPdfParaSugestoes(extrato([]), ctx).ok).toBe(false); });
});

describe("o que já existe no sistema", () => {
  const linhas: LinhaInvestFacil[] = linhasDoInvestFacil([l("2026-09-02", "APLIC.INVEST FACIL", -5936.77, "A"), l("2026-09-09", "RESGATE INVEST FACIL", 5936.77, "B"), l("2026-09-14", "APLIC.INVEST FACIL", -1315.91, "C")]);
  const ex = (id: string, data: string, valor: number, tipo: "entrada" | "saida", chaves: string[] = []): TransferenciaExistente => ({ id, data, valor, tipo, chaves });

  it("a MESMA chave já gravada: 'já registrada' — nada a criar", () => {
    const r = classificarLinhasInvest(linhas, [ex("x", "2026-09-02", 5936.77, "saida", [linhas[0].chave])], new Set());
    expect(r.get(linhas[0].chave)).toEqual({ tipo: "ja_registrada", lancamentoId: "x" });
  });
  it("transferência feita à mão (mesmo valor, até 5 dias, sentido certo): oferece só vincular", () => {
    const r = classificarLinhasInvest(linhas, [ex("m", "2026-09-04", 5936.77, "saida")], new Set());
    expect(r.get(linhas[0].chave)).toEqual({ tipo: "transferencia_manual", lancamentoId: "m", data: "2026-09-04" });
  });
  it("sentido errado, valor diferente ou mais de 5 dias: continua nova", () => {
    expect(classificarLinhasInvest(linhas, [ex("m", "2026-09-02", 5936.77, "entrada")], new Set()).get(linhas[0].chave)).toEqual({ tipo: "nova" });
    expect(classificarLinhasInvest(linhas, [ex("m", "2026-09-02", 5936.00, "saida")], new Set()).get(linhas[0].chave)).toEqual({ tipo: "nova" });
    expect(classificarLinhasInvest(linhas, [ex("m", "2026-09-10", 5936.77, "saida")], new Set()).get(linhas[0].chave)).toEqual({ tipo: "nova" });
  });
  it("uma transferência existente serve a UMA linha só", () => {
    const duas = linhasDoInvestFacil([l("2026-09-02", "APLIC.INVEST FACIL", -100, "A"), l("2026-09-03", "APLIC.INVEST FACIL", -100, "B")]);
    const r = classificarLinhasInvest(duas, [ex("m", "2026-09-02", 100, "saida")], new Set());
    expect([...r.values()].map(v => v.tipo).sort()).toEqual(["nova", "transferencia_manual"]);
  });
  it("uma transferência que já tem OUTRA chave do PDF não é par manual", () => {
    const r = classificarLinhasInvest(linhas, [ex("m", "2026-09-02", 5936.77, "saida", ["outra-chave"])], new Set());
    expect(r.get(linhas[0].chave)).toEqual({ tipo: "nova" });
  });
  it("linha ignorada antes fica recolhida", () => {
    expect(classificarLinhasInvest(linhas, [], new Set([linhas[2].chave])).get(linhas[2].chave)).toEqual({ tipo: "ignorada" });
  });
});

describe("a evidência nas pernas", () => {
  const e = { chave: "2026-09-02:APLICACAO:A:5936.77", arquivo: "Extrato [set].pdf", hash: "abc123", lidoEm: "2026-10-08T12:00:00.000Z", texto: "APLIC.INVEST FACIL\n1067645" };
  it("grava marcas legíveis e o texto original, sem quebrar o formato", () => {
    const t = montarEvidencia(e);
    expect(t).toContain("[invest-pdf:2026-09-02:APLICACAO:A:5936.77]");
    expect(t).toContain("[origem:INVEST_FACIL_PDF]");
    expect(t).toContain("[pdf-hash:abc123]");
    expect(t).toContain("[pdf-arquivo:Extrato set .pdf]");
    expect(t).toContain("Extrato: APLIC.INVEST FACIL 1067645");
  });
  it("lê de volta (detalhes da transferência e auditoria) e as chaves ficam pesquisáveis", () => {
    const t = `[ofx:PDF:x] [transferencia-ofx] ${montarEvidencia(e)}`;
    expect(lerEvidencia(t)).toMatchObject({ chave: e.chave, hash: "abc123", lidoEm: e.lidoEm, arquivo: "Extrato set .pdf", texto: "APLIC.INVEST FACIL 1067645" });
    expect(chavesNaObservacao(t)).toEqual([e.chave]);
    expect(lerEvidencia("sem marca")).toBeNull();
  });
});

describe("auditoria: ligação pela chave e alerta", () => {
  it("cada linha do banco recebe a mesma chave da Mesa; idênticas recebem #2 na ordem", () => {
    const lancs = [l("2026-09-02", "APLIC.INVEST FACIL", -100, "A"), l("2026-09-02", "APLIC.INVEST FACIL", -100, "A"), l("2026-09-03", "PIX RECEBIDO", 50, "Z")];
    const doBanco = linhasDoInvestFacil(lancs).map(x => x.chave);
    const chaveDe = chavesPorAssinatura(lancs);
    const linha = { data: "2026-09-02", valor: -100, historico: "APLIC.INVEST FACIL", documento: "A" };
    expect([chaveDe(linha), chaveDe(linha), chaveDe(linha)]).toEqual([doBanco[0], doBanco[1], undefined]);
    expect(fitidDaChave(doBanco[0])).toBe(`PDF:${doBanco[0]}`);
  });
  it("o alerta soma só o que sobrou no banco como aplicação/resgate", () => {
    const a = alertaDoInvest([{ classe: "aplicacao", valor: -100 }, { classe: "aplicacao", valor: -50 }, { classe: "resgate", valor: 30 }, { classe: "outro", valor: 999 }, { classe: "rendimento", valor: 1 }]);
    expect(a).toEqual({ aplicacoes: { n: 2, total: 150 }, resgates: { n: 1, total: 30 }, efeitoNaCorrente: -120 });
    expect(alertaDoInvest([])).toEqual({ aplicacoes: { n: 0, total: 0 }, resgates: { n: 0, total: 0 }, efeitoNaCorrente: 0 });
  });
});

describe("resumo antes de gravar", () => {
  it("soma aplicações e resgates e o efeito líquido na conta corrente", () => {
    const r = resumirLote(linhasDoInvestFacil([l("2026-09-02", "APLIC.INVEST FACIL", -100, "A"), l("2026-09-03", "APLIC.INVEST FACIL", -50.5, "B"), l("2026-09-09", "RESGATE INVEST FACIL", 300, "C")]));
    expect(r.aplicacoes).toEqual({ n: 2, total: 150.5 });
    expect(r.resgates).toEqual({ n: 1, total: 300 });
    expect(r.efeitoNaCorrente).toBe(149.5);
    expect(r.datas).toEqual({ de: "2026-09-02", ate: "2026-09-09" });
  });
});
