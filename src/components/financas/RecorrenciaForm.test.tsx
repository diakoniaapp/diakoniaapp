// Editar uma recorrência (auditoria da Tesouraria, 27/10/2026, F-01 e F-04): a conta, a categoria e o centro que já estavam gravados têm de aparecer e SER salvos mesmo na primeira abertura da página, quando as
// listas ainda estão carregando (o autocorretor do Radix zerava o campo: "Selecione a conta" ao salvar). E a tela não promete lembretes que nenhum código cumpre.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const atualizarRecorrencia = vi.fn(async () => {});
const erro = vi.fn();
vi.mock("@/services/finService", () => ({
  // as listas chegam DEPOIS da abertura, como na primeira edição da página
  listarContas: async () => { await new Promise(r => setTimeout(r, 15)); return [{ id: "c1", nome: "Bradesco", ativo: true }, { id: "c2", nome: "Caixinha Administrativa", ativo: true }]; },
  listarCategorias: async () => { await new Promise(r => setTimeout(r, 15)); return [{ id: "k1", nome: "Energia Elétrica" }]; },
  listarCentrosCusto: async () => { await new Promise(r => setTimeout(r, 15)); return [{ id: "e1", nome: "Administração" }]; },
  listarFornecedores: async () => [], criarRecorrencia: async () => ({ id: "n" }), atualizarRecorrencia: (...a: unknown[]) => (atualizarRecorrencia as any)(...a),
  listarRecorrencias: async () => [], ordenarCentrosParaSeletor: (cs: any[]) => cs.map(c => ({ centro: c, rotulo: c.nome, indentado: false })),
  propagarLiquidacaoParaPrevistos: async () => 0, erroDaLiquidacao: () => "x", sugerirCentroPorCategoria: async () => null, FREQUENCIA_LABEL: { mensal: "Mensal" },
}));
vi.mock("@/services/recorrenciaService", () => ({
  avisoDeJaPagas: () => null, erroDaRecorrencia: () => "", gerarOcorrencias: async () => ({ criados: 0, jaPagas: [] }), parametrosDaRecorrencia: (r: any) => r,
  propagarModelo: async () => 0, redatarPrevistosDaRecorrencia: async () => 0,
}));
vi.mock("@/components/financas/SeletorFavorecido", () => ({ SeletorFavorecido: () => null }));
vi.mock("@/components/CampoData", () => ({ CampoData: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (...a: unknown[]) => erro(...a), warning: vi.fn(), info: vi.fn() } }));

import { RecorrenciaForm } from "./RecorrenciaForm";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; atualizarRecorrencia.mockClear(); erro.mockClear(); });

const rec = (conta_id: string) => ({
  id: "r1", tipo: "saida", descricao: "Light", valor: 100, valor_variavel: false, forma_liquidacao: "manual", conta_id, categoria_id: "k1", centro_custo_id: "e1", fornecedor_id: "f1", fornecedor_nome: "Light", pessoa_id: null,
  tipo_recorrencia: "continua", total_parcelas: null, parcela_inicial: 1, frequencia: "mensal", dia_vencimento: 10, data_inicio: "2026-01-10", data_fim: null, observacao: null, lembrar_5d: true, lembrar_1d: true, lembrar_dia: false, ativo: true,
});

async function abrir(r: any) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<RecorrenciaForm open onOpenChange={() => {}} recorrencia={r} onSaved={() => {}} />); });
  await act(async () => { await new Promise(res => setTimeout(res, 120)); });
}
const triggers = () => Array.from(document.querySelectorAll('button[role="combobox"]')).map(b => b.textContent ?? "");
async function salvar() {
  const f = document.querySelector("form")!;
  await act(async () => { f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise(res => setTimeout(res, 30)); });
}

describe("Editar recorrência — a primeira abertura da página (listas ainda carregando)", () => {
  it("mostra a conta, a categoria e o centro que já estavam gravados", async () => {
    await abrir(rec("c1"));
    const t = triggers().join(" | ");
    expect(t).toContain("Bradesco");
    expect(t).toContain("Energia Elétrica");
    expect(t).toContain("Administração");
  });

  it("salvar sem mexer na conta grava a MESMA conta (antes: 'Selecione a conta')", async () => {
    await abrir(rec("c2"));
    await salvar();
    expect(erro).not.toHaveBeenCalledWith("Selecione a conta");
    expect(atualizarRecorrencia).toHaveBeenCalledTimes(1);
    const [id, payload] = (atualizarRecorrencia.mock.calls[0] as unknown) as [string, Record<string, unknown>];
    expect(id).toBe("r1");
    expect(payload).toMatchObject({ conta_id: "c2", categoria_id: "k1", centro_custo_id: "e1" });
  });

  it("os valores gravados dos lembretes seguem no pacote, mesmo sem a tela de lembretes", async () => {
    await abrir(rec("c1"));
    await salvar();
    const payload = ((atualizarRecorrencia.mock.calls[0] as unknown) as [string, Record<string, unknown>])[1];
    expect(payload).toMatchObject({ lembrar_5d: true, lembrar_1d: true, lembrar_dia: false });
  });

  it("a tela NÃO promete lembretes que ninguém cumpre", async () => {
    await abrir(rec("c1"));
    expect(document.body.textContent).not.toMatch(/Lembrar antes do vencimento|5 dias antes|1 dia antes/);
  });
});
