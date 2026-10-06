import { describe, expect, it } from "vitest";
import {
  categoriaPadraoDeRepasse, ehCategoriaDeRepasse, fundoAcumulado, granularidadeDoPeriodo,
  periodoAnterior, periodoDoPreset, resumoDoPeriodo, serieDoPeriodo, variacaoPercentual,
  PERIODO_PADRAO,
} from "./indicadoresMissionarios";

let n = 0;
const l = (data: string, valor: number, status = "realizado", data_pagamento: string | null = null) =>
  ({ id: `l${++n}`, data, valor, status, data_pagamento });

describe("o exemplo dela: período × histórico nunca se misturam", () => {
  // Histórico: arrecadado 145.947,09 · enviado 162.554,89 — dos quais, em 2026
  // até 05/10: arrecadado 32.627,20 · enviado 26.660,23.
  const entradas = [l("2025-03-01", 113319.89), l("2026-02-01", 20000), l("2026-08-10", 12627.2)];
  const saidas = [l("2025-06-01", 135894.66), l("2026-07-07", 26660.23)];

  it("período 01/01–05/10/2026: entrou, saiu e resultado líquido", () => {
    const r = resumoDoPeriodo(entradas, saidas, "2026-01-01", "2026-10-05");
    expect(r.entradas).toBe(32627.2);
    expect(r.saidas).toBe(26660.23);
    expect(r.resultado).toBe(5966.97);
    expect(r.situacao).toBe("superavit");
    expect(r.qtdEntradas).toBe(2);
    expect(r.qtdSaidas).toBe(1);
  });

  it("o fundo acumulado ignora o filtro e mostra a vida inteira (e pode ser negativo)", () => {
    const f = fundoAcumulado(entradas, saidas);
    expect(f.arrecadado).toBe(145947.09);
    expect(f.enviado).toBe(162554.89);
    expect(f.saldo).toBe(-16607.8);
  });

  it("o fundo 'até uma data' corta o futuro, mas o filtro de período não o altera", () => {
    expect(fundoAcumulado(entradas, saidas, "2025-12-31").arrecadado).toBe(113319.89);
    expect(fundoAcumulado(entradas, saidas).arrecadado).toBe(145947.09);
  });
});

describe("o que conta como dinheiro", () => {
  it("só realizado/conciliado — previsto e cancelado ficam de fora", () => {
    const e = [l("2026-10-01", 100), l("2026-10-02", 50, "conciliado"), l("2026-10-03", 999, "previsto"), l("2026-10-04", 999, "cancelado")];
    expect(resumoDoPeriodo(e, [], "2026-10-01", "2026-10-31").entradas).toBe(150);
    expect(fundoAcumulado(e, []).arrecadado).toBe(150);
  });

  it("o dia é a data de pagamento, quando existe", () => {
    const e = [l("2026-09-30", 200, "realizado", "2026-10-02")];
    expect(resumoDoPeriodo(e, [], "2026-10-01", "2026-10-31").entradas).toBe(200);
    expect(resumoDoPeriodo(e, [], "2026-09-01", "2026-09-30").entradas).toBe(0);
  });

  it("valor em texto (como o PostgREST devolve numeric) soma igual", () => {
    expect(resumoDoPeriodo([{ id: "x", data: "2026-10-01", valor: "10.10", status: "realizado" }, l("2026-10-01", 0.2)], [], "2026-10-01", "2026-10-01").entradas).toBe(10.3);
  });

  it("déficit e equilíbrio", () => {
    expect(resumoDoPeriodo([l("2026-10-01", 10)], [l("2026-10-01", 30)], "2026-10-01", "2026-10-31")).toMatchObject({ resultado: -20, situacao: "deficit" });
    expect(resumoDoPeriodo([l("2026-10-01", 10)], [l("2026-10-01", 10)], "2026-10-01", "2026-10-31")).toMatchObject({ resultado: 0, situacao: "equilibrio" });
  });
});

