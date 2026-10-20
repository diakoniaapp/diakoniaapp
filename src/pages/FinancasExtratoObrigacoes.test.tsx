// A tela "Extrato de Obrigações" vista pelo que a pessoa lê: filtros, resumo, as 12 colunas, a quitada por terceiro sem movimentação e as três exportações.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linha = (o: Partial<LinhaDoExtrato> & { obrigacaoId: string }): LinhaDoExtrato => ({
  data: "2026-09-10", fornecedor: "Papelaria Central", documento: "NF 10", descricao: "Resmas de papel", categoria: "Material de Consumo", centro: "Ministério Pastoral", projeto: "",
  valor: 100, saldoEmAberto: 0, situacao: "paga", responsavel: "Igreja", intencao: "—", diasEmAtraso: null, idEmAberto: null, reembolsoAPagar: false, saldoAReembolsar: null, ...o,
});
let dados: LinhaDoExtrato[] = [];
const pedidos: { de: string; ate: string; fornecedorId?: string }[] = [];
const salvos: { blob: Blob; nome: string }[] = [];
const csvs: { nome: string; conteudo: string }[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nome: "Tesoureira Teste" } }) }) }) }) },
}));
let temPapel = true;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "t@x.com" }, hasRole: () => temPapel }) }));
// as ações por linha reaproveitam os fluxos da Mesa — aqui só importa que a linha CHAMA o fluxo certo, com o id certo
const chamadas: string[] = [];
vi.mock("@/hooks/useAcoesLancamento", () => ({ useAcoesLancamento: () => ({ pagar: (v: { id: string }) => { chamadas.push("pagar:" + v.id); }, dialogs: null }) }));
vi.mock("@/components/financas/DetalhesDoLancamento", () => ({ DetalhesDoLancamento: ({ lancamento }: { lancamento: { id: string } | null }) => lancamento ? <div data-testid="detalhe">{lancamento.id}</div> : null }));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: ({ open, lancamento }: { open: boolean; lancamento?: { id: string } | null }) => open ? <div data-testid="form">{lancamento?.id}</div> : null }));
vi.mock("@/components/financas/PagarReembolsoDialog", () => ({ PagarReembolsoDialog: ({ alvo }: { alvo: { obrigacaoId: string } | null }) => alvo ? <div data-testid="reembolso">{alvo.obrigacaoId}</div> : null }));
vi.mock("@/components/financas/DocumentacaoDaObrigacao", () => ({ DocumentacaoDaObrigacao: ({ lancamento }: { lancamento: { id: string } | null }) => lancamento ? <div data-testid="documentacao">{lancamento.id}</div> : null }));
vi.mock("@/components/financas/AnexosLancamentoDialog", () => ({ AnexosLancamentoDialog: () => null }));
vi.mock("@/components/financas/QuitacaoDialog", () => ({ QuitacaoDialog: ({ alvo }: { alvo: { id: string } | null }) => alvo ? <div data-testid="quitacao">{alvo.id}</div> : null }));
vi.mock("@/services/fechamentoMensalService", () => ({ buscarLancamentoParaEditar: async (id: string) => ({ id }) }));
vi.mock("@/services/quitacaoService", () => ({ quitacaoDaObrigacao: async (id: string) => ({ quitacaoId: "q-" + id, obrigacaoId: id }) }));
vi.mock("@/services/extratoDeObrigacoesService", () => ({ carregarExtratoDeObrigacoes: async (f: { de: string; ate: string; fornecedorId?: string }) => { pedidos.push(f); return dados; } }));
vi.mock("@/services/finService", () => ({
  brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  downloadCSV: (nome: string, conteudo: string) => { csvs.push({ nome, conteudo }); },
  listarFornecedores: async () => [{ id: "f1", nome: "Papelaria Central" }], listarCategoriasTodas: async () => [{ id: "c1", nome: "Material de Consumo", tipo: "saida" }],
  listarCentrosCustoTodas: async () => [{ id: "ce1", nome: "Ministério Pastoral" }], listarProjetosTodos: async () => [{ id: "pr1", nome: "Reforma" }],
  buscarVencimentoPorId: async (id: string) => (id === "ja-paga" ? null : { id }),
}));
vi.mock("file-saver", () => ({ saveAs: (blob: Blob, nome: string) => { salvos.push({ blob, nome }); } }));
vi.mock("@/components/CampoData", () => ({ CampoData: ({ value }: { value: string }) => <input aria-label="data" value={value} readOnly /> }));

