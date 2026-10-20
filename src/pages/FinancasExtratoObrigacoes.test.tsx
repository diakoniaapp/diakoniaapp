// A tela "Extrato de Obrigações" vista pelo que a pessoa lê e faz (redesenho de 20/10/2026): resumo de 6 totais, lista agrupada por dia com total do dia, selos, filtro de Conta, a quitada por terceiro em
// destaque, as ações por situação, os modelos de impressão e as exportações.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { LinhaDoExtrato } from "@/lib/extratoDeObrigacoes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const linha = (o: Partial<LinhaDoExtrato> & { obrigacaoId: string }): LinhaDoExtrato => ({
  data: "2026-09-10", fornecedor: "Papelaria Central", documento: "NF 10", descricao: "Resmas de papel", categoria: "Material de Consumo", centro: "Ministério Pastoral", projeto: "",
  valor: 100, saldoEmAberto: 0, situacao: "paga", responsavel: "Igreja", intencao: "—", diasEmAtraso: null, idEmAberto: null, reembolsoAPagar: false, saldoAReembolsar: null,
  contaId: "k1", conta: "Bradesco", observacoes: "", anexos: 0, documentacao: null, grau: null, ...o,
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
vi.mock("@/components/financas/DocumentacaoDaObrigacao", () => ({ DocumentacaoDaObrigacao: ({ lancamento }: { lancamento: { id: string } | null }) => lancamento ? <div data-testid="documentacao">{lancamento.id}</div> : null }));
vi.mock("@/components/financas/AnexosLancamentoDialog", () => ({ AnexosLancamentoDialog: () => null }));
vi.mock("@/components/financas/LancamentoForm", () => ({ LancamentoForm: ({ open, lancamento }: { open: boolean; lancamento?: { id: string } | null }) => open ? <div data-testid="form">{lancamento?.id}</div> : null }));
vi.mock("@/components/financas/PagarReembolsoDialog", () => ({ PagarReembolsoDialog: ({ alvo }: { alvo: { obrigacaoId: string } | null }) => alvo ? <div data-testid="reembolso">{alvo.obrigacaoId}</div> : null }));
vi.mock("@/components/financas/QuitacaoDialog", () => ({ QuitacaoDialog: ({ alvo }: { alvo: { id: string } | null }) => alvo ? <div data-testid="quitacao">{alvo.id}</div> : null }));
vi.mock("@/services/fechamentoMensalService", () => ({ buscarLancamentoParaEditar: async (id: string) => ({ id }) }));
vi.mock("@/services/quitacaoService", () => ({ quitacaoDaObrigacao: async (id: string) => ({ quitacaoId: "q-" + id, obrigacaoId: id }) }));
vi.mock("@/services/extratoDeObrigacoesService", () => ({ carregarExtratoDeObrigacoes: async (f: { de: string; ate: string; fornecedorId?: string }) => { pedidos.push(f); return dados; } }));
vi.mock("@/services/finService", () => ({
  brl: (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  downloadCSV: (nome: string, conteudo: string) => { csvs.push({ nome, conteudo }); },
  listarFornecedores: async () => [{ id: "f1", nome: "Papelaria Central" }], listarCategoriasTodas: async () => [{ id: "c1", nome: "Material de Consumo", tipo: "saida" }],
  listarCentrosCustoTodas: async () => [{ id: "ce1", nome: "Ministério Pastoral" }], listarProjetosTodos: async () => [{ id: "pr1", nome: "Reforma" }],
  listarContas: async () => [{ id: "k1", nome: "Bradesco" }, { id: "k2", nome: "Caixinha Administrativo" }, { id: "k3", nome: "Cartão de Crédito" }],
  buscarVencimentoPorId: async (id: string) => (id === "ja-paga" ? null : { id }),
}));
vi.mock("file-saver", () => ({ saveAs: (blob: Blob, nome: string) => { salvos.push({ blob, nome }); } }));
vi.mock("@/components/CampoData", () => ({ CampoData: ({ value }: { value: string }) => <input aria-label="data" value={value} readOnly /> }));

import FinancasExtratoObrigacoes from "./FinancasExtratoObrigacoes";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; pedidos.length = 0; salvos.length = 0; csvs.length = 0; chamadas.length = 0; temPapel = true; try { localStorage.clear(); } catch { /* ok */ } });

