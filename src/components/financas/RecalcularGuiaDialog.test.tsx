// O diálogo "Recalcular guia" (23/10/2026): o botão só libera quando a conferência fecha; o serviço recebe exatamente o que foi digitado; erro do banco aparece.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const recalcularGuia = vi.fn();
const aviso = { sucesso: vi.fn(), erro: vi.fn() };
vi.mock("@/services/recalculoDeObrigacaoService", () => ({ recalcularGuia: (...a: unknown[]) => recalcularGuia(...a) }));
vi.mock("@/services/finService", () => ({ brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) }));
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => aviso.sucesso(...a), error: (...a: unknown[]) => aviso.erro(...a) } }));

import { RecalcularGuiaDialog } from "./RecalcularGuiaDialog";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; recalcularGuia.mockReset(); aviso.sucesso.mockReset(); aviso.erro.mockReset(); });

async function abrir(props: { onFechar?: () => void; onFeito?: () => void } = {}) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<RecalcularGuiaDialog alvo={{ id: "l1", descricao: "FGTS Setembro/2026", valor: 1000 }} onFechar={props.onFechar ?? (() => {})} onFeito={props.onFeito ?? (() => {})} />); });
}
const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
const botao = () => Array.from(document.querySelectorAll("button")).find(b => /Recalcular guia$/.test((b.textContent ?? "").trim())) as HTMLButtonElement;
async function digitar(id: string, texto: string) {
  const el = campo(id);
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, texto); el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function escolherArquivo() {
  const el = campo("rg-guia");
  const arq = new File(["%PDF"], "guia-recalculada.pdf", { type: "application/pdf" });
  await act(async () => { Object.defineProperty(el, "files", { value: [arq], configurable: true }); el.dispatchEvent(new Event("change", { bubbles: true })); });
  return arq;
}

describe("Recalcular guia", () => {
  it("abre com o botão travado e mostra o que já está atual", async () => {
    await abrir();
    expect(document.body.textContent).toContain("FGTS Setembro/2026");
    expect(botao().disabled).toBe(true);
  });

  it("mostra o resumo e diz quanto falta explicar; só libera quando a quebra fecha, com motivo e guia", async () => {
    await abrir();
    await digitar("rg-novo", "1.037,50");
    expect(document.body.textContent).toMatch(/R\$\s*1\.000,00 → R\$\s*1\.037,50/);
    await digitar("rg-multa", "20");
    expect(document.body.textContent).toMatch(/Faltam R\$\s*17,50 para explicar/);
    await digitar("rg-juros", "10"); await digitar("rg-correcao", "7,5");
    expect(document.body.textContent).toContain("✓ A quebra fecha com a diferença.");
    expect(botao().disabled).toBe(true);                       // ainda sem motivo e sem guia
    await digitar("rg-motivo", "Encargos por atraso");
    expect(botao().disabled).toBe(true);                       // ainda sem a guia
    await escolherArquivo();
    expect(botao().disabled).toBe(false);
  });

  it("confirmar manda ao serviço exatamente o digitado, avisa e fecha", async () => {
    recalcularGuia.mockResolvedValue("rec1");
    const onFeito = vi.fn(), onFechar = vi.fn();
    await abrir({ onFeito, onFechar });
    await digitar("rg-novo", "1037,50"); await digitar("rg-juros", "10"); await digitar("rg-multa", "20"); await digitar("rg-correcao", "7,50");
    await digitar("rg-motivo", "Encargos por atraso"); const arq = await escolherArquivo();
    await act(async () => { botao().click(); });
    expect(recalcularGuia).toHaveBeenCalledWith({ lancamentoId: "l1", novoValor: 1037.5, juros: 10, multa: 20, correcao: 7.5, motivo: "Encargos por atraso", guia: arq });
    expect(aviso.sucesso).toHaveBeenCalled();
    expect(onFeito).toHaveBeenCalled(); expect(onFechar).toHaveBeenCalled();
  });

  it("erro do banco aparece e o diálogo NÃO fecha", async () => {
    recalcularGuia.mockRejectedValue(new Error("Só a Administração e a Tesouraria recalculam a guia de uma obrigação."));
    const onFechar = vi.fn(), onFeito = vi.fn();
    await abrir({ onFechar, onFeito });
    await digitar("rg-novo", "1037,50"); await digitar("rg-multa", "37,50"); await digitar("rg-motivo", "Encargos por atraso"); await escolherArquivo();
    await act(async () => { botao().click(); });
    expect(aviso.erro).toHaveBeenCalledWith(expect.stringContaining("Só a Administração e a Tesouraria"));
    expect(onFechar).not.toHaveBeenCalled(); expect(onFeito).not.toHaveBeenCalled();
  });

  it("toque em uma sugestão de motivo preenche o campo", async () => {
    await abrir();
    const sugestao = Array.from(document.querySelectorAll("button")).find(b => (b.textContent ?? "").trim() === "Encargos por atraso") as HTMLButtonElement;
    await act(async () => { sugestao.click(); });
    expect(campo("rg-motivo").value).toBe("Encargos por atraso");
  });
});
