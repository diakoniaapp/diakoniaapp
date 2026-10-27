// ─── Cadastrar pessoa na leitura do extrato (Mesa de Conciliação) — 27/10/2026 ──────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "aparecem nomes de visitantes que contribuíram no extrato, mas não estão cadastrados". Na linha nova do extrato, o seletor de favorecido ganha "Cadastrar pessoa": abre o cadastro como visitante
// com o nome que o extrato traz e, ao salvar, a pessoa já fica como favorecida da linha. Só aparece a quem pode cadastrar pessoas.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ pode: false }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuthOpcional: () => (auth.pode ? { podeEditarPessoas: true } : undefined) }));
vi.mock("@/services/finService", () => ({ buscarPessoasParaLancamento: vi.fn(async () => []), listarFornecedores: vi.fn(async () => []) }));
vi.mock("@/components/membros/MembroForm", () => ({
  MembroForm: (p: { nomeInicial?: string; tipoInicial?: string; telefoneOpcional?: boolean; onCreated?: (id: string, nome: string) => void; onOpenChange: (v: boolean) => void }) => (
    <div data-membro-form data-nome={p.nomeInicial ?? ""} data-tipo={p.tipoInicial ?? ""} data-tel-opcional={String(!!p.telefoneOpcional)}>
      <button type="button" data-criar onClick={() => { p.onCreated?.("p-novo", "Maria Visitante"); p.onOpenChange(false); }}>criar</button>
    </div>
  ),
}));

import { EscolhaDeFavorecido } from "./EscolhaDeFavorecido";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; auth.pode = false; });

const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const esperar = (ms = 30) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function abrir(onChange = vi.fn(), nomeDoExtrato: string | null = "maria visitante") {
  const div = document.createElement("div"); document.body.appendChild(div);
  raiz = createRoot(div);
  await act(async () => { raiz!.render(<EscolhaDeFavorecido atual={null} onChange={onChange} nomeDoExtrato={nomeDoExtrato} />); });
  await act(async () => { (div.querySelector("button") as HTMLElement).click(); });   // abre o seletor
  await esperar();
  return onChange;
}

describe("EscolhaDeFavorecido — cadastrar pessoa", () => {
  it("sem permissão para cadastrar pessoas, o botão não aparece", async () => {
    await abrir();
    expect(q('[data-acao="cadastrar-pessoa"]')).toBeNull();
  });
  it("com permissão: 'Cadastrar pessoa' leva o nome do extrato (em caixa de título) ao cadastro de visitante", async () => {
    auth.pode = true;
    await abrir();
    const botao = q('[data-acao="cadastrar-pessoa"]')!;
    expect(botao.textContent).toContain("Cadastrar pessoa");
    expect(botao.textContent).toContain("Maria Visitante");
    await act(async () => { botao.click(); });
    await esperar();
    const form = q("[data-membro-form]")!;
    expect(form.getAttribute("data-nome")).toBe("Maria Visitante");
    expect(form.getAttribute("data-tipo")).toBe("visitante");
    expect(form.getAttribute("data-tel-opcional")).toBe("true");   // o telefone não é obrigatório aqui (decisão dela, 27/10/2026)
  });
  it("ao salvar, a pessoa nova vira o favorecido da linha", async () => {
    auth.pode = true;
    const onChange = await abrir();
    await act(async () => { q('[data-acao="cadastrar-pessoa"]')!.click(); });
    await esperar();
    await act(async () => { q("[data-criar]")!.click(); });
    expect(onChange).toHaveBeenCalledWith({ tipo: "pessoa", id: "p-novo", nome: "Maria Visitante" });
  });
  it("sem nome no extrato, o botão abre o cadastro em branco", async () => {
    auth.pode = true;
    await abrir(vi.fn(), null);
    const botao = q('[data-acao="cadastrar-pessoa"]')!;
    expect(botao.textContent?.trim()).toBe("Cadastrar pessoa");
    await act(async () => { botao.click(); });
    await esperar();
    expect(q("[data-membro-form]")!.getAttribute("data-nome")).toBe("");
  });
});
