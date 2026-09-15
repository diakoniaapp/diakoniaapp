// ─── Testes de `fuzzyNome.ts` ────────────────────────────────────────────
//
// Casos reais desta sessão (13-15/09/2026), com nomes fictícios no lugar
// dos doadores reais — o padrão de erro é real (espaço a mais quebrando
// tokenização, sobrenome digitado errado), a pessoa não.
import { describe, it, expect } from "vitest";
import { normalizarNome, distanciaLevenshtein, encontrarCandidatoPorNome, type CandidatoNome } from "./fuzzyNome";

describe("normalizarNome", () => {
  it("remove acento, baixa caixa e apara espaço", () => {
    expect(normalizarNome("  José da Silva  ")).toBe("jose da silva");
  });
});

describe("distanciaLevenshtein", () => {
  it("é zero pra strings iguais", () => {
    expect(distanciaLevenshtein("abc", "abc")).toBe(0);
  });
  it("conta substituições/inserções/remoções", () => {
    expect(distanciaLevenshtein("cardozo", "cardoso")).toBe(1);
    expect(distanciaLevenshtein("gato", "gatos")).toBe(1);
  });
});

describe("encontrarCandidatoPorNome", () => {
  const candidatos: CandidatoNome[] = [
    { id: "1", nome: "Maria Aparecida Souza Lima" },
    { id: "2", nome: "João Carlos Pereira" },
    { id: "3", nome: "Sunamyta Fernandes de Oliveira" },
  ];

  it("acha por nome normalizado idêntico (acento/caixa)", () => {
    const r = encontrarCandidatoPorNome("MARIA APARECIDA SOUZA LIMA", candidatos);
    expect(r?.id).toBe("1");
  });

  it("acha por subsequência de tokens (nome do meio abreviado)", () => {
    const r = encontrarCandidatoPorNome("Maria A. Souza Lima", candidatos);
    expect(r?.id).toBe("1");
  });

  it("acha por distância de Levenshtein (erro de digitação no sobrenome)", () => {
    // "Fernandes" -> "Fernanded" (1 char trocado)
    const r = encontrarCandidatoPorNome("Sunamyta Fernanded de Oliveira", candidatos);
    expect(r?.id).toBe("3");
  });

  it("acha mesmo com espaço extra quebrando um token em dois (caso real: SUNAMY TA)", () => {
    const r = encontrarCandidatoPorNome("SUNAMY TA FERNANDES DE OLIVEIRA", candidatos);
    // token-subsequência falha aqui (token extra no meio muda a contagem),
    // mas Levenshtein sem espaços pega — mesma razão que o caso real só
    // foi resolvido no nível 3, não no 2.
    expect(r?.id).toBe("3");
  });

  it("não sugere nada quando há mais de um candidato plausível (ambíguo)", () => {
    const doisJoaos: CandidatoNome[] = [
      { id: "1", nome: "João Carlos Pereira" },
      { id: "2", nome: "João Carlos Ferreira" },
    ];
    const r = encontrarCandidatoPorNome("Joao Carlos Pereira Filho", doisJoaos);
    expect(r).toBeNull();
  });

  it("não sugere nada pra nome muito diferente", () => {
    const r = encontrarCandidatoPorNome("Roberto Almeida Neto", candidatos);
    expect(r).toBeNull();
  });

  it("não sugere nada pra lista vazia ou nome vazio", () => {
    expect(encontrarCandidatoPorNome("Maria", [])).toBeNull();
    expect(encontrarCandidatoPorNome("", candidatos)).toBeNull();
  });
});
