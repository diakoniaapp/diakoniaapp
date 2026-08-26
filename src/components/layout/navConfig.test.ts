// ─── Para onde cada papel entra ────────────────────────────────────────────
//
// Esta regra é difícil de conferir na tela: verificar o destino da secretária
// exigiria entrar como ela, e a senha é dela. O teste é o que substitui isso.
//
// O caso que mais importa é o último — "nunca manda ninguém para uma tela que
// a guarda recusa". Um destino barrado por `ROUTE_ROLES` produziria um vaivém
// logo depois do login: entra, é redirecionado, o portão devolve. Fácil de
// criar sem perceber, porque as duas listas vivem em lugares diferentes do
// mesmo arquivo e ninguém pensa nas duas ao mesmo tempo.

import { describe, it, expect } from "vitest";
import { rotaInicialPorPapel, ROUTE_ROLES } from "./navConfig";
import type { AppRole } from "@/hooks/useAuth";

describe("rotaInicialPorPapel", () => {
  it("secretária entra no painel dela", () => {
    expect(rotaInicialPorPapel(["secretaria"])).toBe("/painel-secretaria");
  });

  it("pastor titular entra no Painel Pastoral", () => {
    // `diakonia` é o perfil de pastor titular — ver a nota em useAuth.tsx.
    expect(rotaInicialPorPapel(["diakonia"])).toBe("/painel-pastoral");
    expect(rotaInicialPorPapel(["pastor"])).toBe("/painel-pastoral");
  });

  it("quem não tem bancada de trabalho cai na Home", () => {
    // Admin inclusive: administrar o sistema é uma capacidade, não uma
    // bancada. Quem só administra não tem uma fila de trabalho própria.
    for (const papel of ["admin", "lideranca", "voluntario"] as AppRole[]) {
      expect(rotaInicialPorPapel([papel])).toBe("/");
    }
  });

  it("sem papel nenhum cai na Home, e não em tela nenhuma", () => {
    // `[]` acontece de verdade: usuário sem linha em `user_roles`. Devolver
    // vazio ou `undefined` aqui deixaria o `navigate` sem destino.
    expect(rotaInicialPorPapel([])).toBe("/");
  });

  it("quem acumula admin e secretaria entra como secretaria", () => {
    // Admin é o que a pessoa PODE; secretaria é o que ela FAZ. Quem tem os
    // dois está sentando na bancada, não auditando o sistema.
    expect(rotaInicialPorPapel(["admin", "secretaria"])).toBe("/painel-secretaria");
    expect(rotaInicialPorPapel(["secretaria", "admin"])).toBe("/painel-secretaria");
  });

  it("nunca manda ninguém para uma tela que a guarda de rota recusa", () => {
    const papeis: AppRole[] = [
      "admin", "secretaria", "pastor", "diakonia", "lideranca", "voluntario",
    ];
    for (const papel of papeis) {
      const destino = rotaInicialPorPapel([papel]);
      const exigido = ROUTE_ROLES[destino];
      if (!exigido) continue;          // rota sem guarda: qualquer um entra
      expect(
        exigido.includes(papel),
        `${papel} seria mandado para ${destino}, que exige ${exigido.join(", ")}`,
      ).toBe(true);
    }
  });
});
