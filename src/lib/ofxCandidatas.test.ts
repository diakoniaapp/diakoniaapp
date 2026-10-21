import { describe, expect, it } from "vitest";
import { candidataDaLinha, pedidosDeConfirmacao, type LinhaParaGuarda } from "./ofxCandidatas";
import type { DocumentoDoExtrato } from "./documentoDoExtrato";

const doc = (extra: Partial<DocumentoDoExtrato> = {}): DocumentoDoExtrato => ({
  documento: { id: "ob-1", valor: 278.22, data: "2026-10-05", fornecedor_id: "f-verisure", fornecedor_nome: "Verisure Brasil" },
  diferenca: 0, exato: true, incerto: true, confianca: 70, contrato: null, segundoContrato: false, ambiguo: false, outrosAbertos: [], contratoSemDocumento: null, motivo: "", ...extra,
});
// "PAGTO ELETRON COBRANCA …" — texto genérico: sem favorecido, a linha segue como NOVA com a dica do documento
const linha = (fitid: string, extra: Partial<LinhaParaGuarda> = {}): LinhaParaGuarda =>
  ({ tx: { fitid, tipo: "saida", valor: 278.22, data: "2026-10-05", memo: "PAGTO ELETRON COBRANCA" }, situacao: "nova", documentos: [doc()], ...extra });

describe("o OFX não cria despesa nova em silêncio quando há obrigação candidata (D3)", () => {
  it("linha nova com a dica de um documento a pagar pede a confirmação — com a conta, o vencimento e o valor", () => {
    const [p] = pedidosDeConfirmacao([linha("A")], new Set());
    expect(p).toMatchObject({ fitid: "A", conta: "Verisure Brasil", vencimento: "2026-10-05", valorDaConta: 278.22, valor: 278.22, exato: true });
  });

  it("linha nova SEM candidata segue direto (tarifa, PIX avulso)", () => {
    expect(pedidosDeConfirmacao([linha("B", { documentos: undefined }), linha("C", { documentos: [] })], new Set())).toEqual([]);
  });

  it("quem já virou proposta de liquidação ('documento') não cria lançamento: não entra na guarda", () => {
    expect(candidataDaLinha({ situacao: "documento", documentos: [doc()] })).toBeNull();
    expect(pedidosDeConfirmacao([linha("D", { situacao: "documento" })], new Set())).toEqual([]);
  });

  it("depois do 'criar mesmo assim' a pergunta não se repete para aquela linha — só para as outras", () => {
    const ps = pedidosDeConfirmacao([linha("E"), linha("F")], new Set(["E"]));
    expect(ps.map(p => p.fitid)).toEqual(["F"]);
  });

  it("valor diferente do da conta é dito (não é 'exato')", () => {
    const [p] = pedidosDeConfirmacao([linha("G", { documentos: [doc({ exato: false, diferenca: 12.5 })] })], new Set());
    expect(p.exato).toBe(false);
  });

  it("o candidato é o primeiro da lista (o mais provável); conta sem nome cai na descrição", () => {
    const outro = doc({ documento: { id: "ob-2", valor: 100, data: "2026-10-09", fornecedor_id: null, fornecedor_nome: null, descricao: "Aluguel do salão" } });
    expect(candidataDaLinha({ situacao: "nova", documentos: [outro, doc()] })).toBe(outro);
    expect(pedidosDeConfirmacao([linha("H", { documentos: [outro] })], new Set())[0].conta).toBe("Aluguel do salão");
  });

  it("H2: a recorrência compatível (conta do mês nunca gerada) também é candidata — pede o clique e o motivo", () => {
    const rec = { recorrenciaId: "r1", rotulo: "Verisure — Templo", valor: 278.22, valorVariavel: false, vencimento: "2026-10-05", diferenca: 0, motivo: "" };
    const [p] = pedidosDeConfirmacao([linha("R", { documentos: undefined, recorrenciaCompativel: rec })], new Set());
    expect(p).toMatchObject({ fitid: "R", conta: "Verisure — Templo", vencimento: "2026-10-05", valorDaConta: 278.22, exato: true, recorrencia: true });
    expect(pedidosDeConfirmacao([linha("R2", { documentos: undefined, recorrenciaCompativel: rec })], new Set(["R2"]))).toEqual([]);
    // uma conta em aberto vence a recorrência: não pergunta duas vezes
    expect(pedidosDeConfirmacao([linha("R3", { recorrenciaCompativel: rec })], new Set()).map(x => x.recorrencia)).toEqual([undefined]);
  });
});