describe("períodos", () => {
  it("o padrão é o mês atual — 'hoje' abre vazio em quase todo dia", () => {
    expect(PERIODO_PADRAO).toBe("mes");
    expect(periodoDoPreset("mes", "2026-10-06")).toEqual({ inicio: "2026-10-01", fim: "2026-10-06" });
  });
  it("30/60/90 dias contam o dia de hoje", () => {
    expect(periodoDoPreset("30d", "2026-10-06")).toEqual({ inicio: "2026-09-07", fim: "2026-10-06" });
    expect(periodoDoPreset("60d", "2026-10-06").inicio).toBe("2026-08-08");
    expect(periodoDoPreset("90d", "2026-10-06").inicio).toBe("2026-07-09");
  });
  it("personalizado com De/Até invertidos é endireitado", () => {
    expect(periodoDoPreset("custom", "2026-10-06", { inicio: "2026-10-10", fim: "2026-10-01" })).toEqual({ inicio: "2026-10-01", fim: "2026-10-10" });
  });
  it("o período anterior tem a mesma duração e termina na véspera", () => {
    expect(periodoAnterior("2026-10-01", "2026-10-06")).toEqual({ inicio: "2026-09-25", fim: "2026-09-30" });
  });
  it("variação percentual", () => {
    expect(variacaoPercentual(150, 100)).toBe(50);
    expect(variacaoPercentual(50, 0)).toBe(100);
    expect(variacaoPercentual(0, 0)).toBe(0);
  });
});

describe("série do gráfico", () => {
  it("granularidade acompanha o tamanho do período", () => {
    expect(granularidadeDoPeriodo("2026-10-01", "2026-10-06")).toBe("dia");
    expect(granularidadeDoPeriodo("2026-07-09", "2026-10-06")).toBe("semana");
    expect(granularidadeDoPeriodo("2026-01-01", "2026-10-06")).toBe("mes");
  });

  it("a soma dos pontos é igual ao resumo — nenhum dia some nem conta duas vezes", () => {
    const e = [l("2026-07-09", 10), l("2026-08-15", 20), l("2026-09-30", 30), l("2026-10-06", 40)];
    const s = [l("2026-07-12", 5), l("2026-10-01", 15)];
    for (const [i, f] of [["2026-07-09", "2026-10-06"], ["2026-01-01", "2026-10-06"], ["2026-10-01", "2026-10-06"]]) {
      const serie = serieDoPeriodo(e, s, i, f);
      const r = resumoDoPeriodo(e, s, i, f);
      expect(serie.reduce((a, p) => a + p.entradas, 0)).toBeCloseTo(r.entradas, 2);
      expect(serie.reduce((a, p) => a + p.saidas, 0)).toBeCloseTo(r.saidas, 2);
      expect(serie[serie.length - 1].acumulado).toBeCloseTo(r.resultado, 2);
      expect(serie[0].inicio).toBe(i);
      expect(serie[serie.length - 1].fim).toBe(f);
    }
  });

  it("meses: o primeiro e o último ponto são recortados ao período", () => {
    const serie = serieDoPeriodo([], [], "2026-01-15", "2026-06-10");
    expect(serie.map(p => [p.inicio, p.fim])).toEqual([
      ["2026-01-15", "2026-01-31"], ["2026-02-01", "2026-02-28"], ["2026-03-01", "2026-03-31"],
      ["2026-04-01", "2026-04-30"], ["2026-05-01", "2026-05-31"], ["2026-06-01", "2026-06-10"],
    ]);
  });

  it("um dia só: um ponto", () => {
    expect(serieDoPeriodo([l("2026-10-06", 10)], [], "2026-10-06", "2026-10-06")).toHaveLength(1);
  });
});

describe("categoria de repasse", () => {
  it("aceita o nome oficial e o antigo, com ou sem acento", () => {
    expect(ehCategoriaDeRepasse("Outros Repasses Missionários")).toBe(true);
    expect(ehCategoriaDeRepasse("Repasses Missionários")).toBe(true);
    expect(ehCategoriaDeRepasse("repasses missionarios")).toBe(true);
    expect(ehCategoriaDeRepasse("Ofertas para Missões")).toBe(false);
    expect(ehCategoriaDeRepasse("Doações e Contribuições")).toBe(false);
  });
  it("o formulário abre na oficial; na falta dela, na antiga", () => {
    const antiga = { id: "a", nome: "Repasses Missionários" };
    const oficial = { id: "o", nome: "Outros Repasses Missionários" };
    expect(categoriaPadraoDeRepasse([antiga, oficial])?.id).toBe("o");
    expect(categoriaPadraoDeRepasse([antiga])?.id).toBe("a");
    expect(categoriaPadraoDeRepasse([])).toBeNull();
  });
});
