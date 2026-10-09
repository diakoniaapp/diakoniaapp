import { describe, expect, it } from "vitest";
import { podeMostrarFechamentos } from "./LinhaDeFechamentoDoDia";

const LIVRE = { periodoPreset: "mes", filtroTipo: "todos", busca: "", categoriaId: "", centroCustoId: "", fornecedorId: "", valorMin: null, valorMax: null };

describe("podeMostrarFechamentos — a linha SALDO DO DIA só aparece quando o acumulado é o saldo real da conta", () => {
  it("lista completa de um período contínuo: mostra", () => { expect(podeMostrarFechamentos(LIVRE)).toBe(true); });
  it("'Atrasados' não é período contínuo: esconde", () => { expect(podeMostrarFechamentos({ ...LIVRE, periodoPreset: "atrasados" })).toBe(false); });
  it("qualquer filtro de conteúdo faz o acumulado ser parcial: esconde", () => {
    for (const f of [{ filtroTipo: "saida" }, { busca: "pix" }, { categoriaId: "c" }, { centroCustoId: "x" }, { fornecedorId: "f" }, { valorMin: 10 }, { valorMax: 500 }, { dataEspecifica: "2026-09-18" }]) {
      expect(podeMostrarFechamentos({ ...LIVRE, ...f }), JSON.stringify(f)).toBe(false);
    }
  });
  it("busca de 1 letra ainda não filtra (a tela só busca com 2+): mostra", () => { expect(podeMostrarFechamentos({ ...LIVRE, busca: "p" })).toBe(true); });
});
