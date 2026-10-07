import { describe, expect, it } from "vitest";
import { planejarLiquidacao, type EntradaDeLiquidacao } from "./liquidacao";

const base = (extra: Partial<EntradaDeLiquidacao> = {}): EntradaDeLiquidacao => ({
  documentos: [{ id: "a", valor: 1418, vencimento: "2026-10-05" }],
  valorPago: 1418, motivoMenos: null, motivoMais: null, juros: 0, multa: 0, complemento: 0, ajuste: 0, motivoDoAjuste: "", ...extra,
});

describe("liquidação — os cenários dela", () => {
  it("igual ao documento: baixa total, sem pergunta", () => {
    const p = planejarLiquidacao(base());
    expect(p.pronto).toBe(true);
    expect(p.itens).toEqual([{ lancamento_id: "a", valor_pago: 1418, desconto: 0 }]);
    expect(p.encargos).toEqual([]);
  });

  it("cenário 1 — parcial: 1.538,00 pago 1.418,00 → saldo 120,00", () => {
    const e = base({ documentos: [{ id: "a", valor: 1538, vencimento: "2026-10-05" }], valorPago: 1418 });
    expect(planejarLiquidacao(e).pronto).toBe(false); // pagou menos: tem que dizer se é parcial ou desconto
    const p = planejarLiquidacao({ ...e, motivoMenos: "parcial" });
    expect(p.pronto).toBe(true);
    expect(p.saldoPendente).toBe(120);
    expect(p.itens).toEqual([{ lancamento_id: "a", valor_pago: 1418, desconto: 0 }]);
  });

  it("cenário 2 — a maior SEM motivo não liquida; mostra a diferença de 120,00", () => {
    const p = planejarLiquidacao(base({ valorPago: 1538 }));
    expect(p.pronto).toBe(false);
    expect(p.diferenca).toBe(120);
    expect(p.problemas[0]).toMatch(/qual o motivo/i);
  });

  it("juros 80 + multa 40 = 1.538,00: três lançamentos, tudo explicado", () => {
    const p = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "juros_multa", juros: 80, multa: 40 }));
    expect(p.pronto).toBe(true);
    expect(p.encargos.map(x => [x.tipo, x.valor])).toEqual([["juros", 80], ["multa", 40]]);
    expect(p.motivo).toMatch(/Juros.*80,00.*Multa.*40,00/);
  });

  it("juros e multa que não fecham a diferença: falta explicar / passa", () => {
    const falta = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "juros_multa", juros: 80, multa: 30 }));
    expect(falta.pronto).toBe(false);
    expect(falta.faltaExplicar).toBe(10);
    const passa = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "juros_multa", juros: 80, multa: 50 }));
    expect(passa.pronto).toBe(false);
    expect(passa.problemas.join(" ")).toMatch(/passam/);
  });

  it("só juros (a diferença inteira) e só multa", () => {
    expect(planejarLiquidacao(base({ valorPago: 1538, motivoMais: "juros", juros: 120 })).pronto).toBe(true);
    expect(planejarLiquidacao(base({ valorPago: 1538, motivoMais: "multa", multa: 120 })).pronto).toBe(true);
  });

  it("desconto: 1.418,00 pago 1.350,00 → desconto 68,00 em campo próprio", () => {
    const p = planejarLiquidacao(base({ valorPago: 1350, motivoMenos: "desconto" }));
    expect(p.pronto).toBe(true);
    expect(p.itens).toEqual([{ lancamento_id: "a", valor_pago: 1350, desconto: 68 }]);
    expect(p.motivo).toMatch(/Desconto.*68,00/);
  });

  it("ajuste manual exige motivo; com motivo passa e leva o motivo", () => {
    const sem = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "ajuste", ajuste: 120 }));
    expect(sem.pronto).toBe(false);
    expect(sem.problemas.join(" ")).toMatch(/exige o motivo/);
    const com = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "ajuste", ajuste: 120, motivoDoAjuste: "  tarifa do banco  " }));
    expect(com.pronto).toBe(true);
    expect(com.encargos).toEqual([{ tipo: "ajuste", valor: 120, lancamento_id: "a", motivo: "tarifa do banco" }]);
  });

  it("complementação voluntária", () => {
    const p = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "complemento", complemento: 120 }));
    expect(p.pronto).toBe(true);
    expect(p.encargos[0].tipo).toBe("complemento");
  });

  it("vários documentos: A 1.418,00 + B 120,00 = 1.538,00 → dois itens, sem diferença", () => {
    const p = planejarLiquidacao(base({
      documentos: [{ id: "a", valor: 1418, vencimento: "2026-10-05" }, { id: "b", valor: 120, vencimento: "2026-10-10" }], valorPago: 1538,
    }));
    expect(p.pronto).toBe(true);
    expect(p.itens.map(i => [i.lancamento_id, i.valor_pago])).toEqual([["a", 1418], ["b", 120]]);
    expect(p.valorOriginal).toBe(1538);
  });

  it("'outro documento' sem incluí-lo continua pedindo; incluído, a diferença some", () => {
    const sem = planejarLiquidacao(base({ valorPago: 1538, motivoMais: "outro_documento" }));
    expect(sem.pronto).toBe(false);
    const com = planejarLiquidacao(base({
      documentos: [{ id: "a", valor: 1418, vencimento: "2026-10-05" }, { id: "b", valor: 120, vencimento: "2026-10-10" }],
      valorPago: 1538, motivoMais: "outro_documento",
    }));
    expect(com.pronto).toBe(true);
    expect(com.diferenca).toBe(0);
  });

  it("parcial com vários documentos paga na ordem de vencimento; o seguinte fica intacto", () => {
    const p = planejarLiquidacao(base({
      documentos: [{ id: "b", valor: 120, vencimento: "2026-10-10" }, { id: "a", valor: 1418, vencimento: "2026-10-05" }],
      valorPago: 1500, motivoMenos: "parcial",
    }));
    expect(p.itens.map(i => [i.lancamento_id, i.valor_pago])).toEqual([["a", 1418], ["b", 82]]);
    expect(p.saldoPendente).toBe(38);
  });

  it("sem valor pago ou sem documento: não confirma", () => {
    expect(planejarLiquidacao(base({ valorPago: 0 })).pronto).toBe(false);
    expect(planejarLiquidacao(base({ documentos: [] })).pronto).toBe(false);
  });
});