async function abrir(url = "/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><FinancasExtratoObrigacoes /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const completo = () => {
  dados = [
    linha({ obrigacaoId: "a", situacao: "em_aberto", valor: 100, saldoEmAberto: 100, responsavel: "Ninguém ainda", diasEmAtraso: 12, idEmAberto: "linha-a", fornecedor: "Light", data: "2026-09-01" }),
    linha({ obrigacaoId: "p", situacao: "paga", valor: 200, data: "2026-09-02", fornecedor: "Papelaria" }),
    linha({ obrigacaoId: "r", situacao: "reembolso", valor: 300, responsavel: "Pessoa — Ana Souza", intencao: "Reembolso", data: "2026-09-03", fornecedor: "Leandro Dias", reembolsoAPagar: true, saldoAReembolsar: 300, saldoEmAberto: 300, idEmAberto: "linha-r", conta: "Caixinha Administrativo", contaId: "k2", grau: "Formal" }),
    linha({ obrigacaoId: "t", situacao: "quitada_por_terceiro", valor: 400, fornecedor: "Mercado Bom", responsavel: "Empresa — Mercado Bom", intencao: "Oferta", data: "2026-09-04", conta: "Sem conta financeira", contaId: "00000000-0000-4000-8000-0000000000a1" }),
    linha({ obrigacaoId: "c", situacao: "cancelada", valor: 999, responsavel: "—", data: "2026-09-05", fornecedor: "Gráfica" }),
  ];
};
// o formatador do pt-BR usa espaço não separável depois do R$
const sn = (t: string | null) => (t ?? "").replace(/ /g, " ");
const botao = (el: HTMLElement, trecho: string) => [...el.querySelectorAll("button")].find(b => b.textContent!.includes(trecho)) as HTMLButtonElement;
const tela = (el: HTMLElement) => el.querySelector("[data-visao=tela]") as HTMLElement;
const papel = (el: HTMLElement) => el.querySelector("[data-visao=papel]") as HTMLElement;

