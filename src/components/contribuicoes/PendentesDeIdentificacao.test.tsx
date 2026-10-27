// ─── Pendentes de Identificação: a aba (27/10/2026, Fase 3) ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Trava: a taxa em quatro partes e a meta de 95%; a fila só com o que NÃO tem pessoa nem classificação; fácil/média/difícil; aceitar sugestão, vincular pessoa e família, anônimo, ignorar e DESFAZER
// (cada um chamando a escrita certa, tirando/devolvendo a linha da fila e avisando o painel); erro de escrita não some com a linha; migration pendente avisa em vez de quebrar; e a fila (nomes + valores)
// só aparece depois do registro de acesso.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const registrar = vi.hoisted(() => vi.fn(async () => ({ ok: true } as { ok: boolean; indisponivel?: boolean; erro?: string })));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/finService", () => ({ brl: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, buscarPessoasParaLancamento: vi.fn() }));
vi.mock("@/services/contribuicoesService", () => ({ registrarAcessoNominal: registrar }));

import { PendentesDeIdentificacao, type ServicoDePendentes } from "./PendentesDeIdentificacao";
import { esquecerRegistrosDaSessao } from "./useRegistroDeAcesso";
import type { ContribuicaoParaTriagem } from "@/lib/identificacaoDeContribuicoes";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); esquecerRegistrosDaSessao(); registrar.mockResolvedValue({ ok: true }); });

const C = (id: string, o: Partial<ContribuicaoParaTriagem> = {}): ContribuicaoParaTriagem => ({
  id, data: "2026-09-10", valor: 100, categoria: "Dizimos", descricao: null, observacoes: null, origem: "importado_omie", forma_pagamento: "pix", pessoa_id: null, familia_id: null, ...o,
});
const CONTRIBUICOES: ContribuicaoParaTriagem[] = [
  C("c1", { valor: 150, observacoes: "lote omie pix rem Sandra Maria Silva 1101" }),                       // fácil (nome casa)
  C("c2", { valor: 50, observacoes: "lote omie pix rem Estudio Matilha 0303" }),                           // difícil (sem pessoa no cadastro)
  C("c3", { valor: 20, origem: "manual", forma_pagamento: "dinheiro" }),                                    // difícil (sem texto)
  C("c6", { valor: 30, origem: "importado_ofx", descricao: "Karen Beatriz Alves" }),                        // fácil
  C("c4", { valor: 700, pessoa_id: "p-x" }),                                                                 // identificada
  C("c5", { valor: 50, observacoes: "lote omie pix rem Alguem 0101" }),                                     // anônima (triagem)
];
const CANDIDATOS = [{ id: "p1", nome: "Sandra Maria Silva" }, { id: "p6", nome: "Karen Beatriz Alves" }];

function servico(o: Partial<ServicoDePendentes> & { triagemIndisponivel?: boolean } = {}) {
  const s = {
    carregarContribuicoes: vi.fn(async () => structuredClone(CONTRIBUICOES)),
    carregarTriagem: vi.fn(async () => ({ vigentes: o.triagemIndisponivel ? [] : [{ lancamento_id: "c5", decisao: "anonimo" as const, motivo: null, por_nome: "Telma", em: "2026-10-20T10:00:00Z" }], indisponivel: !!o.triagemIndisponivel })),
    carregarCandidatos: vi.fn(async () => CANDIDATOS),
    vincular: vi.fn(async () => ({ ok: true })),
    desvincular: vi.fn(async () => ({ ok: true })),
    triar: vi.fn(async () => ({ ok: true })),
    buscarPessoas: vi.fn(async (t: string) => (t.toLowerCase().includes("sandra") ? [{ id: "p1", nome: "Sandra Maria Silva" }] : [])),
    buscarFamilias: vi.fn(async () => [{ id: "f1", nome: "Silva", membros: [{ id: "p1", nome: "Sandra Maria Silva", responsavel: true }, { id: "p2", nome: "João Silva", responsavel: false }] }]),
    familiaDaPessoa: vi.fn(async () => "f9"),
    ...o,
  };
  return s as unknown as ServicoDePendentes & { [K in keyof ServicoDePendentes]: ReturnType<typeof vi.fn> };
}
const esperar = (ms = 30) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[];
const clicar = async (el: HTMLElement | null | undefined) => { await act(async () => { el!.click(); }); await esperar(); };
const naFila = () => qa("[data-pendente]").map(e => e.getAttribute("data-pendente"));

