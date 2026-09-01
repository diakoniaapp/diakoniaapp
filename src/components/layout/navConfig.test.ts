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
import { rotaInicialPorPapel, ROUTE_ROLES, ATALHOS_TOPO, ROLES_PAINEL_PASTORAL } from "./navConfig";
import type { AppRole } from "@/hooks/useAuth";

describe("a secretaria não vê o Painel Pastoral", () => {
  // A regra vive em TRÊS lugares — o atalho do topo, a guarda de rota e a
  // paleta Ctrl+K. Esconder só o item do menu esconderia um dos caminhos e
  // deixaria os outros abertos: a URL direta, o redirecionamento de
  // /ebd/acompanhamento e a busca.
  it("some do atalho do topo", () => {
    const atalho = ATALHOS_TOPO.find(a => a.to === "/painel-pastoral");
    expect(atalho?.allowedRoles).toBeDefined();
    expect(atalho!.allowedRoles).not.toContain("secretaria");
  });

  it("a guarda de rota também recusa", () => {
    expect(ROUTE_ROLES["/painel-pastoral"]).toBeDefined();
    expect(ROUTE_ROLES["/painel-pastoral"]).not.toContain("secretaria");
  });

  it("continua aberto a quem cuida — e o pastor titular é `diakonia`", () => {
    // O erro fácil é achar que pastor titular é `pastor`. Não é: o CLAUDE.md
    // mede 62 combinações tabela+operação para `diakonia` contra 34 de
    // `pastor`, e este último nem enxerga famílias e visitas.
    expect(ROLES_PAINEL_PASTORAL).toContain("diakonia");
  });

  it("a administração entra por ser dona do sistema, não por ser pastoral", () => {
    // Pedido da igreja em 01/09/2026, com a separação dita em voz alta:
    // "ADMINISTRAÇÃO dono do sistema". Sem ela na lista o painel ficaria
    // invisível a todos — nenhuma conta tem `diakonia` hoje.
    expect(ROLES_PAINEL_PASTORAL).toContain("admin");
  });

  it("saíram a liderança e o papel `pastor`", () => {
    // Liderança acompanhava o cuidado sem executá-lo, que é o mesmo motivo da
    // saída da secretária em 26/08. E `pastor` é papel reduzido: mandá-lo a um
    // painel que ele não consegue ler seria promessa vazia.
    expect(ROLES_PAINEL_PASTORAL).not.toContain("lideranca");
    expect(ROLES_PAINEL_PASTORAL).not.toContain("pastor");
  });
});

describe("rotaInicialPorPapel", () => {
  it("secretária entra no painel dela", () => {
    expect(rotaInicialPorPapel(["secretaria"])).toBe("/painel-secretaria");
  });

  it("pastor titular entra no Painel Pastoral", () => {
    // `diakonia` é o perfil de pastor titular — ver a nota em useAuth.tsx.
    expect(rotaInicialPorPapel(["diakonia"])).toBe("/painel-pastoral");
  });

  it("o papel `pastor` NÃO vai para o Painel Pastoral", () => {
    // Saiu em 01/09/2026 junto com a estreitada de `ROLES_PAINEL_PASTORAL`.
    // Mandá-lo para lá seria mandá-lo para uma guarda que recusa no instante
    // seguinte — o vaivém que o último teste deste bloco existe para pegar.
    expect(rotaInicialPorPapel(["pastor"])).toBe("/");
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
