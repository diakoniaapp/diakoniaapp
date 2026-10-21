import { describe, expect, it } from "vitest";
import { candidatosSemProjeto, diaDoCaixa, montarExtratoDoProjeto, type LancamentoDeExtratoDoProjeto } from "./extratoDoProjeto";

let n = 0;
const l = (p: Partial<LancamentoDeExtratoDoProjeto>): LancamentoDeExtratoDoProjeto => ({
  id: `l${++n}`.padStart(4, "0"), data: "2026-05-10", data_pagamento: null, tipo: "entrada", status: "realizado", valor: 100, origem: "manual", projeto_id: "p", ...p,
});

describe("montarExtratoDoProjeto — cronológico, com o saldo do projeto linha a linha", () => {
  it("ordena por data do CAIXA (o pagamento vale no dia em que o banco debitou) e acumula o saldo", () => {
    const ex = montarExtratoDoProjeto([
      l({ id: "c", tipo: "saida", valor: 30, data: "2026-05-01", data_pagamento: "2026-05-20" }),   // vencia dia 1, pago dia 20
      l({ id: "a", valor: 100, data: "2026-05-10" }),
      l({ id: "b", valor: 50, data: "2026-05-15" }),
    ]);
    expect(ex.linhas.map(x => [x.lancamento.id, x.dia, x.saldo])).toEqual([["a", "2026-05-10", 100], ["b", "2026-05-15", 150], ["c", "2026-05-20", 120]]);
    expect(ex).toMatchObject({ entradas: 150, saidas: 30, saldoFinal: 120, reservado: 120, alemDaReserva: 0 });
  });
  it("no mesmo dia a entrada vem antes da saída (o saldo nunca desce antes de subir sem motivo)", () => {
    const ex = montarExtratoDoProjeto([l({ id: "s", tipo: "saida", valor: 40 }), l({ id: "e", valor: 40 })]);
    expect(ex.linhas.map(x => x.lancamento.id)).toEqual(["e", "s"]);
  });
  it("transferência entre contas, cancelado, aguardando aprovação e quitado por terceiro nem aparecem", () => {
    const ex = montarExtratoDoProjeto([
      l({ valor: 10 }), l({ origem: "transferencia", valor: 999 }), l({ status: "cancelado", valor: 999 }),
      l({ status: "aguardando_aprovacao", valor: 999 }), l({ status: "quitado_terceiro", tipo: "saida", valor: 999 }),
    ], { mostrarPrevistos: true });
    expect(ex.linhas).toHaveLength(1);
    expect(ex.saldoFinal).toBe(10);
  });
  it("previsto só aparece se pedido e NUNCA mexe no saldo nem nos totais", () => {
    const base = [l({ valor: 100 }), l({ id: "pv", status: "previsto", tipo: "saida", valor: 500, data: "2026-06-01" })];
    expect(montarExtratoDoProjeto(base).linhas).toHaveLength(1);
    const com = montarExtratoDoProjeto(base, { mostrarPrevistos: true });
    expect(com.linhas).toHaveLength(2);
    expect(com.linhas[1]).toMatchObject({ conta: false, saldo: 100 });
    expect(com).toMatchObject({ saidas: 0, saldoFinal: 100 });
  });
  it("período: o saldo ANTERIOR junta tudo que veio antes, e os totais são só do período", () => {
    const ex = montarExtratoDoProjeto([
      l({ valor: 1000, data: "2026-03-01" }), l({ tipo: "saida", valor: 200, data: "2026-03-05" }),
      l({ valor: 50, data: "2026-05-10" }), l({ valor: 70, data: "2026-07-01" }),
    ], { de: "2026-05-01", ate: "2026-06-30" });
    expect(ex.saldoAnterior).toBe(800);
    expect(ex.linhas).toHaveLength(1);
    expect(ex).toMatchObject({ entradas: 50, saidas: 0, saldoFinal: 850 });
  });
  it("PISO ZERO: gastou mais do que arrecadou → reservado 0 e 'além da reserva'; o saldo do extrato mostra o negativo de verdade", () => {
    const ex = montarExtratoDoProjeto([l({ valor: 100 }), l({ tipo: "saida", valor: 160 })]);
    expect(ex).toMatchObject({ saldoFinal: -60, reservado: 0, alemDaReserva: 60 });
    expect(ex.linhas.at(-1)!.saldo).toBe(-60);
  });
  it("valores em texto (numeric do banco) e centavos não quebram a soma", () => {
    expect(montarExtratoDoProjeto([l({ valor: "10.10" }), l({ valor: "0.20" }), l({ tipo: "saida", valor: "0.05" })]).saldoFinal).toBe(10.25);
  });
  it("diaDoCaixa: realizado usa o pagamento; previsto usa o vencimento mesmo que tenha data de pagamento", () => {
    expect(diaDoCaixa(l({ data: "2026-05-01", data_pagamento: "2026-05-09" }))).toBe("2026-05-09");
    expect(diaDoCaixa(l({ status: "previsto", data: "2026-05-01", data_pagamento: "2026-05-09" }))).toBe("2026-05-01");
  });
});

describe("candidatosSemProjeto — os do mesmo centro que ainda não têm projeto", () => {
  it("só sem projeto, realizado/conciliado e fora transferência; mais recente primeiro", () => {
    const r = candidatosSemProjeto([
      l({ id: "a", projeto_id: null, data: "2026-05-01" }), l({ id: "b", projeto_id: "p" }), l({ id: "c", projeto_id: null, status: "previsto" }),
      l({ id: "d", projeto_id: null, origem: "transferencia" }), l({ id: "e", projeto_id: null, data: "2026-06-01" }),
    ]);
    expect(r.map(x => x.id)).toEqual(["e", "a"]);
  });
  it("respeita o período escolhido", () => {
    const r = candidatosSemProjeto([l({ id: "a", projeto_id: null, data: "2026-03-01" }), l({ id: "b", projeto_id: null, data: "2026-05-01" })], { de: "2026-04-01" });
    expect(r.map(x => x.id)).toEqual(["b"]);
  });
});
