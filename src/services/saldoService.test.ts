import { describe, expect, it } from "vitest";
import { ajusteDeCaixaAntesDe, calcularExtrato, dataEfetiva, fechamentosDoDia, ordenarParaExtrato, vencimentoDiferente } from "./saldoService";
import { filtroDePeriodoDeCaixa } from "./finService";

// Bradesco, 20/03/2026 — os 21 lançamentos das duas telas comparadas na
// auditoria de 30/09/2026 (Omie × Diakonia), transcritos das capturas.
// Todos conciliados, mesmo `created_at` (lote da importação), saldo
// anterior R$ 1,00 nas duas.
const LOTE = "2026-09-20T12:00:00.000Z";
function lanc(id: string, tipo: "entrada" | "saida", valor: number, status = "conciliado") {
  return { id, data: "2026-03-20", tipo, valor, status, created_at: LOTE } as const;
}

const OMIE = [
  lanc("01-dizimo", "entrada", 80),
  lanc("02-rend", "entrada", 0.11), lanc("03-rend", "entrada", 0.07), lanc("04-rend", "entrada", 0.02),
  lanc("05-rend", "entrada", 0.01), lanc("06-rend", "entrada", 0.43),
  lanc("07-transf", "entrada", 2232.62), lanc("08-transf", "entrada", 1644.00),
  lanc("09-transf", "entrada", 1274.00), lanc("10-transf", "entrada", 541.22),
  lanc("11-transf", "entrada", 557.21), lanc("12-transf", "entrada", 6003.66),
  lanc("13-internet", "saida", 99), lanc("14-internet", "saida", 150), lanc("15-aluguel", "saida", 360),
  lanc("16-amil", "saida", 2848.97), lanc("17-tarifa", "saida", 8.70), lanc("18-darf", "saida", 8190.36),
  lanc("19-fgts", "saida", 509.68), lanc("20-tim", "saida", 116.64), lanc("21-vt", "saida", 50),
];

describe("calcularExtrato — auditoria Bradesco 20/03/2026", () => {
  it("reproduz o saldo final do Omie (R$ 1,00)", () => {
    const r = calcularExtrato(OMIE as any, 1);
    expect(r.totalEntradas).toBe(12333.35);
    expect(r.totalSaidas).toBe(12333.35);
    expect(r.saldoFinal).toBe(1);
  });

  it("a transferência de 1.664,00 (Diakonia) no lugar de 1.644,00 (Omie) explica os R$ 20,00", () => {
    const diakonia = OMIE.map(l => (l.id === "08-transf" ? { ...l, valor: 1664 } : l));
    const r = calcularExtrato(diakonia as any, 1);
    expect(r.saldoFinal).toBe(21);
  });

  it("não depende da ordem de chegada quando created_at empata", () => {
    const a = ordenarParaExtrato(OMIE as any).map(l => l.id);
    const b = ordenarParaExtrato([...OMIE].reverse() as any).map(l => l.id);
    expect(b).toEqual(a);
  });

  it("previsto e cancelado não mexem no saldo", () => {
    const r = calcularExtrato([lanc("a", "entrada", 10, "previsto"), lanc("b", "saida", 5, "cancelado")] as any, 1);
    expect(r.saldoFinal).toBe(1);
  });

  it("soma sem erro de ponto flutuante", () => {
    const r = calcularExtrato([lanc("a", "entrada", 0.1), lanc("b", "entrada", 0.2)] as any, 0);
    expect(r.saldoFinal).toBe(0.3);
  });
});

