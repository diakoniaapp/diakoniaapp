import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DispensaDoFechamento, DocumentoDoFechamento } from "@/services/fechamentoDocumentosService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const doc = (o: Partial<DocumentoDoFechamento> = {}): DocumentoDoFechamento => ({
  id: "d1", ano: 2026, mes: 9, tipo: "extrato_bancario", contaId: null, descricao: null, arquivoNome: "extrato_set.pdf", storagePath: "2026-09/d1-extrato_set.pdf", mimeType: "application/pdf",
  tamanhoBytes: 204800, hash: "h".repeat(64), incluidoEm: "2026-10-05T15:30:00Z", incluidoPorNome: "Ana Tesoureira", removidoEm: null, removidoPorNome: null, removidoMotivo: null, ...o,
});

let ativos: DocumentoDoFechamento[] = [];
let todos: DocumentoDoFechamento[] = [];
let dispensas: DispensaDoFechamento[] = [];
const anexar = vi.fn(async (..._a: unknown[]) => "novo");
const remover = vi.fn(async (..._a: unknown[]) => undefined);
const dispensar = vi.fn(async (..._a: unknown[]) => undefined);
const desfazer = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock("@/services/fechamentoDocumentosService", () => ({
  listarDocumentosDoFechamento: async (_a: number, _m: number, incluirRemovidos?: boolean) => (incluirRemovidos ? todos : ativos),
  listarDispensasDoFechamento: async () => dispensas,
  anexarDocumentoDoFechamento: (...a: unknown[]) => anexar(...a),
  removerDocumentoDoFechamento: (...a: unknown[]) => remover(...a),
  dispensarItemDoChecklist: (...a: unknown[]) => dispensar(...a),
  desfazerDispensa: (...a: unknown[]) => desfazer(...a),
  urlDoDocumentoDoFechamento: async () => "https://exemplo/arquivo",
}));
vi.mock("@/services/finService", () => ({ listarContas: async () => [{ id: "c1", nome: "Bradesco" }] }));

import { DocumentosDoFechamento } from "./DocumentosDoFechamento";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; ativos = []; todos = []; dispensas = []; anexar.mockClear(); remover.mockClear(); dispensar.mockClear(); desfazer.mockClear(); });

const onMudou = vi.fn();
async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<DocumentosDoFechamento ano={2026} mes={9} rotulo="Setembro/2026" onMudou={onMudou} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}
const texto = () => document.body.textContent ?? "";
const botao = (rotulo: string) => [...document.body.querySelectorAll("button")].find(b => b.textContent?.includes(rotulo)) as HTMLButtonElement | undefined;
async function clicar(rotulo: string) { const b = botao(rotulo); expect(b, `botão "${rotulo}" não achado`).toBeTruthy(); await act(async () => { b!.click(); }); }
async function digitar(el: HTMLInputElement | HTMLTextAreaElement, valor: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("a seção Documentos do fechamento", () => {
  it("mostra o checklist com os quatro itens, todos faltando num mês vazio", async () => {
    await abrir();
    for (const i of ["Extrato bancário anexado", "OFX anexado", "Cartão anexado", "Adquirente anexado"]) expect(texto()).toContain(`[ ] ${i}`);
    expect(texto()).toContain("Nenhum documento anexado ao fechamento de Setembro/2026.");
    expect(onMudou).toHaveBeenLastCalledWith({ completo: false, faltando: 4, documentos: 0 });
  });

  it("marca [x] o item que tem arquivo e mostra QUEM incluiu e QUANDO (data e hora)", async () => {
    ativos = [doc()];
    await abrir();
    expect(texto()).toContain("[x] Extrato bancário anexado");
    expect(texto()).toContain("[ ] OFX anexado");
    expect(texto()).toContain("extrato_set.pdf");
    expect(texto()).toMatch(/Incluído por Ana Tesoureira em \d{2}\/\d{2}\/2026 às \d{2}:\d{2}/);
    expect(texto()).toContain("Extratos bancários");
  });

  it("'Não se aplica' pede o motivo e dispensa o item; o checklist mostra o motivo", async () => {
    await abrir();
    const antes = [...document.body.querySelectorAll("button")].filter(b => b.textContent === "Não se aplica").length;
    expect(antes).toBe(4);
    await clicar("Não se aplica");
    expect(botao("Marcar como não aplicável")!.disabled).toBe(true);          // sem motivo, não vai
    await digitar(document.body.querySelector("textarea")!, "nenhum cartão foi usado em setembro");
    await clicar("Marcar como não aplicável");
    expect(dispensar).toHaveBeenCalledWith(2026, 9, "extrato", "nenhum cartão foi usado em setembro");
  });

  it("item dispensado mostra o motivo e permite desfazer", async () => {
    dispensas = [{ id: "s1", ano: 2026, mes: 9, grupo: "cartao", motivo: "nenhum cartão usado", criadoEm: "2026-10-05T10:00:00Z", criadoPorNome: "Ana", desfeitaEm: null, desfeitaPorNome: null }];
    await abrir();
    expect(texto()).toContain("Não se aplica neste mês: nenhum cartão usado");
    await clicar("Desfazer");
    expect(desfazer).toHaveBeenCalledWith("s1");
  });

  it("excluir exige o motivo (5 caracteres) e manda o documento certo", async () => {
    ativos = [doc()];
    await abrir();
    await clicar("Excluir");
    const confirmar = [...document.body.querySelectorAll("button")].filter(b => b.textContent === "Excluir").pop()!;
    expect(confirmar.disabled).toBe(true);
    await digitar(document.body.querySelector("textarea")!, "arq");
    expect(([...document.body.querySelectorAll("button")].filter(b => b.textContent === "Excluir").pop()!).disabled).toBe(true);
    await digitar(document.body.querySelector("textarea")!, "arquivo do mês errado");
    await act(async () => { ([...document.body.querySelectorAll("button")].filter(b => b.textContent === "Excluir").pop()!).click(); });
    expect(remover).toHaveBeenCalledTimes(1);
    expect((remover.mock.calls[0][0] as { id: string }).id).toBe("d1");
    expect(remover.mock.calls[0][1]).toBe("arquivo do mês errado");
  });

  it("o histórico mostra o que foi excluído, por quem, quando e por quê", async () => {
    ativos = [doc()];
    todos = [doc(), doc({ id: "d2", arquivoNome: "errado.pdf", removidoEm: "2026-10-06T09:00:00Z", removidoPorNome: "Bia Admin", removidoMotivo: "arquivo do mês errado" })];
    await abrir();
    expect(texto()).not.toContain("errado.pdf");
    await clicar("Ver histórico");
    expect(texto()).toContain("Histórico de inclusão e exclusão");
    expect(texto()).toContain("errado.pdf");
    expect(texto()).toMatch(/excluído por Bia Admin em \d{2}\/\d{2}\/2026 às \d{2}:\d{2}: arquivo do mês errado/);
    await clicar("Ocultar histórico");
    expect(texto()).not.toContain("errado.pdf");
  });

  it("o botão Anexar só habilita com arquivo e tipo", async () => {
    await abrir();
    expect(botao("Anexar")!.disabled).toBe(true);
    expect(texto()).toContain("Tipo do documento");
    expect(texto()).toContain("Relatório Cielo");
    expect(texto()).toContain("Relatório Rede");
    expect(anexar).not.toHaveBeenCalled();
  });
});
