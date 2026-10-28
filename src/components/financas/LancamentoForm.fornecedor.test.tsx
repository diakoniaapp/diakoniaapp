import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// o banco inteiro vira uma "cadeia" que responde vazio: o que importa aqui é o que a TELA mostra
const cadeia = vi.hoisted(() => { const c: unknown = new Proxy(function () {}, {
  get: (_t, p) => (p === "then" ? (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 }) : p === "auth" ? { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } : c),
  apply: () => c,
}); return c; });
vi.mock("@/integrations/supabase/client", () => ({ supabase: cadeia, supabaseRel: cadeia }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, roles: ["tesouraria"], hasRole: () => true, canEdit: true }), useAuthOpcional: () => null }));
vi.mock("@/components/financas/FornecedorForm", () => ({
  FornecedorForm: (p: { open: boolean; inicial?: { nome?: string } }) => p.open ? <div data-cadastro><span data-nome>{p.inicial?.nome}</span></div> : null,
}));

import { LancamentoForm } from "./LancamentoForm";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (window as unknown as { matchMedia?: unknown }).matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir(tipoPadrao: "entrada" | "saida") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<LancamentoForm open onOpenChange={() => {}} tipoPadrao={tipoPadrao} onSaved={() => {}} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
}
const botao = (parte: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent?.includes(parte)) as HTMLButtonElement | undefined;

describe("Lançar despesa: cadastrar o fornecedor sem sair da tela (28/10/2026)", () => {
  it("em DESPESA (saída) há o link 'Cadastrar novo fornecedor' junto ao Favorecido", async () => {
    await abrir("saida");
    expect(document.body.textContent).toContain("Favorecido/recebedor");
    expect(botao("Cadastrar novo fornecedor")).toBeTruthy();
  });
  it("clicar abre o cadastro por cima", async () => {
    await abrir("saida");
    await act(async () => { botao("Cadastrar novo fornecedor")!.click(); });
    expect(document.querySelector("[data-cadastro]")).toBeTruthy();
  });
  it("em ENTRADA (receita) o link não aparece: não é fornecedor", async () => {
    await abrir("entrada");
    expect(botao("Cadastrar novo fornecedor")).toBeUndefined();
  });
});
