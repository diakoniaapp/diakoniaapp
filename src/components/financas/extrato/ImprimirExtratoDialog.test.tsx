// Fechar o "Imprimir extrato": Cancelar, o X, o ESC e o clique fora — os quatro têm que chamar `onFechar` (relato de 20/10/2026: "o modal não fecha").
// A causa medida foi a LENTIDÃO (a página re-renderizava todas as linhas a cada abrir/fechar), não a ligação do Radix; este teste guarda a ligação.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImprimirExtratoDialog } from "./ImprimirExtratoDialog";
import { PERFIL_PADRAO } from "@/lib/perfilDeImpressaoDoExtrato";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir() {
  const onFechar = vi.fn(), onImprimir = vi.fn();
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<ImprimirExtratoDialog aberto onFechar={onFechar} perfil={PERFIL_PADRAO} onMudar={() => {}} onImprimir={onImprimir} />); });
  return { onFechar, onImprimir };
}

describe("ImprimirExtratoDialog — fechar", () => {
  it("Cancelar fecha", async () => {
    const { onFechar } = await abrir();
    await act(async () => { ([...document.querySelectorAll("button")].find(b => b.textContent === "Cancelar") as HTMLButtonElement).click(); });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
  it("o X do canto fecha", async () => {
    const { onFechar } = await abrir();
    await act(async () => { ([...document.querySelectorAll("button")].find(b => b.textContent === "Close") as HTMLButtonElement).click(); });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
  it("ESC fecha", async () => {
    const { onFechar } = await abrir();
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
  it("clique fora (no fundo escuro) fecha", async () => {
    const { onFechar } = await abrir();
    const fundo = document.querySelector("[data-state=open].fixed.inset-0") as HTMLElement;
    await act(async () => {
      fundo.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      fundo.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, button: 0 }));
      fundo.click();
    });
    expect(onFechar).toHaveBeenCalled();
  });
  it("Gerar PDF não fecha por conta própria: quem chama decide (a página fecha e imprime)", async () => {
    const { onFechar, onImprimir } = await abrir();
    await act(async () => { ([...document.querySelectorAll("button")].find(b => b.textContent!.includes("Gerar PDF")) as HTMLButtonElement).click(); });
    expect(onImprimir).toHaveBeenCalledTimes(1);
    expect(onFechar).not.toHaveBeenCalled();
  });
});
