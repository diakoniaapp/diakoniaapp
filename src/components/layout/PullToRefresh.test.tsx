// Puxar para atualizar (16/10/2026): quando o gesto vale e, sobretudo, quando NÃO vale — ele não pode roubar rolagem, nem recarregar a página debaixo de quem está digitando.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PullToRefresh, podePuxarDe } from "./PullToRefresh";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
const atualizar = vi.fn(async () => {});

function montar(html = `<main id="lista"><p id="conteudo">Conteúdo</p><input id="campo" /></main>`) {
  document.body.innerHTML = `<div id="app">${html}</div><div id="gancho"></div>`;
  raiz = createRoot(document.getElementById("gancho")!);
  act(() => { raiz!.render(<PullToRefresh onRefresh={atualizar} />); });
}
const toque = (tipo: string, alvo: Element, y: number, x = 100, n = 1) => {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", { value: tipo === "touchend" ? [] : Array.from({ length: n }, () => ({ clientX: x, clientY: y })) });
  act(() => { alvo.dispatchEvent(e); });
  return e;
};
/** Arrasta o dedo de y0 a y1 e solta. */
async function arrastar(alvo: Element, y0: number, y1: number, x1 = 100) {
  toque("touchstart", alvo, y0);
  toque("touchmove", alvo, (y0 + y1) / 2, (100 + x1) / 2);
  const ultimo = toque("touchmove", alvo, y1, x1);
  await act(async () => { alvo.dispatchEvent(Object.assign(new Event("touchend", { bubbles: true }), { touches: [] })); });
  return ultimo;
}
function rolagem(el: HTMLElement, { scrollTop, scrollHeight = 2000, clientHeight = 600 }: { scrollTop: number; scrollHeight?: number; clientHeight?: number }) {
  el.style.overflowY = "auto";
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  el.scrollTop = scrollTop;
}

beforeEach(() => { atualizar.mockClear(); });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

describe("o gesto de puxar", () => {
  it("do topo, puxando para baixo além do limite: atualiza uma vez", async () => {
    montar();
    const alvo = document.getElementById("conteudo")!;
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    const mover = await arrastar(alvo, 100, 320);   // 220 px de dedo = 110 px de círculo (o máximo), acima do limite de 70
    expect(mover.defaultPrevented).toBe(true);
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it("puxão curto (abaixo do limite) não atualiza", async () => {
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("conteudo")!, 100, 180);   // 80 px de dedo = 40 de círculo
    expect(atualizar).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid=puxar-atualizar]")).toBeNull();   // e o círculo volta ao lugar
  });

  it("lista rolada para baixo: puxar é rolar a lista de volta, não atualizar", async () => {
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 300 });
    const mover = await arrastar(document.getElementById("conteudo")!, 100, 320);
    expect(atualizar).not.toHaveBeenCalled();
    expect(mover.defaultPrevented).toBe(false);   // a rolagem segue normal
  });

  it("rolagem aninhada: se o contêiner de dentro está no meio, ele manda, mesmo com a tela no topo", async () => {
    montar(`<main id="lista"><div id="interna"><p id="conteudo">x</p></div></main>`);
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    rolagem(document.getElementById("interna")!, { scrollTop: 50 });
    await arrastar(document.getElementById("conteudo")!, 100, 320);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("gesto de lado (tabela, carrossel) não atualiza", async () => {
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("conteudo")!, 100, 160, 320);   // 60 px para baixo, 220 para o lado
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("subindo o dedo (rolar para baixo) nunca vira puxão", async () => {
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    const mover = await arrastar(document.getElementById("conteudo")!, 300, 100);
    expect(atualizar).not.toHaveBeenCalled();
    expect(mover.defaultPrevented).toBe(false);
  });

  it("começando num campo de texto, não atualiza (recarregar perderia o que se digita)", async () => {
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("campo")!, 100, 320);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("com um diálogo aberto, não atualiza", async () => {
    montar(`<main id="lista"><p id="conteudo">x</p></main><div role="dialog"><p id="dentro">formulário</p></div>`);
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("conteudo")!, 100, 320);
    await arrastar(document.getElementById("dentro")!, 100, 320);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("áreas marcadas com data-sem-puxar (e o mapa) ficam de fora; dois dedos também", async () => {
    montar(`<main id="lista"><div data-sem-puxar><p id="marcada">x</p></div><div class="leaflet-container"><p id="mapa">m</p></div><p id="conteudo">c</p></main>`);
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("marcada")!, 100, 320);
    await arrastar(document.getElementById("mapa")!, 100, 320);
    toque("touchstart", document.getElementById("conteudo")!, 100, 100, 2);
    expect(atualizar).not.toHaveBeenCalled();
  });

  it("enquanto atualiza, não aceita outro puxão", async () => {
    let termina: () => void = () => {};
    atualizar.mockImplementationOnce(() => new Promise<void>((r) => { termina = r; }));
    montar();
    rolagem(document.getElementById("lista")!, { scrollTop: 0 });
    await arrastar(document.getElementById("conteudo")!, 100, 320);
    expect(document.querySelector("[data-testid=puxar-atualizar]")?.textContent).toContain("Atualizando");
    await arrastar(document.getElementById("conteudo")!, 100, 320);
    expect(atualizar).toHaveBeenCalledTimes(1);
    await act(async () => { termina(); });
    expect(document.querySelector("[data-testid=puxar-atualizar]")).toBeNull();
  });

  it("podePuxarDe: alvo que não é elemento não puxa", () => {
    expect(podePuxarDe(null)).toBe(false);
    expect(podePuxarDe(document)).toBe(false);
  });
});
