import { describe, it, expect } from "vitest";
import { calcularHashArquivo } from "./importacaoArquivos";

// Trava de duplicidade (15/09/2026) — ver `faturaImportService.ts` e a migration
// 20260915160000. Estes testes vieram de `omieImport.test.ts`, trocando a planilha
// de exemplo por bytes simples: o que se prova aqui é só o SHA-256.
const bytes = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("calcularHashArquivo", () => {
  it("gera o mesmo hash pro mesmo conteúdo", async () => {
    expect(await calcularHashArquivo(bytes("FULANO;100"))).toBe(await calcularHashArquivo(bytes("FULANO;100")));
  });

  it("gera hash diferente pra conteúdo diferente", async () => {
    expect(await calcularHashArquivo(bytes("FULANO;100"))).not.toBe(await calcularHashArquivo(bytes("FULANO;200")));
  });

  it("devolve um hex de 64 caracteres (SHA-256)", async () => {
    expect(await calcularHashArquivo(bytes("qualquer coisa"))).toMatch(/^[0-9a-f]{64}$/);
  });
});
