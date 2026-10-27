// ─── Doadores e dizimistas — a tela evoluída (27/10/2026) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Trava o que ela decidiu: (1) o PAINEL é agregado e nunca mostra nome; (2) a lista NOMINAL (Pessoas e Sem contribuição) só aparece depois de o acesso ser registrado — registro com erro = sem nomes;
// função do banco ainda ausente = lista COM aviso; (3) a exportação nominal também registra e, sem registro, não gera arquivo; (4) o piso de 01/01/2026 ajusta o período e avisa; (5) links antigos
// (?ano=&mes=) continuam funcionando; (6) a lista é alfabética; (7) o aviso de cuidado pastoral e as ressalvas aparecem.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const registrar = vi.hoisted(() => vi.fn());
const baixarCsv = vi.hoisted(() => vi.fn());
const salvar = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("file-saver", () => ({ saveAs: salvar }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: () => true }) }));
vi.mock("@/lib/data", async orig => ({ ...(await orig<typeof import("@/lib/data")>()), hojeLocal: () => "2026-10-27" }));
vi.mock("@/services/finService", () => ({ brl: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, downloadCSV: baixarCsv }));
vi.mock("@/lib/xlsxSimples", async orig => ({ ...(await orig<typeof import("@/lib/xlsxSimples")>()), gerarXlsx: async () => new Blob(["x"]) }));
vi.mock("@/services/contribuicoesService", () => ({
  carregarContribuicoes: async () => LINHAS,
  carregarBaseDePessoas: async () => BASE,
  carregarNomes: async (ids: string[]) => new Map(ids.map(i => [i, NOMES[i] ?? "—"])),
  registrarAcessoNominal: registrar,
}));

import FinancasDoadores from "./FinancasDoadores";
import { esquecerRegistrosDaSessao } from "@/components/contribuicoes/useRegistroDeAcesso";
import { filtrarPessoas } from "@/components/contribuicoes/ListaDePessoas";
import { filtrarSemContribuicao } from "@/components/contribuicoes/SemContribuicao";
import type { LinhaDeContribuicao, PessoaDaBase, PessoaSemContribuicao } from "@/lib/contribuicoes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
let raiz: Root | null = null;
beforeAll(() => {
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); esquecerRegistrosDaSessao(); registrar.mockResolvedValue({ ok: true }); });

const NOMES: Record<string, string> = { zeca: "Zeca Teste", ana: "Ana Teste", bia: "Bia Teste" };
const L = (p: string | null, data: string, valor: number, categoria = "Dizimos"): LinhaDeContribuicao => ({ pessoa_id: p, data, valor, categoria });
// período padrão "6 meses" a partir de 27/10/2026 = 28/04 a 27/10; meses completos: maio a setembro
const LINHAS: LinhaDeContribuicao[] = [
  ...["05", "06", "07", "08", "09"].map(m => L("ana", `2026-${m}-10`, 100)),   // ana: dízimo em todos os meses completos
  L("zeca", "2026-06-15", 50), L("zeca", "2026-09-20", 30, "Ofertas"),
  L(null, "2026-08-02", 70),
];
const P = (id: string, nome: string, o: Partial<PessoaDaBase> = {}): PessoaDaBase => ({ id, nome, tipo_pessoa: "membro", status: "ativo", data_nascimento: "1980-01-01", familia_id: null, ...o });
const BASE: PessoaDaBase[] = [P("ana", "Ana Teste"), P("zeca", "Zeca Teste"), P("bia", "Bia Teste", { familia_id: "f1" }), P("caio", "Caio Teste", { familia_id: "f1" }), P("duda", "Duda Teste"), P("kid", "Kid Teste", { data_nascimento: "2018-01-01" })];
// ana e zeca contribuíram; bia/caio/duda não (caio é da família de bia: nenhum dos dois contribuiu → sem marca de família); kid é menor.

async function abrir(url = "/financas/doadores") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><FinancasDoadores /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return alvo;
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[];
const valorDe = (id: string) => q(`[data-indicador="${id}"] [data-valor]`)?.textContent;
const botao = (texto: string) => qa("button").find(b => b.textContent?.trim() === texto);
const abaAtiva = () => q('[role="tab"][data-state="active"]')?.textContent;

