import { describe, expect, it } from "vitest";
import { bloqueioDaMudanca, consequenciasDaMudanca, ehTrocavel, intencaoOposta } from "./mudarIntencao";

describe("Mudar intenção (Fase 2B): só Oferta ⇄ Reembolso", () => {
  it("só essas duas intenções trocam, e a troca é a oposta", () => {
    expect(ehTrocavel("oferta")).toBe(true);
    expect(ehTrocavel("reembolso")).toBe(true);
    expect(ehTrocavel("nao_declarada")).toBe(false);
    expect(ehTrocavel("compensacao_adiantamento")).toBe(false);
    expect(intencaoOposta("oferta")).toBe("reembolso");
    expect(intencaoOposta("reembolso")).toBe("oferta");
  });

  it("as consequências dizem a declaração, as aprovações, o Relatado, a nova via e o efeito de cada sentido", () => {
    const d = consequenciasDaMudanca("oferta", "reembolso").join(" | ");
    expect(d).toMatch(/Declaração do Terceiro atual deixa de valer/);
    expect(d).toMatch(/Toda aprovação já dada perde a validade/);
    expect(d).toMatch(/volta a Relatado/);
    expect(d).toMatch(/NOVA via/);
    expect(d).toMatch(/igreja passa a dever o valor ao terceiro/);
    expect(consequenciasDaMudanca("reembolso", "oferta").join(" | ")).toMatch(/passa a ser uma oferta/);
  });

  it("reembolso já pago (no todo ou em parte) não volta a Oferta: manda para o estorno", () => {
    expect(bloqueioDaMudanca({ intencao: "reembolso", reembolsado: 50, aberta: true })).toMatch(/fluxo de estorno/);
  });
  it("reembolso sem pagamento e oferta (paga ou não) podem trocar", () => {
    expect(bloqueioDaMudanca({ intencao: "reembolso", reembolsado: 0, aberta: true })).toBeNull();
    expect(bloqueioDaMudanca({ intencao: "reembolso", reembolsado: null, aberta: true })).toBeNull();
    expect(bloqueioDaMudanca({ intencao: "oferta", reembolsado: null, aberta: true })).toBeNull();
  });
  it("intenção que não troca ou despesa não aberta: nada a dizer (o cartão não oferece a ação)", () => {
    expect(bloqueioDaMudanca({ intencao: "nao_declarada", reembolsado: null, aberta: true })).toBeNull();
    expect(bloqueioDaMudanca({ intencao: "reembolso", reembolsado: 10, aberta: false })).toBeNull();
  });
});
