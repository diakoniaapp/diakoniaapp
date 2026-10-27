// O Select protegido do autocorretor do Radix (auditoria da Tesouraria, 27/10/2026): o valor definido ANTES de as opções carregarem não pode ser zerado; uma opção de valor vazio DECLARADA continua funcionando.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

/** O formulário de edição: o valor chega por efeito, as opções chegam DEPOIS (como as contas da recorrência). Dentro de <form>: é só aí que o Radix monta o <select> nativo que causa o defeito. */
function Formulario({ onMudou, permitirVazio = false }: { onMudou: (v: string) => void; permitirVazio?: boolean }) {
  const [valor, setValor] = useState("");
  const [opcoes, setOpcoes] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => { setValor("c1"); }, []);
  useEffect(() => { const t = setTimeout(() => setOpcoes([{ id: "c1", nome: "Bradesco" }, { id: "c2", nome: "Caixinha" }]), 20); return () => clearTimeout(t); }, []);
  return (
    <form>
    <Select permitirVazio={permitirVazio} value={valor} onValueChange={v => { onMudou(v); setValor(v); }}>
      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>
        {permitirVazio && <SelectItem value="">— Não definir —</SelectItem>}
        {opcoes.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
      </SelectContent>
    </Select>
    </form>
  );
}

async function abrir(el: React.ReactElement) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(el); });
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
}
const trigger = () => document.querySelector('button[role="combobox"]') as HTMLButtonElement;
async function abrirSeletor() {
  const ev = Object.assign(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }), { pointerType: "mouse" });
  await act(async () => { trigger().dispatchEvent(ev); });
}

describe("Select — valor definido antes das opções", () => {
  it("o autocorretor do Radix (\"\") não chega ao formulário e o rótulo aparece quando as opções carregam", async () => {
    const mudou = vi.fn();
    await abrir(<Formulario onMudou={mudou} />);
    expect(mudou).not.toHaveBeenCalledWith("");
    expect(trigger().textContent).toContain("Bradesco");
  });

  it("sem a proteção o mesmo cenário zerava o campo (prova de que o teste enxerga o defeito)", async () => {
    const { Root, Trigger, Value, Content, Item } = await import("@radix-ui/react-select");
    const mudou = vi.fn();
    function Cru() {
      const [valor, setValor] = useState("");
      const [opcoes, setOpcoes] = useState<string[]>([]);
      useEffect(() => { setValor("c1"); }, []);
      useEffect(() => { const t = setTimeout(() => setOpcoes(["c1"]), 20); return () => clearTimeout(t); }, []);
      return <form><Root value={valor} onValueChange={v => { mudou(v); setValor(v); }}><Trigger><Value placeholder="Selecione" /></Trigger><Content>{opcoes.map(o => <Item key={o} value={o}>{o}</Item>)}</Content></Root></form>;
    }
    await abrir(<Cru />);
    expect(mudou).toHaveBeenCalledWith("");
  });

  it("clicar numa opção entrega o valor dela", async () => {
    const mudou = vi.fn();
    await abrir(<Formulario onMudou={mudou} />);
    await abrirSeletor();
    const caixinha = Array.from(document.querySelectorAll('[role="option"]')).find(o => /Caixinha/.test(o.textContent ?? "")) as HTMLElement | undefined;
    expect(caixinha).toBeTruthy();
    await act(async () => { caixinha!.click(); });
    expect(mudou).toHaveBeenCalledWith("c2");
  });

  it("com `permitirVazio`, a opção de valor vazio declarada ainda chega ao formulário", async () => {
    const mudou = vi.fn();
    await abrir(<Formulario onMudou={mudou} permitirVazio />);
    await abrirSeletor();
    const vazio = Array.from(document.querySelectorAll('[role="option"]')).find(o => /Não definir/.test(o.textContent ?? "")) as HTMLElement | undefined;
    expect(vazio).toBeTruthy();
    await act(async () => { vazio!.click(); });
    expect(mudou).toHaveBeenCalledWith("");
  });
});
