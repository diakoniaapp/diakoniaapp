// ─── Testes de `dinheiro.ts` ─────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { paraNumero } from "./dinheiro";

describe("paraNumero", () => {
  it("lê vírgula como decimal", () => {
    expect(paraNumero("928,00")).toBe(928);
    expect(paraNumero("928,50")).toBe(928.5);
  });

  it("lê ponto de milhar junto com vírgula decimal", () => {
    expect(paraNumero("1.234,56")).toBe(1234.56);
  });

  it("lê ponto de milhar sozinho (sem vírgula) como milhar, não decimal", () => {
    expect(paraNumero("3.500")).toBe(3500);
    expect(paraNumero("1.234.567")).toBe(1234567);
  });

  it("lê ponto com 1-2 dígitos depois (sem vírgula) como decimal", () => {
    expect(paraNumero("928.5")).toBe(928.5);
    expect(paraNumero("928.50")).toBe(928.5);
  });

  it("lê número inteiro sem separador nenhum", () => {
    expect(paraNumero("928")).toBe(928);
  });

  it("texto vazio ou inválido vira zero", () => {
    expect(paraNumero("")).toBe(0);
    expect(paraNumero("   ")).toBe(0);
    expect(paraNumero("abc")).toBe(0);
  });
});
