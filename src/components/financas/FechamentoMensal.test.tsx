// Fechamento do mês como CASA do mês (Fase B, 20/10/2026): seis etapas numa jornada só — Conciliação, Classificação, Prontidão (a fila de pendências embutida), Documentos do mês, Malote, Envio.
// O que este teste guarda: a ordem e os nomes das etapas; a Prontidão é a etapa 3 e resolve a pendência SEM sair da tela (anexar recalcula o mês); `?mes=AAAA-MM` abre o mês pedido;
// o ZIP tem UMA porta (etapa 5); o checklist dos documentos do mês mora só aqui (etapa 4).
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
  fornecedor_nome: `Fornecedor ${n}`, categoria_id: "c1", categoria_nome: "Material de Consumo", centro_custo_id: "ce1", centro_nome: "Administração", documento_numero: "1", ...o } as FinLancamentoExtenso; };
const anexo = (l: FinLancamentoExtenso, tipo: AnexoPacote["tipo"]): AnexoPacote => ({ lancamento_id: l.id, tipo, url: `${l.id}/${tipo}.pdf`, nome: "a.pdf" });

let linhas: LinhaAuditoria[] = [];
const pedidosDeMes: string[] = [];
const chamadas: string[] = [];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, hasRole: () => true }) }));
vi.mock("@/services/pacoteContabilService", () => ({
  auditarPeriodo: async (ini: string) => { pedidosDeMes.push(ini); return linhas; },
  prepararPacoteContabil: async () => ({}), baixarPacoteContabil: async () => ({}),
}));
vi.mock("@/services/fechamentoMensalService", async () => {
  const real = await vi.importActual<typeof import("@/services/fechamentoMensalService")>("@/services/fechamentoMensalService");
  return {
    ...real,
    avaliarMes: async (ano: number, mes: number) => ({
      periodo: { ano, mes, ini: `${ano}-${String(mes).padStart(2, "0")}-01`, fim: `${ano}-${String(mes).padStart(2, "0")}-30`, rotulo: `${mes}/${ano}` },
      conciliacao: { contas: 1, conciliadas: 1, pendentes: [] }, semMovimento: [], semCategoria: [], semCentro: [], semSubcentro: [], possiveisOfertasMissionarias: [],
      saldosInconsistentes: [], quitacoes: { bloqueiam: [], atencao: [] }, bloqueios: [], pronto: true,
    }),
    pacoteDoMes: async () => { chamadas.push("pacote"); return { dossies: 7, pendencias: 2, totalSaidas: 9, ofertadas: 1, avisos: 1 }; },
    ultimoEnvio: async () => ({ envio: null, indisponivel: false }),
    registrarEnvio: async () => ({}),
  };
});
vi.mock("@/services/cicloDoMesService", () => ({
  cicloDoMes: async () => ({ total: 9, porEstado: { pronta_para_malote: 3, enviada: 0, arquivada: 0, conciliada: 1 }, naoConciliadas: 0, semComprovante: 1, semDocumento: 1 }),
}));
vi.mock("@/services/fechamentoDocumentosService", () => ({ documentosDoFechamentoDisponivel: async () => true }));
vi.mock("@/components/financas/DocumentosDoFechamento", () => ({ DocumentosDoFechamento: () => <div data-testid="docs-do-mes">checklist dos documentos do mês</div> }));
vi.mock("@/components/financas/ReabrirEnviadaDialog", () => ({ ReabrirEnviadaDialog: () => null }));
vi.mock("@/components/financas/LancamentosACorrigirDialog", () => ({ LancamentosACorrigirDialog: () => null }));
vi.mock("@/components/financas/AnexosLancamentoDialog", () => ({
  AnexosLancamentoDialog: (p: { lancamentoId: string; onOpenChange: (v: boolean) => void }) => <button data-testid="anexos" onClick={() => p.onOpenChange(false)}>{p.lancamentoId}</button>,
}));
vi.mock("@/components/financas/DetalhesDoLancamento", () => ({ DetalhesDoLancamento: () => null }));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: () => null }));

import { FechamentoMensal } from "./FechamentoMensal";

let raiz: Root | null = null;
beforeEach(() => { n = 0; pedidosDeMes.length = 0; chamadas.length = 0; window.history.replaceState({}, "", "/painel-tesouraria"); });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; window.history.replaceState({}, "", "/"); });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[window.location.pathname + window.location.search]}><FechamentoMensal onConciliar={() => {}} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 60)); });
  return alvo;
}
const ctx = { contaTipo: new Map([["k1", "banco"]]) };
function cenario() {
  const a = saida({ fornecedor_nome: "Completa Ltda" });
  const c = saida({ fornecedor_nome: "Parcial ME", valor: 1500 });
  const d = saida({ fornecedor_nome: "Sem Nada Eireli", valor: 300 });
  linhas = auditarAnexos([a, c, d], [anexo(a, "nota_fiscal"), anexo(a, "comprovante"), anexo(c, "comprovante")], ctx);
}
const etapa = (el: HTMLElement, n: number) => el.querySelector(`section[aria-label^='Etapa ${n}:']`) as HTMLElement;