import FinancasExtratoObrigacoes from "./FinancasExtratoObrigacoes";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; pedidos.length = 0; salvos.length = 0; csvs.length = 0; chamadas.length = 0; temPapel = true; });

async function abrir(url = "/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><FinancasExtratoObrigacoes /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const completo = () => {
  dados = [
    linha({ obrigacaoId: "a", situacao: "em_aberto", valor: 100, saldoEmAberto: 100, responsavel: "Ninguém ainda", diasEmAtraso: 12 }),
    linha({ obrigacaoId: "p", situacao: "paga", valor: 200, data: "2026-09-02" }),
    linha({ obrigacaoId: "r", situacao: "reembolso", valor: 300, responsavel: "Pessoa — Ana Souza", intencao: "Reembolso", data: "2026-09-03" }),
    linha({ obrigacaoId: "t", situacao: "quitada_por_terceiro", valor: 400, fornecedor: "Mercado Bom", responsavel: "Empresa — Mercado Bom", intencao: "Oferta", data: "2026-09-04" }),
    linha({ obrigacaoId: "c", situacao: "cancelada", valor: 999, responsavel: "—", data: "2026-09-05" }),
  ];
};
// o formatador do pt-BR usa espaço não separável depois do R$
const sn = (t: string | null) => (t ?? "").replace(/ /g, " ");
const botao = (el: HTMLElement, trecho: string) => [...el.querySelectorAll("button")].find(b => b.textContent!.includes(trecho)) as HTMLButtonElement;

