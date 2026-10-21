import { describe, expect, it } from "vitest";
import { documentacaoDaSaida, resumirProntidao, textoDoQueFalta, type EntradaDocumental } from "./documentacaoExigida";

const base = (o: Partial<EntradaDocumental>): EntradaDocumental => ({
  categoriaNome: "Material de Consumo", status: "conciliado", contaTipo: "banco", tipos: [], temCategoria: true, temCentro: true, documentoNumero: "123", ...o,
});

describe("documentacaoDaSaida — a regra única", () => {
  it("um comprovante SOZINHO não é documentação completa: é parcial (o defeito que motivou a regra)", () => {
    const d = documentacaoDaSaida(base({ tipos: ["comprovante"] }));
    expect(d.situacao).toBe("parcial");
    expect(d.gravidade).toBe("parcial");
    expect(d.faltam).toEqual(["Nota Fiscal ou Fatura"]);
    expect(textoDoQueFalta(d)).toBe("Falta Nota Fiscal ou Fatura");
  });

  it("prestador PJ / compra: Nota Fiscal + Comprovante (a Fatura também serve como origem)", () => {
    expect(documentacaoDaSaida(base({ tipos: ["nota_fiscal", "comprovante"] })).situacao).toBe("completa");
    expect(documentacaoDaSaida(base({ tipos: ["fatura", "comprovante"] })).situacao).toBe("completa");
    const d = documentacaoDaSaida(base({ tipos: ["nota_fiscal"] }));
    expect(d.situacao).toBe("parcial");
    expect(d.faltam).toEqual(["Comprovante de pagamento"]);
  });

  it("nenhum anexo = sem documentação, gravidade crítica; falta tudo que a regra pede", () => {
    const d = documentacaoDaSaida(base({}));
    expect(d.situacao).toBe("sem");
    expect(d.gravidade).toBe("critica");
    expect(d.faltam).toEqual(["Nota Fiscal ou Fatura", "Comprovante de pagamento"]);
    expect(textoDoQueFalta(d)).toBe("Falta Nota Fiscal ou Fatura e comprovante de pagamento");
  });

  it.each([
    ["Energia Elétrica", "fatura", "Fatura"], ["Internet e Telefonia", "fatura", "Fatura"], ["Água e Esgoto", "fatura", "Fatura"], ["Gás", "fatura", "Fatura"],
    ["Salários", "dps", "DPS"], ["Prebenda", "rsp", "RSP"], ["RPA Pessoa Física/Autônomo", "rpa", "RPA"],
    ["Condomínio", "boleto", "Boleto ou Fatura"], ["Seguros", "contrato", "Apólice ou Boleto"], ["Impostos e Taxas", "guia", "Guia"],
  ])("%s: %s + Comprovante", (categoriaNome, tipo, rotulo) => {
    const d = documentacaoDaSaida(base({ categoriaNome, tipos: [tipo, "comprovante"], documentoNumero: "1" }));
    expect(d.situacao).toBe("completa");
    expect(d.exigidas.map(x => x.rotulo)).toEqual([rotulo, "Comprovante de pagamento"]);
    // sem o documento certo (só o comprovante) continua parcial
    expect(documentacaoDaSaida(base({ categoriaNome, tipos: ["comprovante"] })).faltam).toEqual([rotulo]);
  });

  it("Condomínio aceita Boleto OU Fatura; Seguros, Apólice OU Boleto (decisão dela)", () => {
    expect(documentacaoDaSaida(base({ categoriaNome: "Condomínio", tipos: ["fatura", "comprovante"] })).situacao).toBe("completa");
    expect(documentacaoDaSaida(base({ categoriaNome: "Seguros", tipos: ["boleto", "comprovante"] })).situacao).toBe("completa");
    expect(documentacaoDaSaida(base({ categoriaNome: "Seguros", tipos: ["nota_fiscal", "comprovante"] })).situacao).toBe("parcial");
  });

  it("Salários sem o DPS não está completo mesmo com nota fiscal e comprovante", () => {
    expect(documentacaoDaSaida(base({ categoriaNome: "Salários", tipos: ["nota_fiscal", "comprovante"] })).situacao).toBe("parcial");
  });

  it("o comprovante só é exigido onde o banco o emite: Caixinha, Cartão e Envelopes ficam completos só com a NF/Fatura (decisão dela)", () => {
    for (const contaTipo of ["caixa", "cartao", "envelope"]) {
      const d = documentacaoDaSaida(base({ contaTipo, tipos: ["nota_fiscal"] }));
      expect(d.situacao).toBe("completa");
      expect(d.exigidas.map(x => x.rotulo)).toEqual(["Nota Fiscal ou Fatura"]);
    }
    expect(documentacaoDaSaida(base({ contaTipo: "banco", tipos: ["nota_fiscal"] })).situacao).toBe("parcial");
  });

  it("o campo antigo comprovante_url vale como comprovante", () => {
    expect(documentacaoDaSaida(base({ tipos: ["nota_fiscal"], temComprovanteAntigo: true })).situacao).toBe("completa");
  });

  it("obrigação ainda não paga: não há comprovante a exigir, só o documento de origem", () => {
    const d = documentacaoDaSaida(base({ status: "previsto", tipos: ["boleto", "nota_fiscal"] }));
    expect(d.situacao).toBe("completa");
    expect(d.exigidas.map(x => x.rotulo)).toEqual(["Nota Fiscal ou Fatura"]);
  });

  it("tarifas (PIX e cesta), IOF, juros, rendimentos, investimentos, Invest Fácil e título de capitalização dispensam — pelo padrão do nome", () => {
    for (const categoriaNome of ["Tarifa PIX", "Cesta Bancária", "Rendimentos de Aplicações", "Investimentos", "Título de Capitalização", "Invest Fácil", "IOF"]) {
      expect(documentacaoDaSaida(base({ categoriaNome })).situacao, categoriaNome).toBe("dispensa");
    }
    expect(documentacaoDaSaida(base({ categoriaNome: "Material de Consumo" })).situacao).not.toBe("dispensa");
  });

  it("tarifas, IOF, juros e encargos bancários dispensam — e sem anexo nenhum não são falta", () => {
    for (const categoriaNome of ["Tarifas Bancárias", "IOF", "Juros", "Encargos Bancários"]) {
      const d = documentacaoDaSaida(base({ categoriaNome }));
      expect(d.situacao).toBe("dispensa");
      expect(d.modelo).toBe("dispensa");
    }
    // 'Encargos Trabalhistas' NÃO é bancário: exige Guia
    expect(documentacaoDaSaida(base({ categoriaNome: "Encargos Trabalhistas" })).situacao).toBe("sem");
    // dispensa com anexo: vira completa (o escritório recebe o que houver)
    expect(documentacaoDaSaida(base({ categoriaNome: "Tarifas Bancárias", tipos: ["comprovante"] })).situacao).toBe("completa");
  });

  it("compra OFERTADA: Nota Fiscal + Declaração do Terceiro, SEM comprovante da igreja", () => {
    const ok = documentacaoDaSaida(base({ status: "quitado_terceiro", contaTipo: "nao_aplicavel", tipos: ["nota_fiscal", "declaracao_terceiro"], intencao: "oferta", terceiroQuitou: true }));
    expect(ok.modelo).toBe("oferta");
    expect(ok.situacao).toBe("completa");
    expect(ok.exigidas.map(x => x.rotulo)).toEqual(["Nota Fiscal", "Declaração do Terceiro"]);
    const falta = documentacaoDaSaida(base({ status: "quitado_terceiro", contaTipo: "nao_aplicavel", tipos: ["nota_fiscal"], intencao: "oferta", terceiroQuitou: true }));
    expect(falta.situacao).toBe("parcial");
    expect(falta.faltam).toEqual(["Declaração do Terceiro"]);
  });

  it("REEMBOLSO: Nota Fiscal + Declaração do Terceiro + Comprovante do PIX da igreja", () => {
    const completo = documentacaoDaSaida(base({ tipos: ["nota_fiscal", "pedido_reembolso", "comprovante"], intencao: "reembolso", terceiroQuitou: true }));
    expect(completo.modelo).toBe("reembolso");
    expect(completo.situacao).toBe("completa");
    const semPix = documentacaoDaSaida(base({ tipos: ["nota_fiscal", "declaracao_terceiro"], intencao: "reembolso", terceiroQuitou: true }));
    expect(semPix.faltam).toEqual(["Comprovante do PIX da igreja"]);
    expect(semPix.situacao).toBe("parcial");
  });

  it("aviso de reembolso (aprovado e ainda NÃO pago): o PIX é a falta, e a frase diz que está aguardando o pagamento", () => {
    const d = documentacaoDaSaida(base({ status: "previsto", contaTipo: "nao_aplicavel", tipos: ["nota_fiscal", "declaracao_terceiro"], intencao: "reembolso", terceiroQuitou: true }));
    expect(d.situacao).toBe("parcial");
    expect(d.exigidas.find(x => x.rotulo === "Comprovante do PIX da igreja")?.aguardaPagamento).toBe(true);
    expect(textoDoQueFalta(d)).toBe("Falta Comprovante do PIX da igreja (reembolso ainda não pago)");
  });

  describe("🔵 administrativa: documentação completa, mas falta algo operacional", () => {
    it.each([
      [{ temCentro: false }, "Centro de custo"], [{ temCategoria: false }, "Categoria"], [{ documentoNumero: "" }, "Nº do documento"], [{ status: "realizado" }, "Conferência do pagamento"],
    ])("%j → %s", (o, esperado) => {
      const d = documentacaoDaSaida(base({ tipos: ["nota_fiscal", "comprovante"], ...o }));
      expect(d.situacao).toBe("completa");
      expect(d.gravidade).toBe("administrativa");
      expect(d.administrativas).toContain(esperado);
      expect(textoDoQueFalta(d)).toMatch(/^Documentos ok · falta /);
    });
    it("o nº do documento só se cobra onde há nota ou fatura", () => {
      expect(documentacaoDaSaida(base({ categoriaNome: "Salários", tipos: ["dps", "comprovante"], documentoNumero: null })).gravidade).toBeNull();
    });
    it("a pendência administrativa NÃO rebaixa a documentação: a crítica e a parcial continuam mandando", () => {
      expect(documentacaoDaSaida(base({ temCentro: false, tipos: [] })).gravidade).toBe("critica");
      expect(documentacaoDaSaida(base({ temCentro: false, tipos: ["comprovante"] })).gravidade).toBe("parcial");
    });
    it("tudo em ordem = sem gravidade", () => {
      const d = documentacaoDaSaida(base({ tipos: ["nota_fiscal", "comprovante"] }));
      expect(d.gravidade).toBeNull();
      expect(textoDoQueFalta(d)).toBe("Documentação completa");
    });
  });
});

