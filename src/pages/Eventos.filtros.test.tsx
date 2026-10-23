// A Agenda ao abrir (22/10/2026): todos os filtros nascem marcados e nada do que a pessoa desmarca é lembrado — sair e voltar, atualizar a página ou entrar pelo menu mostra tudo de novo.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { format } from "date-fns";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hoje = format(new Date(), "yyyy-MM-dd");
const evento = { id: "e1", titulo: "Culto de Celebração", tipo: "culto", data: hoje, hora_inicio: "19:00", hora_fim: "21:00", local: null, local_id: "l1", descricao: null, status: "agendado", cor: null,
  ministerio_principal_id: null, recorrencia_id: null, recorrencia_regra: null, is_excecao: false, ocorrencia_original_data: null, serie_origem_id: null };
const tabelas: Record<string, unknown[]> = {
  eventos: [evento],
  ministerios: [{ id: "m1", nome: "Louvor", sigla: null, ativo: true }, { id: "m2", nome: "Ensino", sigla: null, ativo: true }],
  areas: [{ id: "a1", nome: "Som", ministerio_id: "m1", ativo: true }],
  evento_ministerios: [], evento_areas: [],
  locais: [{ id: "l1", nome: "Templo", nome_completo: "Templo principal", status: "ativo", permite_agendamento: true }, { id: "l2", nome: "Salão", nome_completo: "Salão social", status: "ativo", permite_agendamento: true }],
  membros: [],
};
const avisos = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (t: string) => {
    const proxy: any = new Proxy({}, {
      get: (_x, nome: string) => {
        if (nome === "then") return (ok: (v: unknown) => unknown) => Promise.resolve({ data: (globalThis as any).__tabelas[t] ?? [], error: null }).then(ok);
        return () => proxy;
      },
    });
    return proxy;
  };
  return { supabase: { from: (t: string) => consulta(t), rpc: async () => (globalThis as any).__rpc ?? { data: null, error: { message: "função inexistente" } }, auth: { getUser: async () => ({ data: { user: null } }) } }, supabaseRel: {} };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ canEdit: true, user: { id: "u1" }, hasRole: () => true }) }));
vi.mock("@/hooks/usePermissoes", () => ({ usePermissoes: () => ({ podeFazer: () => true, permissoes: [], loading: false }) }));
vi.mock("@/lib/agenda/arrecadacao", async (orig) => ({ ...(await orig<object>()), fetchReservasAgenda: async () => [], mapEspacoCodigoParaLocalId: async () => new Map() }));
vi.mock("sonner", () => ({ toast: { info: (...a: unknown[]) => avisos(...a), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import Eventos from "./Eventos";

let raiz: Root | null = null;
beforeAll(() => {
  (globalThis as any).__tabelas = tabelas;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
});
beforeEach(() => { (globalThis as any).__rpc = undefined; tabelas.membros = []; localStorage.clear(); avisos.mockClear(); localStorage.setItem("agenda:view:v1", "lista"); });
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir(rota = "/eventos") {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={[rota]}><Eventos /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
  return alvo;
}
const CHAVE_ANTIGA = "agenda:filtros:v1";

describe("a Agenda ao abrir (22/10/2026): filtros sempre todos marcados, só valem na sessão", () => {
  it("primeira vez: mostra os eventos, sem aviso, e NÃO grava filtro no navegador", async () => {
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(avisos).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_ANTIGA)).toBeNull();
  });

  it("seleção antiga gravada no navegador é IGNORADA e apagada: o que ela escondia volta à vista", async () => {
    localStorage.setItem(CHAVE_ANTIGA, JSON.stringify({ locais: ["l2"], locaisConhecidos: ["l1", "l2"], categorias: ["igreja"], status: ["cancelado"] }));
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(avisos).not.toHaveBeenCalled();
    expect(localStorage.getItem(CHAVE_ANTIGA)).toBeNull();
  });

  it("o botão Filtros não acusa filtro ligado: nada está restrito ao abrir", async () => {
    const el = await abrir();
    const botao = Array.from(el.querySelectorAll("button")).find((b) => /Filtros/.test(b.textContent ?? ""));
    expect(botao).toBeTruthy();
    expect(botao!.textContent).not.toMatch(/d/);   // sem contador de filtros ativos
  });

  it("desmarcar um filtro vale enquanto a Agenda está aberta (o evento some) e NADA é gravado; ao remontar, volta tudo", async () => {
    const clicar = async (el: Element | undefined) => { await act(async () => { (el as HTMLElement).click(); }); await act(async () => { await new Promise(r => setTimeout(r, 40)); }); };
    const botao = (t: string) => [...document.querySelectorAll("button")].find(b => (b.textContent ?? "").trim().startsWith(t));
    let el = await abrir();
    await clicar(botao("Filtros"));
    await clicar(botao("Local"));
    await clicar(document.querySelector("[role=checkbox]") ?? undefined);   // tira o Templo (l1), onde é o culto
    expect(document.body.textContent).toContain("1 filtro está escondendo parte da agenda");
    expect(el.textContent).not.toContain("Culto de Celebração");
    expect(localStorage.getItem(CHAVE_ANTIGA)).toBeNull();
    act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = "";
    el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
  });

  it("restringir pelo atalho de um local vale na sessão e a volta (sair e entrar) abre de novo com tudo", async () => {
    // /eventos?locais=l2 é o atalho da página Locais: escolha deliberada de quem navegou, vale enquanto a Agenda está aberta.
    const restrito = await abrir("/eventos?locais=l2");
    expect(restrito.textContent).not.toContain("Culto de Celebração");   // o culto é no l1
    act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = "";
    const el = await abrir();   // voltou pelo menu: nada de memória
    expect(el.textContent).toContain("Culto de Celebração");
  });
});

// ─── Aniversários e casamentos de TODOS, para quem trabalha na igreja (o voluntário incluso) ───────────────────────────────────────────────────
const hojeMd = format(new Date(), "MM-dd");
const pessoa = (id: string, nome: string) => ({ id, nome_completo: nome, data_nascimento: `1990-${hojeMd}`, nascimento_dia_mes: null, data_casamento: null, tipo_pessoa: "membro" });

describe("a camada de aniversários da página Agenda", () => {
  it("usa a função do banco: o voluntário vê o aniversário de todos, e não só o dele", async () => {
    (globalThis as any).__rpc = { data: [pessoa("a1", "Ana Souza"), pessoa("a2", "Bruno Lima")], error: null };
    tabelas.membros = [pessoa("a1", "Ana Souza")];   // o que a RLS deixaria o voluntário ler direto: só a própria ficha
    const el = await abrir();
    expect(el.textContent).toContain("Ana Souza");
    expect(el.textContent).toContain("Bruno Lima");
  });

  it("sem a função (migration ainda não aplicada) volta à leitura direta de sempre", async () => {
    tabelas.membros = [pessoa("c1", "Carla Dias")];
    const el = await abrir();
    expect(el.textContent).toContain("Carla Dias");
  });

  it("função que devolve vazio (conta fora dos papéis de trabalho) também cai na leitura direta: o membro comum segue vendo o próprio", async () => {
    (globalThis as any).__rpc = { data: [], error: null };
    tabelas.membros = [pessoa("d1", "Davi Rocha")];
    const el = await abrir();
    expect(el.textContent).toContain("Davi Rocha");
  });
});
