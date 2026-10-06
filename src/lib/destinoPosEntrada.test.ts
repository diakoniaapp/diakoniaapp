import { describe, expect, it } from "vitest";
import { destinoDeOndeEstava, destinoDoEstado, destinoSeguro, estadoDeDesvio } from "./destinoPosEntrada";

describe("destinoSeguro", () => {
  it("aceita caminho interno com query e hash", () => {
    expect(destinoSeguro("/financas/conta/abc?periodo=personalizado&de=2026-06-28")).toBe("/financas/conta/abc?periodo=personalizado&de=2026-06-28");
    expect(destinoSeguro("/painel-tesouraria#cadastros")).toBe("/painel-tesouraria#cadastros");
  });
  it("recusa outro site, protocolo, barra dupla, contrabarra e controle", () => {
    for (const x of ["https://evil.com", "//evil.com", "javascript:alert(1)", "/\\evil.com", "/a\nb", "evil", "", null, undefined, 42]) {
      expect(destinoSeguro(x)).toBeNull();
    }
  });
  it("não volta para as próprias telas de entrada", () => {
    for (const x of ["/auth", "/aceite-lgpd", "/primeiro-acesso", "/esqueci-senha", "/convite/token123", "/auth?x=1"]) {
      expect(destinoSeguro(x)).toBeNull();
    }
    expect(destinoSeguro("/authors")).toBe("/authors");
  });
});

describe("destinoDeOndeEstava / estadoDeDesvio", () => {
  it("o extrato aberto numa aba nova lembra a conta e os filtros", () => {
    const loc = { pathname: "/financas/conta/9c67", search: "?periodo=personalizado&de=2026-06-28&ate=2026-07-03&categoria=x", hash: "" };
    expect(destinoDeOndeEstava(loc)).toBe("/financas/conta/9c67?periodo=personalizado&de=2026-06-28&ate=2026-07-03&categoria=x");
    expect(estadoDeDesvio(loc)).toEqual({ de: "/financas/conta/9c67?periodo=personalizado&de=2026-06-28&ate=2026-07-03&categoria=x" });
  });
  it("a Home não precisa ser lembrada", () => {
    expect(destinoDeOndeEstava({ pathname: "/" })).toBeNull();
    expect(estadoDeDesvio({ pathname: "/" })).toBeUndefined();
  });
  it("lê o estado de volta, com tolerância a lixo", () => {
    expect(destinoDoEstado({ de: "/agenda" })).toBe("/agenda");
    expect(destinoDoEstado(null)).toBeNull();
    expect(destinoDoEstado({ de: "https://x.com" })).toBeNull();
    expect(destinoDoEstado("texto")).toBeNull();
  });
});
