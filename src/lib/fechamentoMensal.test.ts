import { describe, expect, it } from "vitest";
import {
  avaliarFechamento, limitesDoMes, mesEmFechamento, rotuloDoMes, ultimosMeses, veredito,
  type CentroFechamento, type ContaFechamento, type LancamentoFechamento,
} from "./fechamentoMensal";

const conta = (p: Partial<ContaFechamento> = {}): ContaFechamento => ({
  id: "c1", nome: "Bradesco", tipo: "banco", ativo: true, saldoInicial: 100, saldoAtual: 100, movimentoTotal: 0, ...p,
});
let seq = 0;
const lanc = (p: Partial<LancamentoFechamento> = {}): LancamentoFechamento => {
  seq += 1;
  return {
    id: `l${seq}`, dia: "2026-09-15", tipo: "saida", status: "conciliado", valor: 50, contaId: "c1", contaNome: "Bradesco",
    categoriaId: "cat", centroId: "cen", origem: "importado_omie", fornecedor: "Mercado", ...p,
  };
};

describe("datas do fechamento", () => {
  it("o mês em fechamento é o anterior (03/10 → setembro; janeiro → dezembro do ano anterior)", () => {
    expect(mesEmFechamento("2026-10-03")).toEqual({ ano: 2026, mes: 9 });
    expect(mesEmFechamento("2026-01-05")).toEqual({ ano: 2025, mes: 12 });
  });
  it("limites e rótulo", () => {
    expect(limitesDoMes(2026, 9)).toEqual({ ini: "2026-09-01", fim: "2026-09-30" });
    expect(limitesDoMes(2028, 2).fim).toBe("2028-02-29");
    expect(rotuloDoMes(2026, 9)).toBe("Setembro/2026");
  });
  it("últimos meses, do mais recente para o mais antigo, atravessando o ano", () => {
    expect(ultimosMeses("2026-02-10", 3)).toEqual([{ ano: 2026, mes: 2 }, { ano: 2026, mes: 1 }, { ano: 2025, mes: 12 }]);
  });
});