describe("Extrato de Obrigações", () => {
  it("mostra as 12 colunas pedidas, na ordem", async () => {
    completo();
    const el = await abrir();
    const cabecalho = [...el.querySelectorAll("table thead th")].map(t => t.textContent);
    // as 12 do relatório + a coluna "Ações", que só existe na tela (no papel sai: .no-print)
    expect(cabecalho).toEqual(["Data", "Fornecedor", "Documento", "Descrição", "Categoria", "Centro de custo", "Projeto", "Valor", "Situação", "Responsável pela quitação", "Intenção", "Dias em atraso", "Ações"]);
    expect(el.querySelector("table thead th:last-child")!.className).toContain("no-print");
  });

  it("a obrigação quitada por terceiro aparece normalmente, com quem quitou e a intenção", async () => {
    completo();
    const el = await abrir();
    const tr = [...el.querySelectorAll("tbody tr")].find(t => t.textContent!.includes("Mercado Bom"))!;
    expect(tr.textContent).toContain("Quitada por terceiro");
    expect(tr.textContent).toContain("Empresa — Mercado Bom");
    expect(tr.textContent).toContain("Oferta");
    expect(el.querySelectorAll("tbody tr")).toHaveLength(5);
  });

  it("o resumo traz quantidade, valor total (sem canceladas), em aberto, pagas, reembolsos, quitadas por terceiros e canceladas", async () => {
    completo();
    const el = await abrir();
    const resumo = sn(el.querySelector("section[aria-label='Resumo']")!.textContent);
    for (const r of ["Obrigações", "Em aberto", "Pagas", "Reembolsos", "Quitadas por terceiros", "Canceladas"]) expect(resumo).toContain(r);
    expect(resumo).toContain("R$ 1.000,00");              // 100 + 200 + 300 + 400, sem os 999 da cancelada
    expect(sn(el.querySelector("tfoot")!.textContent)).toContain("R$ 1.000,00");
    expect(el.textContent).toContain("5");                 // as cinco obrigações contadas
  });

  it("a situação na URL filtra a lista e o resumo acompanha", async () => {
    completo();
    const el = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30&situacao=reembolso");
    expect(el.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(el.querySelector("tbody")!.textContent).toContain("Pessoa — Ana Souza");
    expect(sn(el.querySelector("section[aria-label='Resumo']")!.textContent)).toContain("R$ 300,00");
  });

  it("o período e os filtros da URL vão para a leitura", async () => {
    completo();
    await abrir("/financas/extrato-de-obrigacoes?inicio=2026-08-01&fim=2026-08-31&fornecedor=f1");
    expect(pedidos.at(-1)).toMatchObject({ de: "2026-08-01", ate: "2026-08-31", fornecedorId: "f1" });
  });

  it("sem obrigações, a tela diz isso (e as exportações ficam desligadas)", async () => {
    dados = [];
    const el = await abrir();
    expect(el.textContent).toContain("Nenhuma obrigação neste período");
    expect(botao(el, "CSV").disabled).toBe(true);
    expect(botao(el, "Excel").disabled).toBe(true);
  });

  it("tem os sete filtros pedidos: data inicial e final, situação, fornecedor, categoria, centro de custo e projeto", async () => {
    completo();
    const texto = (await abrir()).querySelector(".no-print")!.textContent!;
    for (const f of ["Data inicial", "Data final", "Situação", "Fornecedor", "Categoria", "Centro de custo", "Projeto"]) expect(texto).toContain(f);
  });

  it("exporta CSV (com o resumo), Excel (.xlsx) e abre o PDF pela impressão em paisagem", async () => {
    completo();
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    const el = await abrir();
    await act(async () => { botao(el, "CSV").click(); });
    expect(csvs).toHaveLength(1);
    expect(csvs[0].nome).toBe("QIBRJ_Extrato_de_Obrigacoes_2026-09-01_a_2026-09-30.csv");
    expect(csvs[0].conteudo).toContain("Mercado Bom");
    expect(csvs[0].conteudo).toContain("RESUMO;Quantidade;Valor");
    await act(async () => { botao(el, "Excel").click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(salvos).toHaveLength(1);
    expect(salvos[0].nome).toBe("QIBRJ_Extrato_de_Obrigacoes_2026-09-01_a_2026-09-30.xlsx");
    expect(salvos[0].blob.size).toBeGreaterThan(500);
    await act(async () => { botao(el, "PDF").click(); });
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect([...document.querySelectorAll("style")].map(s => s.textContent).join("\n")).toMatch(/size: A4 landscape/);
    imprimir.mockRestore();
  });
});

describe("ações por linha", () => {
  const rotulos = (el: HTMLElement, id: string) => [...el.querySelector(`tr[data-obrigacao='${id}']`)!.querySelectorAll("button")].map(b => b.textContent!.trim());
  const ações = () => {
    dados = [
      linha({ obrigacaoId: "aberta", fornecedor: "Light", situacao: "em_aberto", valor: 100, saldoEmAberto: 100, idEmAberto: "linha-aberta", diasEmAtraso: 12 }),
      linha({ obrigacaoId: "paga", fornecedor: "Papelaria", situacao: "paga" }),
      linha({ obrigacaoId: "terceiro", fornecedor: "Mercado Bom", situacao: "quitada_por_terceiro", responsavel: "Empresa — Mercado Bom", intencao: "Oferta" }),
      linha({ obrigacaoId: "reemb-pagar", fornecedor: "Leandro Dias", situacao: "reembolso", reembolsoAPagar: true, idEmAberto: "linha-reemb", saldoAReembolsar: 1500 }),
      linha({ obrigacaoId: "reemb-pago", fornecedor: "Ilumishop", situacao: "reembolso" }),
      linha({ obrigacaoId: "cancelada", fornecedor: "Gráfica", situacao: "cancelada" }),
    ];
  };

  it("cada situação mostra só as ações que lhe cabem (e quitada por terceiro nunca tem Pagar agora)", async () => {
    ações();
    const el = await abrir();
    // a ordem pedida: Visualizar · Editar · Pagar agora · Documentação (e Corrigir quitação por último)
    expect(rotulos(el, "aberta")).toEqual(["Visualizar", "Editar", "Pagar agora", "Documentação"]);
    expect(rotulos(el, "paga")).toEqual(["Visualizar", "Documentação"]);
    expect(rotulos(el, "terceiro")).toEqual(["Visualizar", "Documentação", "Corrigir quitação"]);
    expect(rotulos(el, "reemb-pagar")).toEqual(["Visualizar", "Pagar reembolso", "Documentação", "Corrigir quitação"]);
    expect(rotulos(el, "reemb-pago")).toEqual(["Visualizar", "Documentação", "Corrigir quitação"]);
    expect(rotulos(el, "cancelada")).toEqual(["Visualizar", "Documentação"]);
  });

  it("quem não opera o dinheiro só consulta: Visualizar e Documentação (conferir documento não depende de poder pagar)", async () => {
    ações(); temPapel = false;
    const el = await abrir();
    expect([...el.querySelectorAll("tbody button")].map(b => b.textContent!.trim()).every(t => t === "Visualizar" || t === "Documentação")).toBe(true);
  });

  it("Documentação abre o painel com TODOS os documentos da obrigação — inclusive na quitada por terceiro e na cancelada", async () => {
    ações();
    const el = await abrir();
    for (const [nome, id] of [["Mercado Bom", "terceiro"], ["Gráfica", "cancelada"], ["Light", "aberta"]] as const) {
      const tr = [...el.querySelectorAll("tbody tr")].find(t => t.textContent!.includes(nome))!;
      await act(async () => { ([...tr.querySelectorAll("button")].find(b => b.textContent!.includes("Documentação")) as HTMLButtonElement).click(); });
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
      expect(el.ownerDocument.querySelector("[data-testid=documentacao]")!.textContent, nome).toBe(id);
    }
  });

  it("Pagar agora busca o vencimento da LINHA EM ABERTO e abre o fluxo de pagamento de sempre", async () => {
    ações();
    const el = await abrir();
    const tr = [...el.querySelectorAll("tbody tr")].find(t => t.textContent!.includes("Light"))!;
    await act(async () => { ([...tr.querySelectorAll("button")].find(b => b.textContent!.includes("Pagar agora")) as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(chamadas).toEqual(["pagar:linha-aberta"]);
  });

  it("Pagar reembolso abre o pagamento do REEMBOLSO (e não o pagamento ao fornecedor)", async () => {
    ações();
    const el = await abrir();
    const tr = [...el.querySelectorAll("tbody tr")].find(t => t.textContent!.includes("Leandro Dias"))!;
    await act(async () => { ([...tr.querySelectorAll("button")].find(b => b.textContent!.includes("Pagar reembolso")) as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(el.querySelector("[data-testid=reembolso]")!.textContent).toBe("reemb-pagar");
    expect(chamadas).toEqual([]);
  });

  it("Editar abre o formulário da linha em aberto; Visualizar abre o detalhe da obrigação; Corrigir quitação abre a quitação", async () => {
    ações();
    const el = await abrir();
    const clicar = async (nome: string, botaoTexto: string) => {
      const tr = [...el.querySelectorAll("tbody tr")].find(t => t.textContent!.includes(nome))!;
      await act(async () => { ([...tr.querySelectorAll("button")].find(b => b.textContent!.includes(botaoTexto)) as HTMLButtonElement).click(); });
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    };
    await clicar("Light", "Editar");
    expect(el.ownerDocument.querySelector("[data-testid=form]")!.textContent).toBe("linha-aberta");
    await clicar("Papelaria", "Visualizar");
    expect(el.ownerDocument.querySelector("[data-testid=detalhe]")!.textContent).toBe("paga");
    await clicar("Mercado Bom", "Corrigir quitação");
    expect(el.ownerDocument.querySelector("[data-testid=quitacao]")!.textContent).toBe("terceiro");
  });

  it("as ações NÃO saem no papel (a coluna e os diálogos ficam em .no-print)", async () => {
    ações();
    const el = await abrir();
    expect(el.querySelector("tbody tr td:last-child")!.className).toContain("no-print");
  });
});
