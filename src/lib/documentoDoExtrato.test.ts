import { describe, expect, it } from "vitest";
import { acharDocumentosDoExtrato, valeComoLiquidacao, type PrevistoParaExtrato } from "./documentoDoExtrato";

const p = (id: string, valor: number, data: string, forn: string | null = "luz"): PrevistoParaExtrato => ({ id, valor, data, fornecedor_id: forn });
const tx = (valor: number, data = "2026-10-08") => ({ valor, data, tipo: "saida" });

describe("documento do extrato", () => {
  it("o exemplo dela: documento 1.418,00 × extrato 1.538,00 → diferença de 120,00", () => {
    const r = acharDocumentosDoExtrato(tx(1538), [p("a", 1418, "2026-10-05")], "luz");
    expect(r).toHaveLength(1);
    expect(r[0].diferenca).toBe(120);
    expect(r[0].exato).toBe(false);
  });

  it("valor igual é exato e vem antes do divergente", () => {
    const r = acharDocumentosDoExtrato(tx(1418), [p("a", 1300, "2026-10-08"), p("b", 1418, "2026-10-01")], "luz");
    expect(r.map(x => [x.documento.id, x.exato])).toEqual([["b", true], ["a", false]]);
  });

  it("sem favorecido (texto genérico do extrato): só valor e data, e fica marcado como incerto", () => {
    const r = acharDocumentosDoExtrato(tx(1418), [p("a", 1418, "2026-10-08")], null);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ exato: true, incerto: true });
    // janela e faixa mais estreitas sem favorecido: 5 dias e 85%–115%
    expect(acharDocumentosDoExtrato(tx(1418), [p("a", 1418, "2026-09-25")], null)).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(1538), [p("a", 1300, "2026-10-08")], null)).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(1538), [p("a", 1418, "2026-10-08")], null)[0].diferenca).toBe(120);
  });

  it("outro favorecido, vencimento longe demais, valor fora de 50%–150% ou já usado: fora", () => {
    expect(acharDocumentosDoExtrato(tx(1418), [p("a", 1418, "2026-10-08", "agua")], "luz")).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(1418), [p("a", 1418, "2026-08-01")], "luz")).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(300), [p("a", 1418, "2026-10-08")], "luz")).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(1418), [p("a", 1418, "2026-10-08")], "luz", new Set(["a"]))).toEqual([]);
  });

  it("entrada nunca casa com documento a pagar", () => {
    expect(acharDocumentosDoExtrato({ valor: 1418, data: "2026-10-08", tipo: "entrada" }, [p("a", 1418, "2026-10-08")], "luz")).toEqual([]);
  });

  it("pagou menos (parcial/desconto) também aparece, com diferença negativa", () => {
    expect(acharDocumentosDoExtrato(tx(1350), [p("a", 1418, "2026-10-08")], "luz")[0].diferenca).toBe(-68);
  });
});

describe("vários contratos do mesmo fornecedor (Verisure, 08/10/2026)", () => {
  const A = { ...p("a", 291.31, "2026-10-05", "verisure"), descricao: "Verisure — Templo", recorrencia_id: "rA" };
  const B = { ...p("b", 278.22, "2026-10-05", "verisure"), descricao: "Verisure — Prédio Administrativo", recorrencia_id: "rB" };
  const contratos = [{ recorrenciaId: "rA", rotulo: "Verisure — Templo", valor: 291.31 }, { recorrenciaId: "rB", rotulo: "Verisure — Prédio Administrativo", valor: 278.22 }];

  it("R$ 278,22 com os dois documentos abertos: o de valor igual vem primeiro como 'possível segundo contrato', 98%", () => {
    const r = acharDocumentosDoExtrato(tx(278.22, "2026-10-06"), [A, B], "verisure", new Set(), contratos);
    expect(r[0].documento.id).toBe("b");
    expect(r[0]).toMatchObject({ exato: true, segundoContrato: true, ambiguo: false, confianca: 98 });
    expect(r[0].outrosAbertos.map(o => o.id)).toEqual(["a"]);
    expect(r[0].motivo).toMatch(/outro documento aberto/);
  });

  it("só o documento do OUTRO contrato existe: não é 'desconto' automático — o valor é o habitual do contrato sem documento", () => {
    const r = acharDocumentosDoExtrato(tx(278.22, "2026-10-06"), [A], "verisure", new Set(), contratos);
    expect(r[0].documento.id).toBe("a");
    expect(r[0].exato).toBe(false);
    expect(r[0].contratoSemDocumento?.rotulo).toBe("Verisure — Prédio Administrativo");
    expect(r[0].motivo).toMatch(/pode não ser desconto nem pagamento parcial/);
    expect(r[0].confianca).toBeLessThan(70);
  });

  it("dois documentos abertos e nenhum com o valor: ambíguo — a tesouraria escolhe o contrato (nada de diferença automática)", () => {
    const r = acharDocumentosDoExtrato(tx(280, "2026-10-06"), [A, B], "verisure", new Set(), contratos);
    expect(r).toHaveLength(2);
    expect(r.every(x => x.ambiguo)).toBe(true);
    expect(r[0].documento.id).toBe("b");    // o mais próximo em valor primeiro
    expect(r[0].confianca).toBe(50);
  });

  it("um único documento aberto e valor diferente: continua sendo a diferença de sempre (desconto/juros/parcial)", () => {
    const r = acharDocumentosDoExtrato(tx(280, "2026-10-06"), [B], "verisure", new Set(), [contratos[1]]);
    expect(r[0]).toMatchObject({ exato: false, ambiguo: false, confianca: 70 });
    expect(r[0].diferenca).toBe(1.78);
  });

  it("dois documentos com o mesmo valor: vale o de vencimento mais próximo, com confiança menor", () => {
    const B2 = { ...B, id: "b2", data: "2026-10-20" };
    const r = acharDocumentosDoExtrato(tx(278.22, "2026-10-19"), [B, B2], "verisure", new Set(), contratos);
    expect(r[0].documento.id).toBe("b2");
    expect(r[0].confianca).toBe(90);
  });

  it("sem favorecido no texto (cobrança genérica): nada de contrato, só valor e data (incerto)", () => {
    const r = acharDocumentosDoExtrato(tx(278.22, "2026-10-06"), [A, B], null);
    expect(r[0]).toMatchObject({ documento: { id: "b" }, incerto: true, segundoContrato: false, ambiguo: false });
  });
});

