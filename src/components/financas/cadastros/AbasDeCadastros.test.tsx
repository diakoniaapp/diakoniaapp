// Cadastros do Financeiro (Fase E): uma barra só, ligando as páginas que antes tinham também uma gaveta cada.
import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { TELAS } from "@/lib/navegacao";
import { AbasDeCadastros, CADASTROS } from "./AbasDeCadastros";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const PAGINA_DE: Record<string, string> = {
  favorecidos: "FinancasFornecedores", contas: "FinancasAdmin", centros: "FinancasCentros",
  recorrencias: "FinancasRecorrencias", projetos: "FinancasProjetos", contratados: "FinancasFolha",
};

describe("a barra de Cadastros", () => {
  it("marca só o cadastro atual e liga cada um à sua página", () => {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    act(() => { raiz!.render(<MemoryRouter><AbasDeCadastros ativa="projetos" /></MemoryRouter>); });
    const links = [...alvo.querySelectorAll("a")];
    expect(links.map(a => a.textContent!.trim())).toEqual(["Favorecidos", "Contas e categorias", "Centros de custo", "Recorrências", "Projetos", "Contratados"]);
    expect(links.filter(a => a.getAttribute("aria-current") === "page").map(a => a.textContent!.trim())).toEqual(["Projetos"]);
    expect(alvo.querySelector("nav")!.className).toContain("print:hidden");
  });

  it("todo destino é uma tela que existe no registro de navegação (nada de link para o vazio)", () => {
    const padroes = new Set(TELAS.map(t => t.padrao));
    for (const c of CADASTROS) expect(padroes.has(c.to.split("?")[0]), c.to).toBe(true);
  });

  it("toda página de cadastro desenha a barra com a sua própria chave — e nenhuma gaveta de cadastro sobrou no Painel", () => {
    for (const c of CADASTROS) {
      const fonte = readFileSync(`src/pages/${PAGINA_DE[c.chave]}.tsx`, "utf8");
      expect(fonte, c.chave).toContain(`<AbasDeCadastros ativa="${c.chave}" />`);
    }
    const painel = readFileSync("src/pages/PainelTesouraria.tsx", "utf8");
    for (const d of ["Fornecedores", "Recorrencias", "Estoque", "Projetos", "Contratados", "Orcamento"]) expect(painel, d).not.toContain(`${d}Drawer`);
  });
});
