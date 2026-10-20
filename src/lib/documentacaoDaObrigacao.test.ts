// Documentação da obrigação (20/10/2026): os anexos viram quatro blocos — obrigação, quitação, comprovantes e vínculos — e as ausências são só fatos.
import { describe, expect, it } from "vitest";
import { agruparDocumentacao } from "./documentacaoDaObrigacao";
import type { DetalhesDaDespesa } from "@/services/cicloDaDespesaService";

const anexo = (id: string, tipo: string, extra: Record<string, unknown> = {}) =>
  ({ id, lancamento_id: "raiz", tipo, url: `raiz/${id}.pdf`, nome: `${id}.pdf`, enviado_por: null, enviado_em: "2026-10-10T10:00:00Z", ...extra });
const detalhes = (o: Partial<DetalhesDaDespesa> = {}): DetalhesDaDespesa => ({
  ciclo: null, quitacao: null, anexos: [], parcelas: [{ id: "raiz", atual: true, raiz: true, data: "2026-10-10", valor: 100, status: "previsto" }], comprovanteAntigo: null, liquidacao: null, obrigacao: null,
  contrato: null, contaNome: "Bradesco", contaTipo: "banco", ofx: null, vinculos: [], conferidoPor: null, envio: null, reaberturas: [], contasAlteradas: [], edicoes: [], ...o,
} as unknown as DetalhesDaDespesa);
const quitacao = (o: Record<string, unknown> = {}) => ({ responsavel: "pessoa", responsavelNome: "Lucio Paulo Paz Barreto", intencao: "reembolso", saldoAReembolsar: 1500, ...o }) as unknown as DetalhesDaDespesa["quitacao"];

