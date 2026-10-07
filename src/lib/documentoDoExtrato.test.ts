import { describe, expect, it } from "vitest";
import { acharDocumentosDoExtrato, type PrevistoParaExtrato } from "./documentoDoExtrato";

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
