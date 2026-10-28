import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const registrar = vi.fn(async (_: unknown) => "o1");
vi.mock("@/services/quitacaoService", () => ({
  declaracaoDisponivel: async () => true, ofertaDisponivel: async () => true, projetoNaNotaDisponivel: async () => false, contaNaoAplicavelDisponivel: async () => true,
  registrarNotaQuitadaPorTerceiro: (p: unknown) => registrar(p),
}));
let porCnpj: { id: string; nome: string } | null = null;
const anexar = vi.fn(async (..._a: unknown[]) => ({ id: "a1" }));
vi.mock("@/services/finService", () => ({
  listarCategorias: async () => [], listarCentrosCusto: async () => [], listarContas: async () => [], listarFornecedores: async () => [], listarProjetos: async () => [],
  buscarPessoasParaLancamento: async () => [], buscarFornecedorPorCnpj: async (c: string) => (c ? porCnpj : null), adicionarAnexo: (...a: unknown[]) => anexar(...a),
}));
vi.mock("@/services/centralDocumentosService", () => ({ lerArquivo: async () => ({ texto: "NF-e", fonte: "texto" }) }));
vi.mock("@/lib/documentos/leitura", () => ({
  lerDocumento: () => ({
    tipo: "nfe", emitente: "SOS SOBRADO MALHAS ME", cnpj: "01738300016155", numero: "3763", emissao: "2026-04-17", vencimento: null,
    valores: [{ valor: 143, origem: "valor total", bruto: true }], duplicatas: [], chave: "33260404017383000161550010000037631248066491",
  }),
}));
// o cadastro de fornecedor é outro diálogo (com os próprios testes): aqui só importa o que ele RECEBE e o que DEVOLVE
vi.mock("@/components/financas/FornecedorForm", () => ({
  FornecedorForm: (p: { open: boolean; inicial?: { nome?: string; cnpjCpf?: string }; onSaved: (f: unknown) => void; onOpenChange: (v: boolean) => void }) => p.open ? (
    <div data-cadastro>
      <span data-nome>{p.inicial?.nome}</span><span data-cnpj>{p.inicial?.cnpjCpf}</span>
      <button data-salvar onClick={() => { p.onOpenChange(false); p.onSaved({ id: "f9", nome: "SOS SOBRADO MALHAS ME" }); }}>salvar fornecedor</button>
    </div>) : null,
}));

import { NotaQuitadaDialog } from "./NotaQuitadaDialog";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; porCnpj = null; anexar.mockClear(); registrar.mockClear(); });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<NotaQuitadaDialog aberto onFechar={() => {}} onFeito={() => {}} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}
const texto = () => document.body.textContent ?? "";
const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
const botao = (parte: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent?.includes(parte)) as HTMLButtonElement | undefined;
async function anexarNota() {
  const input = campo("n-arquivo");
  const arq = new File(["%PDF"], "NF 3763.pdf", { type: "application/pdf" });
  Object.defineProperty(input, "files", { value: [arq], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return arq;
}

describe("Registrar NF quitada por terceiro: cadastrar o fornecedor sem sair da tela (28/10/2026)", () => {
  it("há o link 'Cadastrar novo fornecedor' ao lado do campo do emitente", async () => {
    await abrir();
    expect(botao("Cadastrar novo fornecedor")).toBeTruthy();
  });

  it("anexar a NF preenche só o que está VAZIO (nº, data, valor, chave) e mostra o emitente lido, com o CNPJ", async () => {
    await abrir();
    await act(async () => { campo("n-num").focus(); });
    await anexarNota();
    expect(campo("n-num").value).toBe("3763");
    expect(campo("n-data").value).toBe("2026-04-17");
    expect(campo("n-valor").value).toBe("143");
    expect(campo("n-chave").value).toHaveLength(44);
    expect(texto()).toContain("A nota é de SOS SOBRADO MALHAS ME");
    expect(texto()).toContain("CNPJ 01738300016155");
    expect(botao("Cadastrar novo fornecedor com os dados da nota")).toBeTruthy();
  });

  it("o fornecedor da nota JÁ cadastrado (mesmo CNPJ) é escolhido sozinho, sem pedir cadastro", async () => {
    porCnpj = { id: "f1", nome: "SOS SOBRADO MALHAS ME" };
    await abrir();
    await anexarNota();
    expect(texto()).toContain("SOS SOBRADO MALHAS ME");
    expect(botao("Trocar")).toBeTruthy();
    expect(texto()).not.toContain("Não achei esse fornecedor no cadastro");
  });

  it("'Cadastrar com os dados da nota' abre o cadastro JÁ PREENCHIDO (nome e CNPJ da nota)", async () => {
    await abrir();
    await anexarNota();
    await act(async () => { botao("Cadastrar novo fornecedor com os dados da nota")!.click(); });
    expect(document.querySelector("[data-nome]")?.textContent).toBe("SOS SOBRADO MALHAS ME");
    expect(document.querySelector("[data-cnpj]")?.textContent).toBe("01738300016155");
  });

  it("sem NF, o cadastro abre com o que foi digitado na busca", async () => {
    await abrir();
    await act(async () => {
      const i = campo("n-emit"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(i, "Papelaria Nova"); i.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(botao("Cadastrar novo fornecedor “Papelaria Nova”")).toBeTruthy();
    await act(async () => { botao("Cadastrar novo fornecedor")!.click(); });
    expect(document.querySelector("[data-nome]")?.textContent).toBe("Papelaria Nova");
  });

  it("ao salvar o cadastro, a tela VOLTA com o fornecedor já escolhido e o que foi digitado permanece", async () => {
    await abrir();
    await anexarNota();
    await act(async () => { botao("Cadastrar novo fornecedor com os dados da nota")!.click(); });
    await act(async () => { (document.querySelector("[data-salvar]") as HTMLElement).click(); });
    expect(document.querySelector("[data-cadastro]")).toBeNull();
    expect(texto()).toContain("SOS SOBRADO MALHAS ME");
    expect(botao("Trocar")).toBeTruthy();
    expect(campo("n-num").value).toBe("3763");
    expect(campo("n-valor").value).toBe("143");
  });
});
