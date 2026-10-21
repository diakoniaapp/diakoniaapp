import { describe, expect, it } from "vitest";
import { calcularReservaDosProjetos, itemDoFundoMissionario, montarRecursosReservados, type LancamentoDeReserva } from "./recursosReservados";

const RJ = { id: "rj", nome: "Retiro Juventude 2027" };
const RF = { id: "rf", nome: "Retiro Famílias 2027" };
const l = (p: Partial<LancamentoDeReserva>): LancamentoDeReserva => ({ projeto_id: "rj", tipo: "entrada", status: "realizado", valor: 100, origem: "manual", ...p });

describe("calcularReservaDosProjetos — receitas realizadas − despesas realizadas do MESMO projeto", () => {
  it("o exemplo dela: R$ 15.000 de receitas, R$ 4.000 de despesas = R$ 11.000; pagar o ônibus (R$ 3.500) no mesmo projeto baixa para R$ 7.500", () => {
    const base = [l({ valor: 15000 }), l({ tipo: "saida", valor: 4000 })];
    expect(calcularReservaDosProjetos([RJ], base)[0]).toMatchObject({ entradas: 15000, saidas: 4000, reservado: 11000, alemDaReserva: 0 });
    expect(calcularReservaDosProjetos([RJ], [...base, l({ tipo: "saida", valor: 3500 })])[0].reservado).toBe(7500);
  });
  it("não conta previsto, cancelado, aguardando aprovação nem quitado por terceiro (só o que passou pela conta)", () => {
    const r = calcularReservaDosProjetos([RJ], [
      l({ valor: 1000 }), l({ status: "conciliado", valor: 500 }),
      l({ status: "previsto", valor: 9999 }), l({ status: "cancelado", valor: 9999 }), l({ status: "aguardando_aprovacao", valor: 9999 }), l({ status: "quitado_terceiro", tipo: "saida", valor: 9999 }),
    ]);
    expect(r[0]).toMatchObject({ entradas: 1500, saidas: 0, reservado: 1500 });
  });
  it("não conta transferência entre contas", () => {
    expect(calcularReservaDosProjetos([RJ], [l({ valor: 800 }), l({ valor: 5000, origem: "transferencia" })])[0].entradas).toBe(800);
  });
  it("lançamento de outro projeto ou sem projeto não entra", () => {
    const r = calcularReservaDosProjetos([RJ, RF], [l({ valor: 300 }), l({ projeto_id: "rf", valor: 50 }), l({ projeto_id: null, valor: 7777 })]);
    expect(r.map(i => [i.nome, i.reservado])).toEqual([["Retiro Juventude 2027", 300], ["Retiro Famílias 2027", 50]]);
  });
  it("PISO ZERO: gastou mais do que arrecadou → reservado 0 e a diferença aparece como 'gasto além da reserva' (nunca saldo reservado negativo)", () => {
    const r = calcularReservaDosProjetos([RJ], [l({ valor: 1000 }), l({ tipo: "saida", valor: 1800 })])[0];
    expect(r).toMatchObject({ reservado: 0, alemDaReserva: 800, entradas: 1000, saidas: 1800 });
  });
  it("valor em texto (numeric do banco) e centavos não quebram a soma", () => {
    const r = calcularReservaDosProjetos([RJ], [l({ valor: "10.10" }), l({ valor: "0.20" }), l({ tipo: "saida", valor: "0.05" })])[0];
    expect(r.reservado).toBe(10.25);
  });
  it("projeto marcado sem nenhum lançamento aparece com zero", () => {
    expect(calcularReservaDosProjetos([RF], [])[0]).toMatchObject({ reservado: 0, alemDaReserva: 0 });
  });
});

describe("itemDoFundoMissionario — o saldo do painel de Missões, com piso zero", () => {
  it("arrecadado − enviado + ajustes", () => {
    expect(itemDoFundoMissionario(10000, 6000, 500)).toMatchObject({ origem: "fundo_missionario", nome: "Fundo Missionário", reservado: 4500, alemDaReserva: 0, ajustes: 500 });
  });
  it("enviou mais do que arrecadou: reservado 0 e a diferença é 'além da reserva'", () => {
    expect(itemDoFundoMissionario(1000, 1500, 0)).toMatchObject({ reservado: 0, alemDaReserva: 500 });
  });
  it("um ajuste negativo também respeita o piso", () => {
    expect(itemDoFundoMissionario(1000, 200, -2000)).toMatchObject({ reservado: 0, alemDaReserva: 1200 });
  });
});

describe("montarRecursosReservados — Saldo nas contas × Reservado × Livre", () => {
  const itens = [
    ...calcularReservaDosProjetos([RJ, RF], [l({ valor: 8000 }), l({ projeto_id: "rf", valor: 3200 })]),
    itemDoFundoMissionario(6000, 250, 0),
  ];
  it("o exemplo dela: contas 72.000, reservado soma tudo, livre é a diferença; maior reserva primeiro", () => {
    const r = montarRecursosReservados(72000, itens);
    expect(r.reservado).toBe(8000 + 3200 + 5750);
    expect(r.saldoLivre).toBe(72000 - 16950);
    expect(r.itens.map(i => i.nome)).toEqual(["Retiro Juventude 2027", "Fundo Missionário", "Retiro Famílias 2027"]);
  });
  it("sem nenhum item reservado, livre = saldo nas contas", () => {
    expect(montarRecursosReservados(1234.56, [])).toMatchObject({ reservado: 0, saldoLivre: 1234.56, alemDaReserva: 0 });
  });
  it("reservas maiores que o saldo das contas dão livre NEGATIVO (é o alerta — não é escondido)", () => {
    expect(montarRecursosReservados(5000, itens).saldoLivre).toBeLessThan(0);
  });
  it("soma o 'além da reserva' dos itens (informativo, não entra no livre)", () => {
    const r = montarRecursosReservados(10000, [
      ...calcularReservaDosProjetos([RJ], [l({ valor: 100 }), l({ tipo: "saida", valor: 400 })]), itemDoFundoMissionario(0, 50, 0),
    ]);
    expect(r).toMatchObject({ reservado: 0, alemDaReserva: 350, saldoLivre: 10000 });
  });
});
