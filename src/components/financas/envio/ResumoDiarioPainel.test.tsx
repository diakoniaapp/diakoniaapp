// O painel "Resumo diário" da Mesa (23/10/2026): situação (ligado, último e próximo envio, destinatários), Visualizar, Enviar agora (com confirmação), Configurar e o envio manual de antes.
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumoDiarioStatus } from "@/services/sistemaService";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let papeis: string[] = ["admin"];
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: (r: string[]) => r.some(x => papeis.includes(x)) }) }));
const avisos = { ok: vi.fn(), aviso: vi.fn(), erro: vi.fn() };
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => avisos.ok(...a), warning: (...a: unknown[]) => avisos.aviso(...a), error: (...a: unknown[]) => avisos.erro(...a) } }));

import { ResumoDiarioPainel, mensagemDoEnvioAgora, type ServicoDoPainelDiario } from "./ResumoDiarioPainel";

const status = (o: Omit<Partial<ResumoDiarioStatus>, "config"> & { config?: Partial<ResumoDiarioStatus["config"]> } = {}): ResumoDiarioStatus => ({
  destinatarios: [{ id: "1", nome: "Bruno Souza", email: "bruno@x.org" }, { id: "2", nome: "Lúcio Dias", email: "lucio@x.org" }] as never,
  execucoes: [], agendamento_existe: true, agendamento_ativo: true, ultimo_envio: { em: "2026-10-23T11:00:00Z", itens: 4 }, ...o,
  config: { ativo: true, dias_semana: [1, 2, 3, 4, 5], hora: 8, minuto: 0, janela_dias: 0, enviar_sem_pagamentos: false, incluir_sigilosos: true, ...o.config } as never,
});

