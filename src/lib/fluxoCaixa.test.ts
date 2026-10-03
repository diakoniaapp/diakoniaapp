import { describe, expect, it } from "vitest";
import {
  LIMITE_DIARIO, agrupar, destaques, diasNoPeriodo, granularidadeDe, serieDiaria, type Movimento,
} from "./fluxoCaixa";

const mov = (data: string, tipo: "entrada" | "saida", valor: number, transferencia = false): Movimento =>
  ({ data, tipo, valor, transferencia });

describe("diasNoPeriodo", () => {
  it("conta os dois extremos", () => {
    expect(diasNoPeriodo("2026-09-01", "2026-09-01")).toBe(1);
    expect(diasNoPeriodo("2026-09-01", "2026-09-15")).toBe(15);
    expect(diasNoPeriodo("2026-09-01", "2026-09-30")).toBe(30);
  });
  it("atravessa mês, ano e fevereiro bissexto sem escorregar um dia", () => {
    expect(diasNoPeriodo("2026-12-30", "2027-01-02")).toBe(4);
    expect(diasNoPeriodo("2028-02-28", "2028-03-01")).toBe(3); // 2028 é bissexto
    expect(diasNoPeriodo("2026-03-01", "2026-05-30")).toBe(91);
  });
});

describe("serieDiaria — base SEMPRE diária (15, 30, 45, 90 dias = 15, 30, 45, 90 pontos)", () => {
  it.each([15, 30, 45, 90])("%i dias → %i pontos, um por dia, nenhum buraco", (n) => {
    const ate = new Date(Date.UTC(2026, 8, 1) + (n - 1) * 86_400_000).toISOString().slice(0, 10);
    const s = serieDiaria([], 0, "2026-09-01", ate);
    expect(s).toHaveLength(n);
    expect(s[0].dia).toBe("2026-09-01");
    expect(s[n - 1].dia).toBe(ate);
    // dias consecutivos
    for (let i = 1; i < s.length; i++) {
      expect(diasNoPeriodo(s[i - 1].dia, s[i].dia)).toBe(2);
    }
  });

  it("dia sem movimento aparece com zero e o saldo do dia anterior", () => {
    const s = serieDiaria([mov("2026-09-01", "entrada", 100)], 50, "2026-09-01", "2026-09-03");
    expect(s.map(d => d.saldo)).toEqual([150, 150, 150]);
    expect(s[1]).toMatchObject({ entradas: 0, saidas: 0, resultado: 0 });
  });

  it("entradas, saídas, resultado do dia e saldo acumulado", () => {
    const s = serieDiaria([
      mov("2026-09-01", "entrada", 1000), mov("2026-09-01", "saida", 300),
      mov("2026-09-02", "saida", 900),
      mov("2026-09-03", "entrada", 200.55), mov("2026-09-03", "entrada", 0.1),
    ], 500, "2026-09-01", "2026-09-03");
    expect(s).toEqual([
      { dia: "2026-09-01", entradas: 1000, saidas: 300, resultado: 700, saldo: 1200 },
      { dia: "2026-09-02", entradas: 0, saidas: 900, resultado: -900, saldo: 300 },
      { dia: "2026-09-03", entradas: 200.65, saidas: 0, resultado: 200.65, saldo: 500.65 },
    ]);
  });

  it("saldo negativo é preservado (o período de saldo negativo precisa aparecer)", () => {
    const s = serieDiaria([mov("2026-09-01", "saida", 800)], 100, "2026-09-01", "2026-09-02");
    expect(s.map(d => d.saldo)).toEqual([-700, -700]);
  });

  it("transferência NÃO conta como entrada nem saída, mas entra no saldo (e as pernas se anulam)", () => {
    const s = serieDiaria([
      mov("2026-09-01", "saida", 400, true), mov("2026-09-01", "entrada", 400, true),
      mov("2026-09-02", "saida", 100, true), // perna solta: o saldo acusa
    ], 1000, "2026-09-01", "2026-09-02");
    expect(s[0]).toMatchObject({ entradas: 0, saidas: 0, saldo: 1000 });
    expect(s[1]).toMatchObject({ entradas: 0, saidas: 0, saldo: 900 });
  });

  it("ignora movimento fora do período e centavos não acumulam erro de ponto flutuante", () => {
    const m = Array.from({ length: 10 }, () => mov("2026-09-01", "entrada", 0.1));
    const s = serieDiaria([...m, mov("2026-08-31", "entrada", 999), mov("2026-09-02", "entrada", 999)], 0, "2026-09-01", "2026-09-01");
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ entradas: 1, saldo: 1 });
  });

  it("período invertido: vazio, sem quebrar", () => {
    expect(serieDiaria([], 0, "2026-09-10", "2026-09-01")).toEqual([]);
  });
});

