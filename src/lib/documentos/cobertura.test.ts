import { describe, expect, it } from "vitest";
import {
  COBERTURA_LINHA_DE_BASE, COBERTURA_META, COBERTURA_META_IDEAL, COBERTURA_TRILHA,
  faltaParaOProximo, formatarPercentual, marcosDaTrilha, percentualCobertura,
} from "./cobertura";

describe("cobertura documental — o KPI oficial", () => {
  it("a linha de base é 2 de 772 = 0,3% (medida em 03/10/2026)", () => {
    const { comDocumento, exigem, percentual } = COBERTURA_LINHA_DE_BASE;
    expect(percentualCobertura(comDocumento, exigem)).toBeCloseTo(0.259, 2);
    expect(formatarPercentual(percentualCobertura(comDocumento, exigem))).toBe("0,3");
    expect(percentual).toBe(0.3);
  });

  it("a trilha pedida é 0,3% → 15% → 45% → 80%; meta 80%, ideal 95%", () => {
    expect([...COBERTURA_TRILHA]).toEqual([0.3, 15, 45, 80]);
    expect(COBERTURA_META).toBe(80);
    expect(COBERTURA_META_IDEAL).toBe(95);
  });

  it("não explode sem saída que exija documento", () => {
    expect(percentualCobertura(0, 0)).toBe(0);
  });

  it("formata uma casa decimal, em pt-BR", () => {
    expect(formatarPercentual(0.2591)).toBe("0,3");
    expect(formatarPercentual(15)).toBe("15");
    expect(formatarPercentual(45.24)).toBe("45,2");
    expect(formatarPercentual(100)).toBe("100");
  });
});

describe("marcos da trilha", () => {
  it("hoje (0,3%): só a linha de base está atingida; o próximo é 15%", () => {
    const m = marcosDaTrilha(0.26);
    expect(m.map(x => x.atingido)).toEqual([true, false, false, false]);
    expect(m.find(x => x.proximo)?.valor).toBe(15);
  });

  it("em 20%: 15% atingido, o próximo é 45%", () => {
    const m = marcosDaTrilha(20);
    expect(m.map(x => x.atingido)).toEqual([true, true, false, false]);
    expect(m.find(x => x.proximo)?.valor).toBe(45);
  });

  it("em 80% a trilha inteira está cumprida e não sobra 'próximo'", () => {
    const m = marcosDaTrilha(80);
    expect(m.every(x => x.atingido)).toBe(true);
    expect(m.some(x => x.proximo)).toBe(false);
  });

  it("exatamente em cima do marco já conta como atingido", () => {
    expect(marcosDaTrilha(15)[1].atingido).toBe(true);
  });
});

describe("quanto falta", () => {
  it("de 0,26% pro marco de 15%: 14,74 pontos", () => {
    const f = faltaParaOProximo(0.26)!;
    expect(f.alvo).toBe(15);
    expect(f.pontos).toBeCloseTo(14.74, 2);
  });

  it("cumprida a trilha (80%), o alvo passa a ser a meta ideal de 95%", () => {
    expect(faltaParaOProximo(85)).toMatchObject({ alvo: 95 });
  });

  it("acima da meta ideal não há o que perseguir", () => {
    expect(faltaParaOProximo(96)).toBeNull();
  });
});
