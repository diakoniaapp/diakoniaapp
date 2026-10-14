import { beforeEach, describe, expect, it, vi } from "vitest";

const urgentes = vi.fn(async () => ({ lista: [1, 2, 3] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/services/agendaPastoralService", () => ({ familiasSemResponsavel: vi.fn(), pessoasSemFamiliaSugerida: vi.fn(), proximosDias: vi.fn() }));
vi.mock("@/services/efemerideFeita", () => ({ felicitacoesDeHoje: vi.fn(), chaveDaEfemeride: vi.fn() }));
vi.mock("@/services/assuntosService", () => ({ buscarUrgentesIgreja: () => urgentes() }));
vi.mock("@/services/fiscalService", () => ({ carregarResumoFiscal: vi.fn() }));

import { contarPendenciasP0, esquecerPendenciasP0 } from "./pendenciasP0";

describe("o contador de pendências P0 não refaz as consultas a cada chamada", () => {
  beforeEach(() => { esquecerPendenciasP0(); urgentes.mockClear(); });

  it("duas chamadas seguidas (sidebar + gaveta) consultam uma vez só", async () => {
    const [a, b] = await Promise.all([contarPendenciasP0("secretaria"), contarPendenciasP0("secretaria")]);
    expect(a).toBe(3); expect(b).toBe(3);
    await contarPendenciasP0("secretaria");
    expect(urgentes).toHaveBeenCalledTimes(1);
  });

  it("trocar de usuário esquece o que estava guardado", async () => {
    await contarPendenciasP0("secretaria");
    esquecerPendenciasP0();
    await contarPendenciasP0("secretaria");
    expect(urgentes).toHaveBeenCalledTimes(2);
  });

  it("passada a validade, consulta de novo", async () => {
    vi.useFakeTimers();
    try {
      await contarPendenciasP0("secretaria");
      vi.advanceTimersByTime(3 * 60_000 + 1);
      await contarPendenciasP0("secretaria");
      expect(urgentes).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
