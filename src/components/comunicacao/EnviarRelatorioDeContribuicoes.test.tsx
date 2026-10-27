// ─── A gaveta "Enviar por e-mail" e o Histórico de envios (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Trava: a prévia é OBRIGATÓRIA (e perde a validade se o período muda); destinatários limpos e limitados; o envio só sai depois da confirmação, para a lista certa e o período certo; o aviso de que só
// vão números agregados; o teste vai só para quem pediu; o piso de 01/01/2026; e o Histórico mostra quem pediu, para quem foi e o resultado — ou avisa que a migration está pendente.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/data", async orig => ({ ...(await orig<typeof import("@/lib/data")>()), hojeLocal: () => "2026-10-27" }));

import { EnviarRelatorioDeContribuicoes, type ServicoDoEnvio } from "./EnviarRelatorioDeContribuicoes";
import { HistoricoDeEnvios } from "./HistoricoDeEnvios";
import { blocosDoModelo, IDS_DOS_BLOCOS } from "@/lib/contribuicoesBlocos";
import { CatalogoDeRelatorios } from "./CatalogoDeRelatorios";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); });

const PASTOR = IDS_DOS_BLOCOS.filter(id => blocosDoModelo("pastor").includes(id));   // na ordem canônica, a que a gaveta envia
const PREVIA = { assunto: "Relatório de contribuições — 28/04/2026 a 27/10/2026", html: "<p>corpo</p>", texto: "corpo", resumo: "resumo", periodo: { ini: "2026-04-28", fim: "2026-10-27", ajustado: false } };
function servico(o: Partial<ServicoDoEnvio> = {}) {
  const s = {
    previa: vi.fn(async () => PREVIA),
    teste: vi.fn(async () => ({ enviadoPara: "telma@qibrj.org.br" })),
    enviar: vi.fn(async () => ({ enviados: 1, falharam: 0, historicoGravado: true })),
    ...o,
  };
  return s as unknown as ServicoDoEnvio & { previa: ReturnType<typeof vi.fn>; teste: ReturnType<typeof vi.fn>; enviar: ReturnType<typeof vi.fn> };
}
const esperar = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[];
const clicar = async (el: HTMLElement | null | undefined) => { await act(async () => { el!.click(); }); await esperar(); };
const botaoEnviar = () => q('[data-acao="enviar"]') as HTMLButtonElement | null;

async function abrirGaveta(s: ReturnType<typeof servico>, extra: Partial<React.ComponentProps<typeof EnviarRelatorioDeContribuicoes>> = {}) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  const aoFechar = vi.fn(), aoEnviar = vi.fn();
  await act(async () => { raiz!.render(<EnviarRelatorioDeContribuicoes aberto aoFechar={aoFechar} aoEnviar={aoEnviar} servico={s} {...extra} />); });
  await esperar();
  return { aoFechar, aoEnviar };
}
async function digitar(valor: string) {
  const campo = q("#destinatario-novo") as HTMLInputElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(campo, valor); campo.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
}

