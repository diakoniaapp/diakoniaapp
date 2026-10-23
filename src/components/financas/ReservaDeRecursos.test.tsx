import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/finService", () => ({ brl: (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` }));

import { IndicadoresDeSaldo } from "./ReservaDeRecursos";
import { calcularReservaDosProjetos, itemDoFundoMissionario, montarRecursosReservados } from "@/lib/recursosReservados";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

function montar(saldo: number, itens = [] as ReturnType<typeof calcularReservaDosProjetos>) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  act(() => { raiz!.render(<MemoryRouter><IndicadoresDeSaldo recursos={montarRecursosReservados(saldo, itens)} /></MemoryRouter>); });
  return alvo;
}
const lanc = (p: object) => ({ projeto_id: "rj", tipo: "entrada", status: "realizado", valor: 100, origem: "manual", ...p });
const itens = [
  ...calcularReservaDosProjetos([{ id: "rj", nome: "Retiro Juventude 2027" }, { id: "rf", nome: "Retiro Famílias 2027" }], [lanc({ valor: 8000 }), lanc({ projeto_id: "rf", valor: 1000 }), lanc({ projeto_id: "rf", tipo: "saida", valor: 1500 })]),
  itemDoFundoMissionario(5000, 1000),
];

describe("Saldo nas contas · Reservado · Saldo livre", () => {
  it("mostra os três números no cabeçalho", () => {
    const el = montar(72000, itens);
    const t = el.textContent!;
    expect(t).toContain("Saldo nas contas");
    expect(t).toContain("R$ 72.000,00");
    expect(t).toContain("Reservado");
    expect(t).toContain("R$ 12.000,00");              // 8.000 + 0 (famílias gastou além) + 4.000 do fundo
    expect(t).toContain("Saldo livre");
    expect(t).toContain("R$ 60.000,00");
  });

  it("clicar em Reservado abre o painel com cada projeto e o Fundo Missionário; 'gasto além da reserva' aparece e o reservado não fica negativo", async () => {
    const el = montar(72000, itens);
    await act(async () => { (el.querySelector("button[aria-label^='Reservado']") as HTMLButtonElement).click(); });
    const painel = document.body.querySelector("[role=dialog]")!;
    expect(painel.textContent).toContain("Recursos reservados");
    expect(painel.querySelector("[data-reservado=rj]")!.textContent).toContain("Retiro Juventude 2027");
    expect(painel.querySelector("[data-reservado=rj]")!.textContent).toContain("R$ 8.000,00");
    expect(painel.querySelector("[data-reservado=fundo-missionario]")!.textContent).toContain("Fundo Missionário");
    const familias = painel.querySelector("[data-reservado=rf]")!.textContent!;
    expect(familias).toContain("Gasto além da reserva");
    expect(familias).toContain("R$ 500,00");
    expect(painel.textContent).not.toMatch(/−\s*R\$\s*-/);   // nenhum valor reservado negativo
  });

  it("reservas maiores que as contas: o livre fica vermelho e o painel avisa", async () => {
    const el = montar(1000, itens);
    expect(el.querySelector("[data-saldos]")!.innerHTML).toContain("text-destructive-text");
    await act(async () => { (el.querySelector("button[aria-label^='Reservado']") as HTMLButtonElement).click(); });
    expect(document.body.querySelector("[role=alert]")!.textContent).toContain("somam mais do que há nas contas");
  });

  it("saldo nas contas NEGATIVO fica vermelho (o 'Disponível' antigo era verde mesmo negativo), e o livre também", async () => {
    const el = montar(-43690.93, itens);
    expect(el.querySelector("[data-saldo-contas]")!.className).toContain("text-destructive-text");
    expect(el.querySelector("[data-saldo-contas]")!.className).not.toContain("text-success-text");
    expect(el.querySelector("[data-saldos]")!.textContent).toContain("R$ -43.690,93");
    await act(async () => { (el.querySelector("button[aria-label^='Reservado']") as HTMLButtonElement).click(); });
    expect(document.body.querySelector("[role=alert]")!.textContent).toContain("contas estão no negativo");
  });
  it("saldo positivo continua verde", () => {
    expect(montar(5000, []).querySelector("[data-saldo-contas]")!.className).toContain("text-success-text");
  });

  it("sem nenhum projeto marcado: o painel orienta onde marcar", async () => {
    const el = montar(500, []);
    await act(async () => { (el.querySelector("button[aria-label^='Reservado']") as HTMLButtonElement).click(); });
    expect(document.body.querySelector("[role=dialog]")!.textContent).toContain("Projeto com Reserva Financeira");
  });
});

describe("no celular só o Saldo livre e o 'Sai/semana' ficam à vista (23/10/2026)", () => {
  function montarComSai(saldo: number) {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    act(() => { raiz!.render(<MemoryRouter><IndicadoresDeSaldo recursos={montarRecursosReservados(saldo, [])} depoisDoLivre={<p>Sai/semana R$ 5.844,09</p>} /></MemoryRouter>); });
    return alvo;
  }
  it("o que vem em depoisDoLivre aparece ao lado do Saldo livre", () => {
    const el = montarComSai(1000);
    expect(el.textContent).toContain("Sai/semana R$ 5.844,09");
  });
  it("Saldo nas contas e Reservado ficam escondidos (só no celular, por classe) até 'Ver detalhamento'", () => {
    const el = montarComSai(1000);
    const contas = el.querySelector("[data-saldo-contas]")!.parentElement as HTMLElement;
    const reservado = el.querySelector("button[aria-label^='Reservado']") as HTMLElement;
    expect(contas.className).toContain("max-sm:hidden");
    expect(reservado.className).toContain("max-sm:hidden");
    const alternar = el.querySelector("[data-ver-detalhamento]") as HTMLButtonElement;
    expect(alternar.textContent).toBe("Detalhar →");
    expect(alternar.className).toContain("sm:hidden");   // no computador o botão nem existe
    act(() => { alternar.click(); });
    expect(contas.className).not.toContain("max-sm:hidden");
    expect(reservado.className).not.toContain("max-sm:hidden");
    expect(alternar.textContent).toBe("Ocultar");
  });
  it("no computador os três continuam à mostra: nenhuma classe esconde sem o prefixo do celular", () => {
    const el = montarComSai(1000);
    const livre = [...el.querySelectorAll("p")].find(p => p.textContent === "Saldo livre")!.parentElement as HTMLElement;
    expect(livre.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });
});
