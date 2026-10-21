import { describe, expect, it } from "vitest";
import { aoMudarFim, aoMudarInicio } from "./intervaloDeDatas";

describe("aoMudarInicio — a regra dela (21/10/2026)", () => {
  it("o exemplo dela: 01/09–31/10, inicial vai para 15/09 → a final continua 31/10", () => {
    expect(aoMudarInicio("2026-09-15", "2026-10-31")).toEqual({ inicio: "2026-09-15", fim: "2026-10-31" });
  });
  it("a final só é ajustada quando ficaria menor que a inicial: final 10/09, nova inicial 15/09 → final 15/09", () => {
    expect(aoMudarInicio("2026-09-15", "2026-09-10")).toEqual({ inicio: "2026-09-15", fim: "2026-09-15" });
  });
  it("inicial igual à final é válida e não mexe em nada", () => {
    expect(aoMudarInicio("2026-09-15", "2026-09-15")).toEqual({ inicio: "2026-09-15", fim: "2026-09-15" });
  });
  it("campo apagado ou incompleto (digitando) nunca ajusta a outra data", () => {
    expect(aoMudarInicio("", "2026-10-31")).toEqual({ inicio: "", fim: "2026-10-31" });
    expect(aoMudarInicio("2026-09-1", "2026-10-31")).toEqual({ inicio: "2026-09-1", fim: "2026-10-31" });
    expect(aoMudarInicio("2026-09-15", "")).toEqual({ inicio: "2026-09-15", fim: "" });
  });
  it("atravessa mês e ano sem erro (comparação de AAAA-MM-DD)", () => {
    expect(aoMudarInicio("2027-01-02", "2026-12-31")).toEqual({ inicio: "2027-01-02", fim: "2027-01-02" });
    expect(aoMudarInicio("2026-12-31", "2027-01-02")).toEqual({ inicio: "2026-12-31", fim: "2027-01-02" });
  });
});

describe("aoMudarFim — a simetria", () => {
  it("mudar a final para depois da inicial não mexe na inicial", () => {
    expect(aoMudarFim("2026-09-01", "2026-10-31")).toEqual({ inicio: "2026-09-01", fim: "2026-10-31" });
  });
  it("final antes da inicial leva a inicial até a final: nunca fica um intervalo invertido", () => {
    expect(aoMudarFim("2026-09-15", "2026-09-10")).toEqual({ inicio: "2026-09-10", fim: "2026-09-10" });
  });
  it("campo apagado ou incompleto não ajusta a inicial", () => {
    expect(aoMudarFim("2026-09-15", "")).toEqual({ inicio: "2026-09-15", fim: "" });
    expect(aoMudarFim("", "2026-09-10")).toEqual({ inicio: "", fim: "2026-09-10" });
  });
});
