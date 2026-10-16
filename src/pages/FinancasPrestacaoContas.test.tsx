// A página da Prestação de Contas depois das melhorias de 15/10/2026: a ORDEM do documento, os destaques e a seção nova, vistos pelo que a pessoa lê.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cat = (id: string, nome: string, tipo: string, classificacao_dre: string | null) => ({ id, nome, tipo, classificacao_dre, ativo: true });
const categorias = [
  cat("c-diz", "Dizimos", "entrada", "receitas_regulares"), cat("c-tar", "Tarifas Bancárias", "saida", "despesas_financeiras"),
  cat("c-pre", "Ofertas à Preletores", "saida", "despesas"), cat("c-mat", "Material de Consumo", "saida", "despesas"),
];
let seq = 0;
const l = (o: Record<string, unknown>) => ({ id: `l${++seq}`, status: "realizado", origem: "manual", centro_custo_id: null, pessoa_nome: null, descricao: null, conta_nome: "Bradesco", categoria_nome: null, centro_nome: null, ...o });
let lancamentos: ReturnType<typeof l>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: async () => ({ data: 0, error: null }), from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { nome: "Tesoureira Teste" } }) }) }) }) },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "t@x.com" }, hasRole: () => false }) }));
vi.mock("@/services/finService", () => ({
  brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), downloadCSV: vi.fn(),
  listarContas: async () => [{ id: "b1", nome: "Bradesco", saldo_inicial: 1000 }],
  listarLancamentosSemTeto: async () => lancamentos, listarCategoriasTodas: async () => categorias, listarCentrosCusto: async () => [{ id: "ce-pas", nome: "Min. Pastoral", vinculo_tipo: "ministerio", centro_pai_id: null }],
  nomeExtrato: (x: { descricao?: string | null }) => ({ principal: x.descricao ?? "—", secundario: null }),
}));
vi.mock("@/services/relatorioNotasService", () => ({ listarNotasDoPeriodo: async () => [] }));
vi.mock("@/services/fechamentoPeriodoService", () => ({ buscarFechamento: async () => null, fecharPeriodo: vi.fn(), aprovarPeriodo: vi.fn(), reabrirPeriodo: vi.fn() }));
vi.mock("@/components/financas/EncargosDoPeriodo", () => ({ EncargosDoPeriodo: () => null }));
vi.mock("@/components/financas/NotaRelatorioModal", () => ({ NotaRelatorioModal: () => null }));
vi.mock("@/components/financas/PendenciasCategorizacaoDrawer", () => ({ PendenciasCategorizacaoDrawer: () => null }));
vi.mock("@/components/CampoData", () => ({ CampoData: () => null }));

import FinancasPrestacaoContas from "./FinancasPrestacaoContas";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; seq = 0; });