describe("o painel é só agregado", () => {
  it("indicadores do período (6 meses), sem nenhum nome", async () => {
    await abrir();
    expect(abaAtiva()).toBe("Painel");
    expect(valorDe("dizimistas")).toBe("2");   // ana, zeca
    expect(valorDe("doadores")).toBe("2");
    expect(q('[data-periodo-efetivo]')?.textContent).toContain("28/04/2026 a 27/10/2026");
    expect(valorDe("recorrencia")).toBe("50%");   // ana em 5 de 5 meses completos; zeca não — 1 de 2 dizimistas
    expect(q("[data-cobertura]")?.textContent).toContain("sem identificação");
    expect(document.body.textContent).not.toContain("Ana Teste");
    expect(document.body.textContent).not.toContain("Zeca Teste");
    expect(registrar).not.toHaveBeenCalled();   // agregado não precisa de registro
  });
  it("o botão \"Enviar relatório\" leva à Central com o período que se está vendo", async () => {
    await abrir();
    expect(q('[data-acao="enviar-relatorio"]')?.getAttribute("href")).toBe("/comunicacao?aba=relatorios&enviar=doadores&de=2026-04-28&ate=2026-10-27");
  });
  it("três gráficos e os destaques", async () => {
    await abrir();
    expect(qa("[data-grafico]").map(g => g.getAttribute("data-grafico"))).toEqual(["evolucao", "adesao", "mensal"]);
    expect(qa("[data-destaque]").length).toBe(3);
  });
});

describe("a lista nominal só depois do registro", () => {
  it("Pessoas: registra a consulta (ação e recorte, sem nomes) e então mostra a lista em ordem alfabética", async () => {
    await abrir("/financas/doadores?aba=pessoas");
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith("ver_pessoas", { ini: "2026-04-28", fim: "2026-10-27" }, 2);
    expect(qa("[data-pessoa]").map(e => e.querySelector("p")?.textContent)).toEqual(["Ana Teste", "Zeca Teste"]);
    expect(q('[data-registro="ok"]')?.textContent).toContain("registrada");
  });
  it("o registro com erro NÃO libera os nomes", async () => {
    registrar.mockResolvedValue({ ok: false, indisponivel: false, erro: "Sem permissão para consultar contribuições." });
    await abrir("/financas/doadores?aba=pessoas");
    expect(qa("[data-pessoa]").length).toBe(0);
    expect(q('[data-registro="erro"]')?.textContent).toContain("não é mostrada");
    expect(document.body.textContent).not.toContain("Ana Teste");
  });
  it("função ainda ausente no banco: mostra a lista COM o aviso de que não ficou registrado", async () => {
    registrar.mockResolvedValue({ ok: false, indisponivel: true, erro: "Could not find the function" });
    await abrir("/financas/doadores?aba=pessoas");
    expect(qa("[data-pessoa]").length).toBe(2);
    expect(q('[data-registro="indisponivel"]')?.textContent).toContain("NÃO ficou registrada");
  });
  it("a mesma consulta é registrada uma vez por sessão (reabrir a aba não enche o registro)", async () => {
    await abrir("/financas/doadores?aba=pessoas");
    act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = "";
    await abrir("/financas/doadores?aba=pessoas");
    expect(registrar).toHaveBeenCalledTimes(1);
  });
  it("recorte diferente (outro período) é outro registro", async () => {
    await abrir("/financas/doadores?aba=pessoas");
    act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = "";
    await abrir("/financas/doadores?aba=pessoas&p=90d");
    expect(registrar).toHaveBeenCalledTimes(2);
  });
});

