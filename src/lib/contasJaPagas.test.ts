import { describe, expect, it } from "vitest";
import { sugerirLiquidacoes, type ObrigacaoAberta, type PagamentoRegistrado } from "./contasJaPagas";

const CONTA = "bradesco";
const o = (id: string, nome: string, valor: number, data: string, extra: Partial<ObrigacaoAberta> = {}): ObrigacaoAberta =>
  ({ id, nome, valor, data, fornecedor_id: `f-${nome}`, pessoa_id: null, valor_variavel: false, conta_id: CONTA, ...extra });
const p = (id: string, nome: string, valor: number, data: string, extra: Partial<PagamentoRegistrado> = {}): PagamentoRegistrado =>
  ({ id, nome, valor, data, descricao: `PIX ENVIADO DES: ${nome.toUpperCase()}`, fornecedor_id: `f-${nome}`, pessoa_id: null, origem: "importado_ofx", conta_id: CONTA, ...extra });

describe("contas abertas que já têm pagamento — os 4 casos reais de 05/10/2026", () => {
  // as obrigações de 05/10 foram geradas em 08/10, depois dos PIX de 02/10
  const obrigacoes = [
    o("ana", "Ana Patricia", 380, "2026-10-05", { valor_variavel: true }),
    o("carlos", "Carlos Eduardo", 380, "2026-10-05", { valor_variavel: true }),
    o("denise", "Denise Teixeira", 1438, "2026-10-05", { valor_variavel: true }),
    o("verisure", "Verisure Brasil", 278.22, "2026-10-05"),
    o("anaNov", "Ana Patricia", 380, "2026-11-05", { valor_variavel: true }),
  ];
  const pagamentos = [
    p("pAna", "Ana Patricia", 760, "2026-10-02"), p("pAnaSet", "Ana Patricia", 760, "2026-09-01"),
    p("pCarlos", "Carlos Eduardo", 1630, "2026-10-02"), p("pDenise", "Denise Teixeira", 1358, "2026-10-02"),
  ];
  const r = sugerirLiquidacoes(obrigacoes, pagamentos);
  const por = (id: string) => r.find(s => s.obrigacao.id === id);

  it("Denise: o valor real (R$ 1.358) substitui a estimativa e é segura", () => {
    expect(por("denise")).toMatchObject({ adotarValor: true, nivel: "segura", diferenca: -80 });
    expect(por("denise")!.pagamento.id).toBe("pDenise");
  });
  it("Ana: pagou o dobro do estimado — achada, mas pede conferência (e não adota o valor sozinha)", () => {
    expect(por("ana")).toMatchObject({ nivel: "conferir", adotarValor: false, diferenca: 380 });
    expect(por("ana")!.pagamento.id).toBe("pAna");
    expect(por("ana")!.motivos.join(" ")).toMatch(/2×|2,0×|dobro|estimado/);
  });
  it("Carlos: o PIX de 1.630 cobre mais do que a obrigação — achado, com a diferença para explicar", () => {
    expect(por("carlos")).toMatchObject({ nivel: "conferir", adotarValor: false, diferenca: 1250 });
  });
  it("Verisure não tem pagamento registrado: não aparece (é caso do OFX, não desta lista)", () => {
    expect(por("verisure")).toBeUndefined();
  });
  it("o pagamento de setembro NÃO é da obrigação de novembro, e a de novembro não é achada em outubro", () => {
    expect(por("anaNov")).toBeUndefined();
    expect(r.some(s => s.pagamento.id === "pAnaSet")).toBe(false);
  });
});

describe("regras de valor e de favorecido", () => {
  it("valor exato do mesmo favorecido é seguro, mesmo sem ser estimativa", () => {
    const r = sugerirLiquidacoes([o("a", "Verisure", 278.22, "2026-10-05")], [p("x", "Verisure", 278.22, "2026-10-05")]);
    expect(r[0]).toMatchObject({ nivel: "segura", adotarValor: false, diferenca: 0 });
  });
  it("valor FIXO com diferença pequena: achado, mas pede o motivo (juros, multa, desconto) — não adota", () => {
    const r = sugerirLiquidacoes([o("a", "Prefeitura", 312.7, "2026-09-06")], [p("x", "Prefeitura", 325.2, "2026-09-30")]);
    expect(r[0]).toMatchObject({ nivel: "conferir", adotarValor: false });
    expect(r[0].motivos.join(" ")).toMatch(/juros, multa ou desconto/);
  });
  it("valor FIXO muito diferente não é sugerido", () => {
    expect(sugerirLiquidacoes([o("a", "Prefeitura", 312.7, "2026-09-06")], [p("x", "Prefeitura", 1000, "2026-09-06")])).toEqual([]);
  });
  it("outro favorecido, outra conta ou fora da janela de datas: nada", () => {
    expect(sugerirLiquidacoes([o("a", "Verisure", 100, "2026-10-05")], [p("x", "Outro Nome", 100, "2026-10-05")])).toEqual([]);
    expect(sugerirLiquidacoes([o("a", "Verisure", 100, "2026-10-05")], [p("x", "Verisure", 100, "2026-10-05", { conta_id: "outra" })])).toEqual([]);
    expect(sugerirLiquidacoes([o("a", "Verisure", 100, "2026-10-05")], [p("x", "Verisure", 100, "2026-08-01")])).toEqual([]);
  });
  it("sem id de favorecido, o NOME parecido no extrato basta para sugerir — nunca como segura", () => {
    const r = sugerirLiquidacoes(
      [o("a", "Verisure Brasil Monitoramento de Alarmes", 278.22, "2026-10-05", { fornecedor_id: null })],
      [p("x", "", 278.22, "2026-10-05", { fornecedor_id: null, descricao: "PAGTO ELETRON COBRANCA VERISURE BRASIL MONIT" })]);
    expect(r).toHaveLength(1);
    expect(r[0].nivel).toBe("conferir");
  });
  it("um pagamento serve a UMA obrigação só (a de vencimento mais próximo), e a outra continua aberta", () => {
    const r = sugerirLiquidacoes([o("a", "Ana", 380, "2026-10-05", { valor_variavel: true }), o("b", "Ana", 380, "2026-10-12", { valor_variavel: true })], [p("x", "Ana", 380, "2026-10-04")]);
    expect(r).toHaveLength(1);
    expect(r[0].obrigacao.id).toBe("a");
    expect(r[0].ambigua).toBe(true);
    expect(r[0].nivel).toBe("conferir");
  });
});
