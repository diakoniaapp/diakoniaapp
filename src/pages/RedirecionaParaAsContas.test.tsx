// Endereços que a Fase D uniu na página da conta continuam valendo.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let contas: { id: string; nome: string; tipo: string }[] = [];
let falha = false;
vi.mock("@/services/finService", () => ({ listarContas: async () => { if (falha) throw new Error("rede"); return contas; } }));

import { RedirecionaParaODiagnostico, RedirecionaParaTodasAsContas } from "./RedirecionaParaAsContas";

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; contas = []; falha = false; });

function Destino() { const l = useLocation(); return <p data-testid="destino">{l.pathname + l.search}</p>; }
async function ir(url: string) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => {
    raiz!.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/financas/auditoria-extrato" element={<RedirecionaParaODiagnostico />} />
          <Route path="/financas/relatorio-contas" element={<RedirecionaParaTodasAsContas />} />
          <Route path="*" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo.querySelector("[data-testid=destino]")?.textContent;
}

describe("Auditoria do extrato → aba Diagnóstico", () => {
  it("abre a Bradesco, como a página antiga preferia", async () => {
    contas = [{ id: "x", nome: "Banco do Brasil", tipo: "banco" }, { id: "b", nome: "Bradesco", tipo: "banco" }, { id: "c", nome: "Caixa", tipo: "caixa" }];
    expect(await ir("/financas/auditoria-extrato")).toBe("/financas/conta/b/diagnostico");
  });
  it("sem Bradesco, a primeira conta de banco — nunca uma conta que não tem diagnóstico", async () => {
    contas = [{ id: "c", nome: "Caixa", tipo: "caixa" }, { id: "x", nome: "Banco do Brasil", tipo: "banco" }];
    expect(await ir("/financas/auditoria-extrato")).toBe("/financas/conta/x/diagnostico");
  });
  it("sem conta de banco, ou se a lista falhar, cai na lista de contas", async () => {
    contas = [{ id: "c", nome: "Caixa", tipo: "caixa" }];
    expect(await ir("/financas/auditoria-extrato")).toBe("/financas");
    act(() => raiz?.unmount()); document.body.innerHTML = ""; falha = true;
    expect(await ir("/financas/auditoria-extrato")).toBe("/financas");
  });
});

describe("Relatório de contas → extrato de Todas as Contas", () => {
  it("leva o período que o link antigo trazia", async () => {
    expect(await ir("/financas/relatorio-contas?contas=a,b&inicio=2026-09-01&fim=2026-09-30")).toBe("/financas/conta/todas?periodo=personalizado&de=2026-09-01&ate=2026-09-30");
  });
  it("sem período, abre Todas as Contas no padrão da tela", async () => {
    expect(await ir("/financas/relatorio-contas")).toBe("/financas/conta/todas");
  });
});
