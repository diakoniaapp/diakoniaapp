// ─── Testes de `boleto.ts` ───────────────────────────────────────────────
//
// A linha digitável de teste abaixo foi montada e conferida à mão (não
// copiada de um boleto real) especificamente para estes testes:
//   campo1 = "123456789" → DV módulo 10 = 7 (somando 9·2,8·1,7·2... com
//            redução de dois dígitos, resto 3, DV = 10-3 = 7)
//   campo2 = campo3 = "1234567890" → DV módulo 10 = 3 (mesmo cálculo,
//            resto 7, DV = 10-7 = 3)
//   fator de vencimento = 0100 → 07/10/1997 + 100 dias = 15/01/1998
//     (24 dias até 31/10, +30 até 30/11, +31 até 31/12 = 85; +15 = 100,
//     caindo em 15/01/1998)
//   valor = 0000010000 (centavos) → R$ 100,00
import { describe, it, expect } from "vitest";
import { decodificarLinhaDigitavel } from "./boleto";

const LINHA_VALIDA =
  "1234567897" + "12345678903" + "12345678903" + "1" + "0100" + "0000010000";

describe("decodificarLinhaDigitavel", () => {
  it("decodifica banco, valor e vencimento de uma linha válida", () => {
    const r = decodificarLinhaDigitavel(LINHA_VALIDA);
    expect(r.banco).toBe("123");
    expect(r.valor).toBe(100);
    expect(r.vencimento).toBe("1998-01-15");
    expect(r.linhaDigitavel).toHaveLength(47);
  });

  it("aceita a linha com pontos, espaços e traços (como se copia de um boleto real)", () => {
    const comFormatacao = "12345.67897 12345.678903 12345.678903 1 0100 0000010000";
    const r = decodificarLinhaDigitavel(comFormatacao);
    expect(r.valor).toBe(100);
  });

  it("rejeita quando um dígito verificador de campo não confere", () => {
    const linhaAdulterada = LINHA_VALIDA.slice(0, 5) + "9" + LINHA_VALIDA.slice(6);
    expect(() => decodificarLinhaDigitavel(linhaAdulterada)).toThrow(/não conferem/);
  });

  it("rejeita tamanho diferente de 47 dígitos", () => {
    expect(() => decodificarLinhaDigitavel("123")).toThrow(/47 números/);
  });

  it("identifica 48 dígitos como provável conta de consumo, não boleto", () => {
    expect(() => decodificarLinhaDigitavel(LINHA_VALIDA + "9")).toThrow(/conta de consumo/);
  });

  it("valor null quando o boleto não fixa valor (campo zerado)", () => {
    const semValor = "1234567897" + "12345678903" + "12345678903" + "1" + "0100" + "0000000000";
    const r = decodificarLinhaDigitavel(semValor);
    expect(r.valor).toBeNull();
  });

  it("vencimento null quando o fator vem zerado", () => {
    const semVencimento = "1234567897" + "12345678903" + "12345678903" + "1" + "0000" + "0000010000";
    const r = decodificarLinhaDigitavel(semVencimento);
    expect(r.vencimento).toBeNull();
  });
});
