import { test, expect } from "@playwright/test";

/**
 * Transbordo DENTRO de diálogos.
 *
 * Por que num arquivo separado: o transbordo.spec.ts varre `<main>`, e Radix
 * renderiza diálogo em portal — fora do <main>, direto no <body>. O vazamento
 * do "Imprimir agenda" existia, saía 19px pela direita da tela, e aquele teste
 * nunca o veria.
 *
 * A causa era o proprio DialogContent do shadcn: `grid` sem coluna declarada
 * cria trilha `auto`, cujo piso e o min-content do filho mais largo. Um nome
 * com `truncate` (white-space: nowrap) tem min-content igual ao texto inteiro.
 * Corrigido com grid-cols-[minmax(0,1fr)] — o equivalente de min-w-0 em grid.
 *
 * Como o defeito estava no componente compartilhado, conferir UM dialogo ja
 * guarda todos os outros: e o mesmo DialogContent embaixo.
 */

const LARGURA = 375;
const ALTURA  = 812;

test.describe("diálogos não vazam em 375px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: LARGURA, height: ALTURA });
  });

  test("Imprimir agenda cabe na tela", async ({ page }) => {
    await page.goto("/eventos", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => { /* segue */ });
    await page.waitForTimeout(400);

    const destino = new URL(page.url()).pathname;
    if (destino === "/auth" || destino === "/aceite-lgpd") {
      test.skip(true, `Redirecionado para ${destino}. Veja e2e/README.md.`);
    }

    await page.getByRole("button", { name: /^Imprimir$/ }).click();
    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await page.waitForTimeout(300);

    const { total, piores } = await page.evaluate(({ largura, folga }) => {
      const raiz = document.querySelector('[role="dialog"]')!;
      const fora: { tag: string; classe: string; largura: number; direita: number; texto: string }[] = [];
      for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") continue;
        // O proprio dialogo e fixed e centralizado; so o conteudo interessa.
        if (s.position === "fixed") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= largura + folga) continue;
        fora.push({
          tag: el.tagName.toLowerCase(),
          classe: (typeof el.className === "string" ? el.className : "").slice(0, 70),
          largura: Math.round(r.width),
          direita: Math.round(r.right),
          texto: (el.textContent ?? "").trim().slice(0, 45),
        });
      }
      return { total: fora.length, piores: [...fora].sort((a, b) => b.direita - a.direita).slice(0, 3) };
    }, { largura: LARGURA, folga: 1 });

    expect(
      total,
      total === 0
        ? ""
        : `${total} elemento(s) do diálogo passam da borda de ${LARGURA}px:\n` +
          piores.map(e => `  <${e.tag} class="${e.classe}"> ${e.largura}px, direita ${e.direita}px — "${e.texto}"`).join("\n") +
          `\n\nEm grid, o equivalente de min-w-0 e grid-cols-[minmax(0,1fr)]:\n` +
          `trilha "auto" nao encolhe abaixo do min-content do filho mais largo.`,
    ).toBe(0);
  });
});
