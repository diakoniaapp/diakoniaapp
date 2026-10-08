import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BeneficiarioComCompetencias, CompetenciaDoSustento, PagamentoSolto } from "@/services/sustentoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const aoMudar = vi.fn();
let soltos: PagamentoSolto[] = [];
let achadosNaBusca: PagamentoSolto[] = [];
const ligar = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const abrir = vi.fn(async (..._a: unknown[]) => ({ ok: true, id: "c-nova" }));
const buscar = vi.fn(async (_t: string) => achadosNaBusca);
vi.mock("@/services/sustentoService", () => ({
  pagamentosSoltosDoBeneficiario: async () => soltos,
  buscarPagamentosSoltos: (t: string) => buscar(t),
  ligarPagamento: (...a: unknown[]) => ligar(...a),
  abrirCompetencia: (...a: unknown[]) => abrir(...a),
}));
import { PagamentosAClassificar } from "./PagamentosAClassificar";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; ligar.mockClear(); abrir.mockClear(); buscar.mockClear(); aoMudar.mockClear(); soltos = []; achadosNaBusca = []; });


async function montar(b: BeneficiarioComCompetencias) {
  alvo = document.createElement("div");
  document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<PagamentosAClassificar b={b} aoMudar={aoMudar} />); });
  await act(async () => { await Promise.resolve(); });
  return alvo;
}

const base = {
  adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, nItens: 0, valorPrevisto: null, confirmadaEm: null,
  fechadaEm: null, rspUrl: null, obrigacaoId: null, sustento: 0, outrosProventos: 0, proventos: 0, irrf: 0, outrosDescontos: 0,
  descontos: 0, rubricas: [], pagamentos: [],
};
const comp = (id: string, o: Partial<CompetenciaDoSustento>): CompetenciaDoSustento => ({
  id, beneficiarioId: "b1", competencia: "2026-09-01", status: "fechada", modo: "avancado", liquidoPrevisto: 0, saldoAPagar: 0, ...base, ...o,
});
const benef = (competencias: CompetenciaDoSustento[], o: Partial<BeneficiarioComCompetencias> = {}): BeneficiarioComCompetencias => ({
  id: "b1", tipo: "pastor_titular", nomeExibicao: "Lucio Paulo Paz Barreto — Pastor Titular", pessoaId: "p1", fornecedorId: null,
  controleCompetencia: true, tipoControle: "automatico", diaDoLiquido: 5, observacoes: null, competencias, alteracoes: [], ...o,
});
const solto = (id: string, data: string, valor: number, descricao = "PIX ENVIADO DES: L cio Paulo Paz Barre"): PagamentoSolto =>
  ({ id, data, valor, descricao, status: "conciliado", origem: "importado_ofx", doBeneficiario: true });

// setembro fechada com R$ 5.728,00 a pagar; agosto paga
const setembroAPagar = () => [
  comp("c-set", { competencia: "2026-09-01", status: "fechada", liquidoPrevisto: 13728, adiantamentos: 8000, saldoAPagar: 5728, nItens: 4 }),
  comp("c-ago", { competencia: "2026-08-01", status: "paga", liquidoPrevisto: 13728, saldoAPagar: -1 }),
];
const clicar = (el: Element) => act(async () => { (el as HTMLElement).click(); });
async function escolher(sel: HTMLSelectElement, valor: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
  set.call(sel, valor);
  await act(async () => { sel.dispatchEvent(new Event("change", { bubbles: true })); });
}
const botaoLigar = (el: Element) => [...el.querySelectorAll("button")].find((b) => b.textContent!.startsWith("Lig"))!;

