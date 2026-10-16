// "Posição Financeira das Contas" (15/10/2026): o saldo de cada conta no primeiro e no último dia do período e o consolidado, só leitura — a demonstração não muda.
import { describe, expect, it, vi } from "vitest";

const contas = [
  { id: "c1", nome: "Bradesco Conta Corrente", saldo_inicial: 1000, ativo: true },
  { id: "c2", nome: "Aplicações Financeiras", saldo_inicial: 5000, ativo: true },
  { id: "c3", nome: "Caixinha Administrativa", saldo_inicial: 200, ativo: true },
  { id: "c4", nome: "Caixa Envelopes", saldo_inicial: 0, ativo: true },
  { id: "c5", nome: "Conta antiga zerada", saldo_inicial: 0, ativo: false },
  { id: "c6", nome: "Conta antiga com saldo", saldo_inicial: 50, ativo: false },
];
// movimento realizado ANTES de cada data, por conta (o que a função do banco devolve)
const antes: Record<string, Record<string, number>> = {
  c1: { "2026-09-01": 300, "2026-10-01": 500 }, c2: { "2026-09-01": 40, "2026-10-01": 90 }, c3: { "2026-09-01": -20, "2026-10-01": -35 },
};
const lancs = [{ id: "l1", status: "realizado", origem: "manual", tipo: "entrada", data: "2026-09-05", valor: 100, categoria_id: "c-diz", centro_custo_id: null, pessoa_nome: "Ana", descricao: null, conta_nome: "Bradesco", categoria_nome: null, centro_nome: null }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async (_n: string, a: { p_conta_id: string; p_data_limite_exclusiva: string }) => ({ data: antes[a.p_conta_id]?.[a.p_data_limite_exclusiva] ?? 0, error: null }) },
}));
vi.mock("./finService", () => ({
  listarLancamentosSemTeto: async () => lancs, listarContas: async () => contas,
  listarCategoriasTodas: async () => [{ id: "c-diz", nome: "Dizimos", tipo: "entrada", classificacao_dre: "receitas_regulares", ativo: true }],
  listarCentrosCusto: async () => [], nomeExtrato: () => ({ principal: "x", secundario: null }),
}));
vi.mock("./relatorioNotasService", () => ({ listarNotasDoPeriodo: async () => [] }));

import { gerarCSVPrestacaoContas, gerarPrestacaoContas } from "./prestacaoContasService";
import { diferencaParaADemonstracao, montarPosicaoDasContas, resumoExecutivo } from "@/lib/prestacaoIndicadores";

describe("a posição financeira das contas", async () => {
  const r = await gerarPrestacaoContas(2026, 9, 1);
  const p = r.posicaoContas;

  it("cada conta ativa traz o saldo inicial e o final do período, na ordem do cadastro", () => {
    expect(p.contas.map(c => [c.nome, c.saldoInicial, c.saldoFinal])).toEqual([
      ["Bradesco Conta Corrente", 1300, 1500], ["Aplicações Financeiras", 5040, 5090], ["Caixinha Administrativa", 180, 165], ["Caixa Envelopes", 0, 0], ["Conta antiga com saldo", 50, 50],
    ]);
  });

  it("conta inativa e zerada fica de fora; inativa com saldo entra (senão o total não fecharia)", () => {
    expect(p.contas.some(c => c.nome === "Conta antiga zerada")).toBe(false);
    expect(p.contas.some(c => c.nome === "Conta antiga com saldo")).toBe(true);
  });

  it("o total geral é a soma das contas e o saldo inicial consolidado é o Saldo Inicial do relatório", () => {
    expect(p.totalInicial).toBe(6570);
    expect(p.totalFinal).toBe(6805);
    expect(p.totalInicial).toBe(resumoExecutivo(r).saldoInicial);
  });

  it("não mexe na demonstração: receitas, resultado e saldos seguem os mesmos", () => {
    expect(r.totalReceitas).toEqual([100]);
    expect(r.resultado).toEqual([100]);
    expect(r.saldoAnterior).toEqual([6570]);
    expect(r.saldoFinal).toEqual([6670]);
  });

  it("a diferença para o Saldo Final da demonstração é dita (aqui, o movimento das contas não é o da demonstração)", () => {
    expect(diferencaParaADemonstracao(p, resumoExecutivo(r).saldoFinal)).toBe(135);   // 6.805 reais − 6.670 da demonstração
    expect(diferencaParaADemonstracao({ totalFinal: 6670 }, 6670)).toBe(0);
  });

  it("relatório de UMA conta mostra só ela", async () => {
    const um = await gerarPrestacaoContas(2026, 9, 1, "c2");
    expect(um.posicaoContas.contas.map(c => c.nome)).toEqual(["Aplicações Financeiras"]);
    expect([um.posicaoContas.totalInicial, um.posicaoContas.totalFinal]).toEqual([5040, 5090]);
  });

  it("o CSV acrescenta a posição no fim; o da versão simples não muda", () => {
    const csv = gerarCSVPrestacaoContas(r);
    expect(csv).toContain("Posicao das Contas;Bradesco Conta Corrente;Saldo Inicial;1300.00");
    expect(csv).toContain("Posicao das Contas;Bradesco Conta Corrente;Saldo Final;1500.00");
    expect(csv).toContain("Posicao das Contas;TOTAL GERAL;Saldo Inicial Consolidado;6570.00");
    expect(csv).toContain("Posicao das Contas;TOTAL GERAL;Saldo Final Consolidado;6805.00");
    expect(gerarCSVPrestacaoContas(r, { simples: true })).not.toContain("Posicao das Contas");
  });
});

describe("montarPosicaoDasContas (regra pura)", () => {
  it("arredonda, soma e mantém negativos", () => {
    const m = montarPosicaoDasContas([
      { id: "a", nome: "A", ativo: true, saldoInicial: 10.005, saldoFinal: -3 }, { id: "b", nome: "B", ativo: true, saldoInicial: 0, saldoFinal: 1.1 },
    ]);
    expect(m.totalInicial).toBe(10.01);
    expect(m.totalFinal).toBe(-1.9);
  });
  it("sem contas, o consolidado é zero", () => {
    expect(montarPosicaoDasContas([])).toEqual({ contas: [], totalInicial: 0, totalFinal: 0 });
  });
});