describe("Extrato de Obrigações — leitura", () => {
  it("o resumo tem as SEIS peças pedidas, e 'em aberto' soma o reembolso a pagar", async () => {
    completo();
    const el = await abrir();
    const resumo = sn(el.querySelector("section[aria-label='Resumo']")!.textContent);
    for (const r of ["Total de obrigações", "Total pago", "Total em aberto", "Reembolsos pendentes", "Quitadas por terceiros", "Canceladas"]) expect(resumo).toContain(r);
    expect(resumo).toContain("R$ 1.000,00");              // 100 + 200 + 300 + 400, sem os 999 da cancelada
    expect(resumo).toContain("R$ 400,00");                // em aberto: a obrigação de 100 + o reembolso a pagar de 300
    expect(resumo).toContain("1 vencida");                // a de 12 dias
    expect(resumo).toContain("1 a pagar");                // o reembolso pendente
  });

  it("agrupa por DIA: cada dia tem o cabeçalho com o dia da semana e fecha com 'TOTAL DO DIA'", async () => {
    dados = [
      linha({ obrigacaoId: "x1", data: "2026-10-02", valor: 600, fornecedor: "Daniel" }), linha({ obrigacaoId: "x2", data: "2026-10-02", valor: 9.8, fornecedor: "Banco" }),
      linha({ obrigacaoId: "x3", data: "2026-10-01", valor: 1479.65, fornecedor: "Águas" }),
    ];
    const el = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-10-01&fim=2026-10-31");
    const dias = [...tela(el).querySelectorAll("[data-dia]")];
    expect(dias.map(d => d.getAttribute("data-dia"))).toEqual(["2026-10-01", "2026-10-02"]);
    expect(dias[0].textContent).toContain("quinta-feira");
    expect(sn(tela(el).querySelector("[data-fecha-dia='2026-10-02']")!.textContent)).toContain("02/10/2026 | TOTAL DO DIA");
    expect(sn(tela(el).querySelector("[data-fecha-dia='2026-10-02']")!.textContent)).toContain("R$ 609,80");
    expect(sn(tela(el).querySelector("[data-fecha-dia='2026-10-01']")!.textContent)).toContain("R$ 1.479,65");
  });

  it("selos: cor + forma + palavra; o reembolso aparece como 'a pagar' e o atraso como marca, não como estado", async () => {
    completo();
    const el = await abrir();
    const selo = (id: string) => tela(el).querySelector(`[data-obrigacao='${id}'] [data-selo]`)!;
    expect(selo("a").getAttribute("data-selo")).toBe("aberto");
    expect(selo("a").textContent).toBe("!Em aberto");
    expect(tela(el).querySelector("[data-obrigacao='a']")!.textContent).toContain("▲ 12 dias");
    expect(selo("p").textContent).toBe("✓Paga");
    expect(selo("r").textContent).toBe("↺Reembolso a pagar");
    expect(selo("t").textContent).toBe("◆Quitada por terceiro");
    expect(selo("c").textContent).toBe("✕Cancelada");
  });

  it("a quitada por terceiro e o reembolso ficam em destaque: quem pagou, a intenção, a prova e o saldo", async () => {
    completo();
    const el = await abrir();
    const t = tela(el).querySelector("[data-obrigacao='t']")!;
    expect(t.className).toContain("violeta");
    expect(t.textContent).toContain("Pago por: Empresa — Mercado Bom");
    expect(t.textContent).toContain("Intenção: Oferta");
    const r = tela(el).querySelector("[data-obrigacao='r']")!;
    expect(r.textContent).toContain("Prova: Formal");
    expect(sn(r.textContent)).toContain("Saldo a reembolsar: R$ 300,00");
    // a obrigação comum não ganha a linha de "quem pagou" (a igreja pagou: não é exceção)
    expect(tela(el).querySelector("[data-obrigacao='p']")!.textContent).not.toContain("Pago por");
  });

  it("projeto e conta aparecem como marcas; o contador de documentos só quando há", async () => {
    dados = [linha({ obrigacaoId: "j", projeto: "120 Anos QIBRJ", anexos: 2 }), linha({ obrigacaoId: "k", anexos: 0, fornecedor: "Outra" })];
    const el = await abrir();
    const j = tela(el).querySelector("[data-obrigacao='j']")!.textContent!;
    expect(j).toContain("Projeto: 120 Anos QIBRJ");
    expect(j).toContain("Bradesco");
    expect(j).toContain("2 documentos");
    expect(tela(el).querySelector("[data-obrigacao='k']")!.textContent).not.toContain("documento");
  });

  it("sem obrigações, a tela diz isso (e as exportações ficam desligadas)", async () => {
    dados = [];
    const el = await abrir();
    expect(el.textContent).toContain("Nenhuma obrigação neste período");
    expect(botao(el, "CSV").disabled).toBe(true);
    expect(botao(el, "Excel").disabled).toBe(true);
  });
});

describe("Extrato de Obrigações — períodos grandes", () => {
  it("na tela a lista vem por etapas (dias inteiros); o resumo conta TODAS e 'Mostrar mais dias' continua a lista", async () => {
    // 300 obrigações em 100 dias (3 por dia): a tela começa com ~150 e oferece o resto
    dados = Array.from({ length: 300 }, (_, i) => linha({ obrigacaoId: `o${i}`, data: `2026-09-${String(1 + (i % 28)).padStart(2, "0")}`, fornecedor: `Fornecedor ${i}` }));
    const el = await abrir();
    const naTela = () => tela(el).querySelectorAll("[data-obrigacao]").length;
    expect(naTela()).toBeGreaterThanOrEqual(150);
    expect(naTela()).toBeLessThan(300);
    expect(el.textContent).toContain("300 obrigações");                                  // o resumo é de tudo
    const mais = [...el.querySelectorAll("button")].find(b => b.textContent!.includes("Mostrar mais dias"))!;
    expect(mais.textContent).toContain("o PDF e as exportações levam todas");
    await act(async () => { (mais as HTMLButtonElement).click(); });
    expect(naTela()).toBe(300);
    expect([...el.querySelectorAll("button")].some(b => b.textContent!.includes("Mostrar mais dias"))).toBe(false);
  });
});