describe("Pagamentos a classificar — Fase 2", () => {
  it("sugere a competência com saldo a pagar e o tipo certo: PIX de 02/10 → setembro, pagamento final", async () => {
    soltos = [solto("l1", "2026-10-02", 5728)];
    const el = await montar(benef(setembroAPagar()));
    expect(el.textContent).toContain("02/10/2026");
    expect(el.textContent).toContain("competência mais antiga em aberto");
    const [selComp, selTipo] = [...el.querySelectorAll("select")] as HTMLSelectElement[];
    expect(selComp.value).toBe("c-set");
    expect(selTipo.value).toBe("pagamento_final");
    await clicar(botaoLigar(el));
    expect(ligar).toHaveBeenCalledWith({ competenciaId: "c-set", lancamentoId: "l1", tipo: "pagamento_final" });
    expect(abrir).not.toHaveBeenCalled();
    expect(aoMudar).toHaveBeenCalled();
  });

  it("sem saldo pendente e a competência do mês ainda não existe: oferece abri-la e liga como adiantamento (dia ≤ 20)", async () => {
    soltos = [solto("l2", "2026-10-15", 4000)];
    const quitada = [comp("c-set", { competencia: "2026-09-01", status: "paga", liquidoPrevisto: 13728, saldoAPagar: 0 })];
    const el = await montar(benef(quitada));
    const [selComp, selTipo] = [...el.querySelectorAll("select")] as HTMLSelectElement[];
    expect(selComp.value).toBe("novo:2026-10-01");
    expect(selComp.textContent).toContain("Abrir outubro/2026");
    expect(selTipo.value).toBe("adiantamento");
    await clicar(botaoLigar(el));
    expect(abrir).toHaveBeenCalledWith({ beneficiarioId: "b1", competencia: "2026-10-01", modo: "avancado" });
    expect(ligar).toHaveBeenCalledWith({ competenciaId: "c-nova", lancamentoId: "l2", tipo: "adiantamento" });
  });

  it("depois do dia 20 e sem saldo pendente, a sugestão é a competência seguinte", async () => {
    soltos = [solto("l3", "2026-10-25", 4000)];
    const quitada = [comp("c-set", { competencia: "2026-09-01", status: "paga", liquidoPrevisto: 13728, saldoAPagar: 0 })];
    const el = await montar(benef(quitada));
    const selComp = el.querySelector("select") as HTMLSelectElement;
    expect(selComp.value).toBe("novo:2026-11-01");
  });

  it("competência paga não aparece como destino; o tipo muda conforme a competência escolhida", async () => {
    soltos = [solto("l4", "2026-10-02", 1000)];
    const comps = [...setembroAPagar(), comp("c-out", { competencia: "2026-10-01", status: "aberta", liquidoPrevisto: 0, saldoAPagar: 0 })];
    const el = await montar(benef(comps));
    const [selComp, selTipo] = [...el.querySelectorAll("select")] as HTMLSelectElement[];
    const rotulos = [...selComp.options].map((o) => o.textContent);
    expect(rotulos.some((r) => r!.includes("agosto/2026"))).toBe(false);   // paga
    expect(selTipo.value).toBe("pagamento_final");                          // setembro (fechada)
    await escolher(selComp, "c-out");
    expect((el.querySelectorAll("select")[1] as HTMLSelectElement).value).toBe("adiantamento");   // outubro (aberta)
  });

  it("modo simples só oferece o tipo 'Pagamento'", async () => {
    soltos = [solto("l5", "2026-10-02", 2362)];
    const simples = [comp("c-set", { competencia: "2026-09-01", modo: "simples", status: "fechada", liquidoPrevisto: 2362, saldoAPagar: 2362 })];
    const el = await montar(benef(simples, { tipo: "pastor_missionario", tipoControle: "simples" }));
    const selTipo = el.querySelectorAll("select")[1] as HTMLSelectElement;
    expect([...selTipo.options].map((o) => o.textContent)).toEqual(["Pagamento"]);
    await clicar(botaoLigar(el));
    expect(ligar).toHaveBeenCalledWith({ competenciaId: "c-set", lancamentoId: "l5", tipo: "pagamento" });
  });

  it("pagamento antigo cuja competência sugerida já está paga: não decide por ela — pede a escolha e oferece abrir o mês anterior", async () => {
    soltos = [solto("l8", "2026-08-03", 2362)];   // o líquido de julho, pago em 03/08; agosto já está paga
    const el = await montar(benef(setembroAPagar()));
    const selComp = el.querySelector("select") as HTMLSelectElement;
    expect(selComp.value).toBe("");
    expect(el.textContent).toContain("agosto/2026 já está paga");
    expect([...selComp.options].map((o) => o.textContent)).toContain("Abrir julho/2026 (Avançado)");
    expect(botaoLigar(el).hasAttribute("disabled")).toBe(true);
    await escolher(selComp, "novo:2026-07-01");
    expect(botaoLigar(el).hasAttribute("disabled")).toBe(false);
    await clicar(botaoLigar(el));
    expect(abrir).toHaveBeenCalledWith({ beneficiarioId: "b1", competencia: "2026-07-01", modo: "avancado" });
    expect(ligar).toHaveBeenCalledWith({ competenciaId: "c-nova", lancamentoId: "l8", tipo: "adiantamento" });
  });

  it("erro ao ligar não recarrega nem some com o pagamento", async () => {
    soltos = [solto("l6", "2026-10-02", 5728)];
    ligar.mockResolvedValueOnce({ ok: false, erro: "Este pagamento já está ligado a uma competência." } as never);
    const el = await montar(benef(setembroAPagar()));
    await clicar(botaoLigar(el));
    expect(aoMudar).not.toHaveBeenCalled();
    expect(el.textContent).toContain("02/10/2026");
  });

  it("busca manual: acha o PIX que veio sem favorecido e o lista com a sugestão", async () => {
    soltos = [];
    achadosNaBusca = [{ ...solto("l7", "2026-09-30", 4000), doBeneficiario: false }];
    const el = await montar(benef(setembroAPagar()));
    expect(el.textContent).toContain("Nenhum pagamento pendente");
    const campo = el.querySelector('input[aria-label="Procurar outro pagamento"]') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(campo, "Paulo Paz");
    await act(async () => { campo.dispatchEvent(new Event("input", { bubbles: true })); });
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent === "Procurar")!);
    expect(buscar).toHaveBeenCalledWith("Paulo Paz");
    expect(el.textContent).toContain("30/09/2026");
    expect(el.textContent).not.toContain("Nenhum pagamento pendente");
  });
});
