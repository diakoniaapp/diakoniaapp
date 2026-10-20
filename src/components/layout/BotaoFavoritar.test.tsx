// ★ Favoritar: abrir a tela, clicar, ver fixado; clicar de novo, remover. Pela barra de contexto, em toda tela do Financeiro fixável.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let favoritos: { id: string; rotulo: string; rota: string; tipo: string }[] = [];
let falhaNaLista = false;
const fixar = vi.fn(async (i: { tipo: string; rotulo: string; rota: string }) => { const f = { id: `f${favoritos.length + 1}`, ...i }; favoritos.push(f); return f; });
const desfixar = vi.fn(async (id: string) => { favoritos = favoritos.filter(f => f.id !== id); });
vi.mock("@/services/favoritosService", () => ({
  listarFavoritos: async () => { if (falhaNaLista) throw new Error("sem tabela"); return [...favoritos]; },
  fixarFavorito: (i: { tipo: string; rotulo: string; rota: string }) => fixar(i), desfixarFavorito: (id: string) => desfixar(id),
}));
vi.mock("@/hooks/useNavegacao", () => ({ useNavegacao: () => ({ anterior: null, rotulo: null, voltar: () => {}, voltarPersonalizado: null }) }));

import { BarraDeContexto } from "./BarraDeContexto";

let raiz: Root | null = null;
beforeEach(() => { favoritos = []; falhaNaLista = false; fixar.mockClear(); desfixar.mockClear(); });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir(caminho: string) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[caminho]}><BarraDeContexto /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return alvo;
}
const estrela = (el: HTMLElement) => [...el.querySelectorAll("button")].find(b => /Favorit/.test(b.textContent ?? "")) as HTMLButtonElement | undefined;

describe("★ Favoritar na barra de contexto", () => {
  it("aparece nas telas do Financeiro (inclusive as novas) e fixa com um clique, sem diálogo", async () => {
    const el = await abrir("/financas/extrato-de-obrigacoes");
    expect(estrela(el)!.textContent).toContain("Favoritar");
    await act(async () => { estrela(el)!.click(); });
    expect(fixar).toHaveBeenCalledWith({ tipo: "relatorio", rotulo: "Extrato de Obrigações", rota: "/financas/extrato-de-obrigacoes" });
    expect(estrela(el)!.textContent).toContain("Favorito");
    expect(estrela(el)!.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicar de novo tira dos favoritos", async () => {
    favoritos = [{ id: "f1", rotulo: "Extrato de Obrigações", rota: "/financas/extrato-de-obrigacoes", tipo: "relatorio" }];
    const el = await abrir("/financas/extrato-de-obrigacoes");
    expect(estrela(el)!.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { estrela(el)!.click(); });
    expect(desfixar).toHaveBeenCalledWith("f1");
    expect(estrela(el)!.textContent).toContain("Favoritar");
    expect(favoritos).toHaveLength(0);
  });

  it("outras telas do Financeiro também (Prestação de Contas, DRE, Extrato de Obrigações)", async () => {
    for (const c of ["/financas/prestacao-de-contas", "/financas/dre", "/financas/extrato-de-obrigacoes"]) {
      const el = await abrir(c);
      expect(estrela(el), c).toBeTruthy();
      act(() => raiz?.unmount()); document.body.innerHTML = "";
    }
  });

  it("não aparece fora do Financeiro, na própria Mesa, nem na tela com motivo técnico (relatório de contas)", async () => {
    for (const c of ["/membros", "/painel-tesouraria", "/financas/relatorio-contas?contas=a"]) {
      const el = await abrir(c);
      expect(estrela(el), c).toBeUndefined();
      act(() => raiz?.unmount()); document.body.innerHTML = "";
    }
  });

  it("sem a tabela de favoritos (erro ao listar) o botão some e a tela segue normal", async () => {
    falhaNaLista = true;
    const el = await abrir("/financas/extrato-de-obrigacoes");
    expect(estrela(el)).toBeUndefined();
    expect(el.textContent).toContain("Extrato de Obrigações");
  });
});
