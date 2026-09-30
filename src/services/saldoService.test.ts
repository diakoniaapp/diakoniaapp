import { describe, expect, it } from "vitest";
import { calcularExtrato, ordenarParaExtrato } from "./saldoService";

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