describe("resumirProntidao", () => {
  const itens = [
    documentacaoDaSaida(base({ tipos: ["nota_fiscal", "comprovante"] })),                       // completa
    documentacaoDaSaida(base({ tipos: ["nota_fiscal", "comprovante"], temCentro: false })),     // completa (🔵)
    documentacaoDaSaida(base({ tipos: ["comprovante"] })),                                       // parcial
    documentacaoDaSaida(base({ tipos: [] })),                                                    // sem
    documentacaoDaSaida(base({ categoriaNome: "Tarifas Bancárias" })),                           // dispensa
  ];
  const r = resumirProntidao(itens);

  it("conta cada situação, e prontas = completas + dispensam (o que o escritório já consegue trabalhar)", () => {
    expect(r).toMatchObject({ total: 5, completas: 2, parciais: 1, sem: 1, dispensam: 1, prontas: 3, pendentes: 3, administrativas: 1 });
    expect(r.percentual).toBeCloseTo(60);
  });
  it("existentes × necessários só conta o que a regra EXIGE", () => {
    expect(r.porDocumento).toEqual([
      { rotulo: "Comprovante de pagamento", necessarios: 4, existentes: 3 },
      { rotulo: "Nota Fiscal ou Fatura", necessarios: 4, existentes: 2 },
    ]);
  });
  it("sem nenhuma saída: 0%, sem dividir por zero", () => {
    expect(resumirProntidao([])).toMatchObject({ total: 0, percentual: 0, prontas: 0 });
  });
});
