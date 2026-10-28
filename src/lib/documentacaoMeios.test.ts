import { describe, expect, it } from "vitest";
import { documentacaoDaSaida, meioDePagamento, type EntradaDocumental } from "./documentacaoExigida";

const base = (o: Partial<EntradaDocumental>): EntradaDocumental => ({
  categoriaNome: "Material de Consumo", status: "conciliado", contaTipo: "banco", tipos: [], temCategoria: true, temCentro: true, documentoNumero: "123", ...o,
});

describe("a matriz por meio de pagamento (28/10/2026)", () => {
  const reemb = (o: Partial<EntradaDocumental>) => base({ intencao: "reembolso", terceiroQuitou: true, documentoNumero: "9", ...o });

  describe("meioDePagamento — a conta manda primeiro", () => {
    it.each([
      [{ contaTipo: "caixa" }, "especie"], [{ contaTipo: "envelope" }, "especie"], [{ contaTipo: "caixa", formaPagamento: "pix" }, "especie"],
      [{ contaTipo: "banco", formaPagamento: "dinheiro" }, "especie"], [{ contaTipo: "banco", formaPagamento: "pix" }, "pix"], [{ contaTipo: "banco", formaPagamento: "transferencia" }, "ted"],
      [{ contaTipo: "banco", formaPagamento: "boleto" }, "boleto"], [{ contaTipo: "banco", formaPagamento: "guia" }, "boleto"],
      [{ contaTipo: "cartao" }, "cartao"], [{ contaTipo: "banco", formaPagamento: "cartao_debito" }, "cartao"],
      [{ contaTipo: "banco", formaLiquidacao: "debito_automatico" }, "automatico"], [{ contaTipo: "banco", formaLiquidacao: "pix_recorrente", formaPagamento: "pix" }, "automatico"],
      [{ contaTipo: "banco" }, "outro"], [{}, "outro"],
    ])("%j → %s", (o, esperado) => { expect(meioDePagamento(o)).toBe(esperado); });
  });

  describe("Espécie / Caixinha", () => {
    it("a Nota Fiscal basta: completa, sem comprovante bancário", () => {
      const d = documentacaoDaSaida(base({ contaTipo: "caixa", tipos: ["nota_fiscal"] }));
      expect(d.meio).toBe("especie");
      expect(d.situacao).toBe("completa");
      expect(d.exigeComprovante).toBe(false);
      expect(d.gravidade).toBeNull();
    });
    it("a NF basta MESMO onde a categoria pediria outro documento (Condomínio, Seguros, Impostos, Energia)", () => {
      for (const categoriaNome of ["Condomínio", "Seguros", "Impostos e Taxas", "Energia Elétrica"]) {
        expect(documentacaoDaSaida(base({ categoriaNome, contaTipo: "caixa", tipos: ["nota_fiscal"] })).situacao, categoriaNome).toBe("completa");
      }
    });
    it("em conta de BANCO a NF continua não bastando para o Seguro (a regra nova é só da espécie)", () => {
      expect(documentacaoDaSaida(base({ categoriaNome: "Seguros", contaTipo: "banco", tipos: ["nota_fiscal", "comprovante"] })).situacao).toBe("parcial");
    });
    it("sem a Nota Fiscal, a Caixinha continua pendente", () => {
      const d = documentacaoDaSaida(base({ contaTipo: "caixa", tipos: [] }));
      expect(d.situacao).toBe("sem");
      expect(d.faltam).toEqual(["Nota Fiscal ou Fatura"]);
    });
    it("dinheiro numa conta de banco (forma = dinheiro) também não exige comprovante", () => {
      const d = documentacaoDaSaida(base({ contaTipo: "banco", formaPagamento: "dinheiro", tipos: ["nota_fiscal"] }));
      expect(d.situacao).toBe("completa");
      expect(d.exigeComprovante).toBe(false);
    });
  });

  describe("PIX, TED e boleto — conta de banco exige o comprovante", () => {
    it.each(["pix", "transferencia", "boleto"])("%s: sem comprovante falta ele; com ele, completa", forma => {
      expect(documentacaoDaSaida(base({ formaPagamento: forma, tipos: ["nota_fiscal"] })).faltam).toEqual(["Comprovante de pagamento"]);
      expect(documentacaoDaSaida(base({ formaPagamento: forma, tipos: ["nota_fiscal", "comprovante"] })).situacao).toBe("completa");
    });
  });

  describe("Cartão", () => {
    it("débito/crédito: a fatura do cartão é a prova — sem comprovante, só a Nota", () => {
      for (const o of [{ contaTipo: "cartao" }, { contaTipo: "banco", formaPagamento: "cartao_debito" }, { contaTipo: "banco", formaPagamento: "cartao_credito" }]) {
        const d = documentacaoDaSaida(base({ ...o, tipos: ["nota_fiscal"] }));
        expect(d.meio).toBe("cartao");
        expect(d.situacao).toBe("completa");
        expect(d.exigeComprovante).toBe(false);
      }
    });
  });

  describe("Reembolso", () => {
    it("em ESPÉCIE (pago pela Caixinha): Nota Fiscal + Declaração bastam — nada de PIX nem TED", () => {
      const d = documentacaoDaSaida(reemb({ contaTipo: "caixa", tipos: ["nota_fiscal", "declaracao_terceiro"] }));
      expect(d.modelo).toBe("reembolso");
      expect(d.situacao).toBe("completa");
      expect(d.exigidas.map(x => x.rotulo)).toEqual(["Nota Fiscal", "Declaração do Terceiro"]);
      expect(d.exigeComprovante).toBe(false);
    });
    it("o AVISO do reembolso (ainda não pago) com a Caixinha como conta também não pede o PIX", () => {
      const d = documentacaoDaSaida(reemb({ status: "previsto", contaTipo: "caixa", tipos: ["nota_fiscal", "pedido_reembolso"] }));
      expect(d.situacao).toBe("completa");
      expect(d.faltam).toEqual([]);
    });
    it("reembolso em dinheiro numa conta de banco (forma = dinheiro) idem", () => {
      expect(documentacaoDaSaida(reemb({ formaPagamento: "dinheiro", tipos: ["nota_fiscal", "declaracao_terceiro"] })).situacao).toBe("completa");
    });
    it("em espécie ainda falta a Declaração: a Nota sozinha é parcial", () => {
      const d = documentacaoDaSaida(reemb({ contaTipo: "caixa", tipos: ["nota_fiscal"] }));
      expect(d.situacao).toBe("parcial");
      expect(d.faltam).toEqual(["Declaração do Terceiro"]);
    });
    it("por PIX: continua exigindo o comprovante do PIX da igreja", () => {
      expect(documentacaoDaSaida(reemb({ formaPagamento: "pix", tipos: ["nota_fiscal", "declaracao_terceiro"] })).faltam).toEqual(["Comprovante do PIX da igreja"]);
    });
    it("por TED: exige o comprovante da TED (com o nome certo)", () => {
      expect(documentacaoDaSaida(reemb({ formaPagamento: "transferencia", tipos: ["nota_fiscal", "declaracao_terceiro"] })).faltam).toEqual(["Comprovante da TED da igreja"]);
      expect(documentacaoDaSaida(reemb({ formaPagamento: "transferencia", tipos: ["nota_fiscal", "declaracao_terceiro", "comprovante"] })).situacao).toBe("completa");
    });
    it("conta de banco sem forma informada: segue como sempre — exige o comprovante do PIX", () => {
      expect(documentacaoDaSaida(reemb({ tipos: ["nota_fiscal", "declaracao_terceiro"] })).faltam).toEqual(["Comprovante do PIX da igreja"]);
    });
  });

  describe("Débito automático", () => {
    const luz = (o: Partial<EntradaDocumental>) => base({ categoriaNome: "Energia Elétrica", formaLiquidacao: "debito_automatico", tipos: ["fatura"], documentoNumero: "1", ...o });
    it("a marca [ofx:…] nas observações (conciliação antiga) vale como confirmação bancária", () => {
      const d = documentacaoDaSaida(luz({ observacoes: "Light [ofx:20261015001]" }));
      expect(d.situacao).toBe("completa");
      expect(d.comprovanteOk).toBe(true);
    });
    it("a marca do extrato em PDF [ofx:PDF:…] também", () => {
      expect(documentacaoDaSaida(luz({ observacoes: "[ofx:PDF:2026-10-15:321,37]" })).situacao).toBe("completa");
    });
    it("sem vínculo e sem marca, o que falta é a confirmação do banco", () => {
      expect(documentacaoDaSaida(luz({ observacoes: "pagamento da Light" })).faltam).toEqual(["Confirmação bancária (OFX ou PDF)"]);
    });
    it("a marca [ofx:] NÃO dispensa o comprovante de um pagamento MANUAL", () => {
      expect(documentacaoDaSaida(luz({ formaLiquidacao: "manual", observacoes: "[ofx:123]" })).faltam).toEqual(["Comprovante de pagamento"]);
    });
  });
});
