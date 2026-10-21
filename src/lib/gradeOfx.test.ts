import { describe, expect, it } from "vitest";
import type { Sugestao } from "./classificacaoOfx";
import {
  contarPorFiltro, identificadasParaConfirmar, marcadasIniciais, marcadasParaGravar,
  paginar, podeGravar, pertenceAoFiltro, valoresEfetivos, type LinhaDaGrade,
} from "./gradeOfx";

const sug = (o: Partial<Sugestao> = {}): Sugestao => ({
  confianca: 92, banda: "identificada", motivos: [], categoriaId: "cat-dizimo", ...o,
});
const nova = (fitid: string, s?: Partial<Sugestao>): LinhaDaGrade => ({ fitid, situacao: "nova", sugestao: sug(s) });

describe("filtros da grade", () => {
  const linhas: LinhaDaGrade[] = [
    nova("a"),
    nova("b", { banda: "revisar", confianca: 70 }),
    nova("c", { banda: "nao_identificada", confianca: 30, categoriaId: undefined }),
    nova("t", { banda: "revisar", confianca: 70, transferencia: true, categoriaId: undefined }),
    { fitid: "x", situacao: "conciliar" },
    { fitid: "j", situacao: "ja_registrada" },
    { fitid: "m", situacao: "ambigua" },
    { fitid: "d", situacao: "debito_encontrado" },
  ];

  it("conta cada linha na faixa certa; transferência não entra em identificadas/revisar", () => {
    expect(contarPorFiltro(linhas)).toEqual({
      todas: 8, h0: 0, h1: 0, h2: 0, h3: 0, h4: 0, resolvidos: 0, identificadas: 1, pendencias: 4, revisar: 2, nao_identificadas: 1, transferencias: 1, debitos: 1, documentos: 0, recorrencias: 0, conciliar: 1, vincular: 0, ja_registradas: 1, ignoradas: 0,
    });
  });

  it("H0: o movimento que parece já registrado tem filtro próprio, conta nas pendências e NUNCA é gravado em lote", () => {
    const v: LinhaDaGrade = { fitid: "v", situacao: "vincular", sugestao: sug() };
    expect(pertenceAoFiltro(v, "vincular")).toBe(true);
    expect(pertenceAoFiltro(v, "pendencias")).toBe(true);
    expect(pertenceAoFiltro(v, "identificadas")).toBe(false);
    expect(podeGravar(v)).toBe(false);
    expect(identificadasParaConfirmar([v], {}, new Set(["v"]))).toEqual([]);
    expect(marcadasIniciais([v]).size).toBe(0);
  });

  it("documento a liquidar (saída do extrato que quitou um previsto) tem filtro próprio e NUNCA é gravado em lote", () => {
    const d: LinhaDaGrade = { fitid: "doc", situacao: "documento", sugestao: sug() };
    expect(pertenceAoFiltro(d, "documentos")).toBe(true);
    expect(pertenceAoFiltro(d, "identificadas")).toBe(false);
    expect(pertenceAoFiltro(d, "pendencias")).toBe(false);
    expect(podeGravar(d)).toBe(false);
  });

  it("débito automático encontrado tem filtro próprio e não entra nas faixas de identificação", () => {
    const d = linhas[7];
    expect(pertenceAoFiltro(d, "debitos")).toBe(true);
    expect(pertenceAoFiltro(d, "identificadas")).toBe(false);
    expect(pertenceAoFiltro(d, "pendencias")).toBe(false);
    expect(podeGravar(d)).toBe(false);
  });

  it("linha ambígua cai em 'revisar' (pede olho humano)", () => {
    expect(pertenceAoFiltro(linhas[6], "revisar")).toBe(true);
    expect(pertenceAoFiltro(linhas[6], "identificadas")).toBe(false);
  });
});

