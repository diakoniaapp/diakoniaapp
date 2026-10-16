// A folha útil que o medidor de paginação usa precisa ser a mesma do @page da Prestação de Contas (margens 1,5 × 1,8 cm em retrato; 1,3 × 1,8 cm em paisagem).
import { describe, expect, it } from "vitest";
import { areaUtilDaFolha, FOLGA_DE_SEGURANCA_MM, medirFolgaDoFecho } from "./fechoNoRodape";

describe("area útil da folha A4", () => {
  it("retrato: 210 × 297 mm menos as margens do @page", () => {
    expect(areaUtilDaFolha(true)).toEqual({ larguraMm: 174, alturaMm: 267 });
  });
  it("paisagem: 297 × 210 mm menos as margens do @page", () => {
    expect(areaUtilDaFolha(false)).toEqual({ larguraMm: 261, alturaMm: 184 });
  });
  it("sempre sobra uma folga de segurança, para o bloco nunca criar uma folha só de assinaturas", () => {
    expect(FOLGA_DE_SEGURANCA_MM).toBeGreaterThanOrEqual(3);
  });
});

describe("medirFolgaDoFecho sem navegador de verdade", () => {
  it("sem layout (jsdom) devolve null em vez de inventar uma folga — a impressão segue como sempre", async () => {
    const pagina = document.createElement("div");
    pagina.innerHTML = '<div class="fecho-relatorio">assinaturas</div>';
    document.body.appendChild(pagina);
    expect(await medirFolgaDoFecho(pagina, ".fecho-relatorio", true)).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();   // o iframe de medição não fica para trás
    pagina.remove();
  });
});
