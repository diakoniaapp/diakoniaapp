import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { aplicarEstadoNaUrl, numeroDe, useEstadoNaUrl } from "./useEstadoNaUrl";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const PADRAO = { busca: "", tipo: "todos", pagina: "1" };
let mudar: (p: Partial<typeof PADRAO>) => void = () => {};
let ler: () => { estado: typeof PADRAO; busca: string; tipo: string; hash: string } = () => ({ estado: PADRAO, busca: "", tipo: "", hash: "" });

function Sonda() {
  const [estado, m] = useEstadoNaUrl(PADRAO, { pagina: "1" });
  const loc = useLocation();
  const tipo = useNavigationType();
  mudar = m;
  ler = () => ({ estado, busca: loc.search, tipo, hash: loc.hash });
  return null;
}

function montar(url: string) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  act(() => { raiz!.render(<MemoryRouter initialEntries={[url]}><Sonda /></MemoryRouter>); });
}

describe("useEstadoNaUrl", () => {
  it("nasce da URL (o que o histórico devolve ao voltar)", () => {
    montar("/lista?busca=Light&pagina=3");
    expect(ler().estado).toEqual({ busca: "Light", tipo: "todos", pagina: "3" });
  });
  it("URL limpa = valores padrão", () => {
    montar("/lista");
    expect(ler().estado).toEqual(PADRAO);
  });
  it("escreve na URL com replace (não empilha) e omite o que é padrão", () => {
    montar("/lista");
    act(() => mudar({ busca: "luz", tipo: "saida" }));
    expect(ler().busca).toBe("?busca=luz&tipo=saida");
    expect(ler().tipo).toBe("REPLACE");
    act(() => mudar({ tipo: "todos" }));
    expect(ler().busca).toBe("?busca=luz");
  });
  it("virar a página não reinicia nada; mudar a busca volta à página 1", () => {
    montar("/lista?busca=luz");
    act(() => mudar({ pagina: "4" }));
    expect(ler().estado.pagina).toBe("4");
    expect(ler().busca).toBe("?busca=luz&pagina=4");
    act(() => mudar({ busca: "agua" }));
    expect(ler().estado.pagina).toBe("1");
    expect(ler().busca).toBe("?busca=agua");
  });
  it("não mexe em parâmetros que não são dele", () => {
    montar("/lista?mes=2026-09");
    act(() => mudar({ busca: "luz" }));
    expect(ler().busca).toBe("?mes=2026-09&busca=luz");
  });
});

describe("aplicarEstadoNaUrl / numeroDe", () => {
  it("devolve o mesmo texto quando nada muda", () => {
    const p = new URLSearchParams("busca=luz");
    expect(aplicarEstadoNaUrl(p, { ...PADRAO, busca: "luz" }, PADRAO).toString()).toBe(p.toString());
  });
  it("número inválido ou abaixo do mínimo vira o padrão", () => {
    expect(numeroDe("3", 1)).toBe(3);
    expect(numeroDe("abc", 1)).toBe(1);
    expect(numeroDe("0", 1)).toBe(1);
    expect(numeroDe(undefined, 7)).toBe(7);
    expect(numeroDe("2026", 2000, 1900)).toBe(2026);
  });
});

describe("useEstadoNaUrl e o #hash", () => {
  it("mantém o #hash da página (a aba do Painel da Tesouraria mora nele)", () => {
    montar("/painel-tesouraria#mesa");
    act(() => mudar({ busca: "luz" }));
    expect(ler().busca).toBe("?busca=luz");
    expect(ler().hash).toBe("#mesa");
  });
});
