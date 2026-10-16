// O diálogo "Pagar" (Mesa de Operações / Agenda): UM painel de liquidação, estável. Regressão de 15/10/2026: o painel e o DataDoPagamento eram irmãos com a MESMA `key`
// (`confirmando.id`); o React duplicava/remontava os filhos a cada renderização, o painel chamava `onPlano` ao montar, o pai renderizava de novo… e o diálogo crescia sem fim
// em TODA despesa (avulsa, recorrente, parcela, obrigação fiscal), porque a chave vinha do id da despesa, qualquer que ela fosse.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/integrations/supabase/client", () => {
  const cadeia: any = new Proxy(function () {}, { get: (_t, p) => (p === "then" ? undefined : cadeia), apply: () => cadeia });
  return { supabase: cadeia, supabaseRel: cadeia };
});
const emAberto = [2, 3, 4].map(n => ({ id: `p${n}`, valor: 250, vencimento: `2026-${String(9 + n).padStart(2, "0")}-10`, descricao: `Parcela ${n}/4` }));
vi.mock("@/services/finService", () => ({
  brl: (n: number) => String(n), confirmarPagamento: vi.fn(), buscarFornecedor: async () => ({ id: "f1", nome: "Fornecedor X", chave_pix: null, tipo_chave_pix: null }),
  adicionarAnexo: vi.fn(), pessoaDoLancamento: async () => null, buscarPixDaPessoa: async () => null, salvarPixDaPessoa: vi.fn(),
  fornecedoresParaNome: async () => [], atualizarLancamento: vi.fn(), listarContas: async () => [],
}));
vi.mock("@/services/documentoPagamentoService", () => ({ dadosParaPagarDoLancamento: async () => [] }));
vi.mock("@/services/liquidacaoService", () => ({ liquidacaoDisponivel: async () => true, liquidar: vi.fn(), documentosEmAbertoDoFavorecido: async () => emAberto }));
vi.mock("@/services/quitacaoService", () => ({ quitacaoDisponivel: async () => false, quitacaoDaObrigacao: async () => null }));
vi.mock("@/services/comprovanteService", async (orig) => ({ ...(await orig<object>()), comprovanteJaAnexado: async () => null, auditoriaDaDataDisponivel: async () => false }));
vi.mock("@/components/financas/QuitacaoDialog", () => ({ QuitacaoDialog: () => null }));

import { useAcoesLancamento } from "./useAcoesLancamento";

let raiz: Root | null = null;
let erros: string[] = [];
beforeEach(() => {
  erros = [];
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.restoreAllMocks(); });

function Tela({ venc }: { venc: unknown }) {
  const acoes = useAcoesLancamento(async () => {});
  return <div><button id="pagar" onClick={() => acoes.pagar(venc as never)}>Pagar</button>{acoes.dialogs}</div>;
}
const base = {
  id: "p1", data: "2026-09-10", tipo: "saida", status: "previsto", valor: 37.96, descricao: "Conta de luz", conta_id: "c1", conta_nome: "Bradesco", fornecedor_id: "f1", fornecedor_nome: "Fornecedor X",
  categoria_id: null, categoria_nome: null, categoria_cor: null, dias_para_vencer: -5, urgencia: "vencido", projeto_id: null, projeto_nome: null, centro_custo_id: null, centro_custo_nome: null,
};

async function abrirPagar(venc: unknown) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter><Tela venc={venc} /></MemoryRouter>); });
  await act(async () => { (document.getElementById("pagar") as HTMLButtonElement).click(); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 30)); });
}
const texto = (t: string) => (document.body.textContent!.match(new RegExp(t, "g")) ?? []).length;

describe("Pagar — o painel de liquidação aparece UMA vez e fica quieto", () => {
  for (const [nome, venc] of [
    ["despesa avulsa com favorecido", base],
    ["despesa sem favorecido", { ...base, fornecedor_id: null, fornecedor_nome: null }],
    ["parcela de recorrência", { ...base, descricao: "Aluguel · parcela 1/4", valor: 250 }],
    ["obrigação fiscal (valor com centavos)", { ...base, descricao: "DARF", valor: 1320.9 }],
  ] as const) {
    it(nome, async () => {
      await abrirPagar(venc);
      expect(document.querySelectorAll("#liq-valor-pago")).toHaveLength(1);
      expect(texto("Valor do documento")).toBe(1);
      expect(document.getElementById("liq-valor-pago")).toBeTruthy();
      expect(erros.filter(e => /same key|Maximum update depth/i.test(e))).toEqual([]);
    });
  }

  it("com favorecido, o botão 'Incluir outro documento' aparece uma vez; incluir uma parcela soma o valor e mantém UM painel", async () => {
    await abrirPagar({ ...base, valor: 250 });
    expect(texto("Incluir outro documento neste pagamento")).toBe(1);
    const abrir = [...document.querySelectorAll("button")].find(b => /Incluir outro documento/.test(b.textContent ?? ""))!;
    await act(async () => { abrir.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    const parcela = [...document.querySelectorAll("button")].find(b => /Parcela 2\/4/.test(b.textContent ?? ""))!;
    await act(async () => { parcela.click(); });
    expect(document.querySelectorAll("#liq-valor-pago")).toHaveLength(1);
    expect((document.getElementById("liq-valor-pago") as HTMLInputElement).value).toBe("500");
    expect(texto("Parcela 2/4")).toBe(1);
  });

  it("fechar e abrir de novo (outra despesa) continua com UM painel", async () => {
    await abrirPagar(base);
    expect(document.querySelectorAll("#liq-valor-pago")).toHaveLength(1);
    await act(async () => { (document.getElementById("pagar") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(document.querySelectorAll("#liq-valor-pago")).toHaveLength(1);
  });
});

describe("chaves do diálogo Pagar (guarda estática, falha rápido)", () => {
  it("o painel e o DataDoPagamento são irmãos: nunca podem ter a mesma `key`", async () => {
    const fonte = (await import("node:fs")).readFileSync("src/hooks/useAcoesLancamento.tsx", "utf8");
    const chaves = [...fonte.matchAll(/<(LiquidacaoPainel|DataDoPagamento)\s+key=\{([^}]+)\}/g)].map(m => m[2]);
    expect(chaves).toHaveLength(2);
    expect(new Set(chaves).size).toBe(2);
  });
});
