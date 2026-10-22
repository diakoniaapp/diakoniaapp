import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResumoDiarioConfig, ResumoDiarioDestinatario, ResumoDiarioStatus } from "@/services/sistemaService";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/envioDePagamentosService", () => ({ buscarPessoasComEmail: async () => [] }));

import { ResumoDiarioDaTesouraria, type ServicoDoDiario } from "./ResumoDiarioDaTesouraria";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

const CONFIG: ResumoDiarioConfig = { ativo: false, dias_semana: [1, 2, 3, 4, 5], hora: 7, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, incluir_sigilosos: true };
const status = (o: Partial<ResumoDiarioStatus> = {}): ResumoDiarioStatus => ({
  config: CONFIG, destinatarios: [{ nome: "Bruno Sepulvida", email: "bruno@x.org" }], execucoes: [], agendamento_existe: true, agendamento_ativo: false, ultimo_envio: {}, ...o,
});

function servico(o: { status?: ResumoDiarioStatus; pessoas?: { nome: string; email: string }[]; falharCarga?: string } = {}) {
  const salvos: { config: ResumoDiarioConfig; destinatarios: ResumoDiarioDestinatario[] }[] = [];
  const s: ServicoDoDiario & { salvos: typeof salvos; testes: number; previas: number } = {
    salvos, testes: 0, previas: 0,
    carregarStatusResumoDiario: async () => { if (o.falharCarga) throw new Error(o.falharCarga); return o.status ?? status(); },
    salvarResumoDiario: async (config, destinatarios) => { salvos.push({ config, destinatarios }); },
    previaDoResumoDiario: async () => { s.previas++; return { assunto: "Resumo diário da Tesouraria | 22.10.2026 · 2 pagamentos", html: "<p>prévia</p>", hoje: "2026-10-22", contagem: { pagar: 2, conferir: 1, semMeio: 1, sigilosos: 0, sigilososIncluidos: 0 }, total: { quantidade: 2, valor: 350, atrasados: { quantidade: 1, valor: 300 }, hoje: { quantidade: 1, valor: 50 } } }; },
    enviarTesteDoResumoDiario: async () => { s.testes++; return { enviadoPara: "eu@x.org", itens: 3 }; },
    buscarPessoasComEmail: async () => o.pessoas ?? [],
  };
  return s;
}

