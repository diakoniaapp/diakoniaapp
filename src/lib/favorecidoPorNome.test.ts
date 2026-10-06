import { describe, expect, it } from "vitest";
import { fornecedorPeloNome, palavrasDoNome, type FornecedorParaNome } from "./favorecidoPorNome";

const f = (id: string, nome: string, pix: string | null = null): FornecedorParaNome => ({ id, nome, chave_pix: pix, tipo_chave_pix: null });

// nomes reais do cadastro (06/10/2026)
const base = [
  f("1", "Ana Patricia da Silva de Lima de Oliveira", "07564123745"),
  f("2", "Caio Marcelo Mendes da Silva", "05283953785"),
  f("3", "59.407.727 Marco Antonio Herculano", "x@y.com"),
  f("4", "Carlos Eduardo de Santana"),
  f("5", "Carlos Alberto Souza"),
  f("6", "Localiza Fleet S.A."),
];

describe("palavrasDoNome", () => {
  it("tira acento, números e palavras de descrição ('Salário', 'RPA')", () => {
    expect(palavrasDoNome("Salário Tayane", true)).toEqual(["tayane"]);
    expect(palavrasDoNome("RPA Ana Patricia", true)).toEqual(["ana", "patricia"]);
    expect(palavrasDoNome("59.407.727 Marco Antonio Herculano")).toEqual(["marco", "antonio", "herculano"]);
  });
});

describe("fornecedorPeloNome — só sugere quando UM cadastro bate", () => {
  it("descrição de folha/RPA acha o cadastro pelo nome", () => {
    expect(fornecedorPeloNome("RPA Ana Patricia", base)?.id).toBe("1");
    expect(fornecedorPeloNome("Salario Caio", base)?.id).toBe("2");
    expect(fornecedorPeloNome("MARCO ANTONIO HERCULANO", base)?.id).toBe("3");
  });
  it("ambíguo não sugere: 'Carlos' bate em dois", () => {
    expect(fornecedorPeloNome("Salario Carlos", base)).toBeNull();
    expect(fornecedorPeloNome("RPA Carlos Eduardo", base)?.id).toBe("4");
  });
  it("sem acerto, sem descrição ou palavra curta demais: nada", () => {
    expect(fornecedorPeloNome("DARF PREVIDENCIARIO", base)).toBeNull();
    expect(fornecedorPeloNome(null, base)).toBeNull();
    expect(fornecedorPeloNome("RPA", base)).toBeNull();
    expect(fornecedorPeloNome("Ana", base)).toBeNull(); // 3 letras sozinhas: pouco para identificar alguém
  });
});
