// Fase F — menus: o grupo Financeiro mostra as telas de uso (e Contas, que só se alcançava pela aba Cadastros); os módulos sem uso saem do menu e ficam por Ctrl+K e pelo endereço.
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/layout/navConfig";

const financeiro = NAV_GROUPS.find(g => g.key === "financeiro")!.items;
const rotas = financeiro.map(i => i.to);

describe("menu do Financeiro", () => {
  it("Contas é item do menu e só acende em /financas (as páginas das contas têm a própria trilha)", () => {
    const contas = financeiro.find(i => i.to === "/financas");
    expect(contas?.label).toBe("Contas");
    expect(contas?.end).toBe(true);
  });

  it("estoque, orçamento, reuniões e insights não aparecem no menu (0 registros / virou seção do painel)", () => {
    for (const r of ["/financas/estoque", "/financas/orcamento", "/financas/reunioes", "/financas/insights"]) expect(rotas, r).not.toContain(r);
  });

  it("as telas de uso diário continuam", () => {
    for (const r of ["/painel-tesouraria", "/financas/dre", "/financas/prestacao-de-contas", "/financas/extrato-de-obrigacoes", "/financas/executivo"]) expect(rotas, r).toContain(r);
  });

  it("nenhum destino se repete (o menu usa o destino como chave)", () => {
    expect(new Set(rotas).size).toBe(rotas.length);
  });
});
