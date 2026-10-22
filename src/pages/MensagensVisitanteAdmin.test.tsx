import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ hasRole: () => true, rolesCarregados: true }) }));

import MensagensVisitanteAdmin, { type ServicoDasMensagens } from "./MensagensVisitanteAdmin";
import { CONFIG_PADRAO, SITUACOES, modeloPadrao, type ConfigDaMensagem, type IdentidadeDaIgreja, type ModeloDaMensagem, type PacoteDeMensagens } from "@/lib/mensagensVisitante";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); });

const CONFIG: ConfigDaMensagem = { ...CONFIG_PADRAO, assinatura: "Com carinho,\nEquipe de Acolhimento", link_pedido_oracao: "https://qibrj.org.br/oracao" };
/** A Identidade como ela guarda: "@usuario", número solto e site sem https://. */
const IGREJA: IdentidadeDaIgreja = {
  nome: "Quarta Igreja Batista", site: "qibrj.org.br", endereco: "Rua das Flores, 100", telefone: "(21) 3333-4444", email: "acolhimento@qibrj.org.br",
  redes: [{ plataforma: "instagram", url: "@qibrj" }, { plataforma: "whatsapp", url: "21983991229" }],
};
const pacote = (o: Partial<PacoteDeMensagens> = {}): PacoteDeMensagens => ({
  config: CONFIG, igreja: IGREJA,
  modelos: SITUACOES.flatMap(s => (["whatsapp", "email"] as const).map(c => modeloPadrao(s, c))),
  eventos: [{ titulo: "Culto de Oração", quando: "quarta-feira" }, { titulo: "Congresso de Casais", quando: "15/11" }],
  ...o,
});