let raiz: Root | null = null;
let servico: ServicoDoPainelDiario;
const fechou = vi.fn(); const manual = vi.fn();
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
beforeEach(() => {
  papeis = ["admin"]; fechou.mockReset(); manual.mockReset(); Object.values(avisos).forEach(f => f.mockReset());
  servico = {
    carregarStatusResumoDiario: vi.fn(async () => status()),
    previaDoResumoDiario: vi.fn(async () => ({ assunto: "Pagamentos de 23/10", html: "<p>oi</p>", hoje: "2026-10-23", contagem: {} as never, total: {} as never })),
    enviarResumoDiarioAgora: vi.fn(async () => ({ enviados: 2, falharam: 0, itens: 4, reembolsos: 0 })),
  };
});
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  // sexta 23/10/2026, 12:00 em Brasília (15:00Z): o próximo envio seg–sex às 08:00 é segunda
  await act(async () => { raiz!.render(<MemoryRouter><ResumoDiarioPainel aberto onFechar={fechou} onEnvioManual={manual} servico={servico} agora={() => new Date("2026-10-23T15:00:00Z")} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
}
const botao = (t: string) => [...document.querySelectorAll("button, a")].find(b => (b.textContent ?? "").trim().includes(t)) as HTMLElement | undefined;
const clicar = async (el: HTMLElement | undefined) => { await act(async () => { el!.click(); }); await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };

describe("situação do resumo diário", () => {
  it("diz se está ligado, quando saiu o último, quando sai o próximo e para quem", async () => {
    await abrir();
    const t = document.body.textContent ?? "";
    expect(t).toContain("Ligado");
    expect(t).toContain("segunda a sexta, às 08:00");
    expect(t).toContain("23/10 às 08:00");          // 11:00Z = 08:00 em Brasília
    expect(t).toContain("4 itens");
    expect(t).toContain("segunda, 26/10 às 08:00");  // sexta já passou das 08:00
    expect(t).toContain("2");
    expect(t).toContain("Bruno, Lúcio");
  });
  it("desligado: não promete próximo envio", async () => {
    servico.carregarStatusResumoDiario = vi.fn(async () => status({ config: { ativo: false } }));
    await abrir();
    expect(document.body.textContent).toContain("Desligado");
    expect(document.body.textContent).toContain("— desligado");
  });
  it("ligado mas com o agendamento parado: avisa que o e-mail não vai sair sozinho", async () => {
    servico.carregarStatusResumoDiario = vi.fn(async () => status({ agendamento_ativo: false }));
    await abrir();
    expect(document.body.textContent).toContain("o agendamento no servidor não está ativo");
  });
  it("nunca enviou e sem destinatário: diz, e o 'Enviar agora' fica desabilitado", async () => {
    servico.carregarStatusResumoDiario = vi.fn(async () => status({ destinatarios: [], ultimo_envio: { em: null } }));
    await abrir();
    expect(document.body.textContent).toContain("Ainda não enviou");
    expect(document.body.textContent).toContain("Nenhum cadastrado");
    expect((botao("Enviar agora") as HTMLButtonElement).disabled).toBe(true);
  });
  it("erro ao carregar (migration ausente, por exemplo) aparece em vez de uma tela vazia", async () => {
    servico.carregarStatusResumoDiario = vi.fn(async () => { throw new Error("O resumo diário ainda não foi criado no banco"); });
    await abrir();
    expect(document.querySelector("[role=alert]")?.textContent).toContain("ainda não foi criado");
  });
});

describe("as ações", () => {
  it("Visualizar mostra o e-mail de hoje, sem enviar nada", async () => {
    await abrir();
    await clicar(botao("Visualizar"));
    expect(servico.previaDoResumoDiario).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Pagamentos de 23/10");
    expect(document.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>oi</p>");
    expect(servico.enviarResumoDiarioAgora).not.toHaveBeenCalled();
  });
  it("Enviar agora PEDE confirmação (diz para quem e que o agendado continua) e só então envia", async () => {
    await abrir();
    await clicar(botao("Enviar agora"));
    expect(servico.enviarResumoDiarioAgora).not.toHaveBeenCalled();
    const t = document.body.textContent ?? "";
    expect(t).toContain("Enviar o resumo de hoje agora?");
    expect(t).toContain("Vai para 2 destinatários");
    expect(t).toContain("continua normalmente");
    const confirmar = [...document.querySelectorAll("button")].filter(b => (b.textContent ?? "").trim() === "Enviar agora").pop();
    await clicar(confirmar);
    expect(servico.enviarResumoDiarioAgora).toHaveBeenCalledTimes(1);
    expect(avisos.ok).toHaveBeenCalledWith(expect.stringContaining("Resumo enviado a 2 destinatários · 4 itens"));
  });
  it("cancelar a confirmação não envia", async () => {
    await abrir();
    await clicar(botao("Enviar agora"));
    await clicar(botao("Cancelar"));
    expect(servico.enviarResumoDiarioAgora).not.toHaveBeenCalled();
  });
  it("o envio recusado pelo servidor vira aviso claro, não erro", async () => {
    servico.enviarResumoDiarioAgora = vi.fn(async () => ({ enviados: 0, falharam: 0, itens: 0, reembolsos: 0, motivo: "enviado_ha_pouco" as const }));
    await abrir();
    await clicar(botao("Enviar agora"));
    await clicar([...document.querySelectorAll("button")].filter(b => (b.textContent ?? "").trim() === "Enviar agora").pop());
    expect(avisos.aviso).toHaveBeenCalledWith(expect.stringContaining("menos de 20 minutos"));
    expect(avisos.erro).not.toHaveBeenCalled();
  });
  it("Configurar leva à tela de configuração; o envio manual fecha o painel e abre o 'Preparar envio'", async () => {
    await abrir();
    expect(botao("Configurar")?.getAttribute("href")).toBe("/comunicacao?aba=agendamentos");
    await clicar(botao("Envio manual"));
    expect(fechou).toHaveBeenCalled();
    expect(manual).toHaveBeenCalledTimes(1);
  });
});

describe("quem não é da administração", () => {
  it("não lê a situação nem vê Enviar agora/Visualizar/Configurar — só o envio manual", async () => {
    papeis = ["tesouraria"];
    await abrir();
    expect(servico.carregarStatusResumoDiario).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("é a administração");
    expect(botao("Enviar agora")).toBeUndefined();
    expect(botao("Visualizar")).toBeUndefined();
    expect(botao("Configurar")).toBeUndefined();
    await clicar(botao("Envio manual"));
    expect(manual).toHaveBeenCalledTimes(1);
  });
});

describe("mensagemDoEnvioAgora", () => {
  it("diz quantos receberam e quantos itens; com falhas, vira aviso", () => {
    expect(mensagemDoEnvioAgora({ enviados: 1, falharam: 0, itens: 1, reembolsos: 0 })).toEqual({ tipo: "ok", texto: "Resumo enviado a 1 destinatário · 1 item." });
    expect(mensagemDoEnvioAgora({ enviados: 3, falharam: 0, itens: 5, reembolsos: 2 }).texto).toBe("Resumo enviado a 3 destinatários · 7 itens.");
    const f = mensagemDoEnvioAgora({ enviados: 1, falharam: 1, itens: 2, reembolsos: 0 });
    expect(f.tipo).toBe("aviso");
    expect(f.texto).toContain("1 e-mail não saiu");
  });
  it("cada motivo de recusa tem a sua frase", () => {
    expect(mensagemDoEnvioAgora({ enviados: 0, falharam: 0, itens: 0, reembolsos: 0, motivo: "sem_destinatarios" }).texto).toContain("Não há destinatários");
    expect(mensagemDoEnvioAgora({ enviados: 0, falharam: 0, itens: 0, reembolsos: 0, motivo: "nada_a_pagar" }).texto).toContain("nada a pagar hoje");
  });
});
