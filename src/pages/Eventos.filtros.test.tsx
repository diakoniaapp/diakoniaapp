// A Agenda ao abrir (16/10/2026): restaura a última seleção do usuário, MAS nunca abre vazia por causa de um filtro esquecido — se a seleção salva esconde todos os eventos
// do período, volta tudo marcado e avisa. Filtro salvo que deixa eventos à vista é respeitado.
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

async function abrir() {
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<MemoryRouter initialEntries={["/eventos"]}><Eventos /></MemoryRouter>); });
  await act(async () => { await new Promise(r => setTimeout(r, 80)); });
  return alvo;
}
const gravado = () => JSON.parse(localStorage.getItem("agenda:filtros:v1") ?? "{}");

describe("a Agenda ao abrir", () => {
  it("primeira vez (nada salvo): abre com tudo marcado e mostrando eventos, sem aviso", async () => {
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(avisos).not.toHaveBeenCalled();
    const f = gravado();
    expect(f.locais).toEqual(["l1", "l2"]);
    expect(f.ministerios).toEqual(["m1", "m2"]);
    expect(f.status.length).toBe(3);
    expect(f.categorias.length).toBe(6);
  });

  it("a última seleção do usuário é restaurada quando ainda mostra eventos", async () => {
    localStorage.setItem("agenda:filtros:v1", JSON.stringify({ locais: ["l1"], locaisConhecidos: ["l1", "l2"] }));
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(avisos).not.toHaveBeenCalled();
    expect(gravado().locais).toEqual(["l1"]);   // a escolha dela, intacta
  });

  it("um local NOVO entra marcado sozinho, sem desmarcar a escolha anterior", async () => {
    localStorage.setItem("agenda:filtros:v1", JSON.stringify({ locais: ["l1"], locaisConhecidos: ["l1"] }));   // o l2 nasceu depois
    await abrir();
    expect(gravado().locais).toEqual(["l1", "l2"]);
  });

  it("filtro salvo ANTES da memória de ids (legado) abre com tudo marcado, uma única vez, e passa a lembrar", async () => {
    localStorage.setItem("agenda:filtros:v1", JSON.stringify({ locais: ["l1"] }));
    await abrir();
    expect(gravado().locais).toEqual(["l1", "l2"]);
    expect(gravado().locaisConhecidos).toEqual(["l1", "l2"]);
  });

  it("seleção salva que esconde TUDO é desfeita na abertura: volta tudo marcado e avisa", async () => {
    localStorage.setItem("agenda:filtros:v1", JSON.stringify({ locais: ["l2"], categorias: ["igreja"] }));
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toContain("voltei a mostrar tudo");
    expect(gravado().locais).toEqual(["l1", "l2"]);
    expect(gravado().categorias.length).toBe(6);
  });

  it("categorias salvas VAZIAS (o estado que deixava a agenda em branco) abrem com tudo marcado", async () => {
    localStorage.setItem("agenda:filtros:v1", JSON.stringify({ categorias: [], status: [] }));
    const el = await abrir();
    expect(el.textContent).toContain("Culto de Celebração");
    expect(gravado().categorias.length).toBe(6);
    expect(gravado().status.length).toBe(3);
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