describe("a gaveta de envio", () => {
  it("abre com 6 meses, diz que só vão números agregados e traz os atalhos de período", async () => {
    await abrirGaveta(servico());
    expect(q("[data-periodo]")?.textContent).toContain("28/04/2026 a 27/10/2026");
    expect(q('[data-gaveta="relatorio-contribuicoes"]')?.textContent).toContain("nenhum nome e nenhum valor individual");
    expect(qa("[data-preset]").map(b => b.getAttribute("data-preset"))).toEqual(["90d", "6m", "12m", "ano", "desde_piso", "personalizado"]);
  });
  it("o período vindo da tela Doadores abre como personalizado", async () => {
    await abrirGaveta(servico(), { periodoInicial: { ini: "2026-03-01", fim: "2026-03-31" } });
    expect(q("[data-periodo]")?.textContent).toContain("01/03/2026 a 31/03/2026");
    expect(q('[data-preset="personalizado"]')?.getAttribute("aria-pressed")).toBe("true");
  });
  it("PRÉVIA OBRIGATÓRIA: o Enviar começa desabilitado, mesmo com destinatário, e o aviso explica", async () => {
    await abrirGaveta(servico());
    await digitar("pastor@qibrj.org.br");
    expect(botaoEnviar()!.disabled).toBe(true);
    expect(q('[data-aviso="previa-obrigatoria"]')).not.toBeNull();
  });
  it("depois de visualizar, com destinatário, o Enviar habilita; a prévia aparece num iframe sem permissões", async () => {
    const s = servico();
    await abrirGaveta(s);
    await digitar("pastor@qibrj.org.br");
    await clicar(q('[data-acao="visualizar"]'));
    expect(s.previa).toHaveBeenCalledWith({ ini: "2026-04-28", fim: "2026-10-27" }, PASTOR);
    const frame = q("iframe") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBe("<p>corpo</p>");
    expect(botaoEnviar()!.disabled).toBe(false);
  });
  it("mudar o período depois da prévia tira a validade dela e trava o Enviar de novo", async () => {
    await abrirGaveta(servico());
    await digitar("pastor@qibrj.org.br");
    await clicar(q('[data-acao="visualizar"]'));
    expect(botaoEnviar()!.disabled).toBe(false);
    await clicar(q('[data-preset="90d"]'));
    expect(botaoEnviar()!.disabled).toBe(true);
    expect(q('[data-previa="antiga"]')).not.toBeNull();
  });
  it("sem destinatário o Enviar fica travado mesmo com prévia", async () => {
    await abrirGaveta(servico());
    await clicar(q('[data-acao="visualizar"]'));
    expect(botaoEnviar()!.disabled).toBe(true);
  });
});

