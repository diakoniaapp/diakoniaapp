// O perfil de voluntário (16/10/2026) como perfil de relacionamento mínimo: o que ele vê, o que fica fechado e como registra visitante — sem tela nova, sem permissão nova.
// O que se trava aqui é a PROMESSA ao usuário: menu curto, URL fechada, botão certo na Home.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATALHOS_TOPO, NAV_GROUPS, PAINEL, ROLES_LIDERES, ROUTE_ROLES, papeisExigidosPara, type NavItem } from "@/components/layout/navConfig";
import type { AppRole } from "@/hooks/useAuth";

/** Os destinos do menu lateral que ESTE papel enxerga (grupo e item precisam deixar). */
function menuDe(papel: AppRole): string[] {
  const deixa = (r?: AppRole[]) => !r || r.includes(papel);
  const doGrupo = (NAV_GROUPS as { allowedRoles?: AppRole[]; items: NavItem[] }[]).filter(g => deixa(g.allowedRoles)).flatMap(g => g.items.filter(i => deixa(i.allowedRoles)));
  // a Home está em PAINEL e também no começo de ATALHOS_TOPO: conta uma vez
  return [...new Set([PAINEL, ...ATALHOS_TOPO.filter(i => deixa(i.allowedRoles)), ...doGrupo].map(i => i.to))];
}

describe("perfil de voluntário — telas visíveis", () => {
  it("o menu do voluntário é Home e Agenda, e nada mais", () => {
    expect(menuDe("voluntario")).toEqual(["/", "/eventos"]);
  });

  it("o membro comum também (a mesma régua): nenhuma tela de trabalho aparece", () => {
    expect(menuDe("membro")).toEqual(["/", "/eventos"]);
  });

  it("quem acompanha visitantes continua vendo a tela (liderança, secretaria, pastor, administrador)", () => {
    for (const p of ["admin", "secretaria", "pastor", "lideranca"] as AppRole[]) expect(menuDe(p), p).toContain("/visitantes");
  });
});

describe("perfil de voluntário — telas ocultas, inclusive pelo endereço", () => {
  it("/visitantes e a ficha de acolhimento (/visitantes/:id) têm guarda de rota: voluntário e membro são recusados", () => {
    expect(ROUTE_ROLES["/visitantes"]).toEqual(ROLES_LIDERES);
    for (const rota of ["/visitantes", "/visitantes/abc-123", "/visitantes?aba=qr"]) {
      const papeis = papeisExigidosPara(rota)!;
      expect(papeis, rota).toBeDefined();
      expect(papeis).not.toContain("voluntario");
      expect(papeis).not.toContain("membro");
      for (const p of ["admin", "secretaria", "pastor", "lideranca"] as AppRole[]) expect(papeis).toContain(p);
    }
  });

  it("as bancadas de trabalho seguem fechadas para o voluntário: painéis, financeiro, pessoas, configurações", () => {
    for (const rota of [
      "/painel-pastoral", "/painel-secretaria", "/painel-tesouraria", "/painel-pessoas", "/membros", "/familias", "/ebd", "/financas", "/financas/dre",
      "/financas/estoque", "/usuarios", "/admin/lgpd", "/governanca", "/organograma", "/locais", "/arrecadacao",
    ]) {
      const papeis = papeisExigidosPara(rota);
      expect(papeis, `${rota} sem guarda`).toBeDefined();
      expect(papeis, rota).not.toContain("voluntario");
    }
  });
});

describe("perfil de voluntário — a Home e o registro de visitante", () => {
  const home = readFileSync("src/pages/Home.tsx", "utf8");

  it("sem `criar_pessoa`, o voluntário recebe o botão 'Registrar visitante', que abre o formulário público /bemvindo em aba nova", () => {
    expect(home).toMatch(/indicaVisitante\s*=\s*!registraVisitante\s*&&\s*hasRole\(\["voluntario"\]\)/);
    expect(home).toContain(`href="/bemvindo"`);
    expect(home).toContain(`target="_blank"`);
    expect(home).toContain(`rel="noopener noreferrer"`);
  });

  it("quem tem `criar_pessoa` continua com o 'Visitante Rápido' (ficha completa): o voluntário não ganhou permissão nenhuma", () => {
    expect(home).toContain(`const registraVisitante = permissoes.has("criar_pessoa")`);
    expect(home).toContain("Visitante Rápido");
  });

  it("a barra de baixo do celular e o menu trazem Visitantes só para a liderança", () => {
    const barra = readFileSync("src/components/layout/MobileBottomNav.tsx", "utf8");
    expect(barra).toMatch(/to: "\/visitantes"[^}]*allowedRoles: ROLES_LIDERES/);
  });
});
