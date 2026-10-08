import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { BeneficiarioComCompetencias, CompetenciaDoSustento, ResultadoDoSustento } from "@/services/sustentoService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resultado: ResultadoDoSustento;
const definir = vi.fn(async () => ({ ok: true }));
const definirTipo = vi.fn(async () => ({ ok: true }));
const desligar = vi.fn(async () => ({ ok: true }));
vi.mock("@/services/sustentoService", () => ({
  carregarSustento: async () => resultado,
  definirControlePorCompetencia: (...a: unknown[]) => (definir as any)(...a),
  definirTipoDeControle: (...a: unknown[]) => (definirTipo as any)(...a),
  desligarPagamento: (...a: unknown[]) => (desligar as any)(...a),
  // a seção "Pagamentos a classificar" tem os seus próprios testes (PagamentosAClassificar.test.tsx); aqui não há pagamento solto
  pagamentosSoltosDoBeneficiario: async () => [],
  buscarPagamentosSoltos: async () => [],
  ligarPagamento: async () => ({ ok: true }),
  abrirCompetencia: async () => ({ ok: true, id: "nova" }),
}));
import Sustento from "./Sustento";

let raiz: Root | null = null;
let alvo: HTMLDivElement | null = null;
afterEach(() => { act(() => raiz?.unmount()); alvo?.remove(); raiz = null; alvo = null; definir.mockClear(); definirTipo.mockClear(); desligar.mockClear(); });

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
  id: "b1", tipo: "pastor_titular", nomeExibicao: "Pastor Titular", pessoaId: "p1", fornecedorId: null, controleCompetencia: true, tipoControle: "automatico", diaDoLiquido: 5, observacoes: null,
  competencias: [], alteracoes: [], ...o,
});

const titular = () => benef({
  competencias: [
    comp({
      competencia: "2026-09-01", sustento: 17451.84, outrosProventos: 0.48, proventos: 17452.32, irrf: 3723.55, outrosDescontos: 0.77,
      descontos: 3724.32, liquidoPrevisto: 13728, adiantamentos: 8000, saldoAPagar: 5728, nItens: 5,
      pagamentos: [
        { id: "p1", lancamentoId: "l1", tipo: "adiantamento", data: "2026-09-09", valor: 4000, descricao: null, status: "conciliado" },
        { id: "p2", lancamentoId: "l2", tipo: "adiantamento", data: "2026-09-15", valor: 4000, descricao: null, status: "conciliado" },
      ],
    }),
    comp({ competencia: "2026-08-01", status: "paga", liquidoPrevisto: 13728, pagamentosFinais: 3429, adiantamentos: 10300, saldoAPagar: -1 }),
  ],
});
const missionario = () => benef({ id: "b2", tipo: "pastor_missionario", nomeExibicao: "Pastor Missionário", controleCompetencia: false });

const relogio = (iso: string) => iso;
const clicar = (el: Element) => act(async () => { (el as HTMLElement).click(); });