describe("Fechamento do mês — a casa do mês", () => {
  it("são SEIS etapas, nesta ordem e com estes nomes", async () => {
    cenario();
    const el = await abrir();
    const titulos = [...el.querySelectorAll("section[aria-label^='Etapa ']")].map(s => s.getAttribute("aria-label"));
    expect(titulos).toEqual(["Etapa 1: Conciliação", "Etapa 2: Classificação", "Etapa 3: Prontidão", "Etapa 4: Documentos do mês", "Etapa 5: Malote", "Etapa 6: Envio"]);
  });

  it("a etapa 3 é a Prontidão: números do mês e a fila de pendências embutida (da mais grave à mais leve)", async () => {
    cenario();
    const el = await abrir();
    const e3 = etapa(el, 3);
    expect(e3.textContent).toContain("Prontidão do malote");
    expect(e3.textContent).toContain("1 de 3 obrigações prontas");
    const fila = [...e3.querySelectorAll("[data-pendencia]")] as HTMLElement[];
    expect(fila.map(i => i.getAttribute("data-gravidade-da-linha"))).toEqual(["critica", "parcial"]);
    expect(fila[0].textContent).toContain("Sem Nada Eireli");
    expect(fila[0].textContent).toContain("Falta Nota Fiscal ou Fatura e comprovante de pagamento");
  });

  it("resolve a pendência SEM sair da tela: Anexar abre o diálogo da linha e, ao fechar, o mês é recalculado (Prontidão, malote e ciclo)", async () => {
    cenario();
    const el = await abrir();
    const antes = pedidosDeMes.length;
    const e3 = etapa(el, 3);
    await act(async () => { (e3.querySelector("[data-pendencia] button[aria-label^='Anexar documento']") as HTMLButtonElement).click(); });
    expect(el.querySelector("[data-testid=anexos]")).toBeTruthy();
    chamadas.length = 0;
    await act(async () => { (el.querySelector("[data-testid=anexos]") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 40)); });
    expect(pedidosDeMes.length).toBeGreaterThan(antes);          // leu o mês de novo
    expect(chamadas).toContain("pacote");                        // e o resumo do malote também
  });

  it("a fila recolhe e reabre", async () => {
    cenario();
    const el = await abrir();
    const e3 = etapa(el, 3);
    const alternar = [...e3.querySelectorAll("button")].find(b => /fila de pendências/.test(b.textContent ?? "")) as HTMLButtonElement;
    await act(async () => { alternar.click(); });
    expect(e3.querySelectorAll("[data-pendencia]")).toHaveLength(0);
    await act(async () => { ([...e3.querySelectorAll("button")].find(b => /Ver a fila de pendências \(2\)/.test(b.textContent ?? "")) as HTMLButtonElement).click(); });
    expect(e3.querySelectorAll("[data-pendencia]")).toHaveLength(2);
  });

  it("o checklist dos documentos do mês mora SÓ na etapa 4, e o ZIP tem UMA porta (etapa 5)", async () => {
    cenario();
    const el = await abrir();
    expect(etapa(el, 4).querySelector("[data-testid=docs-do-mes]")).toBeTruthy();
    expect(el.querySelectorAll("[data-testid=docs-do-mes]")).toHaveLength(1);
    const botoesGerar = [...el.querySelectorAll("button")].filter(b => /Gerar Malote/.test(b.textContent ?? ""));
    expect(botoesGerar).toHaveLength(1);
    expect(etapa(el, 5).contains(botoesGerar[0])).toBe(true);
    expect(etapa(el, 5).textContent).toContain("Compras ofertadas");
    expect(etapa(el, 5).textContent).toContain("Avisos de reembolso");
  });

  it("a Prontidão aponta para a importação em lote e para a tela cheia do mês — não existe mais link para a Auditoria no rodapé", async () => {
    cenario();
    const el = await abrir();
    const links = [...el.querySelectorAll("a")].map(a => [a.textContent!.trim(), a.getAttribute("href")]);
    expect(links).toContainEqual(["Importar em lote", "/financas/documentos"]);
    expect(links.some(([t, h]) => /Tela cheia/.test(String(t)) && /^\/financas\/auditoria-anexos\?mes=\d{4}-\d{2}$/.test(String(h)))).toBe(true);
    expect(links.filter(([, h]) => String(h).startsWith("/financas/auditoria-anexos"))).toHaveLength(1);
    expect(links.some(([t]) => /Movimento do mês/.test(String(t)))).toBe(false);      // o relatório "Movimento do mês" (e o CSV) deixou de existir
  });

  it("?mes=AAAA-MM abre o mês pedido (se estiver entre os últimos 13)", async () => {
    cenario();
    const hoje = new Date();
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
    const pedido = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    window.history.replaceState({}, "", `/painel-tesouraria?mes=${pedido}`);
    const el = await abrir();
    expect(pedidosDeMes[0]).toBe(`${pedido}-01`);
    const sel = el.querySelector("#mes-fechamento") as HTMLSelectElement;
    expect(sel.value).toBe(`${d.getFullYear()}-${d.getMonth() + 1}`);
  });

  it("um mês fora da janela, ou lixo na URL, cai no mês em fechamento de sempre", async () => {
    cenario();
    window.history.replaceState({}, "", "/painel-tesouraria?mes=1999-01");
    const el = await abrir();
    expect(pedidosDeMes[0]).not.toBe("1999-01-01");
    expect((el.querySelector("#mes-fechamento") as HTMLSelectElement).value).not.toBe("1999-1");
  });
});