describe("o que pode ser gravado em lote", () => {
  it("só linha nova, que não é transferência e tem categoria", () => {
    expect(podeGravar(nova("a"))).toBe(true);
    expect(podeGravar(nova("a", { transferencia: true }))).toBe(false);
    expect(podeGravar(nova("a", { categoriaId: undefined }))).toBe(false);
    expect(podeGravar({ fitid: "j", situacao: "ja_registrada", sugestao: sug() })).toBe(false);
    expect(podeGravar({ fitid: "x", situacao: "conciliar" })).toBe(false);
  });

  it("sem categoria sugerida, a escolha da pessoa libera a linha — e a sugestão não é perdida", () => {
    const l = nova("c", { banda: "nao_identificada", categoriaId: undefined, centroId: "cc-1" });
    expect(podeGravar(l)).toBe(false);
    expect(podeGravar(l, { categoriaId: "cat-oferta" })).toBe(true);
    expect(valoresEfetivos(l, { categoriaId: "cat-oferta" })).toEqual({ categoriaId: "cat-oferta", centroId: "cc-1" });
  });

  it("a escolha da pessoa vence a sugestão (corrigir Dízimo → Oferta)", () => {
    expect(valoresEfetivos(nova("a"), { categoriaId: "cat-oferta" }).categoriaId).toBe("cat-oferta");
  });

  const linhas = [nova("a"), nova("b"), nova("c", { banda: "revisar", confianca: 70 }), nova("d", { transferencia: true })];

  it("já abre com as identificadas gravábeis marcadas", () => {
    expect([...marcadasIniciais(linhas)].sort()).toEqual(["a", "b"]);
  });

  it("'Confirmar identificadas' respeita o que a pessoa desmarcou e nunca leva revisar nem transferência", () => {
    const marcadas = new Set(["a", "c", "d"]);
    expect(identificadasParaConfirmar(linhas, {}, marcadas).map(l => l.fitid)).toEqual(["a"]);
  });

  it("'Lançar marcadas' leva as marcadas de qualquer faixa, menos as não gravábeis", () => {
    const marcadas = new Set(["a", "c", "d"]);
    expect(marcadasParaGravar(linhas, {}, marcadas).map(l => l.fitid)).toEqual(["a", "c"]);
  });
});

describe("paginar", () => {
  const itens = Array.from({ length: 120 }, (_, i) => i);
  it("divide e limita a página", () => {
    expect(paginar(itens, 1, 50)).toMatchObject({ paginas: 3, pagina: 1 });
    expect(paginar(itens, 3, 50).itens).toHaveLength(20);
    expect(paginar(itens, 99, 50).pagina).toBe(3);
    expect(paginar([], 1, 50)).toMatchObject({ paginas: 1, itens: [] });
  });

  it("linha com CANDIDATA (conta em aberto ou recorrência) nunca vem marcada nem entra em lote: despesa nova é o último caminho", () => {
    const comCandidata: LinhaDaGrade = { ...nova("c1"), candidata: true };
    const livre = nova("l1");
    expect(marcadasIniciais([comCandidata, livre])).toEqual(new Set(["l1"]));
    expect(identificadasParaConfirmar([comCandidata, livre], {}, new Set(["c1", "l1"])).map(x => x.fitid)).toEqual(["l1"]);
    expect(marcadasParaGravar([comCandidata, livre], {}, new Set(["c1", "l1"])).map(x => x.fitid)).toEqual(["l1"]);
    expect(pertenceAoFiltro({ ...nova("h2"), recorrencia: true }, "recorrencias")).toBe(true);
    expect(pertenceAoFiltro(nova("x"), "recorrencias")).toBe(false);
  });

  it("os filtros da Central seguem a hipótese da linha (H0–H4 e resolvidos)", () => {
    const l = (hipotese: LinhaDaGrade["hipotese"]): LinhaDaGrade => ({ ...nova("x"), hipotese });
    expect(pertenceAoFiltro(l("H0"), "h0")).toBe(true);
    expect(pertenceAoFiltro(l("H1"), "h1")).toBe(true);
    expect(pertenceAoFiltro(l("H2"), "h2")).toBe(true);
    expect(pertenceAoFiltro(l("H3"), "h3")).toBe(true);
    expect(pertenceAoFiltro(l("H4"), "h4")).toBe(true);
    expect(pertenceAoFiltro(l("resolvida"), "resolvidos")).toBe(true);
    expect(pertenceAoFiltro(l("H4"), "h0")).toBe(false);
    const c = contarPorFiltro([l("H0"), l("H0"), l("H4"), l("resolvida")]);
    expect([c.todas, c.h0, c.h4, c.resolvidos]).toEqual([4, 2, 1, 1]);
  });
});