async function abrir(url = "/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><FinancasPrestacaoContas /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const quando = (...itens: Record<string, unknown>[]) => { lancamentos = itens.map(i => l(i)); };
const completo = () => quando(
  { tipo: "entrada", data: "2026-09-05", valor: 100, categoria_id: "c-diz", pessoa_nome: "Ana Souza" },
  { tipo: "entrada", data: "2026-10-05", valor: 150, categoria_id: "c-diz", pessoa_nome: "Ana Souza" },
  { tipo: "entrada", data: "2026-10-06", valor: 50, categoria_id: "c-diz", pessoa_nome: "Bruno Lima" },
  { tipo: "saida", data: "2026-09-10", valor: 12, categoria_id: "c-tar" },
  { tipo: "saida", data: "2026-09-12", valor: 200, categoria_id: "c-pre", centro_custo_id: "ce-pas" },
  { tipo: "saida", data: "2026-09-20", valor: 80, categoria_id: "c-mat", status: "quitado_terceiro", descricao: "Sacolas" },
);
const ordem = (el: HTMLElement, ...trechos: string[]) => trechos.map(t => el.textContent!.indexOf(t));

describe("Prestação de Contas — o documento depois das melhorias", () => {
  it("a ordem: resumo executivo → demonstração → indicadores de dízimos → compras ofertadas → fluxo de caixa → assinaturas", async () => {
    completo();
    const el = await abrir();
    const pos = ordem(el, "Resumo Executivo", "Total Receitas", "Indicadores de Dízimos", "Quantidade de compras ofertadas", "Indicadores Financeiros e Fluxo de Caixa", "Conselho Fiscal");
    expect(pos.every(p => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });

  it("o resumo executivo mostra os sete números e diz Superávit", async () => {
    completo();
    const t = (await abrir()).textContent!;
    const resumo = t.slice(t.indexOf("Resumo Executivo"), t.indexOf("Saldo Inicial", t.indexOf("Resumo Executivo")) + 400);
    for (const rotulo of ["Receita Total", "Despesa Total", "Despesas Financeiras", "Resultado do Período · Superávit", "Saldo Inicial", "Saldo Final", "Compras Ofertadas por Terceiros"]) expect(resumo).toContain(rotulo);
    expect(t).toMatch(/Receita Total\s*R\$\s*300,00/);
    expect(t).toMatch(/Despesa Total\s*R\$\s*212,00/);
  });

  it("um déficit aparece como Déficit", async () => {
    quando({ tipo: "saida", data: "2026-09-10", valor: 500, categoria_id: "c-pre", centro_custo_id: "ce-pas" });
    expect((await abrir()).textContent).toContain("Resultado do Período · Déficit");
  });

  it("nomenclatura: 'Ofertas a Preletores', 'Dízimos', 'Ministério Pastoral' — e nada de 'à Preletores'", async () => {
    completo();
    const t = (await abrir()).textContent!;
    expect(t).toContain("Ofertas a Preletores");
    expect(t).toContain("Ministério Pastoral");
    expect(t).not.toContain("à Preletores");
    expect(t).toContain("Saldo Inicial");
    expect(t).not.toContain("Saldo Anterior");
  });

  it("despesas financeiras: seção própria com Tarifas, Título de Capitalização e Outros, cada um com subtotal, e o total", async () => {
    completo();
    const t = (await abrir()).textContent!;
    const sec = t.slice(t.indexOf("Despesas Financeiras", t.indexOf("Total Despesas dos Ministérios")), t.indexOf("Total Despesas Financeiras") + 40);
    expect(sec).toContain("Tarifas Bancárias · subtotal");
    expect(sec).toContain("Título de Capitalização · subtotal");
    expect(sec).toContain("Outros encargos financeiros · subtotal");
    expect(t).toContain("Total Despesas Financeiras");
    expect(t).toContain("Total Geral de Despesas");
  });

  it("sem despesa financeira, a seção segue aparecendo, zerada", async () => {
    quando({ tipo: "entrada", data: "2026-09-05", valor: 100, categoria_id: "c-diz", pessoa_nome: "Ana" });
    const t = (await abrir()).textContent!;
    expect(t).toContain("Tarifas Bancárias · subtotal");
    expect(t).toContain("Título de Capitalização · subtotal");
  });

  it("compras ofertadas: a observação destacada, a quantidade, o valor total e a relação", async () => {
    completo();
    const t = (await abrir()).textContent!;
    expect(t).toContain("As compras ofertadas por terceiros são registradas apenas para fins de controle e prestação de contas, não impactando as receitas, despesas, resultado ou saldo financeiro da igreja.");
    expect(t).toMatch(/Quantidade de compras ofertadas\s*1/);
    expect(t).toMatch(/Valor total ofertado\s*R\$\s*80,00/);
    expect(t).toContain("Sacolas");
  });

  it("sem compras ofertadas a seção aparece e diz que não houve; num relatório de uma conta só ela some", async () => {
    quando({ tipo: "entrada", data: "2026-09-05", valor: 100, categoria_id: "c-diz", pessoa_nome: "Ana" });
    expect((await abrir()).textContent).toContain("Nenhuma compra ofertada por terceiros no período.");
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    expect((await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2&conta=b1")).querySelector("section[aria-label='Compras ofertadas por terceiros']")).toBeNull();
  });

  it("indicadores de dízimos: únicos no período (a mesma pessoa em dois meses conta uma vez), total e média", async () => {
    completo();
    const t = (await abrir()).textContent!;
    expect(t).toMatch(/Dizimistas únicos no período\s*2/);
    expect(t).toMatch(/Valor total de dízimos\s*R\$\s*300,00/);
    expect(t).toMatch(/Valor médio por dizimista\s*R\$\s*150,00/);
  });

  it("a seção nova traz o gráfico e os cartões gerenciais", async () => {
    completo();
    const el = await abrir();
    const t = el.textContent!;
    expect(el.querySelector("svg[role='img'][aria-label*='Fluxo de caixa']")).toBeTruthy();
    for (const r of ["Maior arrecadação do período", "Mês da maior arrecadação", "Maior despesa do período", "Mês da maior despesa", "Menor saldo registrado", "Mês do menor saldo", "Meses com saldo negativo", "Média mensal de receitas", "Média mensal de despesas"]) expect(t).toContain(r);
    for (const m of ["Automático", "Diário", "Semanal", "Mensal"]) expect([...el.querySelectorAll("button")].some(b => b.textContent === m)).toBe(true);
  });

  it("o agrupamento troca o gráfico (diário → mensal) e o rótulo da visão", async () => {
    completo();
    const el = await abrir();
    const barras = () => el.querySelectorAll("svg[role='img'] g > rect").length;
    const diario = [...el.querySelectorAll("button")].find(b => b.textContent === "Diário")!;
    await act(async () => { diario.click(); });
    expect(el.textContent).toContain("visão diária");
    const nDiario = barras();
    const mensal = [...el.querySelectorAll("button")].find(b => b.textContent === "Mensal")!;
    await act(async () => { mensal.click(); });
    expect(el.textContent).toContain("visão mensal");
    expect(barras()).toBeLessThan(nDiario);
    expect(barras()).toBe(4);   // 2 meses × (entradas + saídas)
  });

  it("o que só vale na tela some na impressão (botões de agrupamento) e a seção nova começa página própria", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2&orientacao=paisagem");
    const grupo = el.querySelector("[aria-label='Agrupamento do gráfico']")!;
    expect(grupo.className).toContain("no-print");
    expect(el.querySelector("section[aria-label='Indicadores Financeiros e Fluxo de Caixa']")!.className).toContain("print:break-before-page");
  });
});

describe("Prestação de Contas — papel do PDF: retrato (menos folhas) ou paisagem", () => {
  const css = () => [...document.querySelectorAll("style")].map(x => x.textContent).join("\n");
  const botao = (el: HTMLElement, trecho: string) => [...el.querySelectorAll("button")].find(b => b.textContent!.includes(trecho)) as HTMLButtonElement;

  it("até 4 meses o padrão é retrato: A4 em pé, margens menores e a página compacta", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2");
    expect(css()).toMatch(/size: A4 portrait; margin: 0\.9cm 1cm/);
    expect(el.querySelector(".relatorio-page")!.className).toContain("rel-retrato");
    expect(botao(el, "Retrato").getAttribute("aria-pressed")).toBe("true");
    expect(botao(el, "Paisagem").getAttribute("aria-pressed")).toBe("false");
  });

  it("a escolha explícita por paisagem volta ao papel de sempre (A4 deitado, sem a compactação)", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2&orientacao=paisagem");
    expect(css()).toMatch(/size: A4 landscape; margin: 1\.2cm 1\.5cm/);
    expect(el.querySelector(".relatorio-page")!.className).not.toContain("rel-retrato");
    expect(botao(el, "Paisagem").getAttribute("aria-pressed")).toBe("true");
  });

  it("acima de 4 meses o padrão é paisagem; pedir retrato não vale (as colunas não caberiam) e a tela explica", async () => {
    completo();
    let el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=7&qtd=6");
    expect(css()).toMatch(/size: A4 landscape/);
    expect(el.textContent).not.toContain("Retrato vale para até 4 meses");
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=7&qtd=6&orientacao=retrato");
    expect(css()).toMatch(/size: A4 landscape/);
    expect(el.querySelector(".relatorio-page")!.className).not.toContain("rel-retrato");
    expect(el.textContent).toContain("Retrato vale para até 4 meses");
  });

  it("clicar em Paisagem troca o papel e preserva o período", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2");
    await act(async () => { botao(el, "Paisagem").click(); });
    expect(css()).toMatch(/size: A4 landscape/);
    expect(botao(el, "Paisagem").getAttribute("aria-pressed")).toBe("true");
    expect(el.textContent).toContain("Set");   // o período segue o mesmo (setembro–outubro)
  });

  it("em retrato, a seção do fluxo de caixa não força página nova (o gráfico e os indicadores seguem inteiros)", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2");
    const sec = el.querySelector("section[aria-label='Indicadores Financeiros e Fluxo de Caixa']")!;
    expect(sec.className).not.toContain("print:break-before-page");
    expect(el.querySelector("svg[role='img']")!.getAttribute("viewBox")).toBe("0 0 720 290");
  });

  it("em paisagem o gráfico segue em 960 × 340", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=9&qtd=2&orientacao=paisagem");
    expect(el.querySelector("svg[role='img']")!.getAttribute("viewBox")).toBe("0 0 960 340");
  });

  it("período longo (mais de 6 meses) ganha a tabela larga: o nome da categoria mantém largura mínima", async () => {
    completo();
    const el = await abrir("/financas/prestacao-de-contas?ano=2026&mes=1&qtd=12");
    expect(el.querySelector("table.tabela-prestacao")!.className).toContain("tabela-larga");
    expect(css()).toContain(".tabela-larga td:first-child");
  });
});
