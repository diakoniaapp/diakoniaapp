import { describe, expect, it } from "vitest";
import { resumirHabitos, type PagamentoDoHistorico } from "./habitosDoFavorecido";

const pg = (dia: string, valor: number, o: Partial<PagamentoDoHistorico> = {}): PagamentoDoHistorico =>
  ({ dia, valor, categoriaId: "rpa", centroId: "adm-serv", formaPagamento: "pix", tiposDeDocumento: ["rpa", "comprovante"], ...o });

describe("resumirHabitos", () => {
  it("sem histórico: nada a mostrar", () => {
    expect(resumirHabitos([])).toBeNull();
  });

  it("o exemplo dela: Carlos Eduardo — último pagamento 05/09, R$ 380, categoria e centro habituais", () => {
    const h = resumirHabitos([pg("2026-07-05", 380), pg("2026-08-05", 380), pg("2026-09-05", 380)])!;
    expect(h).toMatchObject({ pagamentos: 3, ultimoDia: "2026-09-05", ultimoValor: 380, categoriaId: "rpa", centroId: "adm-serv", formaPagamento: "pix" });
  });

  it("o último é o mais recente, mesmo que a lista venha fora de ordem", () => {
    const h = resumirHabitos([pg("2026-08-05", 100), pg("2026-09-05", 250), pg("2026-07-05", 90)])!;
    expect(h.ultimoDia).toBe("2026-09-05");
    expect(h.ultimoValor).toBe(250);
  });

  it("o habitual é o mais frequente; no empate, o mais recente", () => {
    const h = resumirHabitos([
      pg("2026-09-05", 1, { categoriaId: "b" }), pg("2026-08-05", 1, { categoriaId: "a" }),
      pg("2026-07-05", 1, { categoriaId: "a" }), pg("2026-06-05", 1, { categoriaId: "b" }),
    ])!;
    expect(h.categoriaId).toBe("b"); // 2 × 2, e "b" é o mais recente
    const h2 = resumirHabitos([
      pg("2026-09-05", 1, { categoriaId: "b" }), pg("2026-08-05", 1, { categoriaId: "a" }), pg("2026-07-05", 1, { categoriaId: "a" }),
    ])!;
    expect(h2.categoriaId).toBe("a"); // 2 × 1
  });

  it("ignora vazios ao decidir o habitual", () => {
    const h = resumirHabitos([pg("2026-09-05", 1, { centroId: null }), pg("2026-08-05", 1, { centroId: "x" })])!;
    expect(h.centroId).toBe("x");
  });

  it("sugere os tipos de documento mais comuns nos últimos pagamentos", () => {
    const h = resumirHabitos([
      pg("2026-09-05", 380, { tiposDeDocumento: ["rpa", "comprovante"] }),
      pg("2026-08-05", 380, { tiposDeDocumento: ["rpa", "comprovante", "comprovante"] }),
      pg("2026-07-05", 380, { tiposDeDocumento: ["comprovante"] }),
    ])!;
    expect(h.documentos).toEqual([{ tipo: "comprovante", vezes: 3 }, { tipo: "rpa", vezes: 2 }]); // dois comprovantes no mesmo pagamento contam uma vez
  });

  it("só os 6 pagamentos mais recentes entram na conta dos documentos", () => {
    const antigos = Array.from({ length: 6 }, (_, i) => pg(`2025-0${i + 1}-05`, 1, { tiposDeDocumento: ["nf"] }));
    const novos = Array.from({ length: 6 }, (_, i) => pg(`2026-0${i + 1}-05`, 1, { tiposDeDocumento: ["rpa"] }));
    expect(resumirHabitos([...antigos, ...novos])!.documentos).toEqual([{ tipo: "rpa", vezes: 6 }]);
  });
});
