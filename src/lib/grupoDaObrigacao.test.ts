import { describe, expect, it } from "vitest";
import { irmaosPorLinha, origemDoAnexo, parcelasDoGrupo, raizDaObrigacao } from "./grupoDaObrigacao";

// O caso real (Denise, 10/2026): obrigação de R$ 1.438; a raiz foi paga com R$ 1.358 pelo PIX de 02/10 e os R$ 80 restantes saíram depois
const RAIZ = { id: "raiz", obrigacao_id: "raiz", data: "2026-10-05", data_pagamento: "2026-10-02", status: "conciliado", valor: 1358 };
const RESTO = { id: "resto", obrigacao_id: "raiz", data: "2026-10-08", data_pagamento: null, status: "realizado", valor: "80.00" };

describe("grupo da obrigação", () => {
  it("a raiz é o obrigacao_id; sem ele, a própria linha", () => {
    expect(raizDaObrigacao(RESTO)).toBe("raiz");
    expect(raizDaObrigacao({ id: "x", obrigacao_id: null })).toBe("x");
    expect(raizDaObrigacao({ id: "y" })).toBe("y");
  });

  it("as parcelas vêm em ordem do dia do pagamento, com a raiz e a linha aberta marcadas", () => {
    const p = parcelasDoGrupo([RESTO, RAIZ], "resto", "raiz");
    expect(p.map(x => x.id)).toEqual(["raiz", "resto"]);
    expect(p[0]).toMatchObject({ raiz: true, atual: false, data: "2026-10-02", valor: 1358 });
    expect(p[1]).toMatchObject({ raiz: false, atual: true, data: "2026-10-08", valor: 80 });   // numeric chega como texto
  });

  it("no mesmo dia, a raiz vem primeiro", () => {
    const p = parcelasDoGrupo([{ ...RESTO, data: "2026-10-02" }, RAIZ], "raiz", "raiz");
    expect(p.map(x => x.id)).toEqual(["raiz", "resto"]);
  });

  it("de onde veio o anexo: nada para a própria linha ou para obrigação de uma parcela só", () => {
    const grupo = parcelasDoGrupo([RAIZ, RESTO], "resto", "raiz");
    expect(origemDoAnexo("resto", "resto", grupo)).toBeNull();
    expect(origemDoAnexo("raiz", "resto", grupo)).toBe("da obrigação");
    expect(origemDoAnexo("resto", "raiz", grupo)).toBe("da parcela de 08/10");
    expect(origemDoAnexo("raiz", "raiz", parcelasDoGrupo([RAIZ], "raiz", "raiz"))).toBeNull();
    expect(origemDoAnexo("outra", "raiz", grupo)).toBeNull();
  });
});

describe("irmaosPorLinha", () => {
  it("o grupo da Denise: a raiz e o resto se enxergam; linha sozinha não aparece", () => {
    const m = irmaosPorLinha([
      { id: "raiz", obrigacao_id: "raiz" }, { id: "resto", obrigacao_id: "raiz" },
      { id: "sozinha", obrigacao_id: "sozinha" }, { id: "sem", obrigacao_id: null },
    ]);
    expect(m.get("raiz")).toEqual(["resto"]);
    expect(m.get("resto")).toEqual(["raiz"]);
    expect(m.has("sozinha")).toBe(false);
    expect(m.has("sem")).toBe(false);
  });

  it("a raiz entra no grupo mesmo quando só as filhas foram consultadas; três linhas se veem duas a duas", () => {
    const m = irmaosPorLinha([{ id: "a", obrigacao_id: "raiz" }, { id: "b", obrigacao_id: "raiz" }]);
    expect(m.get("raiz")!.sort()).toEqual(["a", "b"]);
    expect(m.get("a")!.sort()).toEqual(["b", "raiz"]);
  });
});