describe("o que mostrar: modelos e blocos", () => {
  const marcados = () => qa("[data-bloco]").filter(c => (c as HTMLInputElement).checked).map(c => c.getAttribute("data-bloco"));
  it("abre no modelo Pastor, com os blocos do modelo marcados, e diz que só vão números agregados", async () => {
    await abrirGaveta(servico());
    expect(q('[data-modelo="pastor"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(marcados()).toEqual(IDS_DOS_BLOCOS.filter(id => PASTOR.includes(id)));
    expect(marcados()).toContain("saude_da_base");
    expect(q('[data-aviso="so-agregado"]')?.textContent).toContain("Nomes, valores individuais, telefone e e-mail não são blocos do e-mail");
  });
  it("os três modelos: Pastor, Diretoria e Tesouraria; Diretoria não leva a saúde da base, Tesouraria leva tudo", async () => {
    await abrirGaveta(servico());
    expect(qa("[data-modelo]").map(b => b.getAttribute("data-modelo"))).toEqual(["pastor", "diretoria", "tesouraria", "personalizado"]);
    await clicar(q('[data-modelo="diretoria"]'));
    expect(marcados()).toContain("categorias");
    expect(marcados()).not.toContain("saude_da_base");
    await clicar(q('[data-modelo="tesouraria"]'));
    expect(marcados()).toEqual(IDS_DOS_BLOCOS);
  });
  it("desmarcar um bloco vira 'Personalizado'; e voltar à seleção de um modelo o reconhece", async () => {
    await abrirGaveta(servico());
    await clicar(q('[data-bloco="curva_adesao"]'));
    expect(q('[data-modelo="personalizado"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(q('[data-modelo="pastor"]')?.getAttribute("aria-pressed")).toBe("false");
    await clicar(q('[data-bloco="curva_adesao"]'));
    expect(q('[data-modelo="pastor"]')?.getAttribute("aria-pressed")).toBe("true");
  });
  it("mudar um bloco depois da prévia tira a validade dela e trava o Enviar", async () => {
    await abrirGaveta(servico());
    await digitar("pastor@qibrj.org.br");
    await clicar(q('[data-acao="visualizar"]'));
    expect(botaoEnviar()!.disabled).toBe(false);
    await clicar(q('[data-bloco="destaques"]'));
    expect(botaoEnviar()!.disabled).toBe(true);
    expect(q('[data-previa="antiga"]')).not.toBeNull();
  });
  it("o pedido leva os blocos escolhidos, na ordem canônica", async () => {
    const s = servico();
    await abrirGaveta(s);
    await clicar(q('[data-modelo="diretoria"]'));
    await clicar(q('[data-bloco="categorias"]'));   // tira categorias
    await clicar(q('[data-acao="visualizar"]'));
    const blocos = s.previa.mock.calls[0][1] as string[];
    expect(blocos).not.toContain("categorias");
    expect(blocos).toEqual(IDS_DOS_BLOCOS.filter(id => blocos.includes(id)));
  });
  it("sem nenhum bloco: avisa e não deixa visualizar nem testar", async () => {
    await abrirGaveta(servico());
    for (const id of qa("[data-bloco]").filter(c => (c as HTMLInputElement).checked).map(c => c.getAttribute("data-bloco"))) await clicar(q(`[data-bloco="${id}"]`));
    expect(q('[data-aviso="sem-blocos"]')).not.toBeNull();
    expect((q('[data-acao="visualizar"]') as HTMLButtonElement).disabled).toBe(true);
    expect((q('[data-acao="teste"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it("não existe bloco com nome, valor individual, telefone ou e-mail de pessoa no construtor", async () => {
    await abrirGaveta(servico());
    const texto = qa("[data-bloco]").map(c => c.parentElement?.textContent ?? "").join(" ").toLowerCase();
    expect(texto).not.toMatch(/telefone|lista nominal|valor individual/);
    expect(IDS_DOS_BLOCOS).not.toContain("nomes" as never);
  });
});

describe("destinatários", () => {
  it("aceita vários separados por vírgula, em minúsculas e sem repetição; dá para remover", async () => {
    await abrirGaveta(servico());
    await digitar("Pastor@QIBRJ.org.br, outro@x.com, pastor@qibrj.org.br");
    expect(qa("[data-destinatario]").map(e => e.getAttribute("data-destinatario"))).toEqual(["pastor@qibrj.org.br", "outro@x.com"]);
    await clicar(q('[data-destinatario="outro@x.com"] button'));
    expect(qa("[data-destinatario]").length).toBe(1);
  });
  it("e-mail inválido não entra e a tela diz qual", async () => {
    await abrirGaveta(servico());
    await digitar("isto-nao-e-email");
    expect(qa("[data-destinatario]").length).toBe(0);
    expect(q('[data-erro="destinatario"]')?.textContent).toContain("isto-nao-e-email");
  });
  it("no máximo 10", async () => {
    await abrirGaveta(servico());
    await digitar(Array.from({ length: 11 }, (_, i) => `p${i}@x.com`).join(","));
    expect(qa("[data-destinatario]").length).toBe(0);
    expect(q('[data-erro="destinatario"]')?.textContent).toContain("No máximo 10");
  });
});

describe("enviar", () => {
  async function prepararEnvio(s: ReturnType<typeof servico>) {
    const gaveta = await abrirGaveta(s);
    await digitar("pastor@qibrj.org.br");
    await clicar(q('[data-acao="visualizar"]'));
    return gaveta;
  }
  it("pede confirmação dizendo o período, os destinatários e que não leva nomes; só então envia", async () => {
    const s = servico();
    const { aoEnviar, aoFechar } = await prepararEnvio(s);
    await clicar(botaoEnviar());
    const confirmacao = q('[data-confirmacao="envio"]')!;
    expect(confirmacao.textContent).toContain("28/04/2026 a 27/10/2026");
    expect(confirmacao.textContent).toContain("pastor@qibrj.org.br");
    expect(confirmacao.textContent).toContain("sem nomes");
    expect(s.enviar).not.toHaveBeenCalled();
    await clicar([...confirmacao.querySelectorAll("button")].find(b => b.textContent === "Enviar"));
    expect(s.enviar).toHaveBeenCalledWith({ ini: "2026-04-28", fim: "2026-10-27" }, PASTOR, ["pastor@qibrj.org.br"]);
    expect(toast.success).toHaveBeenCalledWith("Relatório enviado para 1 destinatário");
    expect(aoEnviar).toHaveBeenCalled();
    expect(aoFechar).toHaveBeenCalled();
  });
  it("cancelar a confirmação não envia nada", async () => {
    const s = servico();
    await prepararEnvio(s);
    await clicar(botaoEnviar());
    await clicar([...q('[data-confirmacao="envio"]')!.querySelectorAll("button")].find(b => b.textContent === "Cancelar"));
    expect(s.enviar).not.toHaveBeenCalled();
  });
  it("já enviado há pouco: avisa e não fecha como se tivesse enviado", async () => {
    const s = servico({ enviar: vi.fn(async () => ({ enviados: 0, falharam: 0, historicoGravado: true, motivo: "enviado_ha_pouco" as const })) });
    const { aoEnviar } = await prepararEnvio(s);
    await clicar(botaoEnviar());
    await clicar([...q('[data-confirmacao="envio"]')!.querySelectorAll("button")].find(b => b.textContent === "Enviar"));
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("há menos de 10 minutos"));
    expect(aoEnviar).not.toHaveBeenCalled();
  });
  it("falha parcial e histórico não gravado são ditos claramente", async () => {
    const s = servico({ enviar: vi.fn(async () => ({ enviados: 1, falharam: 1, historicoGravado: false })) });
    await prepararEnvio(s);
    await clicar(botaoEnviar());
    await clicar([...q('[data-confirmacao="envio"]')!.querySelectorAll("button")].find(b => b.textContent === "Enviar"));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("falhou para 1"));
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("histórico não foi gravado"));
  });
  it("erro do servidor aparece e a gaveta continua aberta", async () => {
    const s = servico({ enviar: vi.fn(async () => { throw new Error("Só a administração e o pastor titular podem visualizar ou enviar este relatório."); }) });
    const { aoFechar } = await prepararEnvio(s);
    await clicar(botaoEnviar());
    await clicar([...q('[data-confirmacao="envio"]')!.querySelectorAll("button")].find(b => b.textContent === "Enviar"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("Só a administração"));
    expect(aoFechar).not.toHaveBeenCalled();
  });
  it("o teste vai só para quem pediu: não recebe destinatários", async () => {
    const s = servico();
    await abrirGaveta(s);
    await clicar(q('[data-acao="teste"]'));
    expect(s.teste).toHaveBeenCalledWith({ ini: "2026-04-28", fim: "2026-10-27" }, PASTOR);
    expect(s.teste.mock.calls[0].length).toBe(2);   // período e blocos — nunca destinatários
    expect(toast.success).toHaveBeenCalledWith("Teste enviado para telma@qibrj.org.br");
  });
  it("período antes do piso: avisa, ajusta e o pedido sai a partir de 01/01/2026", async () => {
    const s = servico();
    await abrirGaveta(s, { periodoInicial: { ini: "2025-06-01", fim: "2026-03-31" } });
    expect(q("[data-periodo]")?.textContent).toContain("01/01/2026 a 31/03/2026");
    expect(q("[data-periodo]")?.textContent).toContain("ajustado");
    await clicar(q('[data-acao="visualizar"]'));
    expect(s.previa).toHaveBeenCalledWith({ ini: "2026-01-01", fim: "2026-03-31" }, PASTOR);
  });
});

describe("o catálogo de relatórios", () => {
  async function abrirCatalogo(url: string, s = servico()) {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><CatalogoDeRelatorios servicoDoEnvio={s} /></MemoryRouter>); });
    await esperar();
  }
  it("só Doadores tem 'Enviar por e-mail'; os outros dizem que o envio está por vir", async () => {
    await abrirCatalogo("/comunicacao?aba=relatorios");
    expect(qa('[data-acao="enviar-doadores"]').length).toBe(1);
    expect(q('[data-relatorio="doadores"] [data-acao="enviar-doadores"]')).not.toBeNull();
    expect(qa("[data-relatorio]").filter(c => c.textContent?.includes("Envio por e-mail em breve")).length).toBe(3);
    expect(q('[data-gaveta="relatorio-contribuicoes"]')).toBeNull();
  });
  it("o botão abre a gaveta", async () => {
    await abrirCatalogo("/comunicacao?aba=relatorios");
    await clicar(q('[data-acao="enviar-doadores"]'));
    expect(q('[data-gaveta="relatorio-contribuicoes"]')).not.toBeNull();
  });
  it("?enviar=doadores&de=&ate= (o botão da tela Doadores) abre a gaveta já com o período", async () => {
    await abrirCatalogo("/comunicacao?aba=relatorios&enviar=doadores&de=2026-03-01&ate=2026-03-31");
    expect(q("[data-periodo]")?.textContent).toContain("01/03/2026 a 31/03/2026");
  });
});

describe("o histórico de envios", () => {
  async function abrirHistorico(listar: () => Promise<import("@/services/comunicacaoService").HistoricoDosEnvios>) {
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    await act(async () => { raiz!.render(<HistoricoDeEnvios servico={{ listar }} />); });
    await esperar();
  }
  it("mostra quem pediu, o período, para quem foi e o resultado de cada envio", async () => {
    await abrirHistorico(async () => ({ indisponivel: false, envios: [
      { id: "1", em: "2026-10-27T15:00:00Z", tipo: "relatorio_contribuicoes", origem: "sob_demanda", solicitante_nome: "Telma Souza", assunto: "x", destinatarios: [{ email: "pastor@qibrj.org.br", ok: true, erro: null }, { email: "b@x.com", ok: false, erro: "x" }], parametros: { ini: "2026-04-28", fim: "2026-10-27" }, resultado: "parcial" },
      { id: "2", em: "2026-10-26T15:00:00Z", tipo: "relatorio_contribuicoes", origem: "teste", solicitante_nome: null, assunto: "y", destinatarios: [{ email: "t@x.com", ok: false, erro: "x" }], parametros: {}, resultado: "falhou" },
    ] }));
    const a = q('[data-envio="1"]')!.textContent!;
    expect(a).toContain("Relatório de contribuições");
    expect(a).toContain("Enviado em parte");
    expect(a).toContain("pedido por Telma Souza");
    expect(a).toContain("Período 28/04/2026 a 27/10/2026");
    expect(a).toContain("pastor@qibrj.org.br, b@x.com (falhou)");
    expect(q('[data-envio="2"]')!.textContent).toContain("Teste do relatório de contribuições");
    expect(q('[data-envio="2"]')!.textContent).toContain("Falhou");
  });
  it("vazio: diz que nada foi enviado ainda", async () => {
    await abrirHistorico(async () => ({ indisponivel: false, envios: [] }));
    expect(q("[data-vazio]")?.textContent).toContain("Nenhum relatório foi enviado");
  });
  it("tabela ainda inexistente (migration pendente): avisa em vez de parecer vazio", async () => {
    await abrirHistorico(async () => ({ indisponivel: true, envios: [] }));
    expect(q('[data-aviso="historico-indisponivel"]')?.textContent).toContain("migration pendente");
    expect(q("[data-vazio]")).toBeNull();
  });
  it("erro de leitura aparece", async () => {
    await abrirHistorico(async () => { throw new Error("permissão negada"); });
    expect(q('[data-erro="historico"]')?.textContent).toContain("permissão negada");
  });
});
