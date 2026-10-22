import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mesclarConfig, type PerfilConfigurado } from "@/lib/resumoSemanalCatalogo";

const salvou: PerfilConfigurado[][] = [];
const previas: { perfil: string; blocos: { bloco: string; ativo: boolean }[] }[] = [];
const testes: string[] = [];
let falharCarga: string | null = null;

vi.mock("@/services/sistemaService", () => ({
  carregarConfigDoResumo: async () => { if (falharCarga) throw new Error(falharCarga); return mesclarConfig(null); },
  carregarPessoasDoResumo: async () => [
    { perfil: "tesouraria", nome: "Bruno Sepulvida", email: "bruno@x.org" },
    { perfil: "tesouraria", nome: "Sem Email", email: null },
    { perfil: "pastoral", nome: "Lucio Barreto", email: "lucio@x.org" },
  ],
  salvarConfigDoResumo: async (c: PerfilConfigurado[]) => { salvou.push(c); },
  previaDoResumo: async (perfil: string, blocos: { bloco: string; ativo: boolean }[]) => { previas.push({ perfil, blocos }); return { assunto: "Diakonia — resumo da semana", html: "<p>prévia</p>", blocos: [] }; },
  enviarTesteDoResumo: async (perfil: string) => { testes.push(perfil); return { enviadoPara: "eu@x.org" }; },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ConteudoDoResumoSemanal } from "./ConteudoDoResumoSemanal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => {
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; salvou.length = 0; previas.length = 0; testes.length = 0; falharCarga = null; });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<ConteudoDoResumoSemanal />); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo;
}
const botao = (re: RegExp) => [...document.body.querySelectorAll("button")].find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement | undefined;
const ordemNaTela = () => [...document.body.querySelectorAll('[role="tabpanel"][data-state="active"] li[data-bloco]')].map(li => li.getAttribute("data-bloco"));
async function clicar(el: Element | undefined) { await act(async () => { (el as HTMLElement).click(); }); }

describe("ConteudoDoResumoSemanal — a igreja decide o que cada perfil recebe", () => {
  it("abre na Tesouraria com os blocos que ela pediu, na ordem do padrão, e as pessoas do perfil (a sem e-mail avisada)", async () => {
    const alvo = await abrir();
    expect(ordemNaTela()).toEqual(expect.arrayContaining(["contas_atrasadas", "vencimentos_semana", "debitos_automaticos", "reembolsos", "saldo_contas", "prontidao_malote", "documentos_pendentes", "recursos_reservados"]));
    expect(ordemNaTela()![0]).toBe("contas_atrasadas");
    expect(alvo.textContent).toContain("Bruno Sepulvida");
    expect(alvo.textContent).toContain("sem e-mail — não recebe");
    expect(alvo.textContent).not.toContain("Lucio Barreto");   // é do perfil Pastoral
  });
  it("os blocos 'em preparação' aparecem travados e explicados", async () => {
    await abrir();
    const li = document.body.querySelector('li[data-bloco="prontidao_malote"]')!;
    expect(li.textContent).toContain("Em preparação");
    expect((li.querySelector('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it("sem mudança, Salvar fica desligado; desligar um bloco liga o Salvar e avisa; Descartar volta ao salvo", async () => {
    const alvo = await abrir();
    expect(botao(/Salvar conteúdo/)!.disabled).toBe(true);
    await clicar(document.body.querySelector('[aria-label="Incluir Saldo das contas"]')!);
    expect(botao(/Salvar conteúdo/)!.disabled).toBe(false);
    expect(alvo.textContent).toContain("Há mudanças ainda não salvas");
    await clicar(botao(/Descartar/));
    expect(botao(/Salvar conteúdo/)!.disabled).toBe(true);
  });
  it("subir um bloco muda a ordem; salvar manda a configuração inteira com a nova ordem", async () => {
    await abrir();
    await clicar(document.body.querySelector('[aria-label="Subir Vencimentos da semana"]')!);
    expect(ordemNaTela()!.slice(0, 2)).toEqual(["vencimentos_semana", "contas_atrasadas"]);
    await clicar(document.body.querySelector('[aria-label="Incluir Saldo das contas"]')!);
    await clicar(botao(/Salvar conteúdo/));
    expect(salvou).toHaveLength(1);
    const tes = salvou[0].find(p => p.perfil === "tesouraria")!;
    expect(tes.blocos.slice(0, 2).map(b => b.bloco)).toEqual(["vencimentos_semana", "contas_atrasadas"]);
    expect(tes.blocos.find(b => b.bloco === "saldo_contas")!.ativo).toBe(false);
    expect(salvou[0].map(p => p.perfil)).toEqual(["administracao", "tesouraria", "secretaria", "pastoral"]);
  });
  it("Visualizar e-mail manda o perfil e os blocos DA TELA (mesmo sem salvar) e mostra o e-mail", async () => {
    await abrir();
    await clicar(document.body.querySelector('[aria-label="Incluir Reembolsos"]')!);
    await clicar(botao(/Visualizar e-mail/));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(previas).toHaveLength(1);
    expect(previas[0].perfil).toBe("tesouraria");
    expect(previas[0].blocos.find(b => b.bloco === "reembolsos")!.ativo).toBe(false);
    expect(document.body.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>prévia</p>");
    expect(document.body.querySelector("iframe")?.getAttribute("sandbox")).toBe("");   // o HTML da prévia roda isolado
  });
  it("Enviar teste manda só o perfil e os blocos (o destino é do servidor: o e-mail de quem está logado)", async () => {
    await abrir();
    await clicar(botao(/Enviar teste para mim/));
    expect(testes).toEqual(["tesouraria"]);
  });
  it("desligar o perfil mostra 'off' na aba e vale ao salvar", async () => {
    await abrir();
    await clicar(document.body.querySelector('[aria-label="Tesouraria recebe o resumo"]')!);
    expect(document.body.textContent).toContain("Desligado — ninguém recebe por este perfil.");
    await clicar(botao(/Salvar conteúdo/));
    expect(salvou[0].find(p => p.perfil === "tesouraria")!.ativo).toBe(false);
  });
  it("sem a migration, explica o que fazer em vez de mostrar uma tela quebrada", async () => {
    falharCarga = "A configuração do resumo ainda não foi criada no banco — aplique a migration 20261022200000.";
    const alvo = await abrir();
    expect(alvo.querySelector('[role="alert"]')?.textContent).toContain("aplique a migration 20261022200000");
  });
});
