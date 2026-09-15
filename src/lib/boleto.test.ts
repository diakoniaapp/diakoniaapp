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
import { decodificarLinhaDigitavel, codigoBarrasParaLinhaDigitavel, decodificarBoleto } from "./boleto";

const LINHA_VALIDA =
  "1234567897" + "12345678903" + "12345678903" + "1" + "0100" + "0000010000";

// O código de barras (44) tem a MESMA informação da linha digitável (47),
// só reordenada e sem os 3 DVs de campo — construído aqui campo a campo
// (não hand-typed) pra não arriscar erro de transcrição num número de 44
// dígitos. banco+moeda+dvGeral+fator+valor+campoLivre(25), onde
// campoLivre = [5 primeiros dígitos de campo1 sem DV] + [10 de campo2 sem
// DV] + [10 de campo3 sem DV] — ver comentário de
// `codigoBarrasParaLinhaDigitavel`.
const CODIGO_BARRAS_VALIDO =
  "123" /* banco */ + "4" /* moeda */ + "1" /* DV geral */
  + "0100" /* fator vencimento */ + "0000010000" /* valor */
  + "56789" /* resto do campo1 */ + "1234567890" /* campo2 sem DV */ + "1234567890" /* campo3 sem DV */;

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

  // Achado em revisão de 13/09/2026: a FEBRABAN reiniciou o fator de
  // vencimento pra 1000 em 22/02/2025 (confirmado com fontes do setor —
  // Sankhya, KMEE, Senior). Fator 1000 = 22/02/2025 no ciclo novo, não
  // 07/10/1997+1000 dias (~2000) do ciclo clássico.
  it("fator >= 1000 usa o ciclo novo pós-reinício FEBRABAN (fator 1000 = 22/02/2025)", () => {
    const cicloNovo = "1234567897" + "12345678903" + "12345678903" + "1" + "1000" + "0000010000";
    const r = decodificarLinhaDigitavel(cicloNovo);
    expect(r.vencimento).toBe("2025-02-22");
  });

  it("fator 1000 + N dias no ciclo novo soma certo (1015 = 22/02/2025 + 15 dias)", () => {
    const cicloNovo = "1234567897" + "12345678903" + "12345678903" + "1" + "1015" + "0000010000";
    const r = decodificarLinhaDigitavel(cicloNovo);
    expect(r.vencimento).toBe("2025-03-09");
  });
});

describe("codigoBarrasParaLinhaDigitavel", () => {
  it("reconstrói a linha digitável a partir do código de barras (44 → 47)", () => {
    expect(codigoBarrasParaLinhaDigitavel(CODIGO_BARRAS_VALIDO)).toBe(LINHA_VALIDA);
  });

  it("aceita o código de barras com espaços (como às vezes vem de leitor)", () => {
    const comEspacos = CODIGO_BARRAS_VALIDO.replace(/(.{4})/g, "$1 ").trim();
    expect(codigoBarrasParaLinhaDigitavel(comEspacos)).toBe(LINHA_VALIDA);
  });

  it("rejeita tamanho diferente de 44 dígitos", () => {
    expect(() => codigoBarrasParaLinhaDigitavel("123")).toThrow(/44 números/);
  });
});

describe("decodificarBoleto", () => {
  it("decodifica igual, venha do código de barras (44) ou da linha digitável (47)", () => {
    const doCodigoBarras = decodificarBoleto(CODIGO_BARRAS_VALIDO);
    const daLinha = decodificarBoleto(LINHA_VALIDA);
    expect(doCodigoBarras).toEqual(daLinha);
    expect(doCodigoBarras.valor).toBe(100);
    expect(doCodigoBarras.vencimento).toBe("1998-01-15");
  });
});
