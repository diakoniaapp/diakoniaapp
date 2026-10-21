import { describe, expect, it } from "vitest";
import {
  FILTROS_VAZIOS, chipsDosFiltros, consultaDaSituacao, contarFiltrosAtivos, filtrosDaUrl, filtrosParaUrl, type FiltrosAvancados,
} from "./filtrosDoExtrato";

const NOMES = { categorias: [{ id: "c1", nome: "Dízimos" }], centros: [{ id: "k1", nome: "Missões" }] };
const com = (p: Partial<FiltrosAvancados>): FiltrosAvancados => ({ ...FILTROS_VAZIOS, ...p });

describe("consultaDaSituacao", () => {
  it("'Só vencidos em aberto' é previsto sem chão de data, até ontem, e as datas da barra não valem", () => {
    expect(consultaDaSituacao("vencidos", "2026-10-20")).toEqual({ status: "previsto", ignoraDatas: true, teto: "2026-10-20" });
  });
  it("'Todas' não filtra; as demais filtram pelo status e respeitam as datas", () => {
    expect(consultaDaSituacao("todas", "2026-10-20")).toEqual({ ignoraDatas: false });
    expect(consultaDaSituacao("realizado", "2026-10-20")).toEqual({ status: "realizado", ignoraDatas: false });
    expect(consultaDaSituacao("conciliado", "2026-10-20").status).toBe("conciliado");
  });
});

describe("chips e contador — nunca um filtro escondido", () => {
  it("sem filtro: nada", () => {
    expect(chipsDosFiltros(FILTROS_VAZIOS, NOMES)).toEqual([]);
    expect(contarFiltrosAtivos(FILTROS_VAZIOS)).toBe(0);
  });
  it("cada filtro ativo vira um chip com o nome que a pessoa escolheu", () => {
    const f = com({ tipo: "saida", categoriaId: "c1", centroCustoId: "k1", situacao: "realizado", dataExata: "2026-10-05" });
    const rotulos = chipsDosFiltros(f, NOMES).map(c => c.rotulo);
    expect(rotulos).toEqual(["Tipo: Saídas", "Situação: Realizados", "Categoria: Dízimos", "Centro de custo: Missões", "Só o dia 05/10/2026"]);
    expect(contarFiltrosAtivos(f)).toBe(5);
  });
  it("valor mínimo e máximo viram um chip só e contam como um filtro", () => {
    const f = com({ valorMin: "100", valorMax: "500,50" });
    expect(chipsDosFiltros(f, NOMES).map(c => c.rotulo)).toEqual(["Valor: de 100 a 500,50"]);
    expect(contarFiltrosAtivos(f)).toBe(1);
    expect(chipsDosFiltros(com({ valorMin: "100" }), NOMES)[0].rotulo).toBe("Valor: a partir de 100");
    expect(chipsDosFiltros(com({ valorMax: "9" }), NOMES)[0].rotulo).toBe("Valor: até 9");
  });
  it("o chip de 'vencidos' avisa que as datas são ignoradas", () => {
    expect(chipsDosFiltros(com({ situacao: "vencidos" }), NOMES)[0].rotulo).toContain("ignora as datas");
  });
  it("uma categoria que não está mais na lista não some do chip", () => {
    expect(chipsDosFiltros(com({ categoriaId: "fantasma" }), NOMES)[0].rotulo).toBe("Categoria: …");
  });
  it("remover o chip zera só aquele filtro (e o par de valores inteiro)", () => {
    const f = com({ tipo: "entrada", valorMin: "1", valorMax: "2" });
    const [tipo, valor] = chipsDosFiltros(f, NOMES);
    expect({ ...f, ...tipo.limpar }.tipo).toBe("todos");
    expect({ ...f, ...valor.limpar }).toMatchObject({ valorMin: "", valorMax: "", tipo: "entrada" });
  });
});

describe("filtrosDaUrl / filtrosParaUrl — o endereço espelha os filtros", () => {
  const url = (s: string) => new URLSearchParams(s);
  it("ida e volta sem perder nada", () => {
    const f = com({ tipo: "saida", situacao: "previsto", categoriaId: "c1", centroCustoId: "k1", valorMin: "10,5", valorMax: "99", dataExata: "2026-10-05" });
    const p = new URLSearchParams();
    filtrosParaUrl(f, p);
    expect(filtrosDaUrl(new URLSearchParams(p.toString()))).toEqual(f);
  });
  it("filtro vazio não escreve nada no endereço", () => {
    const p = new URLSearchParams();
    filtrosParaUrl(FILTROS_VAZIOS, p);
    expect(p.toString()).toBe("");
  });
  it("links antigos: os mesmos nomes de parâmetro de sempre", () => {
    expect(filtrosDaUrl(url("tipo=entrada&categoria=c9&centro=k9&valorMin=5&valorMax=7&dataExata=2026-09-30")))
      .toEqual(com({ tipo: "entrada", categoriaId: "c9", centroCustoId: "k9", valorMin: "5", valorMax: "7", dataExata: "2026-09-30" }));
  });
  it("o antigo 'atrasados' vira a Situação 'vencidos'; o parâmetro novo, quando existe, manda", () => {
    expect(filtrosDaUrl(url(""), true).situacao).toBe("vencidos");
    expect(filtrosDaUrl(url("situacao=realizado"), true).situacao).toBe("realizado");
  });
  it("valor inválido de tipo/situação cai no padrão; fornecedor= (filtro que saiu) é ignorado sem filtrar às escondidas", () => {
    expect(filtrosDaUrl(url("tipo=qualquer&situacao=inventada&fornecedor=abc"))).toEqual(FILTROS_VAZIOS);
  });
});
