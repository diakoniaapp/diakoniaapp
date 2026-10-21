// Calendário de vencimentos da Mesa (Fase A — substitui a Agenda Financeira): o mês numa grade, tom por dia, e as obrigações do dia com as MESMAS linhas e ações do Livro.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linha = (o: Partial<LinhaDoExtrato> & { obrigacaoId: string }): LinhaDoExtrato => ({
  data: "2026-10-15", fornecedor: "Papelaria Central", documento: "", descricao: "", categoria: "Material de Consumo", centro: "Ministério Pastoral", projeto: "", valor: 100, saldoEmAberto: 0,
  situacao: "paga", responsavel: "Igreja", intencao: "—", diasEmAtraso: null, idEmAberto: null, reembolsoAPagar: false, saldoAReembolsar: null, contaId: "k1", conta: "Bradesco",
  observacoes: "", anexos: 0, debito: null, documentacao: null, grau: null, ...o,
});
let dados: LinhaDoExtrato[] = [];
const pedidos: { de: string; ate: string }[] = [];
const chamadas: string[] = [];
let mudou = 0;

vi.mock("@/hooks/useAcoesLancamento", () => ({ useAcoesLancamento: () => ({ pagar: (v: { id: string }) => { chamadas.push("pagar:" + v.id); }, dialogs: null }) }));
vi.mock("@/components/financas/DetalhesDoLancamento", () => ({ DetalhesDoLancamento: () => null }));
vi.mock("@/components/financas/DocumentacaoDaObrigacao", () => ({ DocumentacaoDaObrigacao: () => null }));
vi.mock("@/components/financas/AnexosLancamentoDialog", () => ({ AnexosLancamentoDialog: () => null }));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: () => null }));
vi.mock("@/components/financas/PagarReembolsoDialog", () => ({ PagarReembolsoDialog: () => null }));
vi.mock("@/components/financas/QuitacaoDialog", () => ({ QuitacaoDialog: () => null }));
vi.mock("@/services/fechamentoMensalService", () => ({ buscarLancamentoParaEditar: async (id: string) => ({ id }) }));
vi.mock("@/services/quitacaoService", () => ({ quitacaoDaObrigacao: async () => null }));
vi.mock("@/services/extratoDeObrigacoesService", () => ({ carregarExtratoDeObrigacoes: async (f: { de: string; ate: string }) => { pedidos.push(f); return dados; } }));
vi.mock("@/services/finService", () => ({
  brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " "),
  buscarVencimentoPorId: async (id: string) => ({ id }),
}));

import { CalendarioDeVencimentos } from "./CalendarioDeVencimentos";

let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; pedidos.length = 0; chamadas.length = 0; mudou = 0; });

async function abrir(podeOperar = true) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<CalendarioDeVencimentos hoje="2026-10-20" podeOperar={podeOperar} chaveDeAtualizacao={0} onMudou={() => { mudou++; }} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const celula = (el: HTMLElement, dia: string) => el.querySelector(`[data-dia='${dia}']`) as HTMLButtonElement;
const clicar = async (b: Element) => { await act(async () => { (b as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 20)); }); };

function cenario() {
  dados = [
    linha({ obrigacaoId: "a", data: "2026-10-05", situacao: "paga", valor: 8000 }),
    linha({ obrigacaoId: "b", data: "2026-10-10", situacao: "em_aberto", saldoEmAberto: 300, valor: 300, idEmAberto: "b1", diasEmAtraso: 10, fornecedor: "Light" }),
    linha({ obrigacaoId: "c", data: "2026-10-19", situacao: "em_aberto", saldoEmAberto: 99, valor: 99, idEmAberto: "c1", debito: "aguardando", diasEmAtraso: 1, fornecedor: "Verisure" }),
    linha({ obrigacaoId: "d", data: "2026-10-25", situacao: "em_aberto", saldoEmAberto: 500, valor: 500, idEmAberto: "d1", fornecedor: "CEG" }),
    linha({ obrigacaoId: "e", data: "2026-10-25", situacao: "paga", valor: 700 }),
    linha({ obrigacaoId: "f", data: "2026-10-28", situacao: "cancelada", valor: 50 }),
  ];
}

