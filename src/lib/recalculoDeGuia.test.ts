// A conferência do "Recalcular guia" (23/10/2026): as mesmas regras que `fin_recalcular_obrigacao` aplica no banco — a tela diz o que falta antes do clique.
import { describe, expect, it } from "vitest";
import { conferirRecalculo, MOTIVO_MINIMO, resumoDoRecalculo, type EntradaDoRecalculo } from "./recalculoDeGuia";

const base = (o: Partial<EntradaDoRecalculo> = {}): EntradaDoRecalculo => ({ valorAtual: 1000, novoValor: 1037.5, juros: 10, multa: 20, correcao: 7.5, motivo: "Encargos por atraso", temGuia: true, ...o });

describe("conferirRecalculo", () => {
  it("o caso do FGTS: R$ 1.000,00 → R$ 1.037,50, quebra fechando, motivo e guia: tudo certo", () => {
    const c = conferirRecalculo(base());
    expect(c).toMatchObject({ ok: true, diferenca: 37.5, explicado: 37.5, sobra: 0, problemas: [] });
  });
  it("só multa também fecha", () => {
    expect(conferirRecalculo(base({ juros: 0, correcao: 0, multa: 37.5 })).ok).toBe(true);
  });
  it("centavos de ponto flutuante não atrapalham (0,1 + 0,2)", () => {
    expect(conferirRecalculo(base({ valorAtual: 100, novoValor: 100.3, juros: 0.1, multa: 0.2, correcao: 0 })).ok).toBe(true);
  });
  it("faltando explicar: diz quanto falta", () => {
    const c = conferirRecalculo(base({ juros: 10, multa: 20, correcao: 0 }));
    expect(c.ok).toBe(false);
    expect(c.sobra).toBe(7.5);
    expect(c.problemas.join(" ")).toMatch(/Faltam R\$\s*7,50 para explicar/);
  });
  it("quebra que passa da diferença: diz quanto passou", () => {
    const c = conferirRecalculo(base({ juros: 40, multa: 0, correcao: 0 }));
    expect(c.sobra).toBe(-2.5);
    expect(c.problemas.join(" ")).toMatch(/passa R\$\s*2,50 da diferença/);
  });
  it("valor igual ou menor que o atual: recusa e manda usar o desconto no pagamento", () => {
    for (const novoValor of [1000, 900]) {
      const c = conferirRecalculo(base({ novoValor, juros: 0, multa: 0, correcao: 0 }));
      expect(c.ok).toBe(false);
      expect(c.problemas.join(" ")).toMatch(/precisa ser maior.*desconto no pagamento/);
    }
  });
  it("sem novo valor: pede o valor", () => {
    expect(conferirRecalculo(base({ novoValor: 0 })).problemas[0]).toMatch(/Informe o novo valor/);
  });
  it("encargo negativo: recusa", () => {
    expect(conferirRecalculo(base({ juros: -5, multa: 42.5, correcao: 0 })).problemas.join(" ")).toMatch(/negativos/);
  });
  it("motivo curto: recusa; com o mínimo, passa", () => {
    expect(conferirRecalculo(base({ motivo: "ok" })).problemas.join(" ")).toMatch(new RegExp(`pelo menos ${MOTIVO_MINIMO}`));
    expect(conferirRecalculo(base({ motivo: "  abcde  " })).ok).toBe(true);
    expect(conferirRecalculo(base({ motivo: "    ab    " })).ok).toBe(false);
  });
  it("sem a nova guia: recusa (a guia é obrigatória)", () => {
    const c = conferirRecalculo(base({ temGuia: false }));
    expect(c.ok).toBe(false);
    expect(c.problemas.join(" ")).toMatch(/Anexe a nova guia/);
  });
  it("junta todos os problemas de uma vez", () => {
    expect(conferirRecalculo({ valorAtual: 1000, novoValor: 0, juros: 0, multa: 0, correcao: 0, motivo: "", temGuia: false }).problemas.length).toBe(3);
  });
});

describe("resumoDoRecalculo", () => {
  it("mostra de onde para onde e quanto subiu", () => {
    expect(resumoDoRecalculo(1000, 1037.5)).toMatch(/R\$\s*1\.000,00 → R\$\s*1\.037,50 \(\+ R\$\s*37,50\)/);
  });
});