describe("Sem contribuição no período", () => {
  it("indicadores: base (sem menores), quem contribuiu, quem não contribuiu e as ressalvas de cuidado pastoral", async () => {
    await abrir("/financas/doadores?aba=sem");
    expect(valorDe("base")).toBe("5");           // 6 − 1 menor
    expect(valorDe("contribuiram")).toBe("2");
    expect(valorDe("nao")).toBe("3");            // bia, caio, duda
    expect(valorDe("nunca")).toBe("3");
    expect(q('[data-aviso="cuidado"]')?.textContent).toContain("cuidado pastoral");
    expect(q('[data-aviso="cuidado"]')?.textContent).toContain("não para cobrança");
    expect(document.body.textContent).not.toMatch(/inadimplent|faltos/i);
  });
  it("registra a consulta com o recorte (período, o que conta, menores) e mostra a lista em ordem alfabética", async () => {
    await abrir("/financas/doadores?aba=sem");
    expect(registrar).toHaveBeenCalledWith("ver_nao_contribuiram", { ini: "2026-04-28", fim: "2026-10-27", considerar: "qualquer", menores: false }, 3);
    expect(qa('[data-lista="sem-contribuicao"] [data-pessoa]').map(e => e.querySelector("button, span")?.textContent)).toEqual(["Bia Teste", "Caio Teste", "Duda Teste"]);
  });
  it("sem registro, sem nomes", async () => {
    registrar.mockResolvedValue({ ok: false, indisponivel: false, erro: "falhou" });
    await abrir("/financas/doadores?aba=sem");
    expect(qa("[data-pessoa]").length).toBe(0);
    expect(q('[data-registro="erro"]')).not.toBeNull();
  });
  it("'Incluir menores' põe o menor na lista (e é outro recorte, outro registro)", async () => {
    await abrir("/financas/doadores?aba=sem&menores=1");
    expect(valorDe("base")).toBe("6");
    expect(qa("[data-pessoa]").length).toBe(4);
    expect(registrar).toHaveBeenCalledWith("ver_nao_contribuiram", expect.objectContaining({ menores: true }), 4);
  });
});