describe("Calendário de vencimentos", () => {
  it("lê o mês inteiro do Livro (1º ao último dia) e desenha a grade de domingo a sábado", async () => {
    cenario();
    const el = await abrir();
    expect(pedidos).toEqual([{ de: "2026-10-01", ate: "2026-10-31" }]);
    expect(el.textContent).toContain("outubro de 2026");
    expect(el.querySelectorAll("[role=columnheader]")).toHaveLength(7);
    expect(el.querySelectorAll("[data-dia]")).toHaveLength(31);
  });

  it("cada dia leva o total e o tom do PIOR que há nele (atraso, aguardando banco, em aberto, pago, vazio)", async () => {
    cenario();
    const el = await abrir();
    expect(celula(el, "2026-10-05").dataset.tom).toBe("pago");
    expect(celula(el, "2026-10-10").dataset.tom).toBe("atraso");
    expect(celula(el, "2026-10-19").dataset.tom).toBe("aguardando");
    expect(celula(el, "2026-10-25").dataset.tom).toBe("aberto");            // 500 em aberto + 700 pago: pesa o em aberto
    expect(celula(el, "2026-10-28").dataset.tom).toBe("vazio");             // só cancelada
    expect(celula(el, "2026-10-02").dataset.tom).toBe("vazio");
    expect(celula(el, "2026-10-25").textContent).toContain("1,2 mil");     // 500 + 700 = 1.200
    expect(celula(el, "2026-10-25").getAttribute("aria-label")).toContain("2 obrigações");
  });

  it("opção B: valor completo (R$ 1.200) e quantidade por extenso na célula; a linha de alerta só aparece nos dias que pedem atenção", async () => {
    cenario();
    const el = await abrir();
    expect(celula(el, "2026-10-25").textContent).toContain("R$ 1.200");
    expect(celula(el, "2026-10-25").textContent).toContain("2 obrigações");
    expect(celula(el, "2026-10-25").querySelector("[data-alerta]")).toBeNull();               // em aberto, ainda no prazo: sem alerta
    expect(celula(el, "2026-10-05").querySelector("[data-alerta]")).toBeNull();               // tudo pago: célula limpa
    expect(celula(el, "2026-10-10").querySelector("[data-alerta]")!.textContent).toMatch(/▲ 1 .*vencida/);
    expect(celula(el, "2026-10-19").querySelector("[data-alerta]")!.textContent).toMatch(/◐ 1 .*a conferir/);
    expect(celula(el, "2026-10-10").getAttribute("aria-label")).toContain("1 vencida");
  });

  it("o resumo do mês conta tudo (sem as canceladas) e separa o que está em aberto", async () => {
    cenario();
    const el = await abrir();
    expect(el.textContent).toContain("5 obrigações");
    expect(el.textContent).toContain("R$ 9.599,00");
    expect(el.textContent).toContain("R$ 899,00");
  });

  it("hoje já abre com o dia selecionado; clicar num dia mostra as obrigações dele (as mesmas linhas do Livro)", async () => {
    cenario();
    const el = await abrir();
    await clicar(celula(el, "2026-10-25"));
    const aberto = el.querySelector("[data-dia-aberto]")!;
    expect(aberto.getAttribute("data-dia-aberto")).toBe("2026-10-25");
    expect(aberto.querySelectorAll("[data-obrigacao]")).toHaveLength(2);
    expect(aberto.textContent).toContain("CEG");
    expect(aberto.textContent).toContain("Total do dia");
    expect(aberto.querySelector("section")!.getAttribute("data-estilo")).toBe("operacional");           // a Agenda usa a mesma Inter da Mesa, não o título serifado do relatório
    expect(aberto.querySelector("h3")!.className).not.toContain("font-serif");
    await clicar(celula(el, "2026-10-25"));                                   // clicar de novo recolhe
    expect(el.querySelector("[data-dia-aberto]")!.querySelectorAll("[data-obrigacao]")).toHaveLength(0);
  });

  it("dia sem obrigação diz isso; o débito automático aparece com o chip", async () => {
    cenario();
    const el = await abrir();
    await clicar(celula(el, "2026-10-02"));
    expect(el.textContent).toContain("Nenhuma obrigação neste dia.");
    await clicar(celula(el, "2026-10-19"));
    expect(el.querySelector("[data-debito='aguardando']")).toBeTruthy();
  });

  it("as ações do Livro valem aqui: 'Pagar agora' numa linha em aberto abre o fluxo de pagamento de sempre", async () => {
    cenario();
    const el = await abrir();
    await clicar(celula(el, "2026-10-25"));
    await clicar(el.querySelector("button[aria-label^='Pagar agora']")!);
    expect(chamadas).toEqual(["pagar:d1"]);
  });

  it("quem não opera o dinheiro só consulta (sem 'Pagar agora')", async () => {
    cenario();
    const el = await abrir(false);
    await clicar(celula(el, "2026-10-25"));
    expect(el.querySelector("button[aria-label^='Pagar agora']")).toBeNull();
  });

  it("navega entre os meses (vira o ano) e volta para hoje", async () => {
    cenario();
    const el = await abrir();
    await clicar(el.querySelector("button[aria-label='Próximo mês']")!);
    expect(pedidos.at(-1)).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(el.textContent).toContain("novembro de 2026");
    await clicar(el.querySelector("button[aria-label='Próximo mês']")!);
    await clicar(el.querySelector("button[aria-label='Próximo mês']")!);
    expect(el.textContent).toContain("janeiro de 2027");
    await clicar([...el.querySelectorAll("button")].find(b => b.textContent === "Hoje")!);
    expect(el.textContent).toContain("outubro de 2026");
    expect(el.querySelector("[data-dia-aberto]")!.getAttribute("data-dia-aberto")).toBe("2026-10-20");
  });
});