// ── O extrato é de CAIXA: o pagamento entra no dia em que o banco debitou ───────────────────────────────────────
// Bradesco, 18/09/2026 ("o dia 18/09 não fecha em R$ 1,00"): DARF, FGTS, Ecoprint e Tim venciam em 20/09 e foram pagos em 18/09
// (data = 20/09, data_pagamento = 18/09). Por vencimento o dia 18 mostrava R$ 9.023,85; por caixa, R$ 1,00 como o banco.
const L18 = "2026-09-18T12:00:00.000Z";
function dia18(id: string, tipo: "entrada" | "saida", valor: number, extra: Record<string, unknown> = {}) {
  return { id, data: "2026-09-18", tipo, valor, status: "conciliado", created_at: L18, data_pagamento: null, ...extra };
}
const PAGOS_EM_18_VENCIDOS_EM_20 = [
  dia18("darf", "saida", 7835.46, { data: "2026-09-20", data_pagamento: "2026-09-18" }),
  dia18("fgts", "saida", 713.21, { data: "2026-09-20", data_pagamento: "2026-09-18" }),
  dia18("eco", "saida", 360, { data: "2026-09-20", data_pagamento: "2026-09-18" }),
  dia18("tim", "saida", 114.18, { data: "2026-09-20", data_pagamento: "2026-09-18" }),
];
const DO_DIA_18 = [
  dia18("resgate", "entrada", 9879.85),     // entradas do dia somam R$ 9.022,85 + R$ 857 que o banco debita em PIX comuns
  dia18("pix1", "saida", 350), dia18("pix2", "saida", 150), dia18("pix3", "saida", 357),
];

describe("extrato por data de caixa", () => {
  it("dataEfetiva: pago usa data_pagamento; previsto e sem pagamento usam o vencimento", () => {
    expect(dataEfetiva({ status: "conciliado", data: "2026-09-20", data_pagamento: "2026-09-18" })).toBe("2026-09-18");
    expect(dataEfetiva({ status: "realizado", data: "2026-09-20", data_pagamento: null })).toBe("2026-09-20");
    expect(dataEfetiva({ status: "previsto", data: "2026-09-20", data_pagamento: "2026-09-18" })).toBe("2026-09-20");
    expect(dataEfetiva({ status: "conciliado", data: "2026-09-20T00:00:00", data_pagamento: "2026-09-18T10:00:00" })).toBe("2026-09-18");
  });

  it("vencimentoDiferente só aparece quando o pagamento caiu em outro dia", () => {
    expect(vencimentoDiferente({ status: "conciliado", data: "2026-09-20", data_pagamento: "2026-09-18" })).toBe("2026-09-20");
    expect(vencimentoDiferente({ status: "conciliado", data: "2026-09-18", data_pagamento: "2026-09-18" })).toBeNull();
    expect(vencimentoDiferente({ status: "previsto", data: "2026-09-20", data_pagamento: null })).toBeNull();
  });

  it("o dia 18/09 fecha igual ao banco: a ordem do extrato usa o dia do pagamento", () => {
    const base = 1;                                   // saldo do banco no fim do dia anterior
    const todos = [...DO_DIA_18, ...PAGOS_EM_18_VENCIDOS_EM_20];
    const r = calcularExtrato(todos as any, base);
    const ultimaDe18 = r.ordenados.filter(l => dataEfetiva(l as any) === "2026-09-18").at(-1)!;
    expect(r.saldoPorLancamento.get(ultimaDe18.id)).toBe(base + 9879.85 - 350 - 150 - 357 - 9022.85);   // = 1,00
    expect(r.saldoFinal).toBe(1);
  });

  it("sem data_pagamento nada muda: continua ordenando por data (comportamento anterior)", () => {
    const a = ordenarParaExtrato([dia18("b", "saida", 1, { data: "2026-09-19" }), dia18("a", "entrada", 1, { data: "2026-09-18" })] as any).map(l => l.id);
    expect(a).toEqual(["a", "b"]);
  });

  it("ajusteDeCaixaAntesDe: o saldo 'antes de 19/09' por caixa fica 9.022,85 abaixo do por vencimento", () => {
    // por vencimento (fin_movimento_antes_de) os 4 só contam a partir de 20/09; por caixa já contam antes de 19/09
    expect(ajusteDeCaixaAntesDe(PAGOS_EM_18_VENCIDOS_EM_20.map(l => ({ ...l, status: "conciliado" })), "2026-09-19")).toBe(-9022.85);
  });

  it("ajusteDeCaixaAntesDe: pagamento ANTES do vencimento em sentido oposto (vence antes, pago depois) devolve", () => {
    const l = { tipo: "saida", valor: 100, data: "2026-09-10", data_pagamento: "2026-09-12", status: "conciliado" };
    expect(ajusteDeCaixaAntesDe([l], "2026-09-11")).toBe(100);      // por vencimento já saiu; por caixa ainda não
    expect(ajusteDeCaixaAntesDe([l], "2026-09-13")).toBe(0);        // os dois lados já passaram do limite
    expect(ajusteDeCaixaAntesDe([l], "2026-09-10")).toBe(0);        // nenhum dos dois passou
  });

  it("ajusteDeCaixaAntesDe ignora o que não movimenta saldo e o que não tem data de pagamento", () => {
    expect(ajusteDeCaixaAntesDe([{ tipo: "saida", valor: 50, data: "2026-09-20", data_pagamento: "2026-09-18", status: "previsto" }], "2026-09-19")).toBe(0);
    expect(ajusteDeCaixaAntesDe([{ tipo: "saida", valor: 50, data: "2026-09-20", data_pagamento: null, status: "conciliado" }], "2026-09-19")).toBe(0);
  });

  it("o período por caixa: pago pelo pagamento, o resto pelo vencimento", () => {
    expect(filtroDePeriodoDeCaixa("2026-09-18", "2026-09-18")).toBe(
      "and(status.in.(realizado,conciliado),data_pagamento.gte.2026-09-18,data_pagamento.lte.2026-09-18),and(data.gte.2026-09-18,data.lte.2026-09-18,or(data_pagamento.is.null,status.not.in.(realizado,conciliado)))");
    // limite aberto de um lado só (ex.: "atrasados" sem chão)
    expect(filtroDePeriodoDeCaixa(undefined, "2026-09-18")).toContain("data_pagamento.lte.2026-09-18)");
    expect(filtroDePeriodoDeCaixa(undefined, "2026-09-18")).not.toContain(".gte.");
  });
});

