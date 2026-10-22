import { describe, expect, it } from "vitest";
import { esquecerRolagemAPartir, gravarRolagem, podeRestaurar, rolagemGuardada } from "./rolagemRestaurada";

function armazem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
}

describe("rolagem restaurada", () => {
  it("devolve o que foi guardado para o mesmo índice, contêiner e caminho", () => {
    const a = armazem();
    gravarRolagem(3, "pagina", "/financas/conta/1", 840, a);
    expect(rolagemGuardada(3, "pagina", "/financas/conta/1", a)).toBe(840);
  });
  it("contêineres diferentes na mesma entrada não se misturam", () => {
    const a = armazem();
    gravarRolagem(3, "pagina", "/x", 100, a);
    gravarRolagem(3, "extrato", "/x", 600, a);
    expect(rolagemGuardada(3, "pagina", "/x", a)).toBe(100);
    expect(rolagemGuardada(3, "extrato", "/x", a)).toBe(600);
  });
  it("outra tela no mesmo índice (replace para outra rota) não herda a posição", () => {
    const a = armazem();
    gravarRolagem(2, "pagina", "/membros", 500, a);
    expect(rolagemGuardada(2, "pagina", "/financas", a)).toBe(0);
  });
  it("voltar ao topo (0) apaga o que havia", () => {
    const a = armazem();
    gravarRolagem(1, "pagina", "/x", 300, a);
    gravarRolagem(1, "pagina", "/x", 0, a);
    expect(rolagemGuardada(1, "pagina", "/x", a)).toBe(0);
  });
  it("entrar numa tela nova esquece o índice dela e os seguintes, mas não os anteriores", () => {
    const a = armazem();
    gravarRolagem(1, "pagina", "/a", 10, a);
    gravarRolagem(2, "pagina", "/b", 20, a);
    gravarRolagem(3, "pagina", "/c", 30, a);
    esquecerRolagemAPartir(2, a);
    expect(rolagemGuardada(1, "pagina", "/a", a)).toBe(10);
    expect(rolagemGuardada(2, "pagina", "/b", a)).toBe(0);
    expect(rolagemGuardada(3, "pagina", "/c", a)).toBe(0);
  });
  it("sem armazenamento (aba privada) não quebra", () => {
    expect(() => gravarRolagem(1, "pagina", "/x", 5, null)).not.toThrow();
    expect(rolagemGuardada(1, "pagina", "/x", null)).toBe(0);
  });
  it("espera a lista crescer; passado o prazo, aceita o que der", () => {
    expect(podeRestaurar(800, 300, 100)).toBe(false);   // ainda esqueleto
    expect(podeRestaurar(800, 900, 100)).toBe(true);    // a lista cresceu
    expect(podeRestaurar(800, 300, 4000)).toBe(true);   // a lista encolheu: rola até onde dá
  });
});
