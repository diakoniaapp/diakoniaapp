import { describe, expect, it } from "vitest";
import { contarComprovantes, decidir, diaUtilBancario, feriadosBancarios, pascoa, type LeituraDoAnexo, type PagamentoComComprovante } from "./correcaoDataPagamento";

const leitura = (o: Partial<NonNullable<LeituraDoAnexo["leitura"]>> = {}): NonNullable<LeituraDoAnexo["leitura"]> => ({
  data: "2026-10-08", hora: "20:01", valor: 298, banco: "Bradesco", tipo: "pix", confianca: "alta", e2e: null,
  candidatas: [{ data: o.data ?? "2026-10-08", hora: "20:01", rotulo: "data da operação", peso: 3, linha: 2 }], ...o,
});
const anexo = (o: Partial<LeituraDoAnexo> = {}, l = leitura()): LeituraDoAnexo => ({ anexoId: "a1", arquivo: "298,00.pdf", erro: null, quantidadeDeComprovantes: 1, leitura: l, ...o });
const pag = (o: Partial<PagamentoComComprovante> = {}): PagamentoComComprovante =>
  ({ lancamentoId: "l1", tipo: "saida", status: "realizado", dataPagamento: "2026-10-14", valor: 298, anexos: [anexo()], ...o });

describe("calendário bancário", () => {
  it("Páscoa", () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
  });
  it("feriados móveis e fixos de 2026", () => {
    const f = feriadosBancarios(2026);
    for (const d of ["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-20", "2026-04-23"]) expect(f.has(d)).toBe(true);
  });
  it("dia útil: os casos reais de 14/10/2026", () => {
    expect(diaUtilBancario("2026-09-05")).toBe(false);   // sábado — Pix lançado pelo banco em 08/09
    expect(diaUtilBancario("2026-09-07")).toBe(false);   // feriado — idem
    expect(diaUtilBancario("2026-10-08")).toBe(true);
    expect(diaUtilBancario("2026-10-09")).toBe(true);    // sexta
  });
});

describe("decidir — corrigir", () => {
  it("o caso típico: registrado em 14/10, comprovante de 08/10 (dia útil), valor e confiança batem", () => {
    expect(decidir(pag())).toMatchObject({ tipo: "corrigir", de: "2026-10-14", para: "2026-10-08" });
  });
  it("pagamento conciliado sem data_pagamento: preenche", () => {
    expect(decidir(pag({ status: "conciliado", dataPagamento: null }))).toMatchObject({ tipo: "corrigir", de: null, para: "2026-10-08" });
  });
  it("já igual ao comprovante: nada a fazer", () => {
    expect(decidir(pag({ dataPagamento: "2026-10-08" }))).toEqual({ tipo: "ja_certa", data: "2026-10-08" });
  });
});

describe("decidir — excluir (caso dúbio não altera)", () => {
  const motivos = (p: PagamentoComComprovante) => { const d = decidir(p); return d.tipo === "excluir" ? d.motivos.join(" | ") : `(não excluiu: ${d.tipo})`; };
  it("fim de semana / feriado", () => {
    expect(motivos(pag({ valor: 3000, anexos: [anexo({}, leitura({ data: "2026-09-05", valor: 3000 }))] }))).toMatch(/não é dia útil/);
    expect(motivos(pag({ valor: 1142, anexos: [anexo({}, leitura({ data: "2026-09-07", valor: 1142 }))] }))).toMatch(/não é dia útil/);
  });
  it("valor divergente (comprovante de outra despesa anexado)", () => {
    expect(motivos(pag({ valor: 1000, anexos: [anexo({}, leitura({ valor: 31.51 }))] }))).toMatch(/31\.51 ≠ valor pago 1000/);
  });
  it("confiança média ou baixa", () => {
    expect(motivos(pag({ anexos: [anexo({}, leitura({ confianca: "media" }))] }))).toMatch(/confiança da leitura media/);
  });
  it("PDF com mais de um comprovante", () => {
    expect(motivos(pag({ anexos: [anexo({ quantidadeDeComprovantes: 2 })] }))).toMatch(/mais de um comprovante/);
  });
  it("mais de uma data no comprovante", () => {
    const l = leitura(); l.candidatas = [...l.candidatas, { data: "2026-10-07", hora: null, rotulo: null, peso: 0, linha: 5 }];
    expect(motivos(pag({ anexos: [anexo({}, l)] }))).toMatch(/mais de uma data/);
  });
  it("dois comprovantes da mesma despesa com datas diferentes", () => {
    expect(motivos(pag({ anexos: [anexo(), anexo({ anexoId: "a2" }, leitura({ data: "2026-10-07" }))] }))).toMatch(/datas diferentes/);
  });
  it("não é pagamento feito", () => {
    expect(motivos(pag({ status: "previsto" }))).toMatch(/não é um pagamento feito/);
  });
});

describe("decidir — sem comprovante apropriado", () => {
  it("PDF escaneado (sem texto)", () => {
    expect(decidir(pag({ anexos: [anexo({ erro: "PDF sem texto (escaneado) — precisaria de OCR", leitura: null })] }))).toMatchObject({ tipo: "sem_comprovante" });
  });
});

describe("contarComprovantes", () => {
  it("um PDF do Bradesco com dois Pix", () => {
    expect(contarComprovantes("Comprovante de Transação Bancária\nPix\n...\nComprovante de Transação Bancária\nPix")).toBe(2);
    expect(contarComprovantes("Comprovante de Pix")).toBe(1);
  });
});
