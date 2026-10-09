import { describe, expect, it } from "vitest";
import { numerarPorDia, planejarOrdem } from "./ordemDoExtrato";
import { parear, type LinhaBanco, type LinhaSistema } from "./auditoriaExtrato";

const b = (data: string, valor: number, historico: string, extra: Partial<LinhaBanco> = {}): LinhaBanco => ({ data, valor, historico, ...extra });
const s = (id: string, data: string, valor: number, extra: Partial<LinhaSistema> = {}): LinhaSistema => ({ id, data, valor, origem: "importado_ofx", status: "conciliado", descricao: "", ...extra });

describe("numerarPorDia", () => {
  it("numera 1, 2, 3… dentro de cada data, sem reordenar", () => {
    const r = numerarPorDia([b("2026-08-03", -1135.07, "AGUAS DO RIO"), b("2026-08-03", -380, "PATRICIA"), b("2026-08-04", 23, "TAYANE"), b("2026-08-03", -9.8, "TARIFA")]);
    expect(r.map(x => [x.data, x.ordem])).toEqual([["2026-08-03", 1], ["2026-08-03", 2], ["2026-08-04", 1], ["2026-08-03", 3]]);
    expect(r.map(x => x.historico)).toEqual(["AGUAS DO RIO", "PATRICIA", "TAYANE", "TARIFA"]);
  });
});

describe("planejarOrdem — a ordem do banco chega aos lançamentos do sistema", () => {
  // 03/08 do Omie: Águas do Rio, Patrícia, Tarifa, Tarifa, Flora (a ordem do extrato do banco); o sistema as guarda em OUTRA ordem
  const banco = numerarPorDia([
    b("2026-08-03", -1135.07, "AGUAS DO RIO 4 SPE", { fitid: "N1" }), b("2026-08-03", -380, "PATRICIA CANTERO", { fitid: "N2" }),
    b("2026-08-03", -9.8, "TARIFA BANCARIA", { fitid: "N3" }), b("2026-08-03", -114.72, "TARIFA BANCARIA", { fitid: "N4" }),
    b("2026-08-03", -411.16, "FLORA ENERGIA", { fitid: "N5" }), b("2026-08-04", 23, "TAYANE", { fitid: "N6" }),
  ]);
  const sistema: LinhaSistema[] = [
    s("flora", "2026-08-03", -411.16, { fitids: ["N5"] }), s("tarifa2", "2026-08-03", -114.72, { fitids: ["N4"] }), s("agua", "2026-08-03", -1135.07, { fitids: ["N1"] }),
    s("patricia", "2026-08-03", -380, { fitids: ["N2"] }), s("tarifa1", "2026-08-03", -9.8, { fitids: ["N3"] }), s("tayane", "2026-08-04", 23, { fitids: ["N6"] }),
  ];

  it("cada lançamento recebe a posição da sua linha do banco", () => {
    const { pares } = parear(banco, sistema);
    const plano = Object.fromEntries(planejarOrdem(pares).map(x => [x.id, x.ordem]));
    expect(plano).toEqual({ agua: 1, patricia: 2, tarifa1: 3, tarifa2: 4, flora: 5, tayane: 1 });
  });

  it("par de dias diferentes não recebe ordem (a posição não vale para o outro dia)", () => {
    const { pares } = parear([b("2026-09-09", 40, "PIX CRISTIANE", { ordem: 3 })], [s("x", "2026-09-12", 40)]);
    expect(planejarOrdem(pares)).toEqual([]);
  });

  it("par agrupado (várias linhas do banco para um lançamento): vale a menor", () => {
    const bancoAgrupado = numerarPorDia([b("2026-09-01", 10, "A"), b("2026-09-01", 15, "B"), b("2026-09-01", 99, "C")]);
    const { pares } = parear(bancoAgrupado, [s("soma", "2026-09-01", 25), s("c", "2026-09-01", 99)]);
    const plano = Object.fromEntries(planejarOrdem(pares).map(x => [x.id, x.ordem]));
    expect(plano.soma).toBe(1);
    expect(plano.c).toBe(3);
  });

  it("linha do banco sem ordem (ou sem par) não gera nada", () => {
    expect(planejarOrdem([{ banco: [b("2026-09-01", 1, "x")], sistema: [s("a", "2026-09-01", 1)], regra: "mesmo_dia", dias: 0 }])).toEqual([]);
  });
});
