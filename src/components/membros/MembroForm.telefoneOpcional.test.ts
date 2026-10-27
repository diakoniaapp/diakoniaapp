// ─── Telefone opcional no cadastro aberto a partir de Doadores (27/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────
// Pedido dela: "tire a obrigatoriedade do telefone da pessoa no cadastro, dentro de Doadores". O formulário é o mesmo do resto do sistema (onde o visitante continua exigindo telefone), então a regra vive numa
// opção, `telefoneOpcional`, que só o cadastro de Doadores/extrato liga. Leitura do texto: o formulário é grande demais para renderizar só para isto.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const form = readFileSync("src/components/membros/MembroForm.tsx", "utf8");

describe("telefone opcional no cadastro de pessoa", () => {
  it("as três exigências de telefone do visitante (salvar, avançar do passo 2 e o atalho 'Cadastrar visitante') respeitam a opção", () => {
    const exigencias = form.split("\n").filter(l => /Telefone é obrigatório/.test(l) === false && /(isVisitante|tipo_pessoa === "visitante").*telefone_celular\.trim\(\)|^\s*if \(!(telefoneOpcional && )?!?form\.telefone_celular\.trim\(\)\)/.test(l));
    expect(exigencias.length).toBeGreaterThanOrEqual(3);
    for (const l of exigencias) expect(l).toContain("!telefoneOpcional");
    expect((form.match(/Telefone é obrigatório/g) ?? []).length).toBe(3);
  });
  it("sem a opção nada muda: o resto do sistema continua exigindo (a opção é false por omissão)", () => {
    expect(form).toContain("telefoneOpcional?: boolean;");
    expect(form).not.toMatch(/telefoneOpcional\s*=\s*true/);
  });
  it("só o cadastro de Doadores (Pendentes) e o da leitura do extrato ligam a opção", () => {
    expect(readFileSync("src/components/contribuicoes/PendentesDeIdentificacao.tsx", "utf8")).toContain("telefoneOpcional");
    expect(readFileSync("src/components/financas/mesa/EscolhaDeFavorecido.tsx", "utf8")).toContain("telefoneOpcional");
  });
});
