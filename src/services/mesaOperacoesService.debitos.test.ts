// Regressão (20/10/2026): "Débitos automáticos" da Mesa lia "tudo que não é manual", o que arrastava o BOLETO/FATURA (373 linhas) e os pintava de "possível falha no débito".
// Só as formas que o BANCO executa entram: débito automático, PIX recorrente, transferência programada.
import { describe, expect, it, vi } from "vitest";

const passos: [string, unknown[]][] = [];
vi.mock("@/integrations/supabase/client", () => {
  const proxy: any = new Proxy({}, {
    get: (_t, nome: string) => {
      if (nome === "then") return (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return (...args: unknown[]) => { passos.push([nome, args]); return proxy; };
    },
  });
  return { supabase: { from: () => proxy } };
});
vi.mock("@/services/finService", async importOriginal => ({ ...(await importOriginal<object>()), enriquecerLancamentos: async (l: unknown[]) => l }));

import { debitosDoMes } from "./mesaOperacoesService";

describe("debitosDoMes", () => {
  it("pede só as formas automáticas — nunca 'tudo que não é manual'", async () => {
    passos.length = 0;
    await debitosDoMes("2026-10-01", "2026-10-31");
    const filtroDeForma = passos.find(p => p[0] === "in" && p[1][0] === "forma_liquidacao");
    expect(filtroDeForma, "deveria filtrar por forma_liquidacao com in()").toBeTruthy();
    expect([...(filtroDeForma![1][1] as string[])].sort()).toEqual(["debito_automatico", "pix_recorrente", "transferencia_programada"]);
    expect(passos.some(p => p[0] === "neq" && p[1][0] === "forma_liquidacao")).toBe(false);
  });
});