describe("quando o pagamento vira 'Liquidar obrigação prevista' (08/10/2026)", () => {
  const net = (valor: number, data = "2026-10-10") => ({ valor, data, tipo: "saida" });
  it("favorecido certo: sempre", () => {
    expect(valeComoLiquidacao(acharDocumentosDoExtrato(net(1538), [p("a", 1418, "2026-10-08")], "luz"))).toBe(true);
  });
  it("texto genérico de boleto + valor IGUAL + um só documento: sim (antes só virava dica e criava lançamento novo)", () => {
    expect(valeComoLiquidacao(acharDocumentosDoExtrato(net(984.72), [p("a", 984.72, "2026-10-10", null)], null))).toBe(true);
  });
  it("texto genérico com valor diferente, ou dois documentos com o mesmo valor: continua só dica", () => {
    expect(valeComoLiquidacao(acharDocumentosDoExtrato(net(1000), [p("a", 984.72, "2026-10-10", null)], null))).toBe(false);
    expect(valeComoLiquidacao(acharDocumentosDoExtrato(net(300), [p("a", 300, "2026-10-10", null), p("b", 300, "2026-10-11", null)], null))).toBe(false);
  });
  it("sem documento nenhum: não", () => { expect(valeComoLiquidacao([])).toBe(false); });
});

describe("parcelas do mesmo contrato — achado de 08/10/2026 (IPTU da Prefeitura)", () => {
  const parcela = (id: string, data: string, rec = "iptu"): PrevistoParaExtrato => ({ ...p(id, 312.7, data, "pref"), recorrencia_id: rec });

  it("pagamento com multa (R$ 325,20 em 30/09): é a parcela 1/3 VENCIDA em 06/09, não a 2/3 que só vence em 06/10", () => {
    const r = acharDocumentosDoExtrato(tx(325.2, "2026-09-30"), [parcela("p2", "2026-10-06"), parcela("p1", "2026-09-06")], "pref");
    expect(r[0].documento.id).toBe("p1");
    expect(r[0].diferenca).toBe(12.5);
    expect(r[0].motivo).toContain("vencido há 24 dias");
    expect(r[0].motivo).toContain("mais antiga em aberto do mesmo contrato");
    expect(r.map(x => x.documento.id)).toContain("p2");   // a 2/3 continua como alternativa
  });

  it("valor exato com duas parcelas abertas: vale a mais antiga, mesmo estando mais longe do pagamento", () => {
    const r = acharDocumentosDoExtrato(tx(312.7, "2026-10-05"), [parcela("p2", "2026-10-06"), parcela("p1", "2026-09-06")], "pref");
    expect(r[0].documento.id).toBe("p1");
    expect(r[0].exato).toBe(true);
  });

  it("contratos DIFERENTES com o mesmo valor: continua valendo o vencimento mais próximo", () => {
    const r = acharDocumentosDoExtrato(tx(312.7, "2026-10-05"), [parcela("a", "2026-09-20", "contrato-a"), parcela("b", "2026-10-06", "contrato-b")], "pref");
    expect(r[0].documento.id).toBe("b");
  });

  it("vencido há mais de 45 dias, ou pago a MAIS de 15%, ou sem favorecido: não entra pela regra do atraso", () => {
    expect(acharDocumentosDoExtrato(tx(325.2, "2026-09-30"), [parcela("velha", "2026-06-01")], "pref")).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(400, "2026-09-30"), [parcela("p1", "2026-09-06")], "pref")).toEqual([]);
    expect(acharDocumentosDoExtrato(tx(325.2, "2026-09-30"), [parcela("p1", "2026-09-06")], null)).toEqual([]);
  });

  it("pagar MENOS que o documento vencido não o escolhe pela regra do atraso (isso é pagamento parcial, não multa)", () => {
    expect(acharDocumentosDoExtrato(tx(200, "2026-09-30"), [parcela("p1", "2026-09-06")], "pref")).toEqual([]);
  });
});
