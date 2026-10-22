import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const rec = (id: string, descricao: string, extra: Record<string, unknown> = {}) => ({
  id, descricao, tipo: "saida", valor: 100, ativo: true, frequencia: "mensal", dia_do_mes: 1, valor_variavel: false, forma_liquidacao: "manual", ...extra,
});
const lista = [
  rec("1", "Águas do Rio 4 Spe S.A", { fornecedor_nome: "Aguas do Rio 4 Spe S.A", forma_liquidacao: "debito_automatico" }),
  rec("2", "Rio de Janeiro Registro Civil das Pessoas Jurídicas"),
  rec("3", "Prefeitura da Cidade do Rio de Janeiro", { pessoa_nome: "Maria Souza" }),
];

vi.mock("@/services/finService", () => ({
  listarRecorrencias: async () => lista,
  atualizarRecorrencia: async () => ({}), excluirRecorrencia: async () => ({}),
  FREQUENCIA_LABEL: { mensal: "Mensal" }, brl: (n: number) => `R$ ${n}`,
}));
vi.mock("@/services/recorrenciaService", () => ({ avisoDeJaPagas: async () => null, gerarTodasAsRecorrencias: async () => ({}) }));
vi.mock("@/components/financas/RecorrenciaForm", () => ({ RecorrenciaForm: () => null }));
vi.mock("@/components/financas/ResumoDaRecorrencia", () => ({ ResumoDaRecorrencia: () => null }));
vi.mock("@/components/financas/cadastros/AbasDeCadastros", () => ({ AbasDeCadastros: () => null }));

import FinancasRecorrencias from "./FinancasRecorrencias";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir(url = "/financas/recorrencias") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><FinancasRecorrencias /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return alvo;
}
function digitar(el: HTMLInputElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const nomes = (alvo: HTMLElement) => [...alvo.querySelectorAll("div.font-medium.text-sm")].map(e => e.textContent ?? "");

describe("Recorrências — busca pelo nome", () => {
  it("tem o campo de busca e lista tudo quando está vazio", async () => {
    const alvo = await abrir();
    expect(alvo.querySelector('input[aria-label="Buscar recorrência pelo nome"]')).not.toBeNull();
    expect(nomes(alvo)).toHaveLength(3);
  });
  it("filtra pelo nome, sem acento nem maiúscula ('aguas' acha 'Águas')", async () => {
    const alvo = await abrir();
    digitar(alvo.querySelector("input")!, "AGUAS");
    expect(nomes(alvo)).toHaveLength(1);
    expect(nomes(alvo)[0]).toContain("Águas do Rio 4");
  });
  it("filtra também pelo favorecido (pessoa)", async () => {
    const alvo = await abrir();
    digitar(alvo.querySelector("input")!, "maria");
    expect(nomes(alvo)).toHaveLength(1);
    expect(nomes(alvo)[0]).toContain("Prefeitura");
  });
  it("sem resultado diz isso e oferece limpar; limpar volta a lista inteira", async () => {
    const alvo = await abrir();
    digitar(alvo.querySelector("input")!, "zzz");
    expect(alvo.textContent).toContain("Nenhuma recorrência com");
    act(() => { (alvo.querySelector('button[aria-label="Limpar a busca"]') as HTMLButtonElement).click(); });
    expect(nomes(alvo)).toHaveLength(3);
  });
  it("a busca vem da URL (?q=): voltar de uma recorrência devolve a lista filtrada", async () => {
    const alvo = await abrir("/financas/recorrencias?q=registro");
    expect(nomes(alvo)).toHaveLength(1);
    expect((alvo.querySelector("input") as HTMLInputElement).value).toBe("registro");
  });
});
