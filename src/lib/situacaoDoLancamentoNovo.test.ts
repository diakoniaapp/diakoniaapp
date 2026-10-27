// Em que situação um lançamento NOVO nasce (auditoria da Tesouraria, 27/10/2026, F-07).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { ofereceConciliado, situacaoInicial } from "./situacaoDoLancamentoNovo";

describe("situacaoInicial", () => {
  it("despesa digitada à mão nasce PREVISTA (o modelo dela)", () => expect(situacaoInicial("saida", false)).toBe("previsto"));
  it("despesa que vem de uma linha do extrato nasce REALIZADA: o movimento já aconteceu", () => expect(situacaoInicial("saida", true)).toBe("realizado"));
  it("entrada nasce REALIZADA (a oferta do dia já entrou), venha de onde vier", () => {
    expect(situacaoInicial("entrada", false)).toBe("realizado");
    expect(situacaoInicial("entrada", true)).toBe("realizado");
  });
});

describe("ofereceConciliado", () => {
  it("na criação à mão não se escolhe 'Conciliado': quem concilia é o vínculo com o extrato", () => expect(ofereceConciliado(false, false)).toBe(false));
  it("na edição e no lançamento que nasce do extrato, sim", () => {
    expect(ofereceConciliado(true, false)).toBe(true);
    expect(ofereceConciliado(false, true)).toBe(true);
  });
});

describe("o formulário usa a regra", () => {
  const f = fs.readFileSync("src/components/financas/LancamentoForm.tsx", "utf8");
  it("abre o lançamento novo pela regra, e não mais com 'realizado' fixo", () => {
    expect(f).toContain("setStatus(situacaoInicial(tipoPadrao, !!rascunho))");
    expect(f).not.toMatch(/setForma\(rascunho\?\.forma \?\? ""\); setStatus\("realizado"\)/);
  });
  it("trocar Entrada/Saída acompanha o padrão até a pessoa escolher a situação", () => {
    expect(f).toContain("situacaoTocada");
    expect(f).toContain("setStatus(situacaoInicial(tipo, !!rascunho))");
  });
  it("o seletor de situação respeita a regra do 'Conciliado'", () => expect(f).toContain("ofereceConciliado(isEdit, !!rascunho)"));
});
