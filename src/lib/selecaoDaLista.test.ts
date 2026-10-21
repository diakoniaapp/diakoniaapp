import { describe, expect, it } from "vitest";
import { moverSelecao, proximaPorDecidir, selecaoAposSumir, type ItemSelecionavel } from "./selecaoDaLista";

const it_ = (fitid: string, resolvida = false): ItemSelecionavel => ({ fitid, resolvida });
const lista = [it_("a"), it_("b"), it_("c"), it_("d")];

describe("moverSelecao (↑/↓)", () => {
  it("anda para o vizinho, sem dar a volta nas pontas", () => {
    expect(moverSelecao(lista, "b", 1)).toBe("c");
    expect(moverSelecao(lista, "b", -1)).toBe("a");
    expect(moverSelecao(lista, "d", 1)).toBe("d");
    expect(moverSelecao(lista, "a", -1)).toBe("a");
  });
  it("sem seleção: ↓ vai ao primeiro, ↑ ao último; lista vazia, nada", () => {
    expect(moverSelecao(lista, null, 1)).toBe("a");
    expect(moverSelecao(lista, null, -1)).toBe("d");
    expect(moverSelecao(lista, "sumiu", 1)).toBe("a");
    expect(moverSelecao([], "a", 1)).toBeNull();
  });
});

describe("selecaoAposSumir", () => {
  it("fica na mesma posição (agora é a linha seguinte) ou, no fim da lista, na última", () => {
    expect(selecaoAposSumir([it_("a"), it_("c"), it_("d")], 1)).toBe("c");
    expect(selecaoAposSumir([it_("a"), it_("c")], 3)).toBe("c");
    expect(selecaoAposSumir([it_("a")], -2)).toBe("a");
    expect(selecaoAposSumir([], 0)).toBeNull();
  });
});

describe("proximaPorDecidir", () => {
  it("vai para a próxima linha ainda por decidir, pulando as resolvidas", () => {
    expect(proximaPorDecidir([it_("a"), it_("b", true), it_("c", true), it_("d")], "a")).toBe("d");
  });
  it("sem próxima, volta para a anterior por decidir; sem nenhuma, fica", () => {
    expect(proximaPorDecidir([it_("a"), it_("b", true), it_("c")], "c")).toBe("a");
    expect(proximaPorDecidir([it_("a", true), it_("b", true)], "b")).toBe("b");
    expect(proximaPorDecidir(lista, "fora")).toBe("fora");
  });
});
