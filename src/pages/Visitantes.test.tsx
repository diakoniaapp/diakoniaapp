import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: async () => ({ data: null, error: { message: "sem migration" } }), auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("@/components/membros/AutoCadastroQrPainel", () => ({ AutoCadastroQrPainel: () => <div data-painel-do-qr>painel do QR</div> }));
vi.mock("@/components/membros/VisitanteDialog", () => ({ default: () => null }));

import Visitantes, { type ServicoDaCentral } from "./Visitantes";
import type { DadosDaCentral, VisitanteMembro } from "@/services/centralDeAcolhimentoService";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let raiz: Root | null = null;
beforeAll(() => { (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false; });
beforeEach(() => { try { localStorage.clear(); } catch { /* sem storage */ } });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; vi.clearAllMocks(); vi.restoreAllMocks(); });

const DIA = 86_400_000;
const atras = (n: number) => new Date(Date.now() - n * DIA).toISOString();
const v = (id: string, nome: string, o: Record<string, unknown> = {}) => ({
  id, nome_completo: nome, tipo_pessoa: "visitante", telefone_celular: "5521983991229", bairro: "Tijuca", numero_visitas: 1, created_at: atras(0),
  ultimo_contato_em: null, ultimo_contato_tipo: null, data_nascimento: null, ...o,
}) as unknown as VisitanteMembro;

const VISITANTES = [
  v("ana", "Ana Paula Souza", { created_at: atras(3) }),                                                        // pediu oração
  v("bruno", "Bruno Almeida", { created_at: atras(1), ultimo_contato_em: atras(0), ultimo_contato_tipo: "Respondeu" }),   // em dia
  v("carla", "Carla Mendes", { created_at: atras(22), ultimo_contato_em: atras(11) }),                          // não voltou, se perdendo
  v("davi", "Davi Rocha", { created_at: atras(0) }),                                                            // chegou hoje + pediu contato
  v("elisa", "Elisa Prado", { created_at: atras(30), numero_visitas: 3, ultimo_contato_em: atras(1), ultimo_contato_tipo: "Demonstrou interesse" }),   // pronta
  v("heitor", "Heitor Nunes", { created_at: atras(12), numero_visitas: 2, ultimo_contato_em: atras(5) }),         // retornou
];
const PEDIDOS = new Map([
  ["ana", { checkinId: "c1", checkinIds: ["c1", "c1b"], oracao: ["Saúde"], oracaoTexto: null, quer_contato: false, preferencia: null, dataVisita: atras(3).slice(0, 10) }],
  ["davi", { checkinId: "c2", checkinIds: ["c2"], oracao: [], oracaoTexto: null, quer_contato: true, preferencia: "WhatsApp, à tarde", dataVisita: atras(0).slice(0, 10) }],
]);
const tarefa = (id: string, visitante_id: string, titulo: string, concluida: boolean) => ({ id, visitante_id, titulo, concluida });
const TAREFAS = { carla: [tarefa("t1", "carla", "Boas-vindas", true), tarefa("t2", "carla", "Contato", false)] };