describe("avaliarFechamento — o que impede o malote", () => {
  it("mês limpo: pronto, sem bloqueio", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [lanc(), lanc()], []);
    expect(a.pronto).toBe(true);
    expect(a.bloqueios).toEqual([]);
    expect(veredito(a)).toBe("Pronto para gerar o malote de Setembro/2026.");
  });

  it("conta de banco com lançamento só 'realizado' = conta sem conciliar (um bloqueio por CONTA)", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [lanc({ status: "realizado" }), lanc({ status: "realizado" }), lanc()], []);
    expect(a.conciliacao).toMatchObject({ contas: 1, conciliadas: 0 });
    expect(a.conciliacao.pendentes[0].lancamentos).toHaveLength(2);
    expect(a.bloqueios).toHaveLength(1);
    expect(a.bloqueios[0]).toMatchObject({ tipo: "conciliacao", contaId: "c1", titulo: "Conta sem conciliar — Bradesco" });
    expect(a.bloqueios[0].detalhe).toBe("2 lançamentos aguardam conciliação com o extrato");
    expect(a.pronto).toBe(false);
  });

  it("conciliação só vale para conta de BANCO: caixa, envelope e cartão com 'realizado' não impedem", () => {
    const contas = [conta(), conta({ id: "c2", nome: "Caixinha", tipo: "caixa" }), conta({ id: "c3", nome: "Envelopes", tipo: "envelope" })];
    const a = avaliarFechamento(2026, 9, contas, [
      lanc(), lanc({ contaId: "c2", status: "realizado" }), lanc({ contaId: "c3", status: "realizado" }),
    ], []);
    expect(a.bloqueios).toEqual([]);
    expect(a.conciliacao).toMatchObject({ contas: 1, conciliadas: 1 });
  });

  it("'3 de 5': conta quantas contas de banco conciliaram", () => {
    const contas = ["a", "b", "c", "d", "e"].map(id => conta({ id, nome: `Banco ${id}` }));
    const ls = contas.map((c, i) => lanc({ contaId: c.id, contaNome: c.nome, status: i < 2 ? "realizado" : "conciliado" }));
    const a = avaliarFechamento(2026, 9, contas, ls, []);
    expect(a.conciliacao).toMatchObject({ contas: 5, conciliadas: 3 });
    expect(a.conciliacao.pendentes).toHaveLength(2);
  });

  it("conta de banco SEM movimento no mês não entra na conta", () => {
    const a = avaliarFechamento(2026, 9, [conta(), conta({ id: "c9", nome: "Parada" })], [lanc()], []);
    expect(a.conciliacao.contas).toBe(1);
  });

  it("conta de banco ativa SEM lançamento no mês = extrato provavelmente não importado (atenção, não bloqueio)", () => {
    const a = avaliarFechamento(2026, 9, [conta(), conta({ id: "c9", nome: "Parada" })], [lanc()], []);
    expect(a.semMovimento.map(c => c.nome)).toEqual(["Parada"]);
    expect(a.bloqueios).toEqual([]);
    expect(a.pronto).toBe(true);
    // e quem tem movimento, ou não é de banco, não entra
    expect(avaliarFechamento(2026, 9, [conta({ tipo: "caixa" })], [], []).semMovimento).toEqual([]);
  });

  it("sem categoria e sem centro: um bloqueio por lançamento", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [lanc({ categoriaId: null }), lanc({ centroId: null }), lanc()], []);
    expect(a.semCategoria).toHaveLength(1);
    expect(a.semCentro).toHaveLength(1);
    expect(a.bloqueios.map(b => b.tipo)).toEqual(["sem_categoria", "sem_centro"]);
  });

  it("transferência entre contas não precisa de categoria nem centro", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [lanc({ origem: "transferencia", categoriaId: null, centroId: null })], []);
    expect(a.bloqueios).toEqual([]);
  });

  it("saldo inconsistente (saldo gravado ≠ inicial + movimento) bloqueia", () => {
    const a = avaliarFechamento(2026, 9, [conta({ saldoInicial: 100, movimentoTotal: 50, saldoAtual: 120 })], [], []);
    expect(a.bloqueios).toHaveLength(1);
    expect(a.bloqueios[0].tipo).toBe("saldo");
    expect(a.bloqueios[0].detalhe.replace(/\u00a0/g, " ")).toContain("R$ 150,00"); // o Intl usa espaço inseparável
  });
  it("saldo certo, mesmo com centavos de arredondamento: não bloqueia", () => {
    const a = avaliarFechamento(2026, 9, [conta({ saldoInicial: 0.1, movimentoTotal: 0.2, saldoAtual: 0.3 })], [], []);
    expect(a.saldosInconsistentes).toEqual([]);
  });
  it("conta inativa não entra em saldo nem em conciliação", () => {
    const a = avaliarFechamento(2026, 9, [conta({ ativo: false, saldoAtual: 999 })], [lanc({ status: "realizado" })], []);
    expect(a.bloqueios).toEqual([]);
  });

  it("só olha o mês: lançamento de outro mês ou previsto não conta", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [
      lanc({ dia: "2026-08-31", categoriaId: null }), lanc({ dia: "2026-10-01", categoriaId: null }),
      lanc({ status: "previsto", categoriaId: null }), lanc({ status: "cancelado", centroId: null }),
    ], []);
    expect(a.bloqueios).toEqual([]);
  });

  it("sem subcentro é só ATENÇÃO: lançamento no centro-pai não impede o malote", () => {
    const centros: CentroFechamento[] = [{ id: "pai", paiId: null }, { id: "filho", paiId: "pai" }];
    const a = avaliarFechamento(2026, 9, [conta()], [lanc({ centroId: "pai" }), lanc({ centroId: "filho" })], centros);
    expect(a.semSubcentro).toHaveLength(1);
    expect(a.bloqueios).toEqual([]);
    expect(a.pronto).toBe(true);
  });

  it("os ids dos bloqueios são únicos (servem de chave e de contagem)", () => {
    const a = avaliarFechamento(2026, 9, [conta()], [
      lanc({ status: "realizado", categoriaId: null, centroId: null }), lanc({ categoriaId: null }),
    ], []);
    const ids = a.bloqueios.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(4); // 1 conta + 2 sem categoria + 1 sem centro
  });

  it("veredito no singular e no plural", () => {
    expect(veredito(avaliarFechamento(2026, 9, [conta()], [lanc({ categoriaId: null })], [])))
      .toBe("1 pendência impede o fechamento de Setembro/2026.");
    expect(veredito(avaliarFechamento(2026, 9, [conta()], [lanc({ categoriaId: null }), lanc({ categoriaId: null })], [])))
      .toBe("2 pendências impedem o fechamento de Setembro/2026.");
  });
});
