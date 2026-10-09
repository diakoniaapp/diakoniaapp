// Conciliar o pagamento já REALIZADO (botão Pagar) com a linha do extrato: o lançamento passa a guardar o "OFX vinculado" e o dia em que o banco debitou.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = { id: string; status: string; observacoes: string | null; data_pagamento: string | null };
const tabela = new Map<string, Linha>();

function builder(op: "select" | "update", payload?: Partial<Linha>) {
  const filtros: ((l: Linha) => boolean)[] = [];
  const b: any = {
    eq: (c: string, v: unknown) => { filtros.push(l => (l as any)[c] === v); return b; },
    select: () => b,
    maybeSingle: async () => { const l = [...tabela.values()].find(x => filtros.every(f => f(x))); return { data: l ? { ...l } : null, error: null }; },
    then: (res: (r: unknown) => unknown) => {
      const alvo = [...tabela.values()].filter(x => filtros.every(f => f(x)));
      if (op === "update") for (const l of alvo) Object.assign(l, payload);
      return Promise.resolve({ data: alvo.map(l => ({ id: l.id })), error: null }).then(res);
    },
  };
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => builder("select"), update: (p: Partial<Linha>) => builder("update", p) }),
  },
}));

import { conciliarPagamentos } from "./importacaoOfxService";

const tx = (fitid: string, data: string) => ({ fitid, data, valor: 278.22, tipo: "saida", memo: "PAGTO ELETRON COBRANCA VERISURE" }) as never;

beforeEach(() => tabela.clear());

describe("conciliarPagamentos", () => {
  it("concilia e grava a marca do OFX e o dia em que o banco debitou (não o do clique em Pagar)", async () => {
    tabela.set("a", { id: "a", status: "realizado", observacoes: null, data_pagamento: "2026-10-04" });
    const r = await conciliarPagamentos([{ lancamentoId: "a", tx: tx("N11EAA", "2026-10-05") }]);
    expect(r).toEqual({ conciliados: ["a"], erros: [] });
    expect(tabela.get("a")).toMatchObject({ status: "conciliado", data_pagamento: "2026-10-05", observacoes: "[ofx:N11EAA]" });
  });

  it("preserva a observação que já existia", async () => {
    tabela.set("a", { id: "a", status: "realizado", observacoes: "pago pelo balcão", data_pagamento: null });
    await conciliarPagamentos([{ lancamentoId: "a", tx: tx("N1", "2026-10-05") }]);
    expect(tabela.get("a")!.observacoes).toBe("pago pelo balcão\n[ofx:N1]");
  });

  it("não duplica a marca se ela já estiver lá", async () => {
    tabela.set("a", { id: "a", status: "realizado", observacoes: "[ofx:N1]", data_pagamento: null });
    await conciliarPagamentos([{ lancamentoId: "a", tx: tx("N1", "2026-10-05") }]);
    expect(tabela.get("a")!.observacoes).toBe("[ofx:N1]");
  });

  it("recusa quem já não está 'realizado' (outra aba conciliou ou desfez) e não toca nele", async () => {
    tabela.set("a", { id: "a", status: "conciliado", observacoes: "[ofx:OUTRO]", data_pagamento: "2026-10-02" });
    const r = await conciliarPagamentos([{ lancamentoId: "a", tx: tx("N1", "2026-10-05") }]);
    expect(r.conciliados).toEqual([]);
    expect(r.erros[0]).toMatch(/já não está/);
    expect(tabela.get("a")).toMatchObject({ observacoes: "[ofx:OUTRO]", data_pagamento: "2026-10-02" });
  });

  it("um lote: concilia os que dá e relata os que não deu", async () => {
    tabela.set("a", { id: "a", status: "realizado", observacoes: null, data_pagamento: null });
    tabela.set("b", { id: "b", status: "previsto", observacoes: null, data_pagamento: null });
    const r = await conciliarPagamentos([{ lancamentoId: "a", tx: tx("N1", "2026-10-05") }, { lancamentoId: "b", tx: tx("N2", "2026-10-05") }]);
    expect(r.conciliados).toEqual(["a"]);
    expect(r.erros).toHaveLength(1);
  });
});
