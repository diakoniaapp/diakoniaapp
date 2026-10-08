import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { BeneficiarioComCompetencias, CompetenciaDoSustento, ResultadoDoSustento } from "@/services/sustentoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resultado: ResultadoDoSustento;
vi.mock("@/services/sustentoService", () => ({ carregarSustento: async () => resultado }));
import Sustento from "./Sustento";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; });

async function montar() {
  alvo = document.createElement("div");
  document.body.appendChild(alvo);
  raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter><Sustento /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
  return alvo;
}

const base = {
  adiantamentos: 0, pagamentosFinais: 0, complementos: 0, pagamentosSimples: 0, nItens: 0, valorPrevisto: null, confirmadaEm: null,
  fechadaEm: null, rspUrl: null, obrigacaoId: null, sustento: 0, outrosProventos: 0, proventos: 0, irrf: 0, outrosDescontos: 0,
  descontos: 0, rubricas: [], pagamentos: [],
};
const comp = (o: Partial<CompetenciaDoSustento>): CompetenciaDoSustento => ({
  id: "c" + Math.random(), beneficiarioId: "b1", competencia: "2026-09-01", status: "fechada", modo: "avancado", liquidoPrevisto: 0, saldoAPagar: 0, ...base, ...o,
});
const benef = (o: Partial<BeneficiarioComCompetencias>): BeneficiarioComCompetencias => ({
  id: "b1", tipo: "pastor_titular", nomeExibicao: "Pastor Titular", modo: "avancado", modoManual: null, modoManualDesde: null,
  modoManualMotivo: null, diaDoLiquido: 5, observacoes: null, competencias: [], ...o,
});

describe("Conta Corrente de Sustento — tela de leitura", () => {
  it("migration pendente: explica em vez de mostrar erro cru", async () => {
    resultado = { pronto: false, beneficiarios: [], motivo: "migration_pendente", mensagem: "x" };
    const el = await montar();
    expect(el.textContent).toContain("ainda não foi ativada no banco");
    expect(el.textContent).toContain("20261008170000_sustento_conta_corrente");
  });

  it("avançado: o RSP de setembro do Pastor Titular fecha em R$ 5.728,00 a pagar", async () => {
    resultado = {
      pronto: true,
      beneficiarios: [benef({
        competencias: [
          comp({
            competencia: "2026-09-01", sustento: 17451.84, outrosProventos: 0.48, proventos: 17452.32, irrf: 3723.55, outrosDescontos: 0.77,
            descontos: 3724.32, liquidoPrevisto: 13728, adiantamentos: 8000, saldoAPagar: 5728, nItens: 5,
            pagamentos: [
              { id: "p1", lancamentoId: "l1", tipo: "adiantamento", data: "2026-09-09", valor: 4000, descricao: null, status: "conciliado" },
              { id: "p2", lancamentoId: "l2", tipo: "adiantamento", data: "2026-09-15", valor: 4000, descricao: null, status: "conciliado" },
            ],
          }),
          comp({ competencia: "2026-08-01", status: "paga", liquidoPrevisto: 3428, pagamentosFinais: 3429, adiantamentos: 10300, saldoAPagar: -10301 }),
        ],
      })],
    };
    const el = await montar();
    const txt = () => el.textContent!.replace(/\s/g, " ");
    expect(txt()).toContain("Visão avançada");
    expect(txt()).toContain("setembro/2026");
    expect(txt()).toContain("A pagar");
    // o cartão de resumo
    expect(txt()).toMatch(/Saldo a pagar\s*R\$\s*5\.728,00/);
    // abre setembro: a apuração e os dois PIX
    const botao = [...el.querySelectorAll("button")].find((b) => b.textContent!.includes("setembro/2026"))!;
    await act(async () => { botao.click(); });
    expect(txt()).toContain("Apuração do RSP");
    expect(txt()).toContain("3.723,55");
    expect(txt()).toContain("09/09/2026".slice(0, 5));
    expect(txt()).toMatch(/Adiantamento.*4\.000,00/);
  });

  it("simples: previsto, pago e saldo; a regra do dia 20 responde na própria tela", async () => {
    resultado = {
      pronto: true,
      beneficiarios: [benef({
        id: "b2", tipo: "pastor_missionario", nomeExibicao: "Pastor Missionário", modo: "simples",
        competencias: [comp({ beneficiarioId: "b2", competencia: "2026-08-01", status: "aberta", modo: "simples", liquidoPrevisto: 2362, saldoAPagar: 2362 })],
      })],
    };
    const el = await montar();
    expect(el.textContent).toContain("Visão simples");
    expect(el.textContent).toContain("Prevista");
    // com agosto em aberto, uma data de setembro cai em agosto
    const campo = el.querySelector('input[type="date"]') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(campo, "2026-09-01");
    await act(async () => { campo.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(el.textContent).toContain("agosto/2026");
    expect(el.textContent).toContain("competência mais antiga em aberto");
  });
});