describe("granularidade", () => {
  it("até 120 dias é sempre diário, qualquer que seja o modo (o seletor nem aparece)", () => {
    for (const modo of ["automatico", "diario", "semanal", "mensal"] as const) {
      expect(granularidadeDe(LIMITE_DIARIO, modo)).toBe("dia");
      expect(granularidadeDe(15, modo)).toBe("dia");
    }
  });
  it("acima de 120 dias o usuário manda", () => {
    expect(granularidadeDe(200, "diario")).toBe("dia");
    expect(granularidadeDe(200, "semanal")).toBe("semana");
    expect(granularidadeDe(200, "mensal")).toBe("mes");
  });
  it("automático: 121–180 dias semanas, depois meses (os 12 meses do padrão da tela seguem mensais)", () => {
    expect(granularidadeDe(121, "automatico")).toBe("semana");
    expect(granularidadeDe(180, "automatico")).toBe("semana");
    expect(granularidadeDe(181, "automatico")).toBe("mes");
    expect(granularidadeDe(335, "automatico")).toBe("mes");
  });
});

describe("agrupar", () => {
  const movs = [
    mov("2026-09-01", "entrada", 100), mov("2026-09-02", "saida", 40), mov("2026-09-07", "entrada", 10),
    mov("2026-09-14", "saida", 5), mov("2026-10-02", "entrada", 1000),
  ];
  const serie = serieDiaria(movs, 0, "2026-09-01", "2026-10-03");

  it("dia: um ponto por dia, com título 'dia da semana, data'", () => {
    const p = agrupar(serie, "dia");
    expect(p).toHaveLength(33);
    expect(p[0]).toMatchObject({ rotulo: "01/09", titulo: "ter, 01/09/2026", dias: 1, entradas: 100, saldo: 100 });
  });

  it("mês: soma entradas/saídas, e o saldo é o do ÚLTIMO dia do mês", () => {
    const p = agrupar(serie, "mes");
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ rotulo: "Set/26", titulo: "Setembro de 2026", entradas: 110, saidas: 45, resultado: 65, saldo: 65, dias: 30 });
    expect(p[1]).toMatchObject({ rotulo: "Out/26", titulo: "Outubro de 2026", entradas: 1000, dias: 3, saldo: 1065 });
  });

  it("semana: segunda a domingo, recortada nos extremos do período", () => {
    const p = agrupar(serie, "semana");
    // 01/09/2026 é terça: a 1ª semana começa nela, não na segunda 31/08
    expect(p[0]).toMatchObject({ inicio: "2026-09-01", fim: "2026-09-06", dias: 6, entradas: 100, saidas: 40 });
    expect(p[1]).toMatchObject({ inicio: "2026-09-07", fim: "2026-09-13", dias: 7, entradas: 10 });
    expect(p[p.length - 1].fim).toBe("2026-10-03"); // termina no último dia escolhido
    expect(p.reduce((s, x) => s + x.dias, 0)).toBe(33); // nenhum dia perdido nem repetido
  });

  it("agrupar não muda o total: a soma dos pontos fecha com a soma dos dias", () => {
    for (const g of ["dia", "semana", "mes"] as const) {
      const p = agrupar(serie, g);
      expect(Math.round(p.reduce((s, x) => s + x.entradas, 0) * 100) / 100).toBe(1110);
      expect(Math.round(p.reduce((s, x) => s + x.saidas, 0) * 100) / 100).toBe(45);
      expect(p[p.length - 1].saldo).toBe(1065);
    }
  });

  it("série vazia: nada", () => expect(agrupar([], "mes")).toEqual([]));
});

describe("destaques do termômetro", () => {
  const s = serieDiaria([
    mov("2026-09-01", "entrada", 500), mov("2026-09-02", "saida", 900), mov("2026-09-03", "entrada", 500),
    mov("2026-09-04", "saida", 900), mov("2026-09-05", "saida", 200),
  ], 100, "2026-09-01", "2026-09-06");

  it("dia de maior arrecadação e de maior despesa (empate: o mais antigo)", () => {
    const d = destaques(agrupar(s, "dia"));
    expect(d.maiorEntrada).toMatchObject({ inicio: "2026-09-01", entradas: 500 });
    expect(d.maiorSaida).toMatchObject({ inicio: "2026-09-02", saidas: 900 });
  });

  it("períodos de saldo negativo e o pior saldo", () => {
    const d = destaques(agrupar(s, "dia"));
    // saldos: 600, -300, 200, -700, -900, -900
    expect(d.negativos).toBe(4);
    expect(d.total).toBe(6);
    expect(d.menorSaldo).toMatchObject({ inicio: "2026-09-05", saldo: -900 });
  });

  it("sem movimento: sem maior entrada/saída", () => {
    const d = destaques(agrupar(serieDiaria([], 10, "2026-09-01", "2026-09-03"), "dia"));
    expect(d.maiorEntrada).toBeNull();
    expect(d.maiorSaida).toBeNull();
    expect(d.negativos).toBe(0);
  });
});