function servico(o: { pacote?: PacoteDeMensagens | null; email?: string | null; telefone?: string | null } = {}) {
  const chamadas = { modelos: [] as ModeloDaMensagem[], configs: [] as ConfigDaMensagem[], testes: [] as { modelo: ModeloDaMensagem; config: ConfigDaMensagem }[] };
  const s: ServicoDasMensagens & { chamadas: typeof chamadas } = {
    chamadas,
    carregar: async () => (o.pacote === undefined ? pacote() : o.pacote),
    salvarModelo: async m => { chamadas.modelos.push(m); },
    salvarConfig: async c => { chamadas.configs.push(c); },
    meuContato: async () => ({ email: o.email === undefined ? "telma@diakoniaapp.com.br" : o.email, telefone: o.telefone === undefined ? "21999990000" : o.telefone }),
    enviarTesteDeEmail: async r => { chamadas.testes.push(r); return { enviadoPara: "telma@diakoniaapp.com.br" }; },
  };
  return s;
}
async function abrir(s: ReturnType<typeof servico>) {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter><MensagensVisitanteAdmin servico={s} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  return alvo;
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const botao = (re: RegExp) => [...document.body.querySelectorAll("button")].find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement | undefined;
const clicar = async (el: Element | undefined | null) => { await act(async () => { (el as HTMLElement).click(); }); };
function digitar(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  act(() => { set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const canalEmail = () => botao(/^\s*E-mail\s*$/);
/** Radix Tabs abre no mousedown, não no click */
const abrirAba = async (re: RegExp) => { const t = [...document.body.querySelectorAll('[role="tab"]')].find(b => re.test(b.textContent ?? "")); await act(async () => { t!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); }); };
const previa = () => q("[data-previa]")!.textContent ?? "";

describe("Mensagens ao Visitante — a tela de administração", () => {
  it("abre na primeira visita, pelo WhatsApp, com a prévia montada: nome, igreja, próximos eventos, redes e assinatura", async () => {
    await abrir(servico());
    expect((q("#msg-situacao") as HTMLSelectElement).value).toBe("primeira_visita");
    expect(previa()).toContain("Olá, Maria! 😊 Que alegria receber você na Quarta Igreja Batista!");
    expect(previa()).toContain("• Culto de Oração – quarta-feira");
    expect(previa()).toContain("• Congresso de Casais – 15/11");
    expect(previa()).toContain("• Instagram: https://www.instagram.com/qibrj/");
    expect(previa()).toContain("Equipe de Acolhimento");
  });

  it("escrever muda a prévia na hora, sem salvar; o botão só habilita quando há mudança", async () => {
    const s = servico();
    await abrir(s);
    expect(botao(/Mensagem salva/)!.disabled).toBe(true);
    digitar(q("#msg-abertura") as HTMLTextAreaElement, "Fala, {{nome}}! Bem-vindo à {{igreja}}.");
    expect(previa()).toContain("Fala, Maria! Bem-vindo à Quarta Igreja Batista.");
    expect(s.chamadas.modelos).toHaveLength(0);
    expect(botao(/Salvar esta mensagem/)!.disabled).toBe(false);
  });

  it("o nome da prévia é editável", async () => {
    await abrir(servico());
    digitar(q("#msg-nome") as HTMLInputElement, "João Pedro Alves");
    expect(previa()).toContain("Olá, João!");
  });

  it("salvar grava o modelo editado (situação, canal e texto) e a tela passa a dizer 'Mensagem salva'", async () => {
    const s = servico();
    await abrir(s);
    digitar(q("#msg-pastoral") as HTMLTextAreaElement, "Texto pastoral novo.");
    await clicar(botao(/Salvar esta mensagem/));
    expect(s.chamadas.modelos).toHaveLength(1);
    expect(s.chamadas.modelos[0]).toMatchObject({ situacao: "primeira_visita", canal: "whatsapp", texto_pastoral: "Texto pastoral novo." });
    expect(toast.success).toHaveBeenCalled();
    expect(botao(/Mensagem salva/)).toBeTruthy();
  });

  it("trocar o momento mostra a mensagem daquele momento e explica quando ela é usada", async () => {
    await abrir(servico());
    const sel = q("#msg-situacao") as HTMLSelectElement;
    await act(async () => { sel.value = "nao_retornou"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(previa()).toContain("Sentimos a sua falta 💙");
    expect(q("[data-quando]")!.textContent).toMatch(/não voltou depois do prazo/);
    expect(q("[data-quando]")!.textContent).toMatch(/15 dias/);
  });

  it("a edição de um momento não se perde ao trocar de momento e voltar", async () => {
    await abrir(servico());
    digitar(q("#msg-fechamento") as HTMLTextAreaElement, "Fechamento só desta.");
    const sel = q("#msg-situacao") as HTMLSelectElement;
    await act(async () => { sel.value = "jovem"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(previa()).not.toContain("Fechamento só desta.");
    await act(async () => { sel.value = "primeira_visita"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(previa()).toContain("Fechamento só desta.");
    expect(botao(/Salvar esta mensagem/)).toBeTruthy();
  });

  it("cada bloco liga e desliga: sem 'Redes sociais' a prévia perde o bloco", async () => {
    await abrir(servico());
    expect(previa()).toContain("Siga a gente");
    await clicar(q('[data-bloco="incluir_redes"] button[role="switch"]'));
    expect(previa()).not.toContain("Siga a gente");
    await clicar(q('[data-bloco="incluir_eventos"] button[role="switch"]'));
    expect(previa()).not.toContain("Culto de Oração");
  });

  it("bloco ligado SEM o dado avisa o que falta (plano de leitura sem link; endereço vazio)", async () => {
    const p = pacote({ igreja: { ...IGREJA, endereco: "" } });
    await abrir(servico({ pacote: p }));
    expect(q('[data-bloco="incluir_endereco"] [data-falta]')!.textContent).toMatch(/Falta o endereço na Identidade/);
    await clicar(q('[data-bloco="incluir_leitura"] button[role="switch"]'));
    expect(q('[data-bloco="incluir_leitura"] [data-falta]')!.textContent).toMatch(/link do plano de leitura/);
    expect(q('[data-bloco="incluir_whatsapp"] [data-falta]')).toBeNull();
  });

  it("e-mail: mostra o assunto e a prévia em HTML; o texto da prévia é escapado", async () => {
    await abrir(servico());
    await clicar(canalEmail());
    expect(q("[data-assunto]")!.textContent).toContain("Foi uma alegria receber você, Maria!");
    digitar(q("#msg-abertura") as HTMLTextAreaElement, "<img src=x onerror=alert(1)> Olá");
    expect(q("[data-previa] img")).toBeNull();
    expect(previa()).toContain("<img src=x onerror=alert(1)> Olá");
  });

  it("teste por e-mail: manda o RASCUNHO da tela (sem salvar) e avisa o destino; sem e-mail na ficha o botão fica desligado", async () => {
    const s = servico();
    await abrir(s);
    await clicar(canalEmail());
    digitar(q("#msg-assunto") as HTMLInputElement, "Assunto do rascunho");
    await clicar(botao(/Enviar e-mail de teste/));
    expect(s.chamadas.testes).toHaveLength(1);
    expect(s.chamadas.testes[0].modelo).toMatchObject({ situacao: "primeira_visita", canal: "email", assunto: "Assunto do rascunho" });
    expect(s.chamadas.testes[0].config.assinatura).toContain("Equipe de Acolhimento");
    expect(s.chamadas.testes[0]).not.toHaveProperty("igreja");   // a Identidade nunca viaja do navegador
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("telma@diakoniaapp.com.br"));
    expect(s.chamadas.modelos).toHaveLength(0);

    act(() => raiz?.unmount()); document.body.innerHTML = "";
    await abrir(servico({ email: null }));
    await clicar(canalEmail());
    expect(botao(/Enviar e-mail de teste/)!.disabled).toBe(true);
    expect(document.body.textContent).toContain("não tem e-mail");
  });

  it("teste por WhatsApp: abre a conversa com o telefone de quem está logado; sem telefone, só 'Copiar'", async () => {
    await abrir(servico());
    const a = [...document.body.querySelectorAll("a")].find(x => /meu WhatsApp/.test(x.textContent ?? "")) as HTMLAnchorElement;
    expect(a.href).toMatch(/whatsapp\.com|wa\.me/);
    expect(decodeURIComponent(a.href)).toContain("Olá, Maria!");
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    await abrir(servico({ telefone: null }));
    expect([...document.body.querySelectorAll("a")].some(x => /meu WhatsApp/.test(x.textContent ?? ""))).toBe(false);
    expect(document.body.textContent).toContain("não tem telefone");
  });

  it("'Restaurar o texto de partida' volta o texto original do momento", async () => {
    await abrir(servico());
    digitar(q("#msg-abertura") as HTMLTextAreaElement, "Texto trocado");
    await clicar(botao(/Restaurar o texto de partida/));
    expect((q("#msg-abertura") as HTMLTextAreaElement).value).toBe(modeloPadrao("primeira_visita", "whatsapp").abertura);
  });

  it("modelo desligado e modelo ativo sem texto: não salva e avisa", async () => {
    const s = servico();
    await abrir(s);
    digitar(q("#msg-abertura") as HTMLTextAreaElement, "");
    digitar(q("#msg-pastoral") as HTMLTextAreaElement, "");
    await clicar(botao(/Salvar esta mensagem/));
    expect(s.chamadas.modelos).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/ao menos a abertura/));
  });

  it("Redes e links: mostra o que vem da Identidade (só leitura) e o atalho para editá-la", async () => {
    await abrir(servico());
    await abrirAba(/Redes e links/);
    const campo = (r: string) => q('[data-identidade-campo="' + r + '"]')!.textContent;
    expect(campo("Igreja")).toBe("Quarta Igreja Batista");
    expect(campo("Endereço")).toBe("Rua das Flores, 100");
    expect(campo("WhatsApp")).toBe("https://wa.me/5521983991229");
    expect(campo("E-mail")).toBe("acolhimento@qibrj.org.br");
    expect(document.body.textContent).toContain("uma vez só");
    expect([...document.body.querySelectorAll("a")].some(x => x.getAttribute("href") === "/admin/identidade")).toBe(true);
    expect(q("#ig-end")).toBeNull();   // nenhum campo de endereço/telefone/e-mail aqui: a Identidade é a fonte única
    expect(q("#ig-mail")).toBeNull();
  });

  it("Identidade incompleta: o que falta aparece como 'não cadastrado'", async () => {
    await abrir(servico({ pacote: pacote({ igreja: { ...IGREJA, endereco: "", telefone: "", email: "" } }) }));
    await abrirAba(/Redes e links/);
    expect(q('[data-identidade-campo="Endereço"]')!.textContent).toBe("não cadastrado");
    expect(q('[data-identidade-campo="Telefone"]')!.textContent).toBe("não cadastrado");
  });

  it("Redes e links: assinatura e links editam e salvam; link inválido é barrado antes de gravar", async () => {
    const s = servico();
    await abrir(s);
    await abrirAba(/Redes e links/);
    digitar(q("#ig-oracao") as HTMLInputElement, "javascript:alert(1)");
    await clicar(botao(/Salvar redes e links/));
    expect(s.chamadas.configs).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/pedido de oração/));
    digitar(q("#ig-oracao") as HTMLInputElement, "https://qibrj.org.br/oracao-nova");
    digitar(q("#ig-assinatura") as HTMLTextAreaElement, "Abraço, {{igreja}}");
    await clicar(botao(/Salvar redes e links/));
    expect(s.chamadas.configs).toHaveLength(1);
    expect(s.chamadas.configs[0]).toMatchObject({ link_pedido_oracao: "https://qibrj.org.br/oracao-nova", assinatura: "Abraço, {{igreja}}", redes_ocultas: [] });
  });

  it("redes: uma linha por rede conhecida; as sem endereço na Identidade ficam desligadas; esconder uma tira da prévia e vai nas ocultas", async () => {
    const s = servico();
    await abrir(s);
    expect(previa()).toContain("• Instagram:");
    await abrirAba(/Redes e links/);
    expect(document.body.querySelectorAll("[data-rede]")).toHaveLength(7);
    const sw = (t: string) => q('[data-rede="' + t + '"] button[role="switch"]') as HTMLButtonElement;
    expect(sw("instagram").getAttribute("aria-checked")).toBe("true");
    expect(sw("site").getAttribute("aria-checked")).toBe("true");
    expect(sw("spotify").disabled).toBe(true);
    expect(q('[data-rede="spotify"]')!.textContent).toContain("não cadastrada na Identidade");
    await clicar(sw("instagram"));
    expect(sw("instagram").getAttribute("aria-checked")).toBe("false");
    await clicar(botao(/Salvar redes e links/));
    expect(s.chamadas.configs[0].redes_ocultas).toEqual(["instagram"]);
    await abrirAba(/^Mensagens/);
    expect(previa()).not.toContain("• Instagram:");
  });

  it("sem a migration (nada vem do banco) a tela explica em vez de quebrar", async () => {
    await abrir(servico({ pacote: null }));
    expect(document.body.textContent).toContain("ainda não foram criadas");
  });
});
