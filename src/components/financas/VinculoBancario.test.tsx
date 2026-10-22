import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const chamadas: { id: string; motivo: string }[] = [];
let falhar: string | null = null;
vi.mock("@/services/importacaoOfxService", () => ({
  vinculosAtivosDoLancamento: async () => ["N10DBB"],
  desvincularDoExtrato: async (id: string, motivo: string) => { if (falhar) throw new Error(falhar); chamadas.push({ id, motivo }); return 1; },
}));

import { FaixaDoVinculoBancario, useVinculosDoLancamento } from "./VinculoBancario";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; chamadas.length = 0; falhar = null; });

function montar(el: JSX.Element) { const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo); act(() => { raiz!.render(el); }); return alvo; }
const botao = (re: RegExp) => [...document.body.querySelectorAll("button")].find(b => re.test(b.textContent ?? "")) as HTMLButtonElement | undefined;
function digitar(el: HTMLTextAreaElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("FaixaDoVinculoBancario", () => {
  it("sem vínculo ativo não aparece nada", () => {
    expect(montar(<FaixaDoVinculoBancario lancamentoId="l1" fitids={[]} onDesvinculado={() => {}} />).querySelector("[data-vinculo-bancario]")).toBeNull();
  });

  it("com vínculo: avisa o que fica travado e oferece 'Desvincular do extrato'", () => {
    const el = montar(<FaixaDoVinculoBancario lancamentoId="l1" fitids={["N10DBB", "N10DA5"]} onDesvinculado={() => {}} />);
    const t = el.textContent!;
    expect(t).toContain("Ligado ao extrato do banco");
    expect(t).toContain("N10DBB, N10DA5");
    expect(t).toMatch(/valor, status e data do pagamento ficam travados/);
    expect(botao(/Desvincular do extrato/)).toBeTruthy();
  });

  it("o motivo é OBRIGATÓRIO (5+ letras): o botão Desvincular só liga com motivo, e o texto vai inteiro para o serviço", async () => {
    const aoDesvincular = vi.fn();
    montar(<FaixaDoVinculoBancario lancamentoId="l1" fitids={["N10DBB"]} onDesvinculado={aoDesvincular} />);
    await act(async () => { botao(/Desvincular do extrato/)!.click(); });
    const confirmar = () => [...document.body.querySelectorAll("[role=alertdialog] button")].find(b => b.textContent === "Desvincular") as HTMLButtonElement;
    expect(confirmar().disabled).toBe(true);
    const campo = document.body.querySelector("textarea") as HTMLTextAreaElement;
    digitar(campo, "abc");
    expect(confirmar().disabled).toBe(true);
    expect(document.body.textContent).toContain("pelo menos 5 letras");
    digitar(campo, "  O débito pagou duas faturas da Light  ");
    expect(confirmar().disabled).toBe(false);
    await act(async () => { confirmar().click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(chamadas).toEqual([{ id: "l1", motivo: "O débito pagou duas faturas da Light" }]);
    expect(aoDesvincular).toHaveBeenCalled();
  });

  it("se o banco recusar (ex.: migration não aplicada), a mensagem aparece e nada é dado como desvinculado", async () => {
    falhar = "A proteção do vínculo bancário ainda não está ativa no banco (falta aplicar a migration 20261022150000).";
    const aoDesvincular = vi.fn();
    montar(<FaixaDoVinculoBancario lancamentoId="l1" fitids={["N10DBB"]} onDesvinculado={aoDesvincular} />);
    await act(async () => { botao(/Desvincular do extrato/)!.click(); });
    digitar(document.body.querySelector("textarea") as HTMLTextAreaElement, "motivo qualquer");
    await act(async () => { ([...document.body.querySelectorAll("[role=alertdialog] button")].find(b => b.textContent === "Desvincular") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(chamadas).toHaveLength(0);
    expect(aoDesvincular).not.toHaveBeenCalled();
  });
});

describe("useVinculosDoLancamento", () => {
  function Teste({ id }: { id: string | null }) { const v = useVinculosDoLancamento(id); return <p data-teste>{v.fitids.join(",") || "nenhum"}</p>; }
  it("lê os vínculos ativos do lançamento; sem lançamento, nenhum", async () => {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    await act(async () => { raiz!.render(<Teste id="l1" />); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(alvo.textContent).toBe("N10DBB");
    await act(async () => { raiz!.render(<Teste id={null} />); });
    expect(alvo.textContent).toBe("nenhum");
  });
});
