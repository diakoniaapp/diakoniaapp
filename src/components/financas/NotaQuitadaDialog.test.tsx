import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let neutra = true;
vi.mock("@/services/quitacaoService", () => ({
  declaracaoDisponivel: async () => true,
  ofertaDisponivel: async () => true,
  projetoNaNotaDisponivel: async () => false,
  contaNaoAplicavelDisponivel: async () => neutra,
  registrarNotaQuitadaPorTerceiro: vi.fn(async () => "o1"),
}));
vi.mock("@/services/finService", () => ({
  listarCategorias: async () => [{ id: "c1", nome: "Material" }],
  listarCentrosCusto: async () => [{ id: "k1", nome: "Administração" }],
  listarContas: async () => [{ id: "a1", nome: "Banco principal" }],
  listarFornecedores: async () => [],
  listarProjetos: async () => [],
  buscarPessoasParaLancamento: async () => [],
}));

import { NotaQuitadaDialog } from "./NotaQuitadaDialog";

let raiz: Root | null = null;
beforeAll(() => {
  // o Radix mede elementos; o jsdom não tem
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; neutra = true; });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<NotaQuitadaDialog aberto onFechar={() => {}} onFeito={() => {}} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}
const texto = () => document.body.textContent ?? "";
const pos = (s: string) => { const i = texto().indexOf(s); expect(i, `"${s}" não está na tela`).toBeGreaterThanOrEqual(0); return i; };
async function escolher(rotulo: string) {
  const el = [...document.body.querySelectorAll("label")].find(l => l.textContent?.includes(rotulo));
  expect(el, `opção "${rotulo}" não achada`).toBeTruthy();
  await act(async () => { (el!.querySelector("button, input") as HTMLElement).click(); });
}

describe("Registrar NF já quitada por terceiro: o fluxo é guiado por quem pagou e pela intenção", () => {
  it("a ordem é: a nota → a igreja é a compradora → quem pagou → o que quer → classificação (categoria, centro, projeto)", async () => {
    await abrir();
    const ordem = ["A nota fiscal", "A igreja é a compradora?", "Quem pagou o fornecedor?", "O que essa pessoa quer?", "Classificação da despesa", "Categoria (opcional)", "Centro de custo (opcional)"];
    const posicoes = ordem.map(pos);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it("categoria, centro e conta NÃO aparecem antes de quem pagou e da intenção", async () => {
    await abrir();
    expect(pos("Categoria (opcional)")).toBeGreaterThan(pos("O que essa pessoa quer?"));
    expect(pos("Conta da obrigação")).toBeGreaterThan(pos("O que essa pessoa quer?"));
  });

  it("OFERTA: a conta financeira some, e nada de conta aparece na tela", async () => {
    await abrir();
    expect(texto()).toContain("Conta da obrigação");          // antes de escolher a intenção (ainda sem declarar), a conta existe
    await escolher("Oferta");
    expect(texto()).not.toContain("Conta da obrigação");
    expect(texto()).not.toMatch(/Bradesco|Caixinha|Caixa de Envelopes|Cartão de Crédito|Aplicação/);
    expect(texto()).toContain("Como a obrigação será tratada: oferta");
    expect(texto()).toContain("Categoria (opcional)");          // a classificação continua, sem conta
  });

  it("REEMBOLSO: mostra a aprovação e a documentação, e a conta volta (só onde a nota fica registrada)", async () => {
    await abrir();
    await escolher("Reembolso");
    expect(texto()).toContain("Como a obrigação será tratada: reembolso");
    expect(texto()).toContain("Aprovação:");
    expect(texto()).toContain("Documentos:");
    expect(texto()).toContain("Conta da obrigação");
  });

  it("sem a conta neutra no banco, a oferta ainda pede conta (como antes)", async () => {
    neutra = false;
    await abrir();
    await escolher("Oferta");
    expect(texto()).toContain("Conta da obrigação");
  });
});
