// Links e favoritos antigos do Malote Contábil caem no Fechamento do mês certo.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { RedirecionaParaOFechamento } from "./RedirecionaParaOFechamento";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

function Destino() { const l = useLocation(); return <p data-testid="destino">{l.pathname + l.search + l.hash}</p>; }
async function ir(url: string) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => {
    raiz!.render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/financas/relatorio" element={<RedirecionaParaOFechamento />} />
          <Route path="/financas/relatorio/:ano/:mes" element={<RedirecionaParaOFechamento />} />
          <Route path="/painel-tesouraria" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return alvo.querySelector("[data-testid=destino]")!.textContent;
}

describe("Malote Contábil → Fechamento do mês", () => {
  it("com o mês na rota, abre o Fechamento daquele mês", async () => {
    expect(await ir("/financas/relatorio/2026/9")).toBe("/painel-tesouraria?mes=2026-09#fechamento");
    expect(await ir("/financas/relatorio/2026/10")).toBe("/painel-tesouraria?mes=2026-10#fechamento");
  });
  it("sem mês, ou com mês inválido, abre o Fechamento do mês em fechamento de sempre", async () => {
    expect(await ir("/financas/relatorio")).toBe("/painel-tesouraria#fechamento");
    expect(await ir("/financas/relatorio/2026/13")).toBe("/painel-tesouraria#fechamento");
  });
});
