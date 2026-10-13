// D4 (13/10/2026): marcar à mão é CONFERIR — guarda quem e quando quando as colunas existem (migration 20261013120000) e continua funcionando sem elas.
import { beforeEach, describe, expect, it, vi } from "vitest";

let colunasExistem = true;
const atualizacoes: { patch: Record<string, unknown>; ids: unknown }[] = [];

vi.mock("@/integrations/supabase/client", () => {
  const consulta = (alvo: { patch?: Record<string, unknown> }) => {
    const b: any = {
      select: () => b, limit: () => b,
      update: (patch: Record<string, unknown>) => { alvo.patch = patch; return b; },
      eq: (_c: string, id: unknown) => { atualizacoes.push({ patch: alvo.patch ?? {}, ids: id }); return b; },
      in: (_c: string, ids: unknown) => { atualizacoes.push({ patch: alvo.patch ?? {}, ids }); return b; },
      maybeSingle: async () => ({ data: { id: "x" }, error: null }),
      then: (res: (r: unknown) => unknown) => {
        // a sondagem das colunas é o único select sem update; o update devolve a linha tocada (o "conferir()" do app exige ≥ 1)
        const r = alvo.patch ? { data: [{ id: "x" }], error: null } : (colunasExistem ? { data: [], error: null } : { data: null, error: { message: "column conferido_em does not exist" } });
        return Promise.resolve(r).then(res);
      },
    };
    return b;
  };
  return { supabase: { from: () => consulta({}), auth: { getUser: async () => ({ data: { user: { id: "u-telma" } } }) } } };
});

async function carregar() {
  vi.resetModules();   // a sondagem das colunas é guardada no módulo
  return import("./finService");
}

describe("conferir à mão guarda quem e quando", () => {
  beforeEach(() => { atualizacoes.length = 0; colunasExistem = true; });

  it("com as colunas: marcar grava o status E o carimbo; desmarcar limpa o carimbo", async () => {
    const s = await carregar();
    await s.conciliarLancamento("L1");
    expect(atualizacoes.at(-1)!.patch).toMatchObject({ status: "conciliado", conferido_por: "u-telma" });
    expect(typeof atualizacoes.at(-1)!.patch.conferido_em).toBe("string");
    await s.desconciliarLancamento("L1");
    expect(atualizacoes.at(-1)!.patch).toEqual(expect.objectContaining({ status: "realizado", conferido_em: null, conferido_por: null, conferencia_nota: null }));
  });

  it("em lote: o carimbo vale para todos", async () => {
    const s = await carregar();
    await s.conciliarEmLote(["A", "B"]);
    expect(atualizacoes.at(-1)).toMatchObject({ ids: ["A", "B"], patch: { status: "conciliado", conferido_por: "u-telma" } });
  });

  it("SEM as colunas (migration ainda não aplicada) grava só o status, como sempre", async () => {
    colunasExistem = false;
    const s = await carregar();
    const semCarimbo = (p: Record<string, unknown>) => Object.keys(p).every(k => !k.startsWith("conferen") && k !== "conferido_em" && k !== "conferido_por");
    await s.conciliarLancamento("L1");
    expect(atualizacoes.at(-1)!.patch).toMatchObject({ status: "conciliado" });
    expect(semCarimbo(atualizacoes.at(-1)!.patch)).toBe(true);
    await s.conciliarEmLote(["A"]);
    expect(atualizacoes.at(-1)!.patch).toEqual({ status: "conciliado" });
    await s.desconciliarLancamento("L1");
    expect(atualizacoes.at(-1)!.patch).toMatchObject({ status: "realizado" });
    expect(semCarimbo(atualizacoes.at(-1)!.patch)).toBe(true);
  });
});