describe("Conta Corrente de Sustento — tela", () => {
  it("migration pendente: explica em vez de mostrar erro cru", async () => {
    resultado = { pronto: false, beneficiarios: [], motivo: "migration_pendente", mensagem: "x" };
    const el = await montar();
    expect(el.textContent).toContain("ainda não foi ativada no banco");
    expect(el.textContent).toContain("20261008170000_sustento_conta_corrente");
  });

  it("controle ligado: o RSP de setembro do Pastor Titular fecha em R$ 5.728,00 a pagar", async () => {
    resultado = { pronto: true, beneficiarios: [titular()] };
    const el = await montar();
    const txt = () => el.textContent!.replace(/\s/g, " ");
    expect(txt()).toContain("Utilizar Conta Corrente de Sustento");
    expect(txt()).toContain("setembro/2026");
    expect(txt()).toContain("A pagar");
    expect(txt()).toMatch(/Saldo a pagar\s*R\$\s*5\.728,00/);
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent!.includes("setembro/2026"))!);
    expect(txt()).toContain("Apuração do RSP");
    expect(txt()).toContain("3.723,55");
    expect(txt()).toMatch(/Adiantamento.*4\.000,00/);
  });

  it("controle desligado: sem saldo, sem competências e sem a regra do dia 20 — só a chave", async () => {
    resultado = { pronto: true, beneficiarios: [missionario()] };
    const el = await montar();
    expect(el.textContent).toContain("Não utilizar");
    expect(el.textContent).not.toContain("Saldo a pagar");
    expect(el.textContent).not.toContain("Onde cairia um pagamento?");
    expect(el.querySelector('input[type="date"]')).toBeNull();
    expect(el.querySelector("ul[aria-label='Competências']")).toBeNull();
  });

  it("ligar a chave grava e recarrega", async () => {
    resultado = { pronto: true, beneficiarios: [missionario()] };
    const el = await montar();
    await clicar(el.querySelector('button[role="switch"]')!);
    expect(definir).toHaveBeenCalledWith("b2", true);
  });

  it("Tipo de controle: Automático por padrão, e a tela diz o que vale para as próximas competências e por quê", async () => {
    resultado = { pronto: true, beneficiarios: [titular()] };
    const el = await montar();
    const txt = el.textContent!.replace(/\s/g, " ");
    expect(txt).toContain("Tipo de controle");
    for (const rotulo of ["Automático", "Simples", "Avançado"]) expect(txt).toContain(rotulo);
    const vigente = el.querySelector('[data-testid="modo-vigente"]')!.textContent!;
    expect(vigente).toContain("Avançado");
    expect(vigente).toContain("automático");
    expect(vigente).toContain("2 das últimas 2");
    expect(txt).toContain("não reinterpreta nem recalcula competências antigas");
  });

  it("escolher Simples grava o tipo de controle, sem tocar nas competências", async () => {
    resultado = { pronto: true, beneficiarios: [titular()] };
    const el = await montar();
    await clicar(el.querySelector('button[role="radio"][value="simples"]')!);
    expect(definirTipo).toHaveBeenCalledWith("b1", "simples");
    expect(definir).not.toHaveBeenCalled();
  });

  it("com Simples fixo, o vigente vale Simples mesmo com histórico avançado; as competências antigas continuam Avançadas", async () => {
    resultado = { pronto: true, beneficiarios: [{ ...titular(), tipoControle: "simples" }] };
    const el = await montar();
    expect(el.querySelector('[data-testid="modo-vigente"]')!.textContent).toContain("Simples");
    expect(el.querySelector('[data-testid="modo-vigente"]')!.textContent).toContain("definido pela igreja");
    expect(el.textContent).toContain("· Avançado");
  });

  it("mostra quem alterou e quando", async () => {
    resultado = { pronto: true, beneficiarios: [{ ...titular(), alteracoes: [{
      id: "a1", controleAnterior: true, controleNovo: true, tipoControleAnterior: "automatico", tipoControleNovo: "simples",
      alteradoPorNome: "Telma Rodrigues", alteradoEm: "2026-10-08T15:30:00Z",
    }] }] };
    const el = await montar();
    const txt = el.textContent!;
    expect(txt).toContain("Última alteração");
    expect(txt).toContain("08/10/2026");
    expect(txt).toContain("por Telma Rodrigues");
    expect(txt).toContain("Automático → Simples");
  });

  it("desligado: não mostra tipo de controle", async () => {
    resultado = { pronto: true, beneficiarios: [missionario()] };
    const el = await montar();
    expect(el.textContent).not.toContain("Tipo de controle");
  });

  it("competência simples mostra só o valor previsto, nunca a apuração do RSP", async () => {
    resultado = { pronto: true, beneficiarios: [benef({ id: "b3", tipo: "pam", nomeExibicao: "PAM", tipoControle: "simples",
      competencias: [comp({ beneficiarioId: "b3", modo: "simples", status: "fechada", liquidoPrevisto: 500, saldoAPagar: 200, pagamentosSimples: 300 })] })] };
    const el = await montar();
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent!.includes("setembro/2026"))!);
    expect(el.textContent).toContain("Valor previsto");
    expect(el.textContent).not.toContain("Apuração do RSP");
    expect(el.textContent).toContain("Paga parcialmente");
  });

  it("Fase 2: cada pagamento ligado tem \"Desligar\" (só com o controle ligado) e ele chama o serviço com o id da ligação", async () => {
    resultado = { pronto: true, beneficiarios: [titular()] };
    const el = await montar();
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent!.includes("setembro/2026"))!);
    const botoes = [...el.querySelectorAll("button")].filter((b) => b.textContent === "Desligar");
    expect(botoes).toHaveLength(2);
    await clicar(botoes[0]);
    expect(desligar).toHaveBeenCalledWith("p1");
  });

  it("Fase 2: sem o controle ligado não há Desligar nem 'Pagamentos a classificar'", async () => {
    resultado = { pronto: true, beneficiarios: [{ ...titular(), controleCompetencia: false }] };
    const el = await montar();
    expect(el.textContent).not.toContain("Pagamentos a classificar");
    await clicar([...el.querySelectorAll("button")].find((b) => b.textContent!.includes("setembro/2026"))!);
    expect([...el.querySelectorAll("button")].filter((b) => b.textContent === "Desligar")).toHaveLength(0);
  });

  it("desligar com saldo a pagar é recusado e não grava nada", async () => {
    resultado = { pronto: true, beneficiarios: [titular()] };
    const el = await montar();
    await clicar(el.querySelector('button[role="switch"]')!);
    expect(definir).not.toHaveBeenCalled();
  });

  it("com vários beneficiários: a aba do que não usa o controle diz isso, e a regra do dia 20 responde para quem usa", async () => {
    resultado = { pronto: true, beneficiarios: [titular(), missionario()] };
    const el = await montar();
    expect(el.textContent).toContain("sem controle");
    const campo = el.querySelector('input[type="date"]') as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(campo, "2026-09-25");
    await act(async () => { campo.dispatchEvent(new Event("input", { bubbles: true })); });
    // setembro está fechada com saldo → a mais antiga com saldo pendente, mesmo depois do dia 20
    expect(el.textContent).toContain("setembro/2026");
    expect(el.textContent).toContain("competência mais antiga em aberto");
  });
});
