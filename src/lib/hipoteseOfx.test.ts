import { describe, expect, it } from "vitest";
import { montarHipotese, nomeCurtoDaCategoria, type EntradaDaHipotese } from "./hipoteseOfx";
import type { Sugestao } from "./classificacaoOfx";

const nomes: Record<string, string> = { diz: "Dizimos", ofe: "Ofertas", mis: "Ofertas para Missões" };
const nome = (id?: string | null) => (id ? nomes[id] ?? id : "");
const sug = (p: Partial<Sugestao> = {}): Sugestao => ({ confianca: 96, banda: "identificada", motivos: ["6 dízimos no histórico"], ...p });
const ent = (p: Partial<EntradaDaHipotese> = {}): EntradaDaHipotese => ({
  tx: { tipo: "entrada", valor: 830, data: "2026-09-04", memo: "TRANSF AUTORIZ ENTRE AGS CLAUDIA VILELA DE ALMEIDA" },
  sugestao: sug(), contaNome: "Bradesco", alvo: null, modoTransferencia: false, sugeridaComoTransferencia: false, nomeDaCategoria: nome, ...p,
});

describe("hipótese: o que o sistema acredita que a linha representa", () => {
  it("pessoa identificada: quem, últimas classificações, sugestão, confiança e por quê", () => {
    const h = montarHipotese(ent({
      favorecido: { nome: "Claudia Vilela de Almeida", papel: "pessoa" }, categoriaId: "diz",
      sugestao: sug({ historico: [{ dia: "2026-08-06", valor: 830, categoriaId: "diz" }, { dia: "2026-07-03", valor: 830, categoriaId: "diz" }, { dia: "2026-06-03", valor: 960, categoriaId: "ofe" }] }),
    }));
    expect(h).toMatchObject({ tom: "pessoa", titulo: "Pessoa identificada", nivel: "identificada", sugestao: "Dízimo", confianca: 96, valor: 830 });
    expect(h.quem).toEqual({ nome: "Claudia Vilela de Almeida", papel: "Pessoa" });
    expect(h.anteriores).toEqual(["Dízimo", "Dízimo", "Oferta"]);
    expect(h.porques).toEqual(["6 dízimos no histórico"]);
  });

  it("nome só parecido não é 'identificada': é 'Possível pessoa'", () => {
    const h = montarHipotese(ent({ favorecido: { nome: "Maria", papel: "pessoa" }, sugestao: sug({ confianca: 80, banda: "revisar" }) }));
    expect(h.titulo).toBe("Possível pessoa");
    expect(h.nivel).toBe("revisar");
  });

  it("transferência com correspondência: origem, destino, valor, data, confiança e o motivo", () => {
    const h = montarHipotese(ent({
      tx: { tipo: "entrada", valor: 535, data: "2026-09-10", memo: "DEP DINHEIRO ATM" },
      sugestao: sug({ transferencia: true, confianca: 92, banda: "identificada" }),
      provavel: { contaId: "env", contaNome: "Caixa de Envelopes", lancamentoId: "l1", data: "2026-09-09", valor: 535, confianca: 92, outras: [] },
      alvo: { contaId: "env", contaNome: "Caixa de Envelopes", lancamentoId: "l1" }, modoTransferencia: true, sugeridaComoTransferencia: true,
    }));
    expect(h).toMatchObject({ tom: "transferencia", titulo: "Possível transferência interna", confianca: 92, nivel: "identificada", valor: 535 });
    expect(h.transferencia).toMatchObject({ origem: "Caixa de Envelopes", destino: "Bradesco", ligada: true });
    expect(h.porques[0]).toMatch(/saída correspondente em Caixa de Envelopes.*1 dia de diferença/);
  });

  it("transferência só pelo texto do banco (sem perna): avisa que não há lançamento correspondente", () => {
    const h = montarHipotese(ent({ sugestao: sug({ transferencia: true, confianca: 70, banda: "revisar" }), modoTransferencia: true, sugeridaComoTransferencia: true }));
    expect(h.porques[0]).toMatch(/não há lançamento correspondente/);
    expect(h.transferencia?.origem).toBe("escolha a origem");
  });

  it("saída: o destino é a outra conta", () => {
    const h = montarHipotese(ent({
      tx: { tipo: "saida", valor: 3000, data: "2026-09-10", memo: "APLIC INVEST FACIL" }, sugestao: sug({ transferencia: true, banda: "revisar", confianca: 70 }),
      alvo: { contaId: "apl", contaNome: "Aplicação" }, modoTransferencia: true, sugeridaComoTransferencia: true,
    }));
    expect(h.transferencia).toMatchObject({ origem: "Bradesco", destino: "Aplicação" });
  });

  it("PIX ,10: possível oferta missionária, por convenção, sem reclassificar sozinho", () => {
    const h = montarHipotese(ent({ tx: { tipo: "entrada", valor: 50.1, data: "2026-09-01", memo: "PIX RECEBIDO" }, sugestao: sug({ possivelMissoes: true, categoriaId: "mis", confianca: 70, banda: "revisar", motivos: [] }), categoriaId: "mis" }));
    expect(h).toMatchObject({ tom: "missionaria", titulo: "Possível oferta missionária", sugestao: "Missões" });
    expect(h.porques[0]).toMatch(/Convenção operacional da tesouraria/);
    expect(h.aviso).toMatch(/Apenas sugestão/);
  });

  it("texto genérico de cobrança: 'Documento não identificado', sem categoria sugerida", () => {
    const h = montarHipotese(ent({ tx: { tipo: "saida", valor: 300, data: "2026-09-10", memo: "PAGTO ELETRON COBRANCA PAG COBRANCA NET EMPRESA" }, sugestao: sug({ generico: true, confianca: 35, banda: "nao_identificada" }) }));
    expect(h).toMatchObject({ tom: "documento", titulo: "Documento não identificado", nivel: "nao_identificada" });
    expect(h.sugestao).toBeUndefined();
    expect(h.aviso).toMatch(/Aguardando associação com um fornecedor ou com o documento/);
  });

  it("depósito em dinheiro sem correspondência: lembra que pode ser transferência", () => {
    const h = montarHipotese(ent({ tx: { tipo: "entrada", valor: 535, data: "2026-09-10", memo: "DEP DINHEIRO ATM AG00448" }, sugestao: sug({ banda: "revisar", confianca: 62, motivos: [] }) }));
    expect(h).toMatchObject({ tom: "deposito", titulo: "Depósito em dinheiro" });
    expect(h.aviso).toMatch(/transferência entre contas/);
  });

  it("nome curto da categoria", () => {
    expect(nomeCurtoDaCategoria("Ofertas para Missões")).toBe("Missões");
    expect(nomeCurtoDaCategoria("Dizimos")).toBe("Dízimo");
    expect(nomeCurtoDaCategoria("Energia Elétrica")).toBe("Energia Elétrica");
  });
});