async function abrir(s: ReturnType<typeof servico>) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<ResumoDiarioDaTesouraria servico={s} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo;
}
const botao = (re: RegExp) => [...document.body.querySelectorAll("button")].find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement | undefined;
const clicar = async (el: Element | undefined | null) => { await act(async () => { (el as HTMLElement).click(); }); };
function digitar(el: HTMLInputElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

describe("Resumo diário da Tesouraria — interruptor, horário e destinatários", () => {
  it("abre DESLIGADO, com os dias e o horário do padrão e os destinatários salvos", async () => {
    const alvo = await abrir(servico());
    expect(alvo.textContent).toContain("Desligado — nada é enviado");
    expect([...alvo.querySelectorAll('[aria-label="Dias da semana"] button')].map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "true", "true", "true", "true", "false"]);
    expect((alvo.querySelector('[aria-label="Hora do envio"]') as HTMLInputElement).value).toBe("7");
    expect(alvo.querySelector('[data-destinatario="bruno@x.org"]')).not.toBeNull();
    expect(alvo.textContent).toContain("Pausado no servidor");
  });
  it("sem mudança, Salvar fica desligado; mexer em qualquer coisa liga o Salvar", async () => {
    const alvo = await abrir(servico());
    expect(botao(/Salvar resumo diário/)!.disabled).toBe(true);
    await clicar(alvo.querySelector('[aria-label="Dias da semana"] button:last-child'));   // sábado
    expect(botao(/Salvar resumo diário/)!.disabled).toBe(false);
    expect(alvo.textContent).toContain("Há mudanças ainda não salvas");
  });
  it("ligar manda a configuração E os destinatários juntos", async () => {
    const s = servico();
    await abrir(s);
    await clicar(document.body.querySelector('[aria-label="Resumo diário"]'));
    digitar(document.body.querySelector('[aria-label="Hora do envio"]') as HTMLInputElement, "8");
    await clicar(botao(/Salvar resumo diário/));
    expect(s.salvos).toHaveLength(1);
    expect(s.salvos[0].config).toMatchObject({ ativo: true, hora: 8, minuto: 0, dias_semana: [1, 2, 3, 4, 5] });
    expect(s.salvos[0].destinatarios.map(d => d.email)).toEqual(["bruno@x.org"]);
  });
  it("não deixa LIGAR sem destinatário (explica e trava o Salvar)", async () => {
    const alvo = await abrir(servico({ status: status({ destinatarios: [] }) }));
    await clicar(document.body.querySelector('[aria-label="Resumo diário"]'));
    expect(alvo.querySelector('[role="alert"]')?.textContent).toContain("Cadastre ao menos um destinatário");
    expect(botao(/Salvar resumo diário/)!.disabled).toBe(true);
  });
  it("busca uma pessoa do Cadastro, adiciona e remove; quem já está é marcado", async () => {
    const s = servico({ pessoas: [{ nome: "Caio Marcelo", email: "caio@x.org" }, { nome: "Bruno Sepulvida", email: "bruno@x.org" }] });
    const alvo = await abrir(s);
    digitar(alvo.querySelector('[aria-label="Buscar destinatário"]') as HTMLInputElement, "ca");
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    expect(alvo.querySelector('[aria-label="Pessoas encontradas"]')?.textContent).toContain("já está");
    await clicar(botao(/Adicionar Caio Marcelo/));
    expect(alvo.querySelector('[data-destinatario="caio@x.org"]')).not.toBeNull();
    await clicar(botao(/Remover Bruno Sepulvida/));
    expect(alvo.querySelector('[data-destinatario="bruno@x.org"]')).toBeNull();
    await clicar(botao(/Salvar resumo diário/));
    expect(s.salvos[0].destinatarios.map(d => d.email)).toEqual(["caio@x.org"]);
  });
  it("Visualizar e-mail mostra o assunto, os números do dia e o e-mail isolado (sem enviar nada)", async () => {
    const s = servico();
    await abrir(s);
    await clicar(botao(/Visualizar e-mail/));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(s.previas).toBe(1);
    expect(s.testes).toBe(0);
    expect(document.body.textContent).toContain("2 para pagar (R$ 350,00)");
    expect(document.body.textContent).toContain("1 a conferir");
    expect(document.body.textContent).toContain("1 sem meio automático");
    expect(document.body.querySelector("iframe")?.getAttribute("sandbox")).toBe("");
  });
  it("Enviar teste manda UM teste (o destino é do servidor: o e-mail de quem está logado)", async () => {
    const s = servico();
    await abrir(s);
    await clicar(botao(/Enviar teste para mim/));
    expect(s.testes).toBe(1);
  });
  it("os sigilosos vêm INCLUÍDOS por padrão; desmarcar vai na configuração e na prévia ainda não salva", async () => {
    let previaPediu: boolean | undefined;
    const s = servico();
    s.previaDoResumoDiario = async (incluir?: boolean) => { previaPediu = incluir; return { assunto: "x", html: "<p>x</p>", hoje: "2026-10-22", contagem: { pagar: 0, conferir: 0, semMeio: 0, sigilosos: 0, sigilososIncluidos: 0 }, total: { quantidade: 0, valor: 0, atrasados: { quantidade: 0, valor: 0 }, hoje: { quantidade: 0, valor: 0 } } }; };
    await abrir(s);
    const caixa = document.body.querySelector('[aria-label="Incluir pagamentos sigilosos"]') as HTMLInputElement;
    expect(caixa.checked).toBe(true);
    await clicar(caixa);
    await clicar(botao(/Visualizar e-mail/));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(previaPediu).toBe(false);   // a prévia usa a escolha que está na tela, mesmo sem salvar
    await clicar(botao(/Salvar resumo diário/));
    expect(s.salvos[0].config.incluir_sigilosos).toBe(false);
  });
  it("mostra o agendamento ativo e o último envio", async () => {
    const alvo = await abrir(servico({ status: status({ config: { ...CONFIG, ativo: true }, agendamento_ativo: true, ultimo_envio: { em: "2026-10-21T10:00:00Z", itens: 3 } }) }));
    expect(alvo.querySelector("[data-agendamento]")?.textContent).toContain("Ativo no servidor — segunda a sexta, às 07:00");
    expect(alvo.querySelector("[data-agendamento]")?.textContent).toContain("3 pagamentos");
  });
  it("sem a migration, explica o que fazer em vez de mostrar uma tela quebrada", async () => {
    const alvo = await abrir(servico({ falharCarga: "O resumo diário ainda não foi criado no banco — aplique a migration 20261022210000." }));
    expect(alvo.querySelector('[role="alert"]')?.textContent).toContain("aplique a migration 20261022210000");
  });
});
