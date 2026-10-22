import { describe, expect, it } from "vitest";
import { VALIDADE_MS, descartarRascunho, guardarRascunho, lerRascunho, type RascunhoDaConciliacao } from "./rascunhoDaConciliacao";

const rascunho = (n = 3): RascunhoDaConciliacao => ({
  arquivo: new File(["x"], "extrato.ofx"), transacoes: Array.from({ length: n }, (_, i) => ({ fitid: `F${i}` })), filtro: "h2", pagina: 3, agrupar: true,
  marcadas: ["F1"], edicoes: {}, registros: [], confirmadas: [], lote: null, totalDoArquivo: n, aoAbrir: null, agrupamentosAoAbrir: null,
  decisoes: { reconhecidas: [], semDocumento: [], semJaRegistrado: [] },
});

describe("rascunho da conciliação", () => {
  it("devolve o que foi guardado, com os minutos desde então", () => {
    guardarRascunho("conta-1", rascunho(), 1_000_000);
    const r = lerRascunho("conta-1", 1_000_000 + 4 * 60_000);
    expect(r?.rascunho.pagina).toBe(3);
    expect(r?.rascunho.filtro).toBe("h2");
    expect(r?.minutos).toBe(4);
    descartarRascunho("conta-1");
  });
  it("vencido (passou a validade) é esquecido", () => {
    guardarRascunho("conta-2", rascunho(), 0);
    expect(lerRascunho("conta-2", VALIDADE_MS + 1)).toBeNull();
    expect(lerRascunho("conta-2", 1)).toBeNull();   // e não volta
  });
  it("uma conta não vê o rascunho de outra", () => {
    guardarRascunho("conta-3", rascunho(), 0);
    expect(lerRascunho("conta-4", 0)).toBeNull();
    descartarRascunho("conta-3");
  });
  it("um rascunho sem nada analisado não apaga um bom", () => {
    guardarRascunho("conta-5", rascunho(), 0);
    guardarRascunho("conta-5", rascunho(0), 10);
    expect(lerRascunho("conta-5", 20)?.rascunho.transacoes).toHaveLength(3);
    descartarRascunho("conta-5");
  });
  it("descartar apaga", () => {
    guardarRascunho("conta-6", rascunho(), 0);
    descartarRascunho("conta-6");
    expect(lerRascunho("conta-6", 0)).toBeNull();
  });
});