describe("exportar a lista nominal também registra", () => {
  it("CSV de Pessoas: registra 'exportar_pessoas' e só então baixa", async () => {
    await abrir("/financas/doadores?aba=pessoas");
    registrar.mockClear();
    await act(async () => { botao("CSV")!.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(registrar).toHaveBeenCalledWith("exportar_pessoas", { ini: "2026-04-28", fim: "2026-10-27", formato: "csv" }, 2);
    expect(baixarCsv).toHaveBeenCalledTimes(1);
    expect(baixarCsv.mock.calls[0][0]).toContain("contribuicoes_pessoas_2026-04-28_a_2026-10-27.csv");
  });
  it("sem conseguir registrar a exportação, NÃO gera o arquivo", async () => {
    await abrir("/financas/doadores?aba=pessoas");
    registrar.mockResolvedValue({ ok: false, indisponivel: false, erro: "falhou" });
    await act(async () => { botao("CSV")!.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(baixarCsv).not.toHaveBeenCalled();
  });
  it("Excel de Sem contribuição registra 'exportar_nao_contribuiram'", async () => {
    await abrir("/financas/doadores?aba=sem");
    registrar.mockClear();
    await act(async () => { botao("Excel")!.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(registrar).toHaveBeenCalledWith("exportar_nao_contribuiram", expect.objectContaining({ formato: "xlsx" }), 3);
    expect(salvar).toHaveBeenCalledTimes(1);
  });
  it("o Excel do Painel é agregado: baixa sem registro de acesso", async () => {
    await abrir();
    await act(async () => { botao("Excel")!.click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(registrar).not.toHaveBeenCalled();
  });
});

describe("o piso de 01/01/2026 e os links antigos", () => {
  it("um período que começa antes do piso é ajustado, e a tela diz que foi", async () => {
    await abrir("/financas/doadores?p=personalizado&de=2025-06-01&ate=2026-03-31");
    expect(q("[data-aviso='piso']")?.textContent).toContain("começa antes de 01/01/2026");
    expect(q("[data-periodo-efetivo]")?.textContent).toContain("01/01/2026 a 31/03/2026");
  });
  it("um período inteiro antes do piso não calcula nada", async () => {
    await abrir("/financas/doadores?ano=2025");
    expect(q("[data-vazio-piso]")?.textContent).toContain("termina antes de 01/01/2026");
    expect(q("[data-painel]")).toBeNull();
  });
  it("link antigo ?ano=2026&mes=3 vira março de 2026", async () => {
    await abrir("/financas/doadores?ano=2026&mes=3");
    expect(q("[data-periodo-efetivo]")?.textContent).toContain("01/03/2026 a 31/03/2026");
  });
  it("os atalhos de período: 90 dias, 6 e 12 meses, este ano, desde o piso e personalizado", async () => {
    await abrir();
    expect(qa("[data-preset]").map(b => b.getAttribute("data-preset"))).toEqual(["90d", "6m", "12m", "ano", "desde_piso", "personalizado"]);
    expect(q('[data-preset="6m"]')?.getAttribute("aria-pressed")).toBe("true");
    act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = "";
    await abrir("/financas/doadores?p=90d");
    expect(q("[data-periodo-efetivo]")?.textContent).toContain("30/07/2026 a 27/10/2026");
  });
});

describe("filtros puros", () => {
  const pessoas = [
    { pessoaId: "1", nome: "Ana Lúcia", total: 100, quantidade: 2, ultima: "2026-09-01", dizimista: true, recorrente: true, nova: false },
    { pessoaId: "2", nome: "Bruno", total: 900, quantidade: 1, ultima: "2026-08-01", dizimista: false, recorrente: false, nova: true },
    { pessoaId: "3", nome: "Carla", total: 50, quantidade: 1, ultima: "2026-08-01", dizimista: true, recorrente: false, nova: null },
  ];
  it("a busca ignora acento e maiúscula; a ordem padrão é por nome, a de valor é opcional", () => {
    expect(filtrarPessoas(pessoas, "todos", "lucia", "nome").map(p => p.pessoaId)).toEqual(["1"]);
    expect(filtrarPessoas(pessoas, "todos", "", "nome").map(p => p.nome)).toEqual(["Ana Lúcia", "Bruno", "Carla"]);
    expect(filtrarPessoas(pessoas, "todos", "", "valor").map(p => p.nome)).toEqual(["Bruno", "Ana Lúcia", "Carla"]);
  });
  it("grupos: dizimistas, recorrentes e novos", () => {
    expect(filtrarPessoas(pessoas, "dizimistas", "", "nome").map(p => p.pessoaId)).toEqual(["1", "3"]);
    expect(filtrarPessoas(pessoas, "recorrentes", "", "nome").map(p => p.pessoaId)).toEqual(["1"]);
    expect(filtrarPessoas(pessoas, "novos", "", "nome").map(p => p.pessoaId)).toEqual(["2"]);
  });
  const sem = (id: string, o: Partial<PessoaSemContribuicao>): PessoaSemContribuicao => ({ id, nome: id, tipo: "membro", classificacao: "nunca", ultima: null, dias: null, faixa: null, familiaContribui: false, menor: false, semNascimento: false, ...o });
  const lista = [sem("a", {}), sem("b", { tipo: "congregado" }), sem("c", { classificacao: "antes", ultima: "2026-06-01", dias: 120, faixa: "de91a180" }), sem("d", { familiaContribui: true })];
  it("tipo, situação, faixa de dias e 'esconder quem tem família contribuindo'", () => {
    const base = { tipo: "todos", classe: "todos", faixa: "", semFamilia: false } as const;
    expect(filtrarSemContribuicao(lista, base).length).toBe(4);
    expect(filtrarSemContribuicao(lista, { ...base, tipo: "congregado" }).map(p => p.id)).toEqual(["b"]);
    expect(filtrarSemContribuicao(lista, { ...base, classe: "antes" }).map(p => p.id)).toEqual(["c"]);
    expect(filtrarSemContribuicao(lista, { ...base, faixa: "de91a180" }).map(p => p.id)).toEqual(["c"]);
    expect(filtrarSemContribuicao(lista, { ...base, semFamilia: true }).map(p => p.id)).toEqual(["a", "b", "c"]);
  });
});