describe("Extrato de Obrigações — filtros", () => {
  it("tem os filtros pedidos, e o de CONTA lista as contas do cadastro com a quantidade de cada uma e 'Sem conta financeira'", async () => {
    completo();
    const el = await abrir();
    const barra = el.querySelector(".no-print")!.textContent!;
    for (const f of ["Data inicial", "Data final", "Situação", "CONTA", "Fornecedor", "Categoria", "Centro de custo", "Projeto"]) expect(barra).toContain(f);
    // celular: a faixa de atalhos por conta (Todas · cada conta · Sem conta)
    const faixa = [...el.querySelectorAll("[role=group][aria-label=Conta] button")].map(b => b.textContent);
    expect(faixa).toEqual(["Todas", "Bradesco", "Caixinha Administrativo", "Cartão de Crédito", "Sem conta"]);
  });

  it("a conta na URL filtra a lista e o resumo, e vira um chip que se remove", async () => {
    completo();
    const el = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30&conta=k2");
    expect([...tela(el).querySelectorAll("[data-obrigacao]")].map(e => e.getAttribute("data-obrigacao"))).toEqual(["r"]);
    expect(sn(el.querySelector("section[aria-label='Resumo']")!.textContent)).toContain("R$ 300,00");
    const chips = el.querySelector("[aria-label='Filtros ativos']")!;
    expect(chips.textContent).toContain("Conta: Caixinha Administrativo");
    expect(chips.querySelector("button[aria-label^='Remover']")).toBeTruthy();
  });

  it("'Sem conta financeira' mostra as compras pagas por terceiros", async () => {
    completo();
    const el = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30&conta=00000000-0000-4000-8000-0000000000a1");
    expect([...tela(el).querySelectorAll("[data-obrigacao]")].map(e => e.getAttribute("data-obrigacao"))).toEqual(["t"]);
  });

  it("'Em aberto' mostra as obrigações em aberto E os reembolsos a pagar; 'Apenas reembolsos' só os reembolsos", async () => {
    completo();
    const emAberto = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30&situacao=em_aberto");
    expect([...tela(emAberto).querySelectorAll("[data-obrigacao]")].map(e => e.getAttribute("data-obrigacao")).sort()).toEqual(["a", "r"]);
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    const soReembolsos = await abrir("/financas/extrato-de-obrigacoes?inicio=2026-09-01&fim=2026-09-30&situacao=reembolso");
    expect([...tela(soReembolsos).querySelectorAll("[data-obrigacao]")].map(e => e.getAttribute("data-obrigacao"))).toEqual(["r"]);
  });

  it("o período e os filtros da URL vão para a leitura", async () => {
    completo();
    await abrir("/financas/extrato-de-obrigacoes?inicio=2026-08-01&fim=2026-08-31&fornecedor=f1");
    expect(pedidos.at(-1)).toMatchObject({ de: "2026-08-01", ate: "2026-08-31", fornecedorId: "f1" });
  });
});

