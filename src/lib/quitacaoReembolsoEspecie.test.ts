import { describe, expect, it } from "vitest";
import { avaliarQuitacao, resultadoDaQuitacao, type EntradaDaMatriz } from "./quitacao";
import { pagamentoEmEspecie } from "@/components/financas/PagarReembolsoDialog";

// Opção B (decisão dela, 28/10/2026): reembolso em espécie pode ser PAGO sem a declaração assinada antes; ela passa a ser exigida na quitação, depois de pago.
const PARAMS = { teto1: 500, prazoDeclaracaoDias: 30, tetoAnualTerceiro: 2000, qtdRelatadasTrimestre: 3, limiteCapitalizacao: 1000 } as EntradaDaMatriz["parametros"];
const reemb = (o: Partial<EntradaDaMatriz> = {}): EntradaDaMatriz => ({
  responsavel: "pessoa", intencao: "reembolso", grauResponsavel: "formal", grauIntencao: "relatado", naturezaItem: "consumo", valor: 767.1,
  temNotaAnexada: true, compradorCnpjIgreja: true, chaveValida: true, chaveConfereComEmitente: true, chaveInformada: true,
  terceiroNoCircuito: false, terceiroMinistro: false, empresaComPagamentos12m: false, intencaoAlteradaRecentemente: false, pedeReciboFiscal: false,
  ofertaComCondicao: false, diasEntrePagamentoEDeclaracao: 0, acumuladoAnoDoTerceiro: 767.1, qtdRelatadasNoTrimestre: 1,
  periodoDaDespesaAprovado: false, formalizacaoVencida: false, aprovadoPeloAdministrador: false, parametros: PARAMS, ...o,
});

describe("Reembolso: a declaração assinada só é exigida DEPOIS de pago (Opção B)", () => {
  it("antes de pagar, com a prova do pagamento do terceiro Formal e sem a declaração assinada: SUFICIENTE (pode ser aprovado e pago)", () => {
    const r = avaliarQuitacao(reemb({ paga: false }));
    expect(r.suficiente).toBe(true);
    expect(r.motivo).toBeNull();
  });
  it("sem informar 'paga' vale como ainda não paga", () => {
    expect(avaliarQuitacao(reemb()).suficiente).toBe(true);
  });
  it("DEPOIS de pago, sem a declaração: volta a ser insuficiente, e o motivo diz o que falta — a Solicitação e Recibo assinada", () => {
    const r = avaliarQuitacao(reemb({ paga: true }));
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toMatch(/Solicitação e Recibo de Reembolso assinada pelo recebedor/);
  });
  it("depois de pago e COM a declaração assinada: suficiente", () => {
    expect(avaliarQuitacao(reemb({ paga: true, grauIntencao: "formal" })).suficiente).toBe(true);
  });
  it("a prova do PAGAMENTO DO TERCEIRO continua obrigatória: sem ela o reembolso não pode ser pago, com ou sem declaração", () => {
    const r = avaliarQuitacao(reemb({ grauResponsavel: "relatado" }));
    expect(r.suficiente).toBe(false);
    expect(r.motivo).toBe("Reembolso só se paga com a prova Formal: anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.");
  });
  it("intenção NÃO declarada continua sem poder ser paga", () => {
    expect(avaliarQuitacao(reemb({ intencao: "nao_declarada", grauIntencao: "nenhum" })).suficiente).toBe(false);
  });
  it("a aprovação do Administrador continua NÃO substituindo a prova do pagamento do terceiro", () => {
    expect(avaliarQuitacao(reemb({ grauResponsavel: "relatado", aprovadoPeloAdministrador: true })).suficiente).toBe(false);
  });
  it("a oferta e a compensação não mudam: oferta sem declaração segue como estava", () => {
    expect(avaliarQuitacao(reemb({ intencao: "compensacao_adiantamento" })).suficiente).toBe(false);
  });
  it("na fila: antes de pagar, aprovado, vai para 'Reembolso a pagar'; depois de pago sem declaração, cai em 'A formalizar'", () => {
    const antes = avaliarQuitacao(reemb({ paga: false }));
    expect(resultadoDaQuitacao({ responsavel: "pessoa", intencao: "reembolso", suficiente: antes.suficiente, aprovacaoDoReembolso: "aprovada", paga: false }).fila).toBe("reembolso_a_pagar");
    const depois = avaliarQuitacao(reemb({ paga: true }));
    expect(resultadoDaQuitacao({ responsavel: "pessoa", intencao: "reembolso", suficiente: depois.suficiente, aprovacaoDoReembolso: "aprovada", paga: true }).fila).toBe("formalizar");
  });
});

describe("pagamentoEmEspecie — a mesma definição da regra documental", () => {
  it.each([
    ["caixa", null, true], ["envelope", null, true], ["banco", "dinheiro", true], ["banco", "pix", false], ["banco", "transferencia", false], ["banco", null, false], [null, null, false],
  ])("conta %s + forma %s → %s", (conta, forma, esperado) => { expect(pagamentoEmEspecie(conta, forma)).toBe(esperado); });
});
