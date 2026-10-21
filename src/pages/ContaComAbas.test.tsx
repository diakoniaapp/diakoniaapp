// A casca das abas da conta: abre a aba pedida; aba que a conta não tem, ou que não existe, volta para o extrato.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bradesco = { id: "b", nome: "Bradesco", tipo: "banco", saldo_atual: 100, cor: null };
const visa = { id: "v", nome: "Visa", tipo: "cartao", saldo_atual: -50, cor: null };
const todas = [bradesco, visa];

vi.mock("@/services/finService", () => ({
  carregarConta: async (id: string) => todas.find(c => c.id === id) ?? null,
  listarContas: async () => todas,
  brl: (n: number) => String(n),
  CONTA_TIPO_LABEL: { banco: "Banco", cartao: "Cartão" },
}));
vi.mock("@/hooks/useNavegacao", () => ({ useRotuloDaTela: () => {} }));
vi.mock("@/components/financas/contas/ConciliacaoDaConta", () => ({ ConciliacaoDaConta: ({ contaNome }: { contaNome: string }) => <p data-teste="conciliacao">conciliando {contaNome}</p> }));
vi.mock("@/components/financas/contas/DiagnosticoDoExtrato", () => ({ DiagnosticoDoExtrato: ({ contaNome }: { contaNome: string }) => <p data-teste="diagnostico">diagnóstico {contaNome}</p> }));
vi.mock("@/components/financas/contas/ImportacoesDaConta", () => ({ ImportacoesDaConta: ({ tipo }: { tipo: string }) => <p data-teste="importacoes">importando {tipo}</p> }));
vi.mock("@/components/financas/contas/BotaoDeImportar", () => ({ BotaoDeImportar: ({ tipo }: { tipo: string }) => <button data-botao-importar={tipo}>importar</button> }));
vi.mock("@/components/ListState", () => ({ PaginaSkeleton: () => <p data-teste="carregando" /> }));

import ContaComAbas from "./ContaComAbas";

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

function Extrato() { const l = useLocation(); return <p data-teste="extrato">{l.pathname}</p>; }
async function ir(url: string) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => {
    raiz!.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/financas/conta/:contaId" element={<Extrato />} />
          <Route path="/financas/conta/:contaId/:aba" element={<ContaComAbas />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo;
}
const qual = (el: HTMLElement) => el.querySelector("[data-teste]")?.getAttribute("data-teste");
const reiniciar = () => { act(() => raiz?.unmount()); document.body.innerHTML = ""; };

describe("ContaComAbas", () => {
  it("abre a aba pedida, com a conta no cabeçalho e as abas da conta", async () => {
    const el = await ir("/financas/conta/b/conciliacao");
    expect(el.querySelector("[data-teste=conciliacao]")!.textContent).toBe("conciliando Bradesco");
    expect([...el.querySelectorAll("nav a")].map(a => a.textContent!.trim())).toEqual(["Extrato", "Conciliação", "Diagnóstico"]);   // banco: sem a aba Importações (21/10/2026)
    expect(el.querySelector("[aria-current=page]")!.textContent!.trim()).toBe("Conciliação");
  });
  it("cada aba mostra o seu conteúdo", async () => {
    expect(qual(await ir("/financas/conta/b/diagnostico"))).toBe("diagnostico");
    reiniciar();
    expect(qual(await ir("/financas/conta/v/importacoes"))).toBe("importacoes");
  });
  it("o botão de importar é UM só, no cabeçalho, em qualquer aba: OFX no banco, fatura no cartão", async () => {
    for (const [url, tipo] of [["/financas/conta/b/conciliacao", "banco"], ["/financas/conta/b/diagnostico", "banco"], ["/financas/conta/v/importacoes", "cartao"]] as const) {
      const el = await ir(url);
      expect(el.querySelectorAll("[data-botao-importar]"), url).toHaveLength(1);
      expect(el.querySelector("[data-botao-importar]")!.getAttribute("data-botao-importar")).toBe(tipo);
      reiniciar();
    }
  });
  it("conta de banco não tem a aba Importações: o endereço antigo volta para o extrato", async () => {
    expect((await ir("/financas/conta/b/importacoes")).querySelector("[data-teste=extrato]")!.textContent).toBe("/financas/conta/b");
  });
  it("aba que a conta não tem (diagnóstico de cartão) volta para o extrato", async () => {
    expect((await ir("/financas/conta/v/diagnostico")).querySelector("[data-teste=extrato]")!.textContent).toBe("/financas/conta/v");
  });
  it("aba inexistente, extrato escrito à mão ou conta inexistente também voltam para o extrato", async () => {
    expect((await ir("/financas/conta/b/qualquer")).querySelector("[data-teste=extrato]")!.textContent).toBe("/financas/conta/b");
    reiniciar();
    expect((await ir("/financas/conta/b/extrato")).querySelector("[data-teste=extrato]")!.textContent).toBe("/financas/conta/b");
    reiniciar();
    expect((await ir("/financas/conta/nao-existe/conciliacao")).querySelector("[data-teste=extrato]")!.textContent).toBe("/financas/conta/nao-existe");
  });
});
