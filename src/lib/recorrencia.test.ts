import { describe, expect, it } from "vitest";
import {
  calcularOcorrencias, diaNoMes, limiteDeGeracao, ocorrenciasAGerar, primeiraData, situacaoDaSerie,
} from "./recorrencia";

describe("o teste obrigatório dela: 12 ocorrências a partir de 05/10/2026", () => {
  const serie = { dataInicio: "2026-10-05", diaVencimento: 5, frequencia: "mensal" as const, tipo: "parcelamento" as const, totalParcelas: 12 };
  it("gera 05/10/2026 … 05/09/2027, sem parar em dezembro", () => {
    const o = calcularOcorrencias(serie, "9999-12-31");
    expect(o.map(x => x.data)).toEqual([
      "2026-10-05", "2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05", "2027-03-05",
      "2027-04-05", "2027-05-05", "2027-06-05", "2027-07-05", "2027-08-05", "2027-09-05",
    ]);
    expect(o.map(x => x.parcela)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(o.every(x => x.totalParcelas === 12)).toBe(true);
  });
  it("gerada em 06/10/2026 (um dia depois do início) a parcela de 05/10 NÃO se perde", () => {
    const o = ocorrenciasAGerar(serie, "2026-10-06", new Set());
    expect(o).toHaveLength(12);
    expect(o[0].data).toBe("2026-10-05");
  });
  it("o limite de geração de um parcelamento é 'tudo' — não os 90 dias que cortavam em dezembro", () => {
    expect(limiteDeGeracao(serie, "2026-10-06")).toBe("9999-12-31");
  });
});

describe("os outros casos que ela citou", () => {
  it("24 parcelas a partir de 20/09/2026 terminam em 20/08/2028", () => {
    const o = calcularOcorrencias({ dataInicio: "2026-09-20", diaVencimento: 20, frequencia: "mensal", tipo: "parcelamento", totalParcelas: 24 }, "9999-12-31");
    expect(o).toHaveLength(24);
    expect(o[0].data).toBe("2026-09-20");
    expect(o[23].data).toBe("2028-08-20");
  });
  it("3, 4, 5 e 12 parcelas dão exatamente essa quantidade", () => {
    for (const n of [3, 4, 5, 12]) {
      const o = calcularOcorrencias({ dataInicio: "2026-10-05", diaVencimento: 5, frequencia: "mensal", tipo: "parcelamento", totalParcelas: n }, "9999-12-31");
      expect(o).toHaveLength(n);
    }
  });
  it("começando na parcela 4 de 12, só gera 4..12", () => {
    const o = calcularOcorrencias({ dataInicio: "2026-10-15", diaVencimento: 15, frequencia: "mensal", tipo: "parcelamento", totalParcelas: 12, parcelaInicial: 4 }, "9999-12-31");
    expect(o).toHaveLength(9);
    expect(o[0]).toEqual({ data: "2026-10-15", parcela: 4, totalParcelas: 12 });
    expect(o[8]).toEqual({ data: "2027-06-15", parcela: 12, totalParcelas: 12 });
  });
});

describe("datas de fim de mês e de outras frequências", () => {
  it("dia 31 recua nos meses curtos e volta a 31 depois (não 'gruda' no 28)", () => {
    const o = calcularOcorrencias({ dataInicio: "2027-01-31", diaVencimento: 31, frequencia: "mensal", tipo: "parcelamento", totalParcelas: 4 }, "9999-12-31");
    expect(o.map(x => x.data)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
  it("ano bissexto", () => {
    expect(diaNoMes(2028, 2, 30)).toBe("2028-02-29");
  });
  it("trimestral e anual", () => {
    const tri = calcularOcorrencias({ dataInicio: "2026-11-10", diaVencimento: 10, frequencia: "trimestral", tipo: "parcelamento", totalParcelas: 3 }, "9999-12-31");
    expect(tri.map(x => x.data)).toEqual(["2026-11-10", "2027-02-10", "2027-05-10"]);
    const an = calcularOcorrencias({ dataInicio: "2026-12-01", diaVencimento: 1, frequencia: "anual", tipo: "parcelamento", totalParcelas: 3 }, "9999-12-31");
    expect(an.map(x => x.data)).toEqual(["2026-12-01", "2027-12-01", "2028-12-01"]);
  });
  it("virada de ano com dia depois do início: início 05/12, dia 3 → primeira em 03/01", () => {
    expect(primeiraData("2026-12-05", 3)).toBe("2027-01-03");
    expect(primeiraData("2026-10-05", 5)).toBe("2026-10-05");
    expect(primeiraData("2026-10-05", 10)).toBe("2026-10-10");
  });
});

describe("recorrência contínua", () => {
  const cont = { dataInicio: "2026-10-01", diaVencimento: 1, frequencia: "mensal" as const, tipo: "continua" as const };
  it("sem fim, gera 12 meses à frente (não 90 dias)", () => {
    const o = ocorrenciasAGerar(cont, "2026-10-06", new Set());
    expect(o[o.length - 1].data).toBe("2027-10-01");
    expect(o.length).toBeGreaterThanOrEqual(12);
  });
  it("com data de fim, respeita o fim (inclusive)", () => {
    const o = ocorrenciasAGerar({ ...cont, dataFim: "2026-12-04" }, "2026-10-06", new Set());
    expect(o.map(x => x.data)).toEqual(["2026-10-01", "2026-11-01", "2026-12-01"]); // 01/10 está a 5 dias: dentro da tolerância
  });
  it("começou há muito tempo: não despeja meses de atrasados", () => {
    const o = ocorrenciasAGerar({ ...cont, dataInicio: "2026-01-01" }, "2026-10-06", new Set());
    expect(o[0].data >= "2026-09-05").toBe(true);
  });
  it("não repete o que já foi gerado", () => {
    const o = ocorrenciasAGerar({ ...cont, dataFim: "2026-12-04" }, "2026-10-06", new Set(["2026-11-01"]));
    expect(o.map(x => x.data)).toEqual(["2026-10-01", "2026-12-01"]);
  });
});

describe("situação da série (o cartão da recorrência)", () => {
  const nb = { dataInicio: "2026-10-15", diaVencimento: 15, frequencia: "mensal" as const, tipo: "parcelamento" as const, totalParcelas: 12 };
  it("exemplo dela: Notebook em 12 parcelas — atual 4/12, próxima 5/12, término 15/09/2027", () => {
    const s = situacaoDaSerie(nb, "2027-01-20"); // 15/10, 15/11, 15/12, 15/01 já venceram
    expect(s.parcelaAtual).toEqual({ numero: 4, total: 12 });
    expect(s.proximaParcela).toEqual({ numero: 5, total: 12, data: "2027-02-15" });
    expect(s.termino).toBe("2027-09-15");
    expect(s.restantes).toBe(8);
  });
  it("no dia do vencimento a parcela do dia já é a 'atual'", () => {
    const s = situacaoDaSerie(nb, "2027-01-15");
    expect(s.parcelaAtual?.numero).toBe(4);
    expect(s.proximaParcela?.numero).toBe(5);
    expect(s.proximoVencimento).toBe("2027-01-15");
  });
  it("antes da primeira parcela, a atual é a 1", () => {
    const s = situacaoDaSerie(nb, "2026-09-01");
    expect(s.parcelaAtual?.numero).toBe(1);
    expect(s.proximaParcela?.numero).toBe(1);
  });
  it("depois da última: sem próxima, sem restantes", () => {
    const s = situacaoDaSerie(nb, "2027-12-01");
    expect(s.parcelaAtual).toEqual({ numero: 12, total: 12 });
    expect(s.proximaParcela).toBeNull();
    expect(s.restantes).toBe(0);
    expect(s.proximoVencimento).toBeNull();
  });
  it("contínua não tem parcela, só próximo vencimento", () => {
    const s = situacaoDaSerie({ dataInicio: "2026-10-01", diaVencimento: 1, frequencia: "mensal", tipo: "continua" }, "2026-10-06");
    expect(s.parcelaAtual).toBeNull();
    expect(s.proximoVencimento).toBe("2026-11-01");
  });
});
