import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/services/finService", () => ({
  brl: (n: number) => String(n), buscarPessoasParaLancamento: async () => [], listarFornecedores: async () => [], buscarFornecedor: async () => null, FIN_ANEXO_TIPO_LABEL: {},
}));
vi.mock("@/services/recorrenciaService", () => ({ habitosDoFavorecido: async () => null }));
vi.mock("@/components/financas/FornecedorForm", () => ({
  FornecedorForm: (p: { open: boolean; inicial?: { nome?: string }; onSaved: (f: unknown) => void; onOpenChange: (v: boolean) => void }) => p.open ? (
    <div data-cadastro><span data-nome>{p.inicial?.nome}</span>
      <button data-salvar onClick={() => { p.onOpenChange(false); p.onSaved({ id: "f9", nome: "Papelaria Nova", pessoa_id: null }); }}>salvar</button></div>) : null,
}));

import { SeletorFavorecido, type Favorecido } from "./SeletorFavorecido";

let raiz: Root | null = null;
beforeAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function montar(permite: boolean, onChange: (f: Favorecido | null) => void = () => {}) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<SeletorFavorecido value={null} onChange={onChange} categorias={[]} centros={[]} permiteCadastrarFornecedor={permite} />); });
}
const botao = (parte: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent?.includes(parte)) as HTMLButtonElement | undefined;
async function digitar(txt: string) {
  const i = document.body.querySelector("input")!; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { set.call(i, txt); i.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
}

describe("Despesa recorrente: cadastrar o fornecedor sem sair da tela (28/10/2026)", () => {
  it("em despesa há o link, e sem resultado a mensagem não manda mais 'cadastre antes e volte aqui'", async () => {
    await montar(true);
    expect(botao("Cadastrar novo fornecedor")).toBeTruthy();
    await digitar("Papelaria Nova");
    expect(document.body.textContent).toContain("Não achei no cadastro.");
    expect(document.body.textContent).not.toContain("antes e volte aqui");
    expect(botao("Cadastrar novo fornecedor “Papelaria Nova”")).toBeTruthy();
  });
  it("em entrada (contribuinte) NÃO há o link: o favorecido ali não é fornecedor", async () => {
    await montar(false);
    expect(botao("Cadastrar novo fornecedor")).toBeUndefined();
  });
  it("o cadastro abre com o que foi digitado e, ao salvar, o fornecedor volta ESCOLHIDO", async () => {
    const escolhidos: (Favorecido | null)[] = [];
    await montar(true, f => escolhidos.push(f));
    await digitar("Papelaria Nova");
    await act(async () => { botao("Cadastrar novo fornecedor")!.click(); });
    expect(document.querySelector("[data-nome]")?.textContent).toBe("Papelaria Nova");
    await act(async () => { (document.querySelector("[data-salvar]") as HTMLElement).click(); });
    expect(escolhidos.find(f => f?.id === "f9")).toMatchObject({ tipo: "fornecedor", id: "f9", nome: "Papelaria Nova" });
  });
});