function servico(o: { dados?: Partial<DadosDaCentral>; falhar?: string; resultado?: { ok: boolean; erro?: string } } = {}) {
  const chamadas = { contato: [] as unknown[][], retorno: [] as string[], retornoFeito: [] as string[][], promover: [] as unknown[][], tarefa: [] as unknown[][], cargas: 0 };
  const ok = o.resultado ?? { ok: true };
  const s: ServicoDaCentral & { chamadas: typeof chamadas } = {
    chamadas,
    carregar: async () => { chamadas.cargas++; if (o.falhar) throw new Error(o.falhar); return { visitantes: VISITANTES, pedidos: PEDIDOS, conversoes: 2, tarefas: TAREFAS, ...o.dados } as DadosDaCentral; },
    registrarContato: async (m, tipo, obs) => { chamadas.contato.push([m.id, tipo, obs]); return ok; },
    registrarRetorno: async m => { chamadas.retorno.push(m.id); return ok; },
    marcarRetornoFeito: async ids => { chamadas.retornoFeito.push([...ids]); return ok; },
    promover: async (m, para) => { chamadas.promover.push([m.id, para]); return ok; },
    alternarTarefa: async (id, c) => { chamadas.tarefa.push([id, c]); return ok; },
  };
  return s;
}
async function abrir(s: ReturnType<typeof servico>, url = "/visitantes") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[url]}><Visitantes servico={s} /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  return alvo;
}
const q = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const qa = (sel: string) => [...document.body.querySelectorAll(sel)] as HTMLElement[];
const cartao = (id: string) => q(`[data-visitante="${id}"]`)!;
const ids = () => qa("[data-visitante]").map(e => e.getAttribute("data-visitante"));
const botao = (re: RegExp, dentro: ParentNode = document.body) => [...dentro.querySelectorAll("button")].find(b => re.test(b.textContent ?? "") || re.test(b.getAttribute("aria-label") ?? "")) as HTMLButtonElement | undefined;
const clicar = async (el: Element | undefined | null) => { await act(async () => { (el as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
const indicador = (f: string) => q(`[data-indicador="${f}"]`)!;
const numero = (f: string) => indicador(f).querySelector("[data-numero]")!.textContent;

describe("Central de Acolhimento — o que a tela responde ao abrir", () => {
  it("título, frase do dia e os cinco indicadores: quem contatar hoje, quem precisa de cuidado, quem não voltou, quem retornou e os novos da semana", async () => {
    await abrir(servico());
    expect(q("h1")!.textContent).toBe("Central de Acolhimento");
    expect(q("[data-frase-do-dia]")!.textContent).toBe("Hoje: 5 pessoas para contatar · 3 precisam de cuidado · 1 não voltou.");
    expect(numero("hoje")).toBe("5");          // ana, davi, carla (alta) + elisa (pronta para promover) + heitor (voltou, sem contato há 5 dias); bruno está em dia
    expect(numero("cuidado")).toBe("3");       // ana (oração), davi (contato), carla (se perdendo)
    expect(numero("nao_voltou")).toBe("1");
    expect(numero("retornaram")).toBe("2");    // elisa e heitor
    expect(numero("todos")).toBe("3");         // ana (3d), bruno (1d), davi (hoje)
    expect(indicador("cuidado").textContent).toContain("2 pediram oração ou contato");
  });

  it("a lista abre em 'Contatar hoje', por PRIORIDADE: quem pediu cuidado primeiro, depois quem está se perdendo, depois a média", async () => {
    await abrir(servico());
    expect(ids()).toEqual(["ana", "davi", "carla", "elisa", "heitor"]);
    expect(cartao("ana").getAttribute("data-prioridade")).toBe("alta");
    expect(cartao("carla").getAttribute("data-prioridade")).toBe("alta");
    expect(cartao("heitor").getAttribute("data-prioridade")).toBe("baixa");
    expect(q("[data-grupo='alta'] h3")!.textContent).toContain("Alta prioridade · 3");
    expect(q("[data-grupo='media'] h3")!.textContent).toContain("Média prioridade · 1");
    expect(q("[data-grupo='baixa'] h3")!.textContent).toContain("Em dia · 1");
  });

  it("cada cartão traz a PRIORIDADE com palavra, a PRÓXIMA AÇÃO com um botão principal e a LINHA DO TEMPO com 4 marcos", async () => {
    await abrir(servico());
    const ana = cartao("ana");
    expect(ana.querySelector("[data-prioridade-selo]")!.textContent).toContain("ALTA");
    expect(ana.querySelector("[data-proxima-acao]")!.textContent).toContain("Responder ao pedido de oração");
    expect(ana.querySelector("[data-botao-principal]")!.textContent).toContain("Responder pelo WhatsApp");
    expect(ana.querySelectorAll("[data-marco]")).toHaveLength(4);
    expect(ana.textContent).toContain("Pediu oração");
    expect(cartao("carla").textContent).toContain("Não voltou há 22 dias");
    expect(cartao("carla").querySelector("[data-marco='retorno']")!.getAttribute("data-estado")).toBe("atencao");
  });

  it("o que é operacional fica pequeno: registrar contato/retorno e tarefas são botões secundários, e só há UM botão principal por cartão", async () => {
    await abrir(servico());
    for (const c of qa("[data-visitante]")) expect(c.querySelectorAll("[data-botao-principal]").length).toBeLessThanOrEqual(1);
    expect(cartao("carla").querySelector("[data-secundaria='contato']")).toBeTruthy();
    expect(cartao("carla").querySelector("[data-secundaria='tarefas']")!.textContent).toContain("1/2 tarefas");
    expect(cartao("ana").querySelector("[data-secundaria='retorno_feito']")).toBeTruthy();      // só quem pediu cuidado
    expect(cartao("carla").querySelector("[data-secundaria='retorno_feito']")).toBeNull();
  });
});

describe("filtros", () => {
  it("tocar num indicador filtra a lista; 'Ver todos' volta; o indicador ativo fica marcado", async () => {
    await abrir(servico());
    await clicar(indicador("nao_voltou"));
    expect(ids()).toEqual(["carla"]);
    expect(indicador("nao_voltou").getAttribute("aria-pressed")).toBe("true");
    expect(q("[aria-label='Visitantes por prioridade'] h2")!.textContent).toContain("Não voltaram · 1");
    await clicar(indicador("retornaram"));
    expect(ids().sort()).toEqual(["elisa", "heitor"]);
    await clicar(botao(/Ver todos \(6\)/));
    expect(ids()).toHaveLength(6);
  });
  it("'Precisam de cuidado' mostra só a prioridade alta", async () => {
    await abrir(servico());
    await clicar(indicador("cuidado"));
    expect(ids()).toEqual(["ana", "davi", "carla"]);
  });
  it("?aba= dos outros painéis continua valendo: acao = Contatar hoje, nao_voltou, todos", async () => {
    await abrir(servico(), "/visitantes?aba=nao_voltou");
    expect(ids()).toEqual(["carla"]);
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    await abrir(servico(), "/visitantes?aba=todos");
    expect(ids()).toHaveLength(6);
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    await abrir(servico(), "/visitantes?aba=acao");
    expect(ids()).toEqual(["ana", "davi", "carla", "elisa", "heitor"]);
  });
  it("filtro sem ninguém explica o que aparece ali, em vez de uma lista vazia muda", async () => {
    await abrir(servico({ dados: { visitantes: [VISITANTES[1]], pedidos: new Map() } }));
    expect(ids()).toEqual([]);
    expect(document.body.textContent).toContain("Ninguém para contatar hoje");
    expect(q("[data-frase-do-dia]")!.textContent).toBe("Tudo em dia: ninguém precisa ser procurado hoje.");
  });
  it("sem nenhum visitante: a frase e o vazio convidam a usar o QR", async () => {
    await abrir(servico({ dados: { visitantes: [], pedidos: new Map(), tarefas: {} } }));
    expect(q("[data-frase-do-dia]")!.textContent).toContain("Nenhum visitante no acolhimento ainda");
    expect(document.body.textContent).toContain("Nenhum visitante cadastrado");
  });
});

describe("funil", () => {
  it("mostra as cinco etapas com o número e a porcentagem em relação a quem chegou, e quantos % seguiram", async () => {
    await abrir(servico());
    const n = (e: string) => q(`[data-etapa="${e}"] [data-n]`)!.textContent;
    expect([n("chegaram"), n("procurados"), n("voltaram"), n("prontos"), n("congregados")]).toEqual(["6", "4", "2", "1", "2"]);
    expect(q('[data-etapa="procurados"]')!.textContent).toContain("67%");
    expect(q('[data-etapa="procurados"] [data-seguiram]')!.textContent).toContain("67% seguiram");
    expect(q("[data-tarefas-do-funil]")!.textContent).toContain("1/2 · 50%");
  });
});

describe("ações do cartão", () => {
  it("o botão principal de WhatsApp abre o diálogo da mensagem (com o nome); 'Abrir WhatsApp' abre a conversa e pergunta como foi o contato; confirmar registra", async () => {
    const s = servico();
    await abrir(s);
    const aberta = vi.spyOn(window, "open").mockImplementation(() => null);
    await clicar(cartao("ana").querySelector("[data-botao-principal]"));
    const area = document.body.querySelector("textarea[aria-label='Texto da mensagem']") as HTMLTextAreaElement;
    expect(area.value).toContain("Ana");
    await clicar(botao(/Abrir WhatsApp/));
    expect(aberta).toHaveBeenCalledTimes(1);
    expect(String(aberta.mock.calls[0][0])).toMatch(/wa\.me|whatsapp/);
    expect(document.body.textContent).toContain("Não respondeu");      // o diálogo de resultado do contato
    await clicar(botao(/Respondeu/));
    await clicar([...document.body.querySelectorAll("button")].find(b => /Registrar|Salvar|Confirmar/i.test(b.textContent ?? "") && !/Registrar (contato|retorno)/.test(b.textContent ?? "")));
    expect(s.chamadas.contato.length).toBe(1);
    expect(s.chamadas.contato[0][0]).toBe("ana");
  });
  it("sem telefone o botão principal abre a ficha em vez de fingir WhatsApp", async () => {
    await abrir(servico({ dados: { visitantes: [v("sem", "Sem Telefone", { created_at: atras(4), telefone_celular: null })], pedidos: new Map(), tarefas: {} } }));
    expect(cartao("sem").querySelector("[data-botao-principal]")!.getAttribute("data-botao-principal")).toBe("abrir_ficha");
    expect(cartao("sem").querySelector("[data-secundaria='mensagem']")).toBeNull();
  });
  it("promover chama o serviço com o vínculo sugerido, avisa e recarrega", async () => {
    const s = servico({ dados: { visitantes: [VISITANTES[4]], pedidos: new Map() } });
    await abrir(s);
    expect(ids()).toEqual(["elisa"]);   // pronto para o próximo passo entra em "Contatar hoje": é preciso conversar para promover
    const cargas = s.chamadas.cargas;
    await clicar(cartao("elisa").querySelector("[data-botao-principal='promover']"));
    expect(s.chamadas.promover).toEqual([["elisa", "congregado"]]);
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Elisa"));
    expect(s.chamadas.cargas).toBe(cargas + 1);
  });
  it("registrar retorno e 'Retorno feito' (com TODOS os check-ins pendentes da pessoa) gravam pelo serviço", async () => {
    const s = servico();
    await abrir(s);
    await clicar(cartao("carla").querySelector("[data-secundaria='retorno']"));
    expect(s.chamadas.retorno).toEqual(["carla"]);
    await clicar(cartao("ana").querySelector("[data-secundaria='retorno_feito']"));
    expect(s.chamadas.retornoFeito).toEqual([["c1", "c1b"]]);
  });
  it("falha ao gravar mostra o erro e NÃO comemora nem recarrega", async () => {
    const s = servico({ resultado: { ok: false, erro: "Sem permissão" } });
    await abrir(s);
    const cargas = s.chamadas.cargas;
    await clicar(cartao("carla").querySelector("[data-secundaria='retorno']"));
    expect(toast.error).toHaveBeenCalledWith("Sem permissão");
    expect(toast.success).not.toHaveBeenCalled();
    expect(s.chamadas.cargas).toBe(cargas);
  });
  it("tarefas: abrem sob demanda e marcar grava e atualiza na hora", async () => {
    const s = servico();
    await abrir(s);
    expect(cartao("carla").querySelector("[data-tarefas]")).toBeNull();
    await clicar(cartao("carla").querySelector("[data-secundaria='tarefas']"));
    expect(cartao("carla").querySelectorAll("[data-tarefas] li")).toHaveLength(2);
    await clicar(cartao("carla").querySelector("[data-tarefas] li:nth-child(2) button[role='checkbox']"));
    expect(s.chamadas.tarefa).toEqual([["t2", true]]);
    expect(cartao("carla").querySelector("[data-secundaria='tarefas']")!.textContent).toContain("2/2 tarefas");
  });
});

describe("QR Code recolhido", () => {
  it("por padrão só uma linha (o painel nem é montado); abrir mostra o painel e a escolha fica lembrada", async () => {
    await abrir(servico());
    expect(q("[data-painel-do-qr]")).toBeNull();
    expect(q("[data-qr-compacto]")!.textContent).toContain("1 chegou hoje");
    await clicar(q("[data-qr-compacto] button"));
    expect(q("[data-painel-do-qr]")).toBeTruthy();
    expect(localStorage.getItem("diakonia-central-qr-aberto")).toBe("1");
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    await abrir(servico());
    expect(q("[data-painel-do-qr]")).toBeTruthy();   // lembrou
  });
});

describe("carga", () => {
  it("falha ao carregar não derruba a tela: mostra o erro com 'tentar de novo'", async () => {
    const s = servico({ falhar: "sem rede" });
    await abrir(s);
    expect(q("[data-frase-do-dia]")).toBeNull();
    expect(ids()).toEqual([]);
    expect(document.body.querySelector("button")).toBeTruthy();
  });
});
