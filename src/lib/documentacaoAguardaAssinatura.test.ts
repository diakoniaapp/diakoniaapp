import { describe, expect, it } from "vitest";
import { documentacaoDaSaida, resumirProntidao, textoDoQueFalta, type EntradaDocumental } from "./documentacaoExigida";

// 28/10/2026: a Declaração do Terceiro GERADA e esperando a assinatura do responsável não é cobrada nas pendências; só depois da confirmação dele o documento passa a ser exigido.
const oferta = (o: Partial<EntradaDocumental> = {}): EntradaDocumental => ({
  categoriaNome: "Consumo", status: "quitado_terceiro", contaTipo: "nao_aplicavel", tipos: ["nota_fiscal"], intencao: "oferta", terceiroQuitou: true,
  temCategoria: true, temCentro: true, documentoNumero: "3763", ...o,
});

describe("Declaração do Terceiro da oferta: gerada e aguardando assinatura", () => {
  it("SEM declaração gerada, continua cobrando: falta a Declaração do Terceiro (parcial)", () => {
    const d = documentacaoDaSaida(oferta());
    expect(d.situacao).toBe("parcial");
    expect(d.faltam).toEqual(["Declaração do Terceiro"]);
    expect(d.aguardandoAssinatura).toBe(false);
  });
  it("GERADA e sem a assinatura: não é cobrança — documentação completa, com o selo 'aguardando assinatura'", () => {
    const d = documentacaoDaSaida(oferta({ declaracaoAguardandoAssinatura: true }));
    expect(d.situacao).toBe("completa");
    expect(d.gravidade).toBeNull();
    expect(d.faltam).toEqual([]);
    expect(d.aguardandoAssinatura).toBe(true);
    expect(d.documentosOk).toBe(true);
    expect(textoDoQueFalta(d)).toBe("Aguardando a assinatura da Declaração do Terceiro (já gerada)");
  });
  it("quando o arquivo assinado sobe, a despesa fica completa e o selo some", () => {
    const d = documentacaoDaSaida(oferta({ tipos: ["nota_fiscal", "declaracao_terceiro"], declaracaoAguardandoAssinatura: false }));
    expect(d.situacao).toBe("completa");
    expect(d.aguardandoAssinatura).toBe(false);
    expect(textoDoQueFalta(d)).toBe("Documentação completa");
  });
  it("se o arquivo já está anexado, o sinal de 'aguardando' é ignorado (a exigência está atendida)", () => {
    expect(documentacaoDaSaida(oferta({ tipos: ["nota_fiscal", "declaracao_terceiro"], declaracaoAguardandoAssinatura: true })).aguardandoAssinatura).toBe(false);
  });
  it("a Nota Fiscal continua cobrada: sem a nota, a declaração gerada não esconde a falta", () => {
    const d = documentacaoDaSaida(oferta({ tipos: [], declaracaoAguardandoAssinatura: true }));
    expect(d.faltam).toEqual(["Nota Fiscal"]);
    expect(d.situacao).toBe("sem");
  });
  it("as pendências administrativas continuam valendo (🔵) mesmo aguardando a assinatura", () => {
    const d = documentacaoDaSaida(oferta({ declaracaoAguardandoAssinatura: true, temCentro: false }));
    expect(d.gravidade).toBe("administrativa");
    expect(d.administrativas).toContain("Centro de custo");
    expect(d.aguardandoAssinatura).toBe(true);
  });
  it("o REEMBOLSO não ganha essa folga: o recibo assinado é a prova do pagamento e continua cobrado", () => {
    const d = documentacaoDaSaida({ ...oferta({ status: "conciliado", contaTipo: "caixa", intencao: "reembolso", declaracaoAguardandoAssinatura: true }) });
    expect(d.modelo).toBe("reembolso");
    expect(d.faltam).toEqual(["Declaração do Terceiro"]);
    expect(d.aguardandoAssinatura).toBe(false);
  });
  it("na Prontidão: não conta como pendência, é contado à parte e entra nas 'prontas'", () => {
    const itens = [documentacaoDaSaida(oferta({ declaracaoAguardandoAssinatura: true })), documentacaoDaSaida(oferta()), documentacaoDaSaida(oferta({ tipos: ["nota_fiscal", "declaracao_terceiro"] }))];
    const r = resumirProntidao(itens);
    expect(r).toMatchObject({ total: 3, completas: 2, parciais: 1, aguardandoAssinatura: 1, pendentes: 1, prontas: 2 });
  });
});
