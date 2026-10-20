// Auditoria de documentos (20/10/2026): "esta despesa está pronta para a contabilidade?" — prontidão do malote, checklist, existentes × necessários e a fila de Pendências do Malote.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FinLancamentoExtenso } from "@/services/finService";
import { auditarAnexos, type AnexoPacote, type LinhaAuditoria } from "@/lib/pacoteContabil";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

let n = 0;
const saida = (o: Partial<FinLancamentoExtenso>): FinLancamentoExtenso => { n += 1; return {
  id: `l${n}`, data: "2026-09-10", data_pagamento: null, tipo: "saida", status: "conciliado", conta_id: "k1", conta_nome: "Bradesco", valor: 100, origem: null, descricao: null,
  fornecedor_nome: `Fornecedor ${n}`, categoria_id: "c1", categoria_nome: "Material de Consumo", centro_custo_id: "ce1", centro_nome: "Administração", ...o } as FinLancamentoExtenso; };
const anexo = (l: FinLancamentoExtenso, tipo: AnexoPacote["tipo"]): AnexoPacote => ({ lancamento_id: l.id, tipo, url: `${l.id}/${tipo}.pdf`, nome: "a.pdf" });

let linhas: LinhaAuditoria[] = [];
let temPapel = true;
const chamadas: string[] = [];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, hasRole: () => temPapel }) }));
vi.mock("@/services/pacoteContabilService", () => ({ auditarPeriodo: async () => linhas }));
vi.mock("@/services/fechamentoDocumentosService", () => ({
  documentosEDispensasDoMes: async () => ({ documentos: [{ tipo: "extrato_bancario" }, { tipo: "ofx" }], dispensas: [] }),
}));
vi.mock("@/components/financas/AnexosLancamentoDialog", () => ({ AnexosLancamentoDialog: (p: { lancamentoId: string }) => { chamadas.push("anexar:" + p.lancamentoId); return <div data-testid="anexos">{p.lancamentoId}</div>; } }));
vi.mock("@/components/financas/DetalhesDoLancamento", () => ({ DetalhesDoLancamento: (p: { lancamento: { id: string } | null }) => (p.lancamento ? <div data-testid="detalhe">{p.lancamento.id}</div> : null) }));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: (p: { lancamento: { id: string } | null }) => (p.lancamento ? <div data-testid="form">{p.lancamento.id}</div> : null) }));

import FinancasAuditoriaAnexos from "./FinancasAuditoriaAnexos";

