// Os filtros da Agenda (16/10/2026): nunca ficam com nada desmarcado. "Mostrar tudo" e "Marcar todos" marcam; tirar a última caixa devolve todas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgendaFilters } from "./AgendaFilters";
import { CATEGORIAS_PADRAO, DEFAULT_FILTROS, TODAS_AS_CATEGORIAS, TODOS_OS_STATUS, TODOS_OS_TIPOS, type AgendaFiltros } from "@/lib/agenda/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ministerios = [{ id: "m1", nome: "Louvor", sigla: null, ativo: true }, { id: "m2", nome: "Ensino", sigla: null, ativo: true }];
const areas = [{ id: "a1", nome: "Som", ministerio_id: "m1", ativo: true }, { id: "a2", nome: "Recepção", ministerio_id: "m2", ativo: true }];
const locais = [{ id: "l1", nome: "Templo", nome_completo: "Templo principal", status: "ativo", permite_agendamento: true }, { id: "l2", nome: "Salão", nome_completo: "Salão social", status: "ativo", permite_agendamento: true }];
const todos: AgendaFiltros = {
  ...DEFAULT_FILTROS, ministerios: ["m1", "m2"], areas: ["a1", "a2"], locais: ["l1", "l2"], tipos: TODOS_OS_TIPOS, status: TODOS_OS_STATUS, categorias: TODAS_AS_CATEGORIAS,
};

let raiz: Root | null = null;
afterEach(() => { act(() => raiz?.unmount()); raiz = null; document.body.innerHTML = ""; });

async function abrir(filtros: AgendaFiltros) {
  const onChange = vi.fn();
  const alvo = document.createElement("div"); document.body.appendChild(alvo); raiz = createRoot(alvo);
  await act(async () => { raiz!.render(<AgendaFilters filtros={filtros} onChange={onChange} ministerios={ministerios as never} areas={areas as never} locais={locais as never} />); });
  await act(async () => { [...document.querySelectorAll("button")].find(b => /Filtros/.test(b.textContent ?? ""))!.click(); });
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
  return onChange;
}
const botao = (t: string) => [...document.querySelectorAll("button")].find(b => (b.textContent ?? "").trim() === t) as HTMLButtonElement | undefined;
const abrirChip = async (rotulo: string) => { await act(async () => { [...document.querySelectorAll("button")].find(b => (b.textContent ?? "").startsWith(rotulo))!.click(); }); await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };

describe("Filtros da Agenda", () => {
  it("tudo marcado: sem aviso de filtro escondendo nada", async () => {
    await abrir(todos);
    expect(document.body.textContent).not.toContain("escondendo parte da agenda");
    expect(botao("Mostrar tudo")).toBeUndefined();
  });

  it("'Mostrar tudo' devolve TODAS as caixas marcadas (não vazias), e preserva só a cor", async () => {
    const onChange = await abrir({ ...todos, colorBy: "ministerio", locais: ["l1"], status: ["cancelado"], categorias: ["igreja"] });
    expect(document.body.textContent).toContain("3 filtros estão escondendo parte da agenda");
    await act(async () => { botao("Mostrar tudo")!.click(); });
    const novo = onChange.mock.calls[0][0] as AgendaFiltros;
    expect(novo).toMatchObject({ ministerios: ["m1", "m2"], areas: ["a1", "a2"], locais: ["l1", "l2"], tipos: TODOS_OS_TIPOS, status: TODOS_OS_STATUS, categorias: TODAS_AS_CATEGORIAS, colorBy: "ministerio" });
  });

  it("dentro de cada filtro o atalho é 'Marcar todos' (nunca 'Limpar') e marca tudo", async () => {
    const onChange = await abrir({ ...todos, locais: ["l1"] });
    await abrirChip("Local");
    expect(document.body.textContent).toContain("Marcar todos");
    expect(document.body.textContent).not.toContain("Limpar");
    await act(async () => { botao("Marcar todos")!.click(); });
    expect((onChange.mock.calls[0][0] as AgendaFiltros).locais).toEqual(["l1", "l2"]);
  });

  it("desmarcar um item deixa os outros; desmarcar o ÚLTIMO devolve todos marcados", async () => {
    let onChange = await abrir(todos);
    await abrirChip("Local");
    const caixas = () => [...document.querySelectorAll("[role=checkbox]")] as HTMLElement[];
    await act(async () => { caixas()[0].click(); });
    expect((onChange.mock.calls.at(-1)![0] as AgendaFiltros).locais).toEqual(["l2"]);
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    onChange = await abrir({ ...todos, locais: ["l1"] });
    await abrirChip("Local");
    await act(async () => { caixas()[0].click(); });   // tira o único que sobrava
    expect((onChange.mock.calls.at(-1)![0] as AgendaFiltros).locais).toEqual(["l1", "l2"]);
  });

  it("categoria e status também: tirar a última caixa marca todas", async () => {
    let onChange = await abrir({ ...todos, categorias: ["igreja"] });
    await abrirChip("Categoria");
    await act(async () => { ([...document.querySelectorAll("[role=checkbox]")][0] as HTMLElement).click(); });   // "Igreja", a única marcada
    expect((onChange.mock.calls.at(-1)![0] as AgendaFiltros).categorias).toEqual(CATEGORIAS_PADRAO);
    act(() => raiz?.unmount()); document.body.innerHTML = "";
    onChange = await abrir({ ...todos, status: ["agendado"] });
    await abrirChip("Status");
    await act(async () => { ([...document.querySelectorAll("[role=checkbox]")][0] as HTMLElement).click(); });
    expect((onChange.mock.calls.at(-1)![0] as AgendaFiltros).status).toEqual(TODOS_OS_STATUS);
  });
});
