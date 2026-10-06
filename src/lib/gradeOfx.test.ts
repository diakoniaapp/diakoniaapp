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
      todas: 8, identificadas: 1, pendencias: 4, revisar: 2, nao_identificadas: 1, transferencias: 1, debitos: 1, conciliar: 1, ja_registradas: 1,
    });
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
});