describe("agruparDocumentacao", () => {
  it("separa os anexos nos quatro blocos pelo tipo", () => {
    const g = agruparDocumentacao(detalhes({ anexos: [
      anexo("nf", "nota_fiscal"), anexo("bol", "boleto"), anexo("dar", "guia"), anexo("xml", "xml"), anexo("ctr", "contrato"),
      anexo("dec", "declaracao_terceiro"), anexo("ped", "pedido_reembolso"), anexo("pix", "comprovante"),
    ] as never }), "raiz");
    expect(g.documentos.map(x => x.tipo)).toEqual(["nota_fiscal", "boleto", "guia", "xml", "contrato"]);
    expect(g.quitacao.itens.map(i => i.tipo)).toEqual(["declaracao_terceiro", "pedido_reembolso"]);
    expect(g.comprovantes.itens.map(i => i.tipo)).toEqual(["comprovante"]);
    expect(g.total).toBe(8);
  });

  it("a ordem dos documentos é a da Tesouraria (NF, fatura, boleto, guia…), qualquer que seja a ordem de envio", () => {
    const g = agruparDocumentacao(detalhes({ anexos: [anexo("a", "contrato"), anexo("b", "boleto"), anexo("c", "fatura"), anexo("d", "nota_fiscal")] as never }), "raiz");
    expect(g.documentos.map(x => x.tipo)).toEqual(["nota_fiscal", "fatura", "boleto", "contrato"]);
  });

  it("vários do mesmo tipo ficam no mesmo grupo, e a guia traz a dica (DARF, FGTS…)", () => {
    const g = agruparDocumentacao(detalhes({ anexos: [anexo("g1", "guia"), anexo("g2", "guia")] as never }), "raiz");
    expect(g.documentos).toHaveLength(1);
    expect(g.documentos[0].itens).toHaveLength(2);
    expect(g.documentos[0].dica).toMatch(/DARF/);
  });

  it("o anexo de uma parcela diz de onde veio; o da própria linha, não", () => {
    const parcelas = [{ id: "raiz", atual: false, raiz: true, data: "2026-10-05", valor: 60, status: "realizado" }, { id: "p2", atual: true, raiz: false, data: "2026-10-20", valor: 40, status: "previsto" }];
    const g = agruparDocumentacao(detalhes({ parcelas, anexos: [anexo("boleto", "boleto", { lancamento_id: "raiz" }), anexo("comp", "comprovante", { lancamento_id: "p2" })] as never }), "p2");
    expect(g.documentos[0].itens[0].origem).toBe("da obrigação");
    expect(g.comprovantes.itens[0].origem).toBeNull();
  });

  it("quitada por terceiro: lista o que NÃO está anexado (fatos, sem julgar — a Política é quem exige) — e some quando está", () => {
    const sem = agruparDocumentacao(detalhes({ quitacao: quitacao(), anexos: [] as never }), "raiz");
    expect(sem.quitacao.existe).toBe(true);
    expect(sem.quitacao.ausencias.join(" ")).toMatch(/Pedido de Reembolso|Declaração do Terceiro/);
    expect(sem.quitacao.ausencias.join(" ")).toMatch(/Prova do pagamento/);
    expect(sem.quitacao.ausencias.join(" ")).toMatch(/Nota Fiscal/);
    const completa = agruparDocumentacao(detalhes({ quitacao: quitacao({ intencao: "oferta" }), anexos: [anexo("nf", "nota_fiscal"), anexo("d", "declaracao_terceiro"), anexo("p", "prova_pagamento_terceiro")] as never }), "raiz");
    expect(completa.quitacao.ausencias).toEqual([]);
  });

  it("obrigação sem quitação por terceiro não tem ausências de quitação (a igreja é quem paga)", () => {
    const g = agruparDocumentacao(detalhes({ anexos: [] as never }), "raiz");
    expect(g.quitacao).toMatchObject({ existe: false, resumo: null, ausencias: [] });
  });

  it("o resumo da quitação diz quem, a intenção e o saldo a reembolsar", () => {
    const g = agruparDocumentacao(detalhes({ quitacao: quitacao() }), "raiz");
    expect(g.quitacao.resumo).toContain("Lucio Paulo Paz Barreto");
    expect(g.quitacao.resumo).toContain("reembolso");
    expect(g.quitacao.resumo).toMatch(/1\.500,00/);
  });

  it("comprovante antigo (coluna comprovante_url) só aparece quando não há comprovante anexado; a forma de pagamento acompanha", () => {
    expect(agruparDocumentacao(detalhes({ comprovanteAntigo: "x/antigo.pdf" }), "raiz", "PIX").comprovantes).toMatchObject({ comprovanteAntigo: "x/antigo.pdf", forma: "PIX" });
    expect(agruparDocumentacao(detalhes({ comprovanteAntigo: "x/antigo.pdf", anexos: [anexo("c", "comprovante")] as never }), "raiz").comprovantes.comprovanteAntigo).toBeNull();
  });

  it("vínculos: OFX/PDF do banco, a liquidação e a conciliação; o vínculo desfeito fica como histórico", () => {
    const g = agruparDocumentacao(detalhes({
      ofx: "FIT123", liquidacao: { id: "l1", data_pagamento: "2026-10-12", valor_total: 176, ofx_fitid: "FIT123", created_at: "x" },
      vinculos: [{ fitid: "FIT123", origem: "ofx", vinculadoEm: "2026-10-13", ativo: true, desfeitoEm: null, desfeitoMotivo: null, daLinha: true }, { fitid: "OLD", origem: "pdf", vinculadoEm: "2026-09-01", ativo: false, desfeitoEm: "2026-09-02", desfeitoMotivo: "linha errada", daLinha: true }],
    } as never), "raiz");
    const rotulos = g.vinculos.map(v => v.rotulo);
    expect(rotulos).toContain("Extrato OFX");
    expect(rotulos).toContain("Liquidação");
    expect(rotulos).toContain("Conciliação");
    expect(g.vinculos.find(v => v.rotulo.startsWith("Vínculo anterior"))).toMatchObject({ tom: "historico" });
    expect(g.vinculos.find(v => v.rotulo === "Extrato OFX")!.texto).toContain("FIT123");
  });

  it("PDF bancário e conferência à mão aparecem como tais; sem nada, a lista é vazia", () => {
    const pdf = agruparDocumentacao(detalhes({ ofx: "PDF:abc" } as never), "raiz");
    expect(pdf.vinculos[0].rotulo).toBe("Extrato em PDF");
    const manual = agruparDocumentacao(detalhes({ ciclo: { conferencia: "manual", estado: "conciliada" } } as never), "raiz");
    expect(manual.vinculos.map(v => v.texto).join(" ")).toMatch(/à mão/);
    expect(agruparDocumentacao(detalhes(), "raiz").vinculos).toEqual([]);
  });
});
