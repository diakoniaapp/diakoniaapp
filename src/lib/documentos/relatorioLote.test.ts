import { describe, expect, it, vi } from "vitest";

// `relatorioLote` usa `csvPtBr`/`dataBr` de `lib/pacoteContabil`, que importa o
// cliente do Supabase — aqui só se testa formatação, o cliente nunca é chamado.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {}, supabaseRel: {} }));

import { csvDoLote } from "./relatorioLote";
import type { ItemCentral } from "./fluxo";
import type { LancamentoPool, ResultadoCasamento } from "./casamento";

const lanc = (id: string, valor: number, dia = "2026-08-13"): LancamentoPool => ({
  id, dia, valor, fornecedorNome: "Mercado Exemplo LTDA", fornecedorCnpj: null, contaNome: "Caixinha", contaTipo: "caixa", status: "conciliado", temAnexo: false,
});
const res = (banda: ResultadoCasamento["banda"], l: LancamentoPool, extra: Partial<ResultadoCasamento> = {}): ResultadoCasamento =>
  ({ id: "x", banda, confianca: 97, candidatos: [{ lancamento: l, confianca: 97, motivos: ["CNPJ confere", "valor igual", "data igual"] }], resumo: "", ...extra });
const item = (p: Partial<ItemCentral>): ItemCentral =>
  ({ id: "i", nome: "a.pdf", caminho: "AGO/a.pdf", bytes: 1, origem: "upload", etapa: "lido", tipo: "nota_fiscal", acao: "pendente", parcelasExcluidas: [], ...p });

describe("relatório do lote (CSV)", () => {
  it("uma linha por arquivo vinculado, com lançamento, data, fornecedor, valor, confiança e motivo", () => {
    const l = lanc("aaaaaaaa-1111", 52.74);
    const csv = csvDoLote([item({ resultado: res("pronto", l), acao: "confirmado", gravado: true })]);
    const linhas = csv.trim().split("\r\n");
    expect(linhas[0]).toContain("Arquivo");
    expect(linhas[0]).toContain("Motivo da correspondência");
    expect(linhas[1]).toContain('"AGO/a.pdf"');
    expect(linhas[1]).toContain('"Vinculação automática"');
    expect(linhas[1]).toContain('"aaaaaaaa"');
    expect(linhas[1]).toContain('"13/08/2026"');
    expect(linhas[1]).toContain('"52,74"');
    expect(linhas[1]).toContain('"97%"');
    expect(linhas[1]).toContain("CNPJ confere; valor igual; data igual");
    expect(linhas[1]).toContain('"Vinculado"');
  });

  it("compra parcelada: UMA LINHA POR PARCELA, todas com o mesmo arquivo", () => {
    const p = [lanc("p1", 10, "2026-04-10"), lanc("p2", 10, "2026-05-11"), lanc("p3", 10, "2026-06-10")];
    const r = res("pronto", p[0], { parcelamento: { n: 3, valorParcela: 10, total: 30, lancamentos: p, encontradas: 3, faltam: 0 }, resumo: "Compra parcelada em 3× de R$ 10,00" });
    const csv = csvDoLote([item({ resultado: r, acao: "confirmado" })]);
    expect(csv.trim().split("\r\n")).toHaveLength(1 + 3);
  });

  it("não identificado: lista o palpite e marca 'Pendente'; ignorado e erro aparecem como tal", () => {
    const l = lanc("zzzzzzzz", 99);
    const csv = csvDoLote([
      item({ id: "1", resultado: res("sem_destino", l) }),
      item({ id: "2", resultado: res("duplicata", l), acao: "ignorado" }),
      item({ id: "3", resultado: res("pronto", l), acao: "confirmado" }),
    ], new Map([["3", "Arquivo maior que 5 MB"]]));
    expect(csv).toContain('"Pendente"');
    expect(csv).toContain('"Ignorado"');
    expect(csv).toContain("ERRO: Arquivo maior que 5 MB");
  });

  it("arquivo que não foi lido aparece, com o motivo do erro", () => {
    const csv = csvDoLote([item({ etapa: "erro", erro: "PDF corrompido", resultado: undefined })]);
    expect(csv).toContain("PDF corrompido");
    expect(csv).toContain('"Não identificado"');
  });
});
