import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CompetenciaDoSustento } from "@/services/sustentoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = async (..._a: unknown[]) => ({ ok: true });
const salvarValor = vi.fn(ok);
const adicionar = vi.fn(ok);
const remover = vi.fn(ok);
const fechar = vi.fn(ok);
const reabrir = vi.fn(ok);
vi.mock("@/services/sustentoService", () => ({
  salvarValorPrevisto: (...a: unknown[]) => salvarValor(...a),
  adicionarRubrica: (...a: unknown[]) => adicionar(...a),
  removerRubrica: (...a: unknown[]) => remover(...a),
  fecharCompetencia: (...a: unknown[]) => fechar(...a),
  reabrirCompetencia: (...a: unknown[]) => reabrir(...a),
}));
import { EditorDaCompetencia } from "./EditorDaCompetencia";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
const aoMudar = vi.fn();
afterEach(() => {
  act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null;
  for (const f of [salvarValor, adicionar, remover, fechar, reabrir, aoMudar]) f.mockClear();
});

async function montar(c: CompetenciaDoSustento) {
  alvo = document.createElement("div");
  document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<EditorDaCompetencia c={c} aoMudar={aoMudar} />); });
  return alvo;
}

const base = {
  adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, nItens: 0, valorPrevisto: null, confirmadaEm: null,
  fechadaEm: null, rspUrl: null, obrigacaoId: null, sustento: 0, outrosProventos: 0, proventos: 0, irrf: 0, outrosDescontos: 0,
  descontos: 0, rubricas: [], pagamentos: [],
};
const comp = (o: Partial<CompetenciaDoSustento>): CompetenciaDoSustento => ({
  id: "c1", beneficiarioId: "b1", competencia: "2026-10-01", status: "aberta", modo: "avancado", liquidoPrevisto: 0, saldoAPagar: 0, ...base, ...o,
});
const digitar = (campo: HTMLInputElement, v: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(campo, v);
  campo.dispatchEvent(new Event("input", { bubbles: true }));
});
const clicar = (el: Element) => act(async () => { (el as HTMLElement).click(); });
const botao = (el: Element, texto: string) => [...el.querySelectorAll("button")].find((b) => b.textContent === texto)!;

describe("Editor da competência — Fase 2 (2/3)", () => {
  it("simples: salva o valor previsto lido em reais (2.362,00 → 2362)", async () => {
    const el = await montar(comp({ modo: "simples" }));
    expect(el.textContent).toContain("Valor previsto");
    await digitar(el.querySelector('input[aria-label="Valor previsto"]') as HTMLInputElement, "2.362,00");
    await clicar(botao(el, "Salvar valor"));
    expect(salvarValor).toHaveBeenCalledWith("c1", 2362);
    expect(aoMudar).toHaveBeenCalled();
  });

  it("valor inválido não grava nada", async () => {
    const el = await montar(comp({ modo: "simples" }));
    await digitar(el.querySelector('input[aria-label="Valor previsto"]') as HTMLInputElement, "abc");
    await clicar(botao(el, "Salvar valor"));
    expect(salvarValor).not.toHaveBeenCalled();
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("avançado: lança uma rubrica do RSP com a natureza certa (IRRF é desconto)", async () => {
    const el = await montar(comp({}));
    const sel = el.querySelector('select[aria-label="Rubrica"]') as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(sel, "irrf");
    await act(async () => { sel.dispatchEvent(new Event("change", { bubbles: true })); });
    await digitar(el.querySelector('input[aria-label="Valor da rubrica"]') as HTMLInputElement, "3.723,55");
    await clicar(botao(el, "Lançar"));
    expect(adicionar).toHaveBeenCalledWith({ competenciaId: "c1", rubrica: "irrf", natureza: "desconto", descricao: "IRRF", valor: 3723.55 });
  });

  it("avançado: remove uma rubrica pelo id", async () => {
    const el = await montar(comp({ nItens: 1, sustento: 100, rubricas: [{ id: "r1", rubrica: "sustento", codigo: null, descricao: "Sustento pastoral", natureza: "provento", valor: 100, ordem: 1 }] }));
    await clicar([...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Remover Sustento pastoral")!);
    expect(remover).toHaveBeenCalledWith("c1", "r1");
  });

  it("não fecha sem apuração: o botão fica desligado e diz por quê", async () => {
    const el = await montar(comp({}));
    expect(botao(el, "Fechar competência").hasAttribute("disabled")).toBe(true);
    expect(el.textContent).toContain("Lance primeiro o sustento pastoral do RSP");
  });

  it("com o sustento lançado e líquido positivo, fecha", async () => {
    const el = await montar(comp({ nItens: 2, sustento: 17451.84, liquidoPrevisto: 13728, saldoAPagar: 13728 }));
    expect(botao(el, "Fechar competência").hasAttribute("disabled")).toBe(false);
    await clicar(botao(el, "Fechar competência"));
    expect(fechar).toHaveBeenCalledWith("c1");
  });

  it("fechada: oferece reabrir (e avisa que nada é apagado)", async () => {
    const el = await montar(comp({ status: "fechada", nItens: 2, sustento: 100, liquidoPrevisto: 100 }));
    expect(el.textContent).toContain("Reabrir não apaga nada");
    await clicar(botao(el, "Reabrir para corrigir"));
    expect(reabrir).toHaveBeenCalledWith("c1");
  });

  it("erro do serviço aparece e não recarrega", async () => {
    salvarValor.mockResolvedValueOnce({ ok: false, erro: "O valor previsto não foi salvo" } as never);
    const el = await montar(comp({ modo: "simples" }));
    await digitar(el.querySelector('input[aria-label="Valor previsto"]') as HTMLInputElement, "100");
    await clicar(botao(el, "Salvar valor"));
    expect(aoMudar).not.toHaveBeenCalled();
  });
});