// ── a ordem do extrato do BANCO e a linha "SALDO DO DIA" ────────────────────────────────────────────────────────────
// 03/08/2026 do Omie: Águas do Rio, Patrícia, Tarifa, Tarifa, Flora — e 04/08: Tayane, Ulisses. Saldo do dia 03/08 = R$ 1,00.
const T = "2026-08-05T12:00:00.000Z";
const l0 = (id: string, data: string, tipo: "entrada" | "saida", valor: number, ordem?: number, extra: Record<string, unknown> = {}) =>
  ({ id, data, tipo, valor, status: "conciliado", created_at: T, data_pagamento: null, ...(ordem === undefined ? {} : { ordem_banco: ordem }), ...extra });

describe("ordem do banco no extrato", () => {
  const AGOSTO = [
    l0("flora", "2026-08-03", "saida", 411.16, 5), l0("tarifa2", "2026-08-03", "saida", 114.72, 4), l0("agua", "2026-08-03", "saida", 1135.07, 1),
    l0("patricia", "2026-08-03", "saida", 380, 2), l0("tarifa1", "2026-08-03", "saida", 9.8, 3),
    l0("tayane", "2026-08-04", "entrada", 23, 1), l0("ulisses", "2026-08-04", "entrada", 10, 2),
  ];

  it("dentro do mesmo dia, a sequência é a do banco — qualquer que seja a ordem de chegada", () => {
    const a = ordenarParaExtrato(AGOSTO as any).map(l => l.id);
    const b = ordenarParaExtrato([...AGOSTO].reverse() as any).map(l => l.id);
    expect(a).toEqual(["agua", "patricia", "tarifa1", "tarifa2", "flora", "tayane", "ulisses"]);
    expect(b).toEqual(a);
  });

  it("o banco manda até sobre 'entrada antes de saída' (o extrato do banco tem a sequência dele)", () => {
    const r = ordenarParaExtrato([l0("saida", "2026-08-03", "saida", 5, 1), l0("entrada", "2026-08-03", "entrada", 5, 2)] as any).map(l => l.id);
    expect(r).toEqual(["saida", "entrada"]);
  });

  it("sem ordem (não sincronizado) a regra antiga continua; quem tem ordem vem antes de quem não tem, e a ordem total é estável", () => {
    const mistura = [l0("manualSaida", "2026-08-03", "saida", 1), l0("banco2", "2026-08-03", "saida", 1, 2), l0("manualEntrada", "2026-08-03", "entrada", 1), l0("banco1", "2026-08-03", "saida", 1, 1)];
    const a = ordenarParaExtrato(mistura as any).map(l => l.id);
    expect(a).toEqual(["banco1", "banco2", "manualEntrada", "manualSaida"]);
    expect(ordenarParaExtrato([...mistura].reverse() as any).map(l => l.id)).toEqual(a);
  });

  it("a ordem só vale dentro do dia: outra data continua pesando mais", () => {
    expect(ordenarParaExtrato([l0("tarde", "2026-08-04", "saida", 1, 1), l0("cedo", "2026-08-03", "saida", 1, 9)] as any).map(l => l.id)).toEqual(["cedo", "tarde"]);
  });
});

