import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const chamadas: { id: string; patch: Record<string, unknown>; motivo?: string }[] = [];
let doCentro: unknown[] = [];

vi.mock("@/services/finService", () => ({
  brl: (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
  nomeExtrato: (l: { descricao?: string }) => ({ principal: l.descricao ?? "—", secundario: null }),
  listarLancamentosSemTeto: async () => doCentro,
  atualizarLancamento: async (id: string, patch: Record<string, unknown>, motivo?: string) => { chamadas.push({ id, patch, motivo }); },
}));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: () => null }));
vi.mock("@/components/AssinaturaDoSistema", () => ({ AssinaturaDoSistema: () => null }));
vi.mock("@/assets/logo-diakonia.png", () => ({ default: "logo.png" }));

import { ExtratoDoProjeto } from "./ExtratoDoProjeto";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; chamadas.length = 0; doCentro = []; });

const projeto = { id: "p1", nome: "Retiro Juventude 2026", reserva_financeira: true } as never;
const base = { centro_custo_id: "c1", centro_nome: "Juventude", categoria_nome: "Ofertas", conta_nome: "Bradesco", origem: "manual", data_pagamento: null };
const lanc = (p: object) => ({ id: "x", data: "2026-05-10", tipo: "entrada", status: "realizado", valor: 100, projeto_id: "p1", descricao: "Almoço", ...base, ...p });

async function abrir(lancamentos: unknown[], onMudou = vi.fn()) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => {
    raiz!.render(<ExtratoDoProjeto projeto={projeto} lancamentos={lancamentos as never} emitidoPor="Telma" abas={<span data-abas />} onEditarProjeto={() => {}} onMudou={onMudou} />);
  });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return { el: alvo, onMudou };
}

describe("Extrato do projeto", () => {
  it("lista receitas e despesas por data, com o saldo do projeto linha a linha e os totais", async () => {
    const { el } = await abrir([
      lanc({ id: "a", valor: 1000, descricao: "Almoço 1", data: "2026-05-10" }),
      lanc({ id: "b", tipo: "saida", valor: 300, descricao: "Ônibus", data: "2026-06-01" }),
    ]);
    const linhas = [...el.querySelectorAll("[data-linha]")];
    expect(linhas.map(r => r.getAttribute("data-linha"))).toEqual(["a", "b"]);
    expect(linhas[0].textContent).toContain("Almoço 1");
    expect(linhas[1].textContent).toContain("R$ 700,00");          // saldo depois do ônibus
    expect(el.querySelector("tfoot")!.textContent).toContain("R$ 1.000,00");
    expect(el.querySelector("[aria-label='Resumo do extrato']")!.textContent).toContain("Reservado");
  });

  it("projeto sem reserva não mostra 'Reservado'; gasto além da reserva avisa", async () => {
    const { el } = await abrir([lanc({ id: "a", valor: 100 }), lanc({ id: "b", tipo: "saida", valor: 160 })]);
    expect(el.textContent).toContain("Gasto além da reserva");
    expect(el.textContent).toContain("R$ 60,00");
  });

  it("Imprimir / PDF existe, e os controles e a lista 'sem projeto' ficam fora do papel (no-print)", async () => {
    const { el } = await abrir([lanc({ id: "a" })]);
    expect([...el.querySelectorAll("button")].some(b => /Imprimir \/ PDF/.test(b.textContent ?? ""))).toBe(true);
    expect(el.querySelector(".relatorio-page")!.textContent).toContain("Extrato do Projeto");
    expect(el.querySelector("section[aria-label='Do mesmo centro, sem projeto']")!.className).toContain("no-print");
    expect(el.querySelector(".relatorio-page [aria-label='Do mesmo centro, sem projeto']")).toBeNull();
  });

  it("o PDF sai em A4 RETRATO: Centro e Conta saem das colunas no papel e vão para a linha de baixo da descrição", async () => {
    const { el } = await abrir([lanc({ id: "a", centro_nome: "Juventude", conta_nome: "Bradesco" })]);
    const css = el.querySelector("style")!.textContent!;
    expect(css).toContain("A4 portrait");
    expect(css).not.toContain("landscape");
    const cab = [...el.querySelectorAll("thead th")].filter(th => th.className.includes("print:hidden")).map(th => th.textContent);
    expect(cab).toEqual(expect.arrayContaining(["Centro", "Conta"]));
    expect([...el.querySelectorAll("[data-linha=a] span")].some(x => x.className.includes("print:block") && x.textContent === "Juventude · Bradesco")).toBe(true);
  });

  it("'Do mesmo centro, sem projeto': mostra só o que não tem projeto e inclui o marcado, com o projeto certo e o motivo", async () => {
    doCentro = [
      lanc({ id: "ja", projeto_id: "p1" }),
      lanc({ id: "sem1", projeto_id: null, valor: 250, descricao: "Almoço de agosto", data: "2026-08-10" }),
      lanc({ id: "sem2", projeto_id: null, valor: 80, descricao: "Cantina", data: "2026-07-01" }),
      lanc({ id: "prev", projeto_id: null, status: "previsto" }),
    ];
    const { el, onMudou } = await abrir([lanc({ id: "a" })]);
    const itens = [...el.querySelectorAll("[data-candidatos] li")];
    expect(itens.map(i => i.textContent)).toEqual([expect.stringContaining("Almoço de agosto"), expect.stringContaining("Cantina")]);
    await act(async () => { (itens[0].querySelector("[role=checkbox]") as HTMLElement).click(); });
    const incluir = [...el.querySelectorAll("button")].find(b => /Incluir 1 neste projeto/.test(b.textContent ?? "")) as HTMLButtonElement;
    expect(incluir.disabled).toBe(false);
    await act(async () => { incluir.click(); });
    const confirmar = [...document.body.querySelectorAll("[role=alertdialog] button")].find(b => b.textContent === "Incluir") as HTMLButtonElement;
    await act(async () => { confirmar.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({ id: "sem1", patch: { projeto_id: "p1" } });
    expect(chamadas[0].motivo).toContain("Retiro Juventude 2026");
    expect(onMudou).toHaveBeenCalled();
  });

  it("sem nada marcado o botão de incluir fica desligado; projeto sem centro explica por que não há sugestão", async () => {
    const { el } = await abrir([lanc({ id: "a", centro_custo_id: null, centro_nome: null })]);
    expect(el.textContent).toContain("não há de onde sugerir");
    expect(([...el.querySelectorAll("button")].find(b => /Incluir .*neste projeto/.test(b.textContent ?? "")) as HTMLButtonElement).disabled).toBe(true);
  });
});