async function abrir(s = servico(), aoMudar = vi.fn()) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter><PendentesDeIdentificacao servico={s} aoMudar={aoMudar} /></MemoryRouter>); });
  await esperar();
  return { s, aoMudar };
}
async function digitar(valor: string) {
  const campo = q('[data-campo="busca-vinculo"]') as HTMLInputElement;
  await act(async () => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(campo, valor); campo.dispatchEvent(new Event("input", { bubbles: true })); });
  await esperar(350);   // a busca espera 250 ms
}

describe("a taxa de identificação em quatro partes e a meta", () => {
  it("mostra identificadas, anônimas, ignoradas e pendentes (valor e quantidade) e a meta de 95%", async () => {
    await abrir();
    // total R$ 1.000: identificada 700 (70%), anônima 50 (5%), pendentes 250 (25%): 150 + 50 + 20 + 30
    expect(q("[data-taxa]")?.textContent).toBe("70%");
    expect(q('[data-parte="identificadas"] [data-valor]')?.textContent).toBe("70%");
    expect(q('[data-parte="anonimas"] [data-valor]')?.textContent).toBe("5%");
    expect(q('[data-parte="ignoradas"] [data-valor]')?.textContent).toBe("0%");
    expect(q('[data-parte="pendentes"] [data-valor]')?.textContent).toBe("25%");
    expect(q("[data-meta]")?.textContent).toContain("Meta 95%");
    expect(q("[data-meta]")?.textContent).toContain("faltam R$ 250,00");   // 95% de 1.000 = 950; tem 700
    expect(q('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("70");
  });
});

describe("a fila", () => {
  it("só tem o que NÃO tem pessoa e ainda não foi classificado; as classificadas ficam à parte", async () => {
    await abrir();
    expect(naFila().sort()).toEqual(["c1", "c2", "c3", "c6"]);
    expect(q('[data-vista="pendentes"]')?.textContent).toContain("4");
    expect(q('[data-vista="classificadas"]')?.textContent).toContain("1");
  });
  it("fácil, média e difícil: contagens e filtro; a explicação diz o que cada uma é", async () => {
    await abrir();
    expect(q('[data-dificuldade="facil"]')?.textContent).toBe("Fáceis 2");
    expect(q('[data-dificuldade="media"]')?.textContent).toBe("Médias 0");
    expect(q('[data-dificuldade="dificil"]')?.textContent).toBe("Difíceis 2");
    await clicar(q('[data-dificuldade="facil"]'));
    expect(naFila().sort()).toEqual(["c1", "c6"]);
    expect(q("[data-explicacao-dificuldade]")?.textContent).toContain("casa com UMA pessoa");
  });
  it("cada linha mostra o nome que veio do extrato e a sugestão", async () => {
    await abrir();
    const linha = q('[data-pendente="c1"]')!;
    expect(linha.querySelector("[data-remetente]")?.textContent).toContain("sandra maria silva");
    expect(linha.querySelector("[data-sugestao]")?.textContent).toContain("Sandra Maria Silva");
    expect(q('[data-pendente="c3"] [data-remetente]')?.textContent).toContain("Sem nome no extrato");
    expect(q('[data-pendente="c3"] [data-acao="aceitar"]')).toBeNull();   // sem sugestão, sem botão de aceitar
  });
  it("com mais de 50 pendentes mostra 50 e oferece 'Mostrar mais'", async () => {
    const muitas = Array.from({ length: 70 }, (_, i) => C(`m${i}`, { valor: 10 }));
    await abrir(servico({ carregarContribuicoes: vi.fn(async () => muitas) as never }));
    expect(naFila().length).toBe(50);
    await clicar(q('[data-acao="mostrar-mais"]'));
    expect(naFila().length).toBe(70);
  });
  it("fila vazia: diz que nenhuma está pendente", async () => {
    await abrir(servico({ carregarContribuicoes: vi.fn(async () => [C("x", { pessoa_id: "p" })]) as never }));
    expect(q("[data-vazio]")?.textContent).toContain("Nenhuma contribuição pendente");
  });
});

describe("as ações", () => {
  it("Aceitar sugestão: vincula à pessoa sugerida (e à família dela), tira a linha da fila, avisa o painel e oferece Desfazer", async () => {
    const { s, aoMudar } = await abrir();
    await clicar(q('[data-pendente="c1"] [data-acao="aceitar"]'));
    expect(s.familiaDaPessoa).toHaveBeenCalledWith("p1");
    expect(s.vincular).toHaveBeenCalledWith("c1", "p1", "f9");
    expect(naFila()).not.toContain("c1");
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Vinculada a Sandra Maria Silva", expect.objectContaining({ action: expect.objectContaining({ label: "Desfazer" }) }));
    expect(q("[data-taxa]")?.textContent).toBe("85%");   // 700 + 150 identificados
  });
  it("Desfazer o vínculo: remove só se ainda for aquela pessoa e devolve a linha à fila", async () => {
    const { s } = await abrir();
    await clicar(q('[data-pendente="c1"] [data-acao="aceitar"]'));
    const desfazer = (toast.success.mock.calls[0][1] as { action: { onClick: () => void } }).action.onClick;
    await act(async () => { desfazer(); }); await esperar();
    expect(s.desvincular).toHaveBeenCalledWith("c1", "p1", true);
    expect(naFila()).toContain("c1");
    expect(q("[data-taxa]")?.textContent).toBe("70%");
  });
  it("Marcar como anônimo: chama a triagem, a linha sai da fila e vai para as classificadas; Desfazer volta", async () => {
    const { s } = await abrir();
    await clicar(q('[data-pendente="c2"] [data-acao="anonimo"]'));
    expect(s.triar).toHaveBeenCalledWith("c2", "anonimo");
    expect(naFila()).not.toContain("c2");
    expect(q('[data-vista="classificadas"]')?.textContent).toContain("2");
    expect(q('[data-parte="anonimas"] [data-valor]')?.textContent).toBe("10%");   // 50 + 50 de 1.000
    const desfazer = (toast.success.mock.calls[0][1] as { action: { onClick: () => void } }).action.onClick;
    await act(async () => { desfazer(); }); await esperar();
    expect(s.triar).toHaveBeenLastCalledWith("c2", "desfeita");
    expect(naFila()).toContain("c2");
  });
  it("Ignorar: chama a triagem com 'ignorado' e entra na parte das ignoradas, que NÃO conta como identificada", async () => {
    const { s } = await abrir();
    await clicar(q('[data-pendente="c3"] [data-acao="ignorar"]'));
    expect(s.triar).toHaveBeenCalledWith("c3", "ignorado");
    expect(q('[data-parte="ignoradas"] [data-valor]')?.textContent).toBe("2%");
    expect(q("[data-taxa]")?.textContent).toBe("70%");   // ignorar não infla a taxa
  });
  it("a aba Classificadas lista a decisão e quem a tomou, com Desfazer", async () => {
    const { s } = await abrir();
    await clicar(q('[data-vista="classificadas"]'));
    expect(q('[data-classificada="c5"]')?.textContent).toContain("Anônima por Telma");
    await clicar(q('[data-acao="desfazer-classificacao"]'));
    expect(s.triar).toHaveBeenCalledWith("c5", "desfeita");
    expect(q('[data-classificada="c5"]')).toBeNull();
  });
  it("Vincular pessoa: abre a busca já com o nome do extrato, procura e vincula à escolhida", async () => {
    const { s } = await abrir();
    await clicar(q('[data-pendente="c1"] [data-acao="pessoa"]'));
    expect(q('[data-dialogo="pessoa"]')).not.toBeNull();
    expect((q('[data-campo="busca-vinculo"]') as HTMLInputElement).value).toBe("sandra maria silva");
    await esperar(350);
    await clicar(q('[data-escolha="p1"]'));
    expect(s.buscarPessoas).toHaveBeenCalled();
    expect(s.vincular).toHaveBeenCalledWith("c1", "p1", "f9");
  });
  it("busca sem resultado diz que ninguém foi encontrado", async () => {
    await abrir();
    await clicar(q('[data-pendente="c2"] [data-acao="pessoa"]'));
    await digitar("zzz inexistente");
    expect(q("[data-resultados]")?.textContent).toContain("Ninguém encontrado");
  });
  it("Vincular família: mostra os membros (responsável marcado) e vincula quem contribuiu COM a família escolhida", async () => {
    const { s } = await abrir();
    await clicar(q('[data-pendente="c2"] [data-acao="familia"]'));
    await digitar("silva");
    expect(q('[data-familia="f1"]')?.textContent).toContain("responsável");
    await clicar(q('[data-familia="f1"] [data-escolha="p2"]'));
    expect(s.vincular).toHaveBeenCalledWith("c2", "p2", "f1");
    expect(s.familiaDaPessoa).not.toHaveBeenCalled();   // a família já foi escolhida: não procura outra
  });
  it("erro na escrita (RLS ou mês fechado): avisa, NÃO tira a linha da fila e NÃO avisa o painel", async () => {
    const { s, aoMudar } = await abrir(servico({ vincular: vi.fn(async () => ({ ok: false, erro: "O mês está fechado." })) as never }));
    await clicar(q('[data-pendente="c1"] [data-acao="aceitar"]'));
    expect(toast.error).toHaveBeenCalledWith("O mês está fechado.");
    expect(naFila()).toContain("c1");
    expect(aoMudar).not.toHaveBeenCalled();
    expect(s.vincular).toHaveBeenCalledTimes(1);
  });
});

describe("migration ainda não aplicada e registro de acesso", () => {
  it("sem a triagem no banco: avisa, desabilita Anônimo e Ignorar, e deixa vincular", async () => {
    await abrir(servico({ triagemIndisponivel: true }));
    expect(q('[data-aviso="triagem-indisponivel"]')?.textContent).toContain("migration pendente");
    expect((q('[data-pendente="c1"] [data-acao="anonimo"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-pendente="c1"] [data-acao="ignorar"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-pendente="c1"] [data-acao="aceitar"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it("a fila (nomes e valores) só aparece depois de registrar o acesso 'ver_pendentes' com o recorte", async () => {
    await abrir();
    expect(registrar).toHaveBeenCalledWith("ver_pendentes", { desde: "2026-01-01" }, 4);
    expect(naFila().length).toBe(4);
  });
  it("registro com erro NÃO libera a fila", async () => {
    registrar.mockResolvedValue({ ok: false, indisponivel: false, erro: "sem permissão" });
    await abrir();
    expect(naFila().length).toBe(0);
    expect(q('[data-registro="erro"]')?.textContent).toContain("não é mostrada");
  });
  it("função de registro ausente: mostra COM o aviso de que não ficou registrado", async () => {
    registrar.mockResolvedValue({ ok: false, indisponivel: true, erro: "x" });
    await abrir();
    expect(naFila().length).toBe(4);
    expect(q('[data-registro="indisponivel"]')?.textContent).toContain("NÃO ficou registrada");
  });
  it("erro ao carregar as contribuições aparece", async () => {
    await abrir(servico({ carregarContribuicoes: vi.fn(async () => { throw new Error("falha de rede"); }) as never }));
    expect(q('[data-erro="pendentes"]')?.textContent).toContain("falha de rede");
  });
});
