import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { BeneficiarioComCompetencias, CompetenciaDoSustento, ObrigacaoCandidata } from "@/services/sustentoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let candidatas: ObrigacaoCandidata[] = [];
const ok = async (..._a: unknown[]) => ({ ok: true });
const adotar = vi.fn(ok);
const criar = vi.fn(ok);
const atualizar = vi.fn(ok);
const desvincular = vi.fn(ok);
vi.mock("@/services/sustentoService", () => ({
  obrigacoesCandidatas: async () => candidatas,
  adotarObrigacao: (...a: unknown[]) => adotar(...a),
  criarObrigacao: (...a: unknown[]) => criar(...a),
  atualizarValorDaObrigacao: (...a: unknown[]) => atualizar(...a),
  desvincularObrigacao: (...a: unknown[]) => desvincular(...a),
}));
import { ObrigacaoDaCompetencia } from "./ObrigacaoDaCompetencia";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
const aoMudar = vi.fn();
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; for (const f of [adotar, criar, atualizar, desvincular, aoMudar]) f.mockClear(); candidatas = []; });

async function montar(c: CompetenciaDoSustento) {
  alvo = document.createElement("div");
  document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<ObrigacaoDaCompetencia b={benef} c={c} aoMudar={aoMudar} />); });
  await act(async () => { await Promise.resolve(); });
  return alvo;
}

const base = {
  adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, nItens: 0, valorPrevisto: null, confirmadaEm: null,
  fechadaEm: null, rspUrl: null, obrigacaoId: null, sustento: 0, outrosProventos: 0, proventos: 0, irrf: 0, outrosDescontos: 0,
  descontos: 0, rubricas: [], pagamentos: [], obrigacao: null,
};
const comp = (o: Partial<CompetenciaDoSustento>): CompetenciaDoSustento => ({
  id: "c1", beneficiarioId: "b1", competencia: "2026-09-01", status: "fechada", modo: "avancado", liquidoPrevisto: 13728, saldoAPagar: 5728, ...base, ...o,
});
const benef: BeneficiarioComCompetencias = {
  id: "b1", tipo: "pastor_titular", nomeExibicao: "Lucio Paulo Paz Barreto — Pastor Titular", pessoaId: "p1", fornecedorId: null, contaId: "ct1",
  categoriaId: "cat1", centroCustoId: null, controleCompetencia: true, tipoControle: "automatico", diaDoLiquido: 5, observacoes: null, competencias: [], alteracoes: [],
};
const clicar = (el: Element) => act(async () => { (el as HTMLElement).click(); });
const botao = (el: Element, trecho: string) => [...el.querySelectorAll("button")].find((b) => b.textContent!.includes(trecho))!;

describe("Obrigação do saldo a pagar — Fase 2 (3/3)", () => {
  it("competência aberta não mostra nada (ainda não há saldo a cobrar)", async () => {
    const el = await montar(comp({ status: "aberta", saldoAPagar: 0, liquidoPrevisto: 0 }));
    expect(el.textContent).toBe("");
  });

  it("fechada com saldo e um previsto no mês seguinte: oferece ADOTAR, ajustando ao saldo", async () => {
    candidatas = [{ id: "l1", data: "2026-10-05", valor: 5728, descricao: "Lucio Paulo Paz Barreto", origem: "recorrencia" }];
    const el = await montar(comp({}));
    expect(el.textContent).toContain("Saldo a pagar de setembro/2026");
    expect(el.textContent).toContain("05/10/2026");
    await clicar(botao(el, "Adotar como obrigação"));
    expect(adotar).toHaveBeenCalledWith({ competenciaId: "c1", competencia: "2026-09-01", lancamentoId: "l1", valor: 5728 });
    expect(criar).not.toHaveBeenCalled();
    expect(aoMudar).toHaveBeenCalled();
  });

  it("sem previsto no mês seguinte: diz isso e permite CRIAR, com vencimento no dia habitual", async () => {
    candidatas = [];
    const el = await montar(comp({ competencia: "2026-09-01" }));
    expect(el.textContent).toContain("Nenhum previsto desta pessoa vence no mês seguinte");
    await clicar(botao(el, "Criar nova obrigação"));
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({
      competenciaId: "c1", competencia: "2026-09-01", valor: 5728, vencimento: "2026-10-05",
      descricao: "Sustento — Lucio Paulo Paz Barreto — setembro/2026",
    }));
  });

  it("com obrigação prevista de valor diferente do saldo: oferece atualizar", async () => {
    const el = await montar(comp({ obrigacao: { id: "l1", data: "2026-10-05", valor: 9728, status: "previsto" }, saldoAPagar: 5728 }));
    expect(el.textContent).toContain("vence 05/10/2026");
    await clicar(botao(el, "Atualizar para"));
    expect(atualizar).toHaveBeenCalledWith("l1", 5728);
  });

  it("com obrigação prevista do valor certo: não oferece atualizar, mas permite desvincular", async () => {
    const el = await montar(comp({ obrigacao: { id: "l1", data: "2026-10-05", valor: 5728, status: "previsto" } }));
    expect(botao(el, "Atualizar para")).toBeUndefined();
    await clicar(botao(el, "Desvincular"));
    expect(desvincular).toHaveBeenCalledWith("c1");
  });

  it("obrigação já paga: avisa que ela é o pagamento final e não oferece desvincular", async () => {
    const el = await montar(comp({ obrigacao: { id: "l1", data: "2026-10-05", valor: 5728, status: "conciliado" } }));
    expect(el.textContent).toContain("ela mesma é o pagamento final");
    expect(botao(el, "Desvincular")).toBeUndefined();
  });

  it("paga e sem obrigação: nada a fazer", async () => {
    const el = await montar(comp({ status: "paga", saldoAPagar: 0 }));
    expect(el.textContent).toBe("");
  });
});
