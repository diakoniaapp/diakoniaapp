import { describe, expect, it } from "vitest";
import { centroESubcentro } from "./centroSubcentro";

describe("centroESubcentro", () => {
  it("parte 'Pai · Filho'", () => {
    expect(centroESubcentro("Administração · Pessoal")).toEqual({ centro: "Administração", subcentro: "Pessoal" });
  });
  it("centro sem subcentro", () => {
    expect(centroESubcentro("Administração")).toEqual({ centro: "Administração", subcentro: null });
  });
  it("vazio", () => {
    expect(centroESubcentro(null)).toBeNull();
    expect(centroESubcentro("")).toBeNull();
  });
});
