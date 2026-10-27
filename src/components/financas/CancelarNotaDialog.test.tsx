// Cancelar nota (auditoria da Tesouraria, 27/10/2026, F-10): fechar sem salvar e reabrir NÃO pode deixar motivo e arquivo da vez anterior — antes o campo de arquivo reaparecia vazio com o arquivo ainda no estado
// e o botão "Cancelar a nota" liberado, e a nota podia ser cancelada com a prova de OUTRA nota.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const adicionarAnexo = vi.fn(async () => ({ id: "ax" }));
const cancelarObrigacao = vi.fn(async () => {});
vi.mock("@/services/finService", () => ({ adicionarAnexo: (...a: unknown[]) => (adicionarAnexo as any)(...a) }));
vi.mock("@/services/quitacaoService", () => ({ cancelarObrigacao: (...a: unknown[]) => (cancelarObrigacao as any)(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CancelarNotaDialog } from "./CancelarNotaDialog";

let raiz: Root | null = null;
beforeAll(() => { (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; adicionarAnexo.mockClear(); cancelarObrigacao.mockClear(); });

function Casca({ alvo }: { alvo: { id: string; descricao: string } | null }) {
  return <CancelarNotaDialog alvo={alvo} onFechar={() => {}} onFeito={() => {}} />;
}
async function renderizar(alvo: { id: string; descricao: string } | null) {
  if (!raiz) { const el = document.createElement("div"); document.body.appendChild(el); raiz = createRoot(el); }
  await act(async () => { raiz!.render(<Casca alvo={alvo} />); });
}
const arquivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const motivo = () => document.querySelector("textarea") as HTMLTextAreaElement;
const botao = () => Array.from(document.querySelectorAll("button")).find(b => /Cancelar a nota/.test(b.textContent ?? "")) as HTMLButtonElement;
async function preencher() {
  const f = new File(["x"], "prova.pdf", { type: "application/pdf" });
  await act(async () => { Object.defineProperty(arquivo(), "files", { value: [f], configurable: true }); arquivo().dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    set.call(motivo(), "Nota cancelada com o emitente"); motivo().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Cancelar nota — estado ao reabrir", () => {
  it("com arquivo e motivo o botão libera", async () => {
    await renderizar({ id: "n1", descricao: "Nota A" });
    expect(botao().disabled).toBe(true);
    await preencher();
    expect(botao().disabled).toBe(false);
  });

  it("fechar sem salvar e reabrir (mesmo outra nota): motivo vazio, sem arquivo, botão travado", async () => {
    await renderizar({ id: "n1", descricao: "Nota A" });
    await preencher();
    expect(botao().disabled).toBe(false);
    await renderizar(null);                                   // o usuário clicou em "Voltar"
    await renderizar({ id: "n2", descricao: "Nota B" });      // abre outra nota
    expect(motivo().value).toBe("");
    expect(botao().disabled).toBe(true);                      // antes: liberado, com a prova da Nota A invisível
  });

  it("reabrir a MESMA nota também zera", async () => {
    await renderizar({ id: "n1", descricao: "Nota A" });
    await preencher();
    await renderizar(null);
    await renderizar({ id: "n1", descricao: "Nota A" });
    expect(motivo().value).toBe("");
    expect(botao().disabled).toBe(true);
  });

  it("o pai recriar o objeto `alvo` (mesma nota, mesmo estado aberto) NÃO apaga o que a pessoa digita", async () => {
    await renderizar({ id: "n1", descricao: "Nota A" });
    await preencher();
    await renderizar({ id: "n1", descricao: "Nota A" });      // objeto novo, mesma nota, sem fechar
    expect(motivo().value).toBe("Nota cancelada com o emitente");
    expect(botao().disabled).toBe(false);
  });
});
