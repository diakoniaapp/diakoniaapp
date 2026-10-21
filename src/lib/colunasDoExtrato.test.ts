import { describe, expect, it } from "vitest";
import {
  CHAVE_COLUNAS, COLUNAS_COMPACTO, COLUNAS_COMPLETO, COLUNAS_PADRAO, colunasDoPreset, colunasVisiveis, gravarColunas, lerColunas, presetQueCasa,
} from "./colunasDoExtrato";

function armazemDe(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

describe("lerColunas — o que mostrar ao abrir a tela", () => {
  it("sem nada guardado: o celular nasce em Compacto e a tela larga no padrão de sempre (o antigo Analítico)", () => {
    expect(Array.from(lerColunas(armazemDe(), true))).toEqual(COLUNAS_COMPACTO);
    expect(Array.from(lerColunas(armazemDe(), false)).sort()).toEqual([...COLUNAS_PADRAO].sort());
  });
  it("a escolha guardada vence tudo, inclusive o celular", () => {
    const a = armazemDe({ [CHAVE_COLUNAS]: JSON.stringify(["saldo", "projeto"]) });
    expect(Array.from(lerColunas(a, true)).sort()).toEqual(["projeto", "saldo"]);
    expect(Array.from(lerColunas(a, false)).sort()).toEqual(["projeto", "saldo"]);
  });
  it("quem tinha guardado Resumido/Analítico não perde a escolha (migra, e o Resumido ganha o Saldo)", () => {
    expect(Array.from(lerColunas(armazemDe({ "diakonia-extrato-modo": "resumido" }), false))).toEqual(COLUNAS_COMPACTO);
    expect(Array.from(lerColunas(armazemDe({ "diakonia-extrato-modo": "analitico" }), true)).sort()).toEqual([...COLUNAS_PADRAO].sort());
  });
  it("coluna desconhecida guardada é descartada; texto estragado cai no padrão", () => {
    expect(Array.from(lerColunas(armazemDe({ [CHAVE_COLUNAS]: JSON.stringify(["saldo", "inventada"]) }), false))).toEqual(["saldo"]);
    expect(Array.from(lerColunas(armazemDe({ [CHAVE_COLUNAS]: "{não é json" }), true))).toEqual(COLUNAS_COMPACTO);
  });
  it("armazenamento indisponível não derruba a tela", () => {
    expect(lerColunas(null, true).size).toBe(COLUNAS_COMPACTO.length);
    const quebrado = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("bloqueado"); } };
    expect(lerColunas(quebrado, false).size).toBe(COLUNAS_PADRAO.length);
    expect(() => gravarColunas(quebrado, new Set(["saldo"]))).not.toThrow();
  });
});

describe("gravarColunas", () => {
  it("guarda e volta igual", () => {
    const a = armazemDe();
    gravarColunas(a, new Set(["saldo", "documento"]));
    expect(Array.from(lerColunas(a, true)).sort()).toEqual(["documento", "saldo"]);
  });
});

describe("os atalhos Compacto e Completo", () => {
  it("Compacto é Data·Descrição·Valor·Saldo: só o Saldo fica ligado", () => {
    expect(Array.from(colunasDoPreset("compacto"))).toEqual(["saldo"]);
  });
  it("Completo liga todas", () => {
    expect(colunasDoPreset("completo").size).toBe(COLUNAS_COMPLETO.length);
  });
  it("presetQueCasa reconhece o atalho e devolve null para combinação própria", () => {
    expect(presetQueCasa(new Set(["saldo"]), false)).toBe("compacto");
    expect(presetQueCasa(colunasDoPreset("completo"), true)).toBe("completo");
    expect(presetQueCasa(new Set(["saldo", "categoria"]), false)).toBeNull();
    expect(presetQueCasa(new Set(), false)).toBeNull();
  });
  it("fora de Todas as Contas a coluna Conta não conta: o Completo ainda casa sem ela", () => {
    const semConta = new Set(COLUNAS_COMPLETO.filter(c => c !== "conta"));
    expect(presetQueCasa(semConta, false)).toBe("completo");
    expect(presetQueCasa(semConta, true)).toBeNull();
  });
  it("colunasVisiveis tira a Conta quando não é Todas as Contas", () => {
    expect(colunasVisiveis(new Set(["saldo", "conta"]), false).has("conta")).toBe(false);
    expect(colunasVisiveis(new Set(["saldo", "conta"]), true).has("conta")).toBe(true);
  });
});
