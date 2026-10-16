// O Extrato de Obrigações tem de estar à mão no Workspace Financeiro (Tesouraria): janela "Relatórios" da aba 2 Gestão e os links "Fora do fechamento" da aba 4 Fechamento,
// além do menu lateral e do Ctrl+K. Guarda estática: se alguém tirar um dos atalhos, o teste avisa.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fonte = (p: string) => readFileSync(p, "utf8");
const ROTA = "/financas/extrato-de-obrigacoes";

describe("atalhos do Extrato de Obrigações", () => {
  it("Workspace Financeiro: aba Gestão (janela Relatórios) e aba Fechamento", () => {
    expect(fonte("src/pages/PainelTesouraria.tsx")).toContain(`to: "${ROTA}", label: "Extrato de Obrigações"`);
    expect(fonte("src/components/financas/FechamentoMensal.tsx")).toContain(`to="${ROTA}"`);
  });
  it("menu lateral, navegação (Ctrl+K), favoritos e rota", () => {
    expect(fonte("src/components/layout/navConfig.ts")).toContain(`to: "${ROTA}"`);
    expect(fonte("src/lib/navegacao.ts")).toContain(`T("${ROTA}"`);
    expect(fonte("src/components/financas/FixarFavoritoDialog.tsx")).toContain("telasFixaveis()");   // a lista vem do registro de telas: o Extrato entra sem linha própria
    expect(fonte("src/lib/navegacao.ts")).not.toMatch(/extrato-de-obrigacoes[^\n]*naoFixavel/);
    expect(fonte("src/App.tsx")).toContain(`path="${ROTA}"`);
  });
});
