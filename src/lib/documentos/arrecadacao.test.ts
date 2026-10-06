import { describe, expect, it } from "vitest";
import { decodificarArrecadacao, ehArrecadacao } from "./arrecadacao";

// Monta uma linha de arrecadação VÁLIDA a partir do código de barras, para o teste não depender de
// um documento real. Os casos de "erro" alteram um dígito DEPOIS de montar.
function modulo10(c: string) {
  let s = 0, p = 2;
  for (let i = c.length - 1; i >= 0; i--) { let x = Number(c[i]) * p; if (x > 9) x = Math.floor(x / 10) + (x % 10); s += x; p = p === 2 ? 1 : 2; }
  const r = s % 10;
  return r === 0 ? 0 : 10 - r;
}
function barrasValidas(segmento: string, valorCentavos: number, resto: string) {
  const semDv = "8" + segmento + "6" + String(valorCentavos).padStart(11, "0") + resto.padEnd(29, "0");
  const dv = modulo10(semDv);
  return semDv.slice(0, 3) + dv + semDv.slice(3);
}
function linhaDe(barras: string) {
  return Array.from({ length: 4 }, (_, b) => { const bl = barras.slice(b * 11, b * 11 + 11); return bl + modulo10(bl); }).join("");
}

describe("decodificarArrecadacao", () => {
  const barras = barrasValidas("5", 125000, "00394460"); // segmento 5 = órgão governamental, R$ 1.250,00

  it("do código de barras: valor, segmento e a linha de 48", () => {
    const r = decodificarArrecadacao(barras);
    expect(r).toMatchObject({ segmento: "orgao_governamental", valor: 1250 });
    expect(r.linhaDigitavel).toHaveLength(48);
  });

  it("da linha digitável (com espaços): o mesmo resultado, DVs conferem", () => {
    const bonita = linhaDe(barras).match(/.{1,12}/g)!.join(" ");
    const r = decodificarArrecadacao(bonita);
    expect(r.codigoBarras).toBe(barras);
    expect(r.valor).toBe(1250);
    expect(r.dvConfere).toBe(true);
  });

  it("um dígito trocado (OCR) → dvConfere = false: o sistema avisa, não apresenta como certo", () => {
    const l = linhaDe(barras);
    const errada = l.slice(0, 20) + (l[20] === "1" ? "2" : "1") + l.slice(21);
    expect(decodificarArrecadacao(errada).dvConfere).toBe(false);
  });

  it("conta de energia (segmento 3)", () => {
    expect(decodificarArrecadacao(barrasValidas("3", 281146, "1234")).segmento).toBe("energia_gas");
  });

  it("valor só de referência não vira valor", () => {
    const semDv = "8" + "5" + "7" + "00000000000" + "".padEnd(29, "1");
    const barrasRef = semDv.slice(0, 3) + modulo10(semDv) + semDv.slice(3);
    expect(decodificarArrecadacao(barrasRef).valor).toBeNull();
  });

  it("não é arrecadação / tamanho errado", () => {
    expect(ehArrecadacao(barras)).toBe(true);
    expect(ehArrecadacao("34191790010104351004791020150008591070026000")).toBe(false);
    expect(() => decodificarArrecadacao("34191790010104351004791020150008591070026000")).toThrow();
    expect(() => decodificarArrecadacao("812345")).toThrow(/44 ou 48/);
  });
});
