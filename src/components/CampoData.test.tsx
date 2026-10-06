import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CampoData } from "./CampoData";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; });

function montar(el: React.ReactElement) {
  alvo = document.createElement("div");
  document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  act(() => raiz!.render(el));
  return alvo.querySelector("input") as HTMLInputElement;
}

// o React escuta o evento "input" com o valor nativo: precisa do setter do protótipo
function digitar(campo: HTMLInputElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  set.call(campo, valor);
  act(() => { campo.dispatchEvent(new Event("input", { bubbles: true })); });
}
const focar = (c: HTMLInputElement) => act(() => { c.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
const sair = (c: HTMLInputElement) => act(() => { c.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });

// a tela de verdade guarda o valor: o campo é CONTROLADO
function Controlado({ inicial, aoMudar, permitirVazio }: { inicial: string; aoMudar: (v: string) => void; permitirVazio?: boolean }) {
  const [v, setV] = useState(inicial);
  return <CampoData value={v} onChange={(x) => { setV(x); aoMudar(x); }} permitirVazio={permitirVazio} />;
}

describe("CampoData — apagar a data", () => {
  it("campo OPCIONAL: apagar o texto limpa a data (onChange vazio) e o campo fica vazio ao sair", () => {
    const onChange = vi.fn();
    const campo = montar(<Controlado inicial="2030-12-31" aoMudar={onChange} permitirVazio />);
    expect(campo.value).toBe("31/12/2030");
    focar(campo);
    digitar(campo, "");
    expect(onChange).toHaveBeenLastCalledWith("");
    sair(campo);
    expect(campo.value).toBe("");
  });

  it("campo OBRIGATÓRIO (padrão): apagar e sair devolve o último valor, como sempre", () => {
    const onChange = vi.fn();
    const campo = montar(<Controlado inicial="2030-12-31" aoMudar={onChange} />);
    focar(campo);
    digitar(campo, "");
    expect(onChange).not.toHaveBeenCalled();
    sair(campo);
    expect(campo.value).toBe("31/12/2030");
  });
});