describe("fechamentosDoDia — a linha SALDO DO DIA", () => {
  it("devolve o saldo depois da última linha de cada data (03/08 fecha em R$ 1,00)", () => {
    // saldo anterior R$ 1.152,44 → depois das 5 saídas de 03/08 o saldo é R$ 1,00
    const dia3 = [l0("agua", "2026-08-03", "saida", 1135.07, 1), l0("pat", "2026-08-03", "saida", 380, 2), l0("t1", "2026-08-03", "saida", 9.8, 3), l0("t2", "2026-08-03", "saida", 114.72, 4), l0("flora", "2026-08-03", "saida", 411.16, 5)];
    const dia4 = [l0("tayane", "2026-08-04", "entrada", 23, 1), l0("ulisses", "2026-08-04", "entrada", 10, 2)];
    const r = calcularExtrato([...dia3, ...dia4] as any, 2051.75);
    const f = fechamentosDoDia(r.ordenados as any, r.saldoPorLancamento);
    expect([...f.entries()].map(([id, x]) => [id, x.data, x.saldo])).toEqual([["flora", "2026-08-03", 1], ["ulisses", "2026-08-04", 34]]);
  });

  it("usa a data de CAIXA: o pagamento de 18/09 com vencimento em 20/09 fecha o dia 18, não o 20", () => {
    const lancs = [l0("pix", "2026-09-18", "saida", 350, 1), l0("darf", "2026-09-20", "saida", 100, 2, { data_pagamento: "2026-09-18" })];
    const r = calcularExtrato(lancs as any, 451);
    const f = fechamentosDoDia(r.ordenados as any, r.saldoPorLancamento);
    expect([...f.values()]).toEqual([{ data: "2026-09-18", saldo: 1 }]);
  });

  it("previsto no fim do dia não muda o fechamento; lista vazia não gera nada", () => {
    const lancs = [l0("pg", "2026-09-01", "saida", 10, 1), l0("prev", "2026-09-01", "saida", 99, undefined, { status: "previsto" })];
    const r = calcularExtrato(lancs as any, 11);
    expect([...fechamentosDoDia(r.ordenados as any, r.saldoPorLancamento).values()]).toEqual([{ data: "2026-09-01", saldo: 1 }]);
    expect(fechamentosDoDia([], new Map()).size).toBe(0);
  });
});