let raiz: Root | null = null;
beforeEach(() => { n = 0; temPapel = true; chamadas.length = 0; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={["/financas/auditoria-anexos?mes=2026-09"]}><FinancasAuditoriaAnexos /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  return alvo;
}
const ctx = { contaTipo: new Map([["k1", "banco"]]) };
/** 5 saídas: 1 completa, 1 completa com falta administrativa, 1 parcial, 1 sem documentação, 1 tarifa (dispensa). */
function cenario() {
  const a = saida({ fornecedor_nome: "Completa Ltda" });
  const b = saida({ fornecedor_nome: "Sem Centro SA", centro_custo_id: null as never, valor: 80 });
  const c = saida({ fornecedor_nome: "Parcial ME", valor: 1500 });
  const d = saida({ fornecedor_nome: "Sem Nada Eireli", valor: 300 });
  const e = saida({ fornecedor_nome: "Banco", categoria_nome: "Tarifas Bancárias", valor: 9.8 });
  // com o nº do documento preenchido, só o centro de custo falta no "b"
  linhas = auditarAnexos([a, b, c, d, e].map(x => ({ ...x, documento_numero: "1" }) as FinLancamentoExtenso), [
    anexo(a, "nota_fiscal"), anexo(a, "comprovante"), anexo(b, "nota_fiscal"), anexo(b, "comprovante"), anexo(c, "comprovante"),
  ], ctx);
}
const bloco = (el: HTMLElement, nome: string) => el.querySelector(`[data-bloco=${nome}]`) as HTMLElement;
const fila = (el: HTMLElement) => [...bloco(el, "fila").querySelectorAll("[data-pendencia]")] as HTMLElement[];

describe("Auditoria de documentos — prontidão do malote", () => {
  it("responde 'quanto falta?': % de prontas (completas + dispensam), as quatro contagens e o veredito", async () => {
    cenario();
    const el = await abrir();
    const p = bloco(el, "prontidao");
    expect(p.querySelector("[data-percentual]")!.textContent).toBe("60%");           // (2 completas + 1 dispensa) de 5
    expect(p.textContent).toContain("3 de 5 obrigações prontas");
    expect(p.textContent).toMatch(/Documentação completa\s*2/);
    expect(p.textContent).toMatch(/Documentação parcial\s*1/);
    expect(p.textContent).toMatch(/Sem documentação\s*1/);
    expect(p.textContent).toMatch(/Dispensam\s*1/);
    expect(p.querySelector("[data-veredito]")!.getAttribute("data-veredito")).toBe("faltam");
    expect(p.textContent).toContain("Faltam 2 obrigações com documentação incompleta e 1 ajuste administrativo");
  });

  it("tudo em ordem: o veredito diz que o escritório já consegue trabalhar com o período", async () => {
    const a = saida({ documento_numero: "1" } as never);
    linhas = auditarAnexos([a], [anexo(a, "nota_fiscal"), anexo(a, "comprovante")], ctx);
    const el = await abrir();
    expect(bloco(el, "prontidao").querySelector("[data-veredito]")!.getAttribute("data-veredito")).toBe("pronto");
    expect(bloco(el, "prontidao").textContent).toContain("O escritório já consegue trabalhar com este período.");
  });

  it("'existentes × necessários' conta só o que a regra exige", async () => {
    cenario();
    const el = await abrir();
    const ex = bloco(el, "existentes");
    expect(ex.querySelector("[data-documento='Nota Fiscal ou Fatura']")!.textContent).toContain("2 de 4");
    expect(ex.querySelector("[data-documento='Comprovante de pagamento']")!.textContent).toContain("3 de 4");
  });

  it("o checklist do mês mostra os documentos mensais (extrato e OFX anexados; cartão e adquirente faltando)", async () => {
    cenario();
    const el = await abrir();
    const ck = bloco(el, "checklist");
    expect(ck.textContent).toContain("Extrato bancário");
    const itens = [...ck.querySelectorAll("[data-item-do-checklist]")].map(i => [i.textContent, i.getAttribute("data-item-do-checklist")]);
    expect(itens.find(i => i[0]!.includes("Cartão"))![1]).toBe("atencao");
    expect(itens.find(i => i[0]!.includes("OFX"))![1]).toBe("ok");
    expect(ck.textContent).toContain("Anexar os documentos do mês");
  });
});

describe("Auditoria de documentos — fila de Pendências do Malote", () => {
  it("lista só as pendências, da mais grave à mais leve (crítica, parcial, administrativa), com o que falta", async () => {
    cenario();
    const el = await abrir();
    const itens = fila(el);
    expect(itens.map(i => i.getAttribute("data-gravidade-da-linha"))).toEqual(["critica", "parcial", "administrativa"]);
    expect(itens[0].textContent).toContain("Sem Nada Eireli");
    expect(itens[0].textContent).toContain("Falta Nota Fiscal ou Fatura e comprovante de pagamento");
    expect(itens[1].textContent).toContain("Falta Nota Fiscal ou Fatura");
    expect(itens[2].textContent).toContain("Documentos ok · falta centro de custo");
    expect(itens[0].textContent).toContain("R$"); expect(itens[0].textContent).toContain("Bradesco");
  });

  it("os filtros da fila (Críticas, Parciais, Administrativas, Completas, Dispensam, Todas) mostram o que dizem", async () => {
    cenario();
    const el = await abrir();
    const vista = async (v: string) => { await act(async () => { (el.querySelector(`[data-vista=${v}]`) as HTMLButtonElement).click(); }); return fila(el).length; };
    expect(await vista("critica")).toBe(1);
    expect(await vista("parcial")).toBe(1);
    expect(await vista("administrativa")).toBe(1);
    expect(await vista("completas")).toBe(2);
    expect(await vista("dispensam")).toBe(1);
    expect(await vista("todas")).toBe(5);
  });

  it("ações: Anexar à vista nas pendências de documento, Editar nas administrativas; o resto em '⋯'; sem permissão, só consulta", async () => {
    cenario();
    const el = await abrir();
    const rotulos = (i: HTMLElement) => [...i.querySelectorAll("button")].map(b => (b.getAttribute("aria-label") ?? "").replace(/ (—|de) .*$/, "")).filter(Boolean);
    const itens = fila(el);
    expect(rotulos(itens[0])).toContain("Anexar documento");
    expect(rotulos(itens[2])).toContain("Editar obrigação");
    expect(rotulos(itens[2])).not.toContain("Anexar documento");
    // Anexar abre o diálogo de anexos da própria linha, sem sair da tela
    await act(async () => { (itens[0].querySelector("button[aria-label^='Anexar documento']") as HTMLButtonElement).click(); });
    expect(document.querySelector("[data-testid=anexos]")!.textContent).toBe(linhas.find(x => x.situacao === "sem")!.lancamento.id);
  });

  it("quem não opera o dinheiro não vê Anexar nem Editar", async () => {
    cenario(); temPapel = false;
    const el = await abrir();
    const itens = fila(el);
    expect(itens.every(i => !i.querySelector("button[aria-label^='Anexar documento']") && !i.querySelector("button[aria-label^='Editar obrigação']"))).toBe(true);
  });

  it("o nome do fornecedor abre o detalhe (Visualizar)", async () => {
    cenario();
    const el = await abrir();
    const nome = [...fila(el)[0].querySelectorAll("button")].find(b => b.textContent === "Sem Nada Eireli")!;
    await act(async () => { (nome as HTMLButtonElement).click(); });
    expect(document.querySelector("[data-testid=detalhe]")).toBeTruthy();
  });

  it("aviso de reembolso aparece marcado na fila", async () => {
    const r = saida({ status: "previsto" as never, fornecedor_nome: "Loja do Reembolso", obrigacao_id: "o1" } as never);
    linhas = auditarAnexos([r], [anexo(r, "nota_fiscal")], { ...ctx, quitacao: new Map([["o1", { intencao: "reembolso", terceiroQuitou: true }]]), avisos: new Set([r.id]) });
    const el = await abrir();
    expect(fila(el)[0].textContent).toContain("Reembolso a pagar");
    expect(fila(el)[0].textContent).toContain("Falta Declaração do Terceiro e comprovante do PIX da igreja (reembolso ainda não pago)");
  });
});
