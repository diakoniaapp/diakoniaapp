import { describe, expect, it } from "vitest";
import { itensDeEncargo, resumoDoEncargo, somarEncargos, temEncargos } from "./encargos";

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const IPTU = { valor: 325.2, valor_original: 312.7, juros: 0, multa: 12.5, complemento: 0, ajuste: 0, desconto: 0 };

describe("encargos como informação complementar da obrigação", () => {
  it("IPTU: R$ 312,70 + multa R$ 12,50 — uma linha, o total pago e o detalhe", () => {
    expect(temEncargos(IPTU)).toBe(true);
    expect(itensDeEncargo(IPTU)).toEqual([{ chave: "multa", rotulo: "Multa", valor: 12.5 }]);
    expect(resumoDoEncargo(IPTU, brl)).toBe("Valor original R$ 312,70 · Multa R$ 12,50");
  });

  it("sem encargo: nada a mostrar", () => {
    expect(temEncargos({ valor: 100, juros: 0, multa: 0, desconto: 0 })).toBe(false);
    expect(resumoDoEncargo({ valor: 100 }, brl)).toBeNull();
    expect(resumoDoEncargo({ valor: "100.00", juros: "0.00", multa: "0.00" }, brl)).toBeNull();   // numeric chega do banco como texto
  });

  it("juros + multa + desconto juntos; o desconto vem com sinal de menos", () => {
    const l = { valor: 1000, valor_original: 1000, juros: 30, multa: 20, desconto: 50 };
    expect(resumoDoEncargo(l, brl)).toBe("Valor original R$ 1000,00 · Juros R$ 30,00 · Multa R$ 20,00 · Desconto − R$ 50,00");
  });

  it("sem valor_original, deduz do valor pago (tira o que foi pago a mais, soma o desconto)", () => {
    expect(resumoDoEncargo({ valor: 1538, juros: 80, multa: 40 }, brl)).toBe("Valor original R$ 1418,00 · Juros R$ 80,00 · Multa R$ 40,00");
    expect(resumoDoEncargo({ valor: 280, desconto: 20 }, brl)).toBe("Valor original R$ 300,00 · Desconto − R$ 20,00");
  });

  it("ajuste e complemento aparecem; os indicadores os juntam em 'outros'", () => {
    const ana = { valor: 760, valor_original: 380, ajuste: 380 };
    expect(resumoDoEncargo(ana, brl)).toBe("Valor original R$ 380,00 · Ajuste R$ 380,00");
    expect(somarEncargos([ana, IPTU, { valor: 2803.26, valor_original: 2801.4, juros: 1.86 }, { valor: 50 }])).toEqual({
      juros: 1.86, multas: 12.5, descontos: 0, outros: 380, obrigacoes: 3, comIndicador: 2,
    });
  });

  it("os indicadores somam sem erro de ponto flutuante", () => {
    const r = somarEncargos([{ multa: 0.1 }, { multa: 0.2 }, { desconto: 0.07 }, { desconto: 0.01 }]);
    expect(r.multas).toBe(0.3);
    expect(r.descontos).toBe(0.08);
  });
});
