// ─── Central de Comunicação e Relatórios (27/10/2026, Fase 2) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Trava: as CINCO abas e a aba vinda da URL; que o que existia (agendamento, resumo diário, perfis × blocos, execuções) continua alcançável; que a aba Relatórios não promete envio que não existe;
// que a aba Configurações diz para onde vai a resposta (e o rodapé que a pessoa lê); que quem não é admin/diakonia sai da tela; e que as rotas do catálogo e do menu existem de verdade.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const navegar = vi.hoisted(() => vi.fn());
const papeis = vi.hoisted(() => ({ ok: true }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: () => papeis.ok, rolesCarregados: true }) }));
vi.mock("react-router-dom", async orig => ({ ...(await orig<typeof import("react-router-dom")>()), useNavigate: () => navegar }));
vi.mock("@/components/sistema/ConteudoDoResumoSemanal", () => ({ ConteudoDoResumoSemanal: () => <div data-filho="perfis-e-blocos" /> }));
vi.mock("@/components/sistema/ResumoDiarioDaTesouraria", () => ({ ResumoDiarioDaTesouraria: () => <div data-filho="resumo-diario" /> }));
vi.mock("@/services/comunicacaoService", () => ({ listarEnviosDaComunicacao: async () => ({ envios: [], indisponivel: false }), previaDoRelatorioDeContribuicoes: vi.fn(), enviarTesteDoRelatorioDeContribuicoes: vi.fn(), enviarRelatorioDeContribuicoes: vi.fn() }));
vi.mock("@/services/sistemaService", () => ({
  carregarStatusResumoSemanal: async () => ({
    ativo: true, dia_semana: 5, hora: 18, minuto: 0, destinatarios: [],
    execucoes: [{ inicio: "2026-10-23T21:00:00Z", status: "succeeded", mensagem: "enviados 4" }, { inicio: "2026-10-16T21:00:00Z", status: "failed", mensagem: "erro de envio" }],
  }),
  carregarEnderecosDeResposta: async () => ({ email_resposta: "tesouraria@qibrj.org.br", email_contato: "contato@qibrj.org.br" }),
  definirHorarioResumoSemanal: vi.fn(), pausarResumoSemanal: vi.fn(), dispararResumoSemanalAgora: vi.fn(),
  DIA_SEMANA_LABEL: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
}));

import ComunicacaoERelatorios from "./ComunicacaoERelatorios";
import { ABAS_DA_COMUNICACAO, CATALOGO_DE_RELATORIOS, abaValida } from "@/lib/comunicacao";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); papeis.ok = true; });

async function abrir(url = "/comunicacao") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><ComunicacaoERelatorios /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return alvo;
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const abaAtiva = () => document.body.querySelector('[role="tab"][data-state="active"]')?.textContent;

describe("a Central tem as cinco abas", () => {
  it("Agendamentos · Modelos · Relatórios · Histórico · Configurações, nessa ordem", async () => {
    await abrir();
    const rotulos = [...document.body.querySelectorAll('[role="tab"]')].map(t => t.textContent);
    expect(rotulos).toEqual(["Agendamentos", "Modelos", "Relatórios", "Histórico", "Configurações"]);
    expect(rotulos).toEqual(ABAS_DA_COMUNICACAO.map(a => a.rotulo));
    expect(document.body.textContent).toContain("Comunicação e Relatórios");
  });
  it("sem aba na URL abre em Agendamentos, que traz o agendamento semanal e o resumo diário", async () => {
    await abrir();
    expect(abaAtiva()).toBe("Agendamentos");
    expect(q('[data-cartao="agendamento-semanal"]')).not.toBeNull();
    expect(q('[data-cartao="testar-agora"]')).not.toBeNull();
    expect(q('[data-filho="resumo-diario"]')).not.toBeNull();
  });
  it.each([["modelos", "Modelos"], ["relatorios", "Relatórios"], ["historico", "Histórico"], ["configuracoes", "Configurações"]])("?aba=%s abre em %s", async (id, rotulo) => {
    await abrir(`/comunicacao?aba=${id}`);
    expect(abaAtiva()).toBe(rotulo);
  });
  it("aba inventada na URL cai em Agendamentos (um favorito velho nunca deixa a tela em branco)", async () => {
    await abrir("/comunicacao?aba=inexistente");
    expect(abaAtiva()).toBe("Agendamentos");
    expect(abaValida("inexistente")).toBe("agendamentos");
    expect(abaValida(null)).toBe("agendamentos");
  });
});

