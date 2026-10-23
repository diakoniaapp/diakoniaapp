import { describe, expect, it } from "vitest";
import { chipsDeDocumentacao, pendenciasDaAuditoria } from "./documentacaoDaMesa";

const r = (parciais: number, sem: number, administrativas = 0) => ({ parciais, sem, administrativas });
const setembro = (x: ReturnType<typeof r>) => ({ rotulo: "Setembro/2026", resumo: x });

describe("pendências como a Auditoria conta", () => {
  it("parciais + sem documentação + ajustes administrativos (setembro: 19 + 3 + 2 = 24, não 22)", () => {
    expect(pendenciasDaAuditoria(r(19, 3, 2))).toBe(24);
  });
});

describe("um chip por mês na Mesa", () => {
  it("dentro da janela (dias 1–20): o mês anterior primeiro, depois o corrente, cada um levando à Auditoria do SEU mês", () => {
    const c = chipsDeDocumentacao("2026-10-05", setembro(r(19, 3, 2)), r(10, 3));
    expect(c.map(x => [x.texto, x.detalhe, x.para])).toEqual([
      ["Documentos de Setembro/2026", "24 pendências", "/financas/auditoria-anexos?mes=2026-09"],
      ["Documentos de Outubro/2026", "13 pendências", "/financas/auditoria-anexos?mes=2026-10"],
    ]);
  });
  it("fora da janela (dia 23): só o corrente — hoje, 13 pendências de outubro", () => {
    const c = chipsDeDocumentacao("2026-10-23", null, r(10, 3));
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ rotulo: "Outubro/2026", mes: "2026-10", pendencias: 13, para: "/financas/auditoria-anexos?mes=2026-10" });
  });
  it("mesmo que o mês anterior ainda venha carregado, passado o dia 20 ele não vira chip", () => {
    expect(chipsDeDocumentacao("2026-10-21", setembro(r(5, 1)), r(0, 0))).toEqual([]);
  });
  it("mês sem pendência não vira chip", () => {
    const c = chipsDeDocumentacao("2026-10-05", setembro(r(0, 0, 0)), r(2, 0));
    expect(c.map(x => x.rotulo)).toEqual(["Outubro/2026"]);
  });
  it("em janeiro o mês anterior é dezembro do ano passado (o ?mes= acompanha)", () => {
    const c = chipsDeDocumentacao("2027-01-10", { rotulo: "Dezembro/2026", resumo: r(1, 0) }, r(0, 0));
    expect(c[0]).toMatchObject({ mes: "2026-12", para: "/financas/auditoria-anexos?mes=2026-12", detalhe: "1 pendência" });
  });
  it("sem dados (carregou com erro): nenhum chip", () => {
    expect(chipsDeDocumentacao("2026-10-05", null, null)).toEqual([]);
  });
});