describe("Extrato de Obrigações — impressão", () => {
  async function abrirDialogo(el: HTMLElement) {
    await act(async () => { botao(el, "PDF / Imprimir").click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  }
  /** O papel só é montado enquanto se imprime (beforeprint) e sai ao terminar (afterprint) — manter as linhas montadas duas vezes deixava os diálogos lentos no celular. */
  const entrarNoPapel = async () => { await act(async () => { window.dispatchEvent(new Event("beforeprint")); }); };
  const sairDoPapel = async () => { await act(async () => { window.dispatchEvent(new Event("afterprint")); }); };
  const modelo = async (nome: string) => { await act(async () => { ([...document.querySelectorAll("[role=radio]")].find(b => b.textContent === nome) as HTMLElement).click(); }); };

  it("o papel é A4 em RETRATO, a coluna de ações e os botões NÃO saem, e o papel só existe na impressão", async () => {
    completo();
    const el = await abrir();
    const css = [...document.querySelectorAll("style")].map(s => s.textContent).join("\n");
    expect(css).toMatch(/size: A4 portrait/);
    expect(css).not.toMatch(/landscape/);
    expect(css).toMatch(/\.so-impressao \{ display: none; \}/);
    expect(papel(el)).toBeNull();                                                  // na tela o papel NÃO está montado
    await entrarNoPapel();
    expect(papel(el).querySelectorAll("button").length).toBe(0);                    // nenhum botão no papel
    await sairDoPapel();
    expect(papel(el)).toBeNull();                                                  // e sai de novo quando a impressão termina
    expect(tela(el).className).toContain("no-print");                              // a tela (com as ações) sai da impressão
    expect(tela(el).querySelectorAll("button").length).toBeGreaterThan(0);
  });

  it("'PDF / Imprimir' abre o diálogo com os quatro modelos; escolher um muda os campos do papel; 'Gerar PDF' imprime e lembra a escolha", async () => {
    completo();
    const imprimir = vi.spyOn(window, "print").mockImplementation(() => {});
    const el = await abrir();
    await abrirDialogo(el);
    expect([...document.querySelectorAll("[role=radio]")].map(b => b.textContent)).toEqual(["Tesouraria", "Contabilidade", "Diretoria", "Simplificado"]);
    await entrarNoPapel();
    // Tesouraria (padrão): categoria e centro saem no papel
    expect(papel(el).textContent).toContain("Material de Consumo › Ministério Pastoral");
    await modelo("Simplificado");
    expect(papel(el).textContent).not.toContain("Material de Consumo");              // o simplificado é só quem e quanto
    expect(papel(el).textContent).toContain("Light");
    expect(papel(el).querySelector("[data-selo='terceiro']")).toBeTruthy();         // o selo de terceiro sai em TODO modelo
    await act(async () => { ([...document.querySelectorAll("button")].find(b => b.textContent!.includes("Gerar PDF")) as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 250)); });
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("diakonia:extrato-obrigacoes:impressao")!).campos.categoria).toBe(false);
    imprimir.mockRestore();
  });

  it("a Diretoria leva as assinaturas; a Tesouraria, não; mexer num campo vira 'Personalizado'", async () => {
    completo();
    const el = await abrir();
    await entrarNoPapel();
    expect(papel(el).parentElement!.textContent).not.toContain("Conselho Fiscal");
    await abrirDialogo(el);
    await modelo("Diretoria");
    expect(el.textContent).toContain("Conselho Fiscal");
    const caixa = [...document.querySelectorAll("input[type=checkbox]")].find(c => c.parentElement!.textContent!.startsWith("Projeto")) as HTMLInputElement;
    await act(async () => { caixa.click(); });
    expect(document.body.textContent).toContain("não coincidem com nenhum modelo");
  });

  it("o papel mostra o modelo escolhido na linha de filtros", async () => {
    completo();
    const el = await abrir();
    expect(el.textContent).toContain("modelo Tesouraria");
  });

  it("exporta CSV (com a coluna Conta e o resumo) e Excel (.xlsx)", async () => {
    completo();
    const el = await abrir();
    await act(async () => { botao(el, "CSV").click(); });
    expect(csvs).toHaveLength(1);
    expect(csvs[0].nome).toBe("QIBRJ_Extrato_de_Obrigacoes_2026-09-01_a_2026-09-30.csv");
    expect(csvs[0].conteudo).toContain("Mercado Bom");
    expect(csvs[0].conteudo).toContain("Dias em atraso;Conta");
    expect(csvs[0].conteudo).toContain("Reembolso a pagar");
    expect(csvs[0].conteudo).toContain("RESUMO;Quantidade;Valor");
    await act(async () => { botao(el, "Excel").click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(salvos).toHaveLength(1);
    expect(salvos[0].nome).toBe("QIBRJ_Extrato_de_Obrigacoes_2026-09-01_a_2026-09-30.xlsx");
    expect(salvos[0].blob.size).toBeGreaterThan(500);
  });
});

describe("ações por linha", () => {
  const linhaDe = (el: HTMLElement, id: string) => tela(el).querySelector(`[data-obrigacao='${id}']`)!;
  /** O que fica À VISTA na linha (rótulo curto), já sem o nome do fornecedor que o aria-label acrescenta. */
  const aVista = (el: HTMLElement, id: string) => [...linhaDe(el, id).querySelectorAll(".no-print.col-span-2 button")].map(b => (b.getAttribute("aria-label") ?? b.textContent!).replace(/ (—|de) .*$/, ""));
  /** Abre o "⋯ Mais ações" da linha e devolve o que há no menu. */
  async function abrirMenu(el: HTMLElement, id: string) {
    const gatilho = linhaDe(el, id).querySelector("button[aria-label^='Mais ações']") as HTMLElement;
    await act(async () => { gatilho.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 })); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    return [...document.querySelectorAll("[role=menuitem]")].map(i => i.textContent!.trim());
  }
  const escolher = async (nome: string) => {
    await act(async () => { ([...document.querySelectorAll("[role=menuitem]")].find(i => i.textContent!.trim() === nome) as HTMLElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  };
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

  it("à vista fica só o que mexe no dinheiro (e a Documentação onde ela decide); o resto vai para '⋯ Mais ações'", async () => {
    ações();
    const el = await abrir();
    expect(aVista(el, "aberta")).toEqual(["Pagar agora", "Mais ações"]);
    expect(aVista(el, "paga")).toEqual(["Mais ações"]);
    expect(aVista(el, "terceiro")).toEqual(["Documentação", "Mais ações"]);                       // quitada por terceiro: nunca Pagar; a Documentação é o centro da decisão
    expect(aVista(el, "reemb-pagar")).toEqual(["Pagar reembolso", "Documentação", "Mais ações"]);
    expect(aVista(el, "reemb-pago")).toEqual(["Documentação", "Mais ações"]);
    expect(aVista(el, "cancelada")).toEqual(["Mais ações"]);
  });

  it("o menu tem as demais ações de cada situação — Visualizar, Editar, Documentação, Corrigir quitação —, e só as que cabem", async () => {
    ações();
    const el = await abrir();
    expect(await abrirMenu(el, "aberta")).toEqual(["Visualizar", "Editar", "Documentação"]);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(await abrirMenu(el, "paga")).toEqual(["Visualizar", "Documentação"]);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(await abrirMenu(el, "terceiro")).toEqual(["Visualizar", "Corrigir quitação"]);
  });

  it("quem não opera o dinheiro não vê Pagar nem Editar nem Corrigir quitação: só consulta", async () => {
    ações(); temPapel = false;
    const el = await abrir();
    expect(aVista(el, "aberta")).toEqual(["Mais ações"]);
    expect(aVista(el, "reemb-pagar")).toEqual(["Documentação", "Mais ações"]);
    expect(await abrirMenu(el, "aberta")).toEqual(["Visualizar", "Documentação"]);
  });

  it("Pagar agora busca o vencimento da LINHA EM ABERTO e abre o fluxo de pagamento de sempre", async () => {
    ações();
    const el = await abrir();
    await act(async () => { (linhaDe(el, "aberta").querySelector("button[aria-label^='Pagar agora']") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(chamadas).toEqual(["pagar:linha-aberta"]);
  });

  it("Pagar reembolso abre o pagamento do REEMBOLSO (e não o pagamento ao fornecedor)", async () => {
    ações();
    const el = await abrir();
    await act(async () => { (linhaDe(el, "reemb-pagar").querySelector("button[aria-label^='Pagar reembolso']") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(document.querySelector("[data-testid=reembolso]")!.textContent).toBe("reemb-pagar");
    expect(chamadas).toEqual([]);
  });

  it("Editar, Visualizar, Documentação e Corrigir quitação abrem cada um o seu fluxo", async () => {
    ações();
    const el = await abrir();
    await abrirMenu(el, "aberta"); await escolher("Editar");
    expect(document.querySelector("[data-testid=form]")!.textContent).toBe("linha-aberta");
    await abrirMenu(el, "paga"); await escolher("Visualizar");
    expect(document.querySelector("[data-testid=detalhe]")!.textContent).toBe("paga");
    await act(async () => { (linhaDe(el, "terceiro").querySelector("button[aria-label^='Documentação']") as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(document.querySelector("[data-testid=documentacao]")!.textContent).toBe("terceiro");
    await abrirMenu(el, "terceiro"); await escolher("Corrigir quitação");
    expect(document.querySelector("[data-testid=quitacao]")!.textContent).toBe("terceiro");
  });

  it("o nome do fornecedor também abre o detalhe (a linha 'clicável' sem esconder nada)", async () => {
    ações();
    const el = await abrir();
    const nome = [...linhaDe(el, "paga").querySelectorAll("button")].find(b => b.textContent === "Papelaria")!;
    await act(async () => { (nome as HTMLButtonElement).click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(document.querySelector("[data-testid=detalhe]")!.textContent).toBe("paga");
  });

  it("as ações ficam numa coluna estreita à direita (em tela grande) e NÃO saem no papel", async () => {
    ações();
    const el = await abrir();
    const cluster = linhaDe(el, "aberta").querySelector(".no-print.col-span-2")!;
    expect(cluster.className).toContain("md:col-start-3");
    await act(async () => { window.dispatchEvent(new Event("beforeprint")); });
    expect(papel(el).querySelectorAll("button").length).toBe(0);
  });
});