describe("o conteúdo de cada aba", () => {
  it("Modelos: perfis × blocos do semanal e o caminho para as mensagens ao visitante", async () => {
    await abrir("/comunicacao?aba=modelos");
    expect(q('[data-filho="perfis-e-blocos"]')).not.toBeNull();
    expect(q('[data-cartao="mensagens-visitante"] a')?.getAttribute("href")).toBe("/admin/mensagens-visitante");
  });
  it("Relatórios: o catálogo leva a cada tela; só Doadores envia por e-mail e os demais dizem que o envio está por vir", async () => {
    await abrir("/comunicacao?aba=relatorios");
    const cartoes = [...document.body.querySelectorAll("[data-relatorio]")];
    expect(cartoes.map(c => c.getAttribute("data-relatorio"))).toEqual(CATALOGO_DE_RELATORIOS.map(r => r.id));
    for (const r of CATALOGO_DE_RELATORIOS) expect(q(`[data-relatorio="${r.id}"] a`)?.getAttribute("href")).toBe(r.rota);
    expect(q('[data-aviso="envio-em-breve"]')?.textContent).toContain("já funciona para");
    expect([...document.body.querySelectorAll("button")].filter(b => /enviar por e-mail/i.test(b.textContent ?? "")).length).toBe(1);   // só o de Doadores
    expect(q('[data-relatorio="doadores"] [data-acao="enviar-doadores"]')).not.toBeNull();
  });
  it("Histórico: os relatórios enviados, as execuções do agendador e o aviso honesto de que o registro do resumo diário e do semanal ainda não existe", async () => {
    await abrir("/comunicacao?aba=historico");
    const linhas = q('[data-cartao="historico-execucoes"]')!.textContent!;
    expect(linhas).toContain("enviados 4");
    expect(linhas).toContain("erro de envio");
    expect(q('[data-cartao="historico-envios"]')).not.toBeNull();
    expect(q('[data-aviso="historico-incompleto"]')?.textContent).toContain("quem enviou, para quem");
  });
  it("Configurações: quem envia, para onde vai a resposta (campo próprio), o rodapé que a pessoa lê e a regra dos 3 dias", async () => {
    await abrir("/comunicacao?aba=configuracoes");
    expect(q('[data-remetente="automatico"]')?.textContent).toBe("Diakonia <resumo@diakoniaapp.com.br>");
    expect(q('[data-resposta="configurada"]')?.textContent).toContain("tesouraria@qibrj.org.br");
    expect(q('[data-resposta="configurada"]')?.textContent).toContain("Responder para");
    expect(q("[data-rodape]")?.textContent).toContain("responda a esta mensagem");
    expect(q('[data-cartao="regra-saldo"]')?.textContent).toContain("até 3 dias");
    expect(q('[data-cartao="resposta"] a')?.getAttribute("href")).toBe("/admin/identidade");
  });
});

describe("acesso e roteamento", () => {
  it("quem não é admin nem diakonia volta para a Home", async () => {
    papeis.ok = false;
    await abrir();
    expect(navegar).toHaveBeenCalledWith("/", { replace: true });
  });
  it("a rota existe, /admin/resumo-semanal redireciona para ela e as duas exigem o papel de dono do sistema", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('path="/comunicacao"');
    expect(app).toMatch(/path="\/admin\/resumo-semanal" element=\{<Navigate to="\/comunicacao\?aba=agendamentos" replace \/>\}/);
    const nav = readFileSync("src/components/layout/navConfig.ts", "utf8");
    expect(nav).toMatch(/"\/comunicacao": ROLES_DONO_SISTEMA/);
    expect(nav).toMatch(/"\/admin\/resumo-semanal": ROLES_DONO_SISTEMA/);
  });
  it("todo relatório do catálogo aponta para uma rota que o App tem", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    for (const r of CATALOGO_DE_RELATORIOS) expect(app, r.id).toContain(`path="${r.rota}"`);
  });
  it("os dois menus (computador e celular) e a busca apontam para a Central, com o nome novo", () => {
    for (const f of ["src/components/layout/AppLayout.tsx", "src/components/layout/UserMenuButton.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain('navigate("/comunicacao")');
      expect(src, f).toContain("Comunicação e Relatórios");
      expect(src, f).not.toContain("Resumo Semanal por E-mail");
    }
    expect(readFileSync("src/components/CommandPalette.tsx", "utf8")).toContain('to: "/comunicacao"');
  });
});

describe("Configurações sem endereço", () => {
  it("sem Reply-To nem contato: avisa que os e-mails pedem para NÃO responder", async () => {
    vi.resetModules();
    const { ConfiguracoesDeComunicacao } = await import("@/components/comunicacao/ConfiguracoesDeComunicacao");
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    await act(async () => { raiz!.render(<MemoryRouter><ConfiguracoesDeComunicacao servico={{ carregarEnderecos: async () => ({ email_resposta: null, email_contato: null }) }} /></MemoryRouter>); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(q('[data-resposta="nenhuma"]')?.textContent).toContain("não responder");
    expect(q("[data-rodape]")?.textContent).toContain("não responda diretamente");
  });
  it("só com o e-mail de contato: usa o contato e diz que o campo próprio está vazio", async () => {
    const { ConfiguracoesDeComunicacao } = await import("@/components/comunicacao/ConfiguracoesDeComunicacao");
    const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
    await act(async () => { raiz!.render(<MemoryRouter><ConfiguracoesDeComunicacao servico={{ carregarEnderecos: async () => ({ email_resposta: null, email_contato: "contato@qibrj.org.br" }) }} /></MemoryRouter>); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(q('[data-resposta="configurada"]')?.textContent).toContain("contato@qibrj.org.br");
    expect(q('[data-resposta="configurada"]')?.textContent).toContain("e-mail de contato");
  });
});
