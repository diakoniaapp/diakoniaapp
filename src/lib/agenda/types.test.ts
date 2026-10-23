// ─── Os filtros da Agenda (22/10/2026) ─────────────────────────────────────
//
// A Agenda abre SEMPRE com tudo marcado. Nada do que a pessoa desmarca é gravado no navegador: a seleção vale só enquanto a tela está aberta. Estes testes travam o ponto
// de partida (`DEFAULT_FILTROS`), a definição de "filtro ligado" e a regra de ids novos dentro da mesma sessão.

import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTROS, TODOS_OS_TIPOS, TODAS_AS_CATEGORIAS, TODOS_OS_STATUS, algumFiltroRestringe, filtrosTodosMarcados, incluirNovos,
  CATEGORIAS_PADRAO, categoriasRestringem,
} from "./types";

describe("o ponto de partida da Agenda: tudo marcado", () => {
  it("tipos, status e categorias nascem completos — inclusive as datas profissionais", () => {
    expect(DEFAULT_FILTROS.tipos).toEqual(TODOS_OS_TIPOS);
    expect(DEFAULT_FILTROS.status).toEqual(TODOS_OS_STATUS);
    expect(DEFAULT_FILTROS.categorias).toEqual(TODAS_AS_CATEGORIAS);
    expect(DEFAULT_FILTROS.categorias).toContain("profissional");
  });
  it("ministérios, áreas e locais nascem vazios (= sem restrição) e a tela os preenche com tudo", () => {
    expect(DEFAULT_FILTROS).toMatchObject({ ministerios: [], areas: [], locais: [] });
  });
  it("o estado de partida não conta como filtro ligado", () => {
    expect(categoriasRestringem(DEFAULT_FILTROS.categorias)).toBe(false);
    expect(algumFiltroRestringe(DEFAULT_FILTROS, { ministerios: ["m1"], areas: ["a1"], locais: ["l1"] })).toBe(false);
  });
  it("os blocos do painel seguem sem as profissionais (CATEGORIAS_PADRAO)", () => {
    expect(CATEGORIAS_PADRAO).not.toContain("profissional");
    expect(CATEGORIAS_PADRAO.length).toBe(TODAS_AS_CATEGORIAS.length - 1);
  });
});

describe("categoriasRestringem", () => {
  it("falta QUALQUER categoria (inclusive a profissional) = filtro ligado", () => {
    expect(categoriasRestringem(TODAS_AS_CATEGORIAS)).toBe(false);
    expect(categoriasRestringem(TODAS_AS_CATEGORIAS.filter((c) => c !== "familiar"))).toBe(true);
    expect(categoriasRestringem(TODAS_AS_CATEGORIAS.filter((c) => c !== "profissional"))).toBe(true);
  });
  it("sem lista (undefined) não restringe", () => {
    expect(categoriasRestringem(undefined)).toBe(false);
  });
});

describe("filtrosTodosMarcados e algumFiltroRestringe", () => {
  const universo = { ministerios: ["m1", "m2", "m3"], areas: ["a1", "a2"], locais: ["l1", "l2"] };

  it("marca todas as opções, mantém só a preferência de cor", () => {
    const f = filtrosTodosMarcados({ ...DEFAULT_FILTROS, colorBy: "ministerio", ministerios: ["m1"], locais: ["l2"], status: ["cancelado"], categorias: ["igreja"] }, universo);
    expect(f).toMatchObject({ ministerios: ["m1", "m2", "m3"], areas: ["a1", "a2"], locais: ["l1", "l2"], status: TODOS_OS_STATUS, categorias: TODAS_AS_CATEGORIAS, tipos: TODOS_OS_TIPOS, colorBy: "ministerio" });
    expect(algumFiltroRestringe(f, universo)).toBe(false);
  });

  it("restringe quando falta ALGUMA opção; vazio ou tudo marcado não restringem (mesma definição do contador do botão)", () => {
    const todos = filtrosTodosMarcados(DEFAULT_FILTROS, universo);
    expect(algumFiltroRestringe(todos, universo)).toBe(false);
    expect(algumFiltroRestringe({ ...todos, locais: ["l1"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, status: ["agendado"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, categorias: ["igreja"] }, universo)).toBe(true);
    expect(algumFiltroRestringe({ ...todos, ministerios: [] }, universo)).toBe(false);
  });
});

describe("incluirNovos — restaurar a última seleção sem perder o que nasceu depois", () => {
  it("lista vazia: tudo marcado", () => {
    expect(incluirNovos([], undefined, ["a", "b"])).toEqual({ selecionados: ["a", "b"], conhecidos: ["a", "b"], mudou: true });
  });
  it("com memória: o que foi desmarcado continua desmarcado e nada muda", () => {
    expect(incluirNovos(["a"], ["a", "b"], ["a", "b"])).toEqual({ selecionados: ["a"], conhecidos: ["a", "b"], mudou: false });
  });
  it("com memória: só o item NOVO entra marcado", () => {
    expect(incluirNovos(["a"], ["a", "b"], ["a", "b", "c"])).toEqual({ selecionados: ["a", "c"], conhecidos: ["a", "b", "c"], mudou: true });
  });
  it("sem memória (legado): todos contam como novos uma vez", () => {
    expect(incluirNovos(["a"], undefined, ["a", "b"])).toEqual({ selecionados: ["a", "b"], conhecidos: ["a", "b"], mudou: true });
  });
  it("não duplica", () => {
    expect(incluirNovos(["a", "c"], ["a"], ["a", "c"]).selecionados).toEqual(["a", "c"]);
  });
});
