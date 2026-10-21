// A última guarda contra duplicidade: `registrarLote` recusa a linha que o banco já tem sob OUTRO identificador, a menos que traga o motivo.
import { beforeEach, describe, expect, it, vi } from "vitest";

const inseridos: Record<string, unknown>[][] = [];
let existentes: Record<string, unknown>[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => { inseridos.push(rows); return { select: async () => ({ data: rows.map((_, i) => ({ id: `novo-${inseridos.length}-${i}` })), error: null }) }; },
    }),
  },
}));
vi.mock("@/services/finService", async () => ({
  ...(await vi.importActual<object>("@/services/finService")),
  listarLancamentosSemTeto: async () => existentes,
}));

import { registrarLote, type ParaRegistrar } from "./importacaoOfxService";

const tx = (fitid: string, valor = 278.22, data = "2026-10-05") => ({ fitid, tipo: "saida" as const, data, valor, memo: "PAGTO ELETRON COBRANCA VERISURE" });
const item = (fitid: string, extra: Partial<ParaRegistrar> = {}): ParaRegistrar => ({ tx: tx(fitid), categoriaId: "cat", ...extra });
// a recorrência da Verisure, já baixada em 08/10 com o identificador do OUTRO arquivo
const jaBaixada = { id: "rec-1", tipo: "saida", valor: 278.22, data: "2026-10-05", data_pagamento: "2026-10-05", observacoes: "[ofx:N11F17]", origem: "recorrencia", status: "conciliado", created_at: "2026-10-08T13:24:00Z", fornecedor_nome: "Verisure" };

beforeEach(() => { inseridos.length = 0; existentes = [jaBaixada]; });

describe("registrarLote — guarda final contra duplicidade", () => {
  it("recusa a linha que já existe sob outro identificador do banco e não grava nada dela", async () => {
    const r = await registrarLote("conta", [item("N105B3")], undefined, { fitidsDoArquivo: new Set(["N105B3"]) });
    expect(r.ids).toEqual([]);
    expect(r.recusadas).toEqual(["N105B3"]);
    expect(r.erros[0]).toContain("já parece registrado");
    expect(inseridos).toEqual([]);
  });

  it("com o motivo ('é outro pagamento') a linha é gravada, e o motivo fica no lançamento", async () => {
    const r = await registrarLote("conta", [item("N105B3", { motivoNovo: "Dois pagamentos iguais no mesmo dia" })], undefined, { fitidsDoArquivo: new Set(["N105B3"]) });
    expect(r.ids).toHaveLength(1);
    expect(r.recusadas).toEqual([]);
    expect(String(inseridos[0][0].observacoes)).toContain("[motivo-novo:Dois pagamentos iguais no mesmo dia]");
  });

  it("num lote misto, só as linhas com gêmeo são recusadas; as outras seguem", async () => {
    const r = await registrarLote("conta", [item("N105B3"), { tx: tx("N999", 40, "2026-10-06"), categoriaId: "cat" }], undefined, { fitidsDoArquivo: new Set(["N105B3", "N999"]) });
    expect(r.recusadas).toEqual(["N105B3"]);
    expect(r.ids).toHaveLength(1);
    expect(inseridos[0]).toHaveLength(1);
    expect(String(inseridos[0][0].observacoes)).toContain("[ofx:N999]");
  });

  it("um lançamento que carrega um identificador DESTE arquivo não é gêmeo de outra linha (dois PIX iguais no mesmo arquivo)", async () => {
    existentes = [{ ...jaBaixada, observacoes: "[ofx:N105B3]" }];
    const r = await registrarLote("conta", [item("N1059D")], undefined, { fitidsDoArquivo: new Set(["N105B3", "N1059D"]) });
    expect(r.recusadas).toEqual([]);
    expect(r.ids).toHaveLength(1);
  });

  it("sem a conferência pedida (nenhum arquivo informado) o comportamento antigo se mantém", async () => {
    const r = await registrarLote("conta", [item("N105B3")]);
    expect(r.ids).toHaveLength(1);
  });

  it("o motivo nunca fecha o colchete da marca nem quebra a linha", async () => {
    await registrarLote("conta", [item("N1", { motivoNovo: "x] [ofx:FALSO]\noutra" })]);
    const obs = String(inseridos[0][0].observacoes);
    expect(obs).not.toContain("[ofx:FALSO]");
    expect(obs.split("\n")).toHaveLength(1);
  });
});
