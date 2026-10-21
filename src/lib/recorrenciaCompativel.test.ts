import { describe, expect, it } from "vitest";
import { acharRecorrenciaCompativel, type LinhaDaRecorrencia, type RecorrenciaDoCadastro } from "./recorrenciaCompativel";

const light: RecorrenciaDoCadastro = {
  id: "r-light", descricao: "Conta de luz — Templo", tipo: "saida", valor: 3583.22, valor_variavel: true, fornecedor_id: "f-light",
  frequencia: "mensal", dia_vencimento: 15, data_inicio: "2026-01-15", data_fim: "2099-12-31", ativo: true,
};
const verisure: RecorrenciaDoCadastro = {
  id: "r-ver", descricao: "Verisure — Templo", tipo: "saida", valor: 278.22, valor_variavel: false, fornecedor_id: "f-ver",
  frequencia: "mensal", dia_vencimento: 5, data_inicio: "2026-01-05", data_fim: null, ativo: true,
};
const pagamento = (valor: number, data: string) => ({ valor, data, tipo: "saida" });

describe("H2 — recorrência compatível sem conta gerada para o mês", () => {
  it("contrato de valor fixo: mesmo favorecido e valor, ocorrência do mês sem linha → propõe gerar", () => {
    const r = acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "f-ver", [verisure], []);
    expect(r).toMatchObject({ recorrenciaId: "r-ver", vencimento: "2026-10-05", valorVariavel: false, diferenca: 0 });
    expect(r!.motivo).toContain("05/10");
  });

  it("a ocorrência do mês JÁ tem linha (aberta, paga ou cancelada): não é H2 — é H1/H0", () => {
    const ocupantes: LinhaDaRecorrencia[] = [{ recorrencia_id: "r-ver", data: "2026-10-05", competencia: "2026-10-01" }];
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "f-ver", [verisure], ocupantes)).toBeNull();
  });

  it("a linha do mês paga em outro dia (data andou, competência não) também ocupa a ocorrência", () => {
    const ocupantes: LinhaDaRecorrencia[] = [{ recorrencia_id: "r-ver", data: "2026-10-02", competencia: "2026-10-01" }];
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-02"), "f-ver", [verisure], ocupantes)).toBeNull();
  });

  it("valor diferente num contrato de valor fixo não é compatível", () => {
    expect(acharRecorrenciaCompativel(pagamento(291.31, "2026-10-05"), "f-ver", [verisure], [])).toBeNull();
  });

  it("contrato de valor variável aceita de 50% a 150% do habitual, e diz a diferença", () => {
    const r = acharRecorrenciaCompativel(pagamento(3000, "2026-10-15"), "f-light", [light], []);
    expect(r).toMatchObject({ recorrenciaId: "r-light", valorVariavel: true, diferenca: -583.22 });
    expect(acharRecorrenciaCompativel(pagamento(9000, "2026-10-15"), "f-light", [light], [])).toBeNull();
  });

  it("outro favorecido, entrada, parcelamento ou contrato inativo nunca são compatíveis", () => {
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "outro", [verisure], [])).toBeNull();
    expect(acharRecorrenciaCompativel({ valor: 278.22, data: "2026-10-05", tipo: "entrada" }, "f-ver", [verisure], [])).toBeNull();
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "f-ver", [{ ...verisure, tipo_recorrencia: "parcelamento", total_parcelas: 12 }], [])).toBeNull();
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "f-ver", [{ ...verisure, ativo: false }], [])).toBeNull();
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), undefined, [verisure], [])).toBeNull();
  });

  it("o vencimento precisa estar perto do pagamento: de 45 dias depois a 10 dias antes", () => {
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-20"), "f-ver", [verisure], [{ recorrencia_id: "r-ver", data: "2026-10-05", competencia: "2026-10-01" }])).toBeNull();   // a de 05/11 está a 16 dias à frente: longe demais
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-26"), "f-ver", [verisure], [{ recorrencia_id: "r-ver", data: "2026-10-05", competencia: "2026-10-01" }])?.vencimento).toBe("2026-11-05");   // 10 dias antes da de novembro
  });

  it("paga com atraso: propõe a ocorrência vencida (a mais próxima)", () => {
    const r = acharRecorrenciaCompativel(pagamento(278.22, "2026-10-20"), "f-ver", [verisure], []);
    expect(r?.vencimento).toBe("2026-10-05");
    expect(r?.motivo).toContain("15 dias depois do vencimento");
  });

  it("cada ocorrência serve a um pagamento só", () => {
    const usadas = new Set(["r-ver|2026-10-05"]);
    expect(acharRecorrenciaCompativel(pagamento(278.22, "2026-10-05"), "f-ver", [verisure], [], usadas)?.vencimento).not.toBe("2026-10-05");
  });

  it("dois contratos do mesmo favorecido: o de valor igual vence o de valor variável", () => {
    const v2: RecorrenciaDoCadastro = { ...verisure, id: "r-ver2", descricao: "Verisure — Anexo", valor: 291.31 };
    expect(acharRecorrenciaCompativel(pagamento(291.31, "2026-10-05"), "f-ver", [verisure, v2], [])?.recorrenciaId).toBe("r-ver2");
  });
});
