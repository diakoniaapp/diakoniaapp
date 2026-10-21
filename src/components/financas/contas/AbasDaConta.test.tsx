// As abas da conta (Fase D): quais existem por tipo de conta, e o endereço de cada uma.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AbasDaConta, abasDaConta, enderecoDaAba } from "./AbasDaConta";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const rotulos = (tipo: Parameters<typeof abasDaConta>[0]) => abasDaConta(tipo).map(a => a.aba);

describe("quais abas cada conta tem", () => {
  it("banco: extrato, conciliação e diagnóstico (a aba Importações saiu — o botão Importar OFX fica no cabeçalho)", () => expect(rotulos("banco")).toEqual(["extrato", "conciliacao", "diagnostico"]));
  it("cartão: extrato e importações (o histórico das faturas); conciliação e diagnóstico são do banco", () => expect(rotulos("cartao")).toEqual(["extrato", "importacoes"]));
  it("caixa, pix, aplicação…: só o extrato", () => {
    for (const t of ["caixa", "pix", "aplicacao", "cofre", "envelope"] as const) expect(rotulos(t), t).toEqual(["extrato"]);
  });
  it("enquanto o tipo não carregou, só o extrato", () => expect(rotulos(undefined)).toEqual(["extrato"]));
});

describe("endereço de cada aba", () => {
  it("o extrato é o endereço da conta; as outras levam o nome da aba", () => {
    expect(enderecoDaAba("abc", "extrato")).toBe("/financas/conta/abc");
    expect(enderecoDaAba("abc", "conciliacao")).toBe("/financas/conta/abc/conciliacao");
    expect(enderecoDaAba("abc", "diagnostico")).toBe("/financas/conta/abc/diagnostico");
    expect(enderecoDaAba("abc", "importacoes")).toBe("/financas/conta/abc/importacoes");
  });
});

describe("a barra de abas", () => {
  const montar = (tipo: Parameters<typeof AbasDaConta>[0]["tipo"], aba: Parameters<typeof AbasDaConta>[0]["aba"]) => {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    act(() => { raiz!.render(<MemoryRouter><AbasDaConta contaId="c1" tipo={tipo} aba={aba} /></MemoryRouter>); });
    return alvo;
  };
  it("marca só a aba atual e liga cada uma ao seu endereço", () => {
    const el = montar("banco", "conciliacao");
    const links = [...el.querySelectorAll("a")];
    expect(links.map(a => a.getAttribute("href"))).toEqual(["/financas/conta/c1", "/financas/conta/c1/conciliacao", "/financas/conta/c1/diagnostico"]);
    expect(links.filter(a => a.getAttribute("aria-current") === "page").map(a => a.textContent!.trim())).toEqual(["Conciliação"]);
  });
  it("não desenha nada quando a conta só tem o extrato, e some no papel", () => {
    expect(montar("caixa", "extrato").querySelector("nav")).toBeNull();
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    expect(montar("banco", "extrato").querySelector("nav")!.className).toContain("print:hidden");
  });
});
