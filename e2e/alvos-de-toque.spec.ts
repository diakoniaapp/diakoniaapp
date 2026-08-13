import { test, expect, type Page } from "@playwright/test";

/**
 * Alvo de toque minimo — WCAG 2.2, SC 2.5.8 (nivel AA): 24x24 CSS px.
 *
 * O piso e 24px, e nao os 44px que este projeto adota nas telas principais.
 * 44px e a meta de conforto; 24px e a linha que nao se cruza. Um teste que
 * exigisse 44 reprovaria coisas legitimamente densas e viraria ruido — e teste
 * ruidoso acaba desligado.
 *
 * TRES ARMADILHAS DE MEDICAO, TODAS ENCONTRADAS MEDINDO
 *
 * 1. getBoundingClientRect() nao ve alvo esticado por pseudo-elemento.
 *    Em /familias e /ministerios o titulo do cartao e um <button> de 28px cuja
 *    ::after cobre o cartao inteiro (336x80). Medir so a caixa acusaria 46
 *    violacoes que nao existem. Por isso o tamanho efetivo considera ::after e
 *    ::before absolutos.
 *
 * 2. Amostrar pontos com elementFromPoint parece mais fiel, e e instavel.
 *    Numa lista rolavel, a barra inferior fixa cobre transitoriamente o que
 *    estiver embaixo dela: o mesmo botao passa e reprova conforme a rolagem.
 *    Medida geometrica e deterministica.
 *
 * 3. Link dentro de frase e isento pela propria norma ("Inline: the target is
 *    in a sentence..."). Em /usuarios ha um <a>Pessoas</a> de 56x17 no meio de
 *    "Para criar acesso, abra a ficha da pessoa em Pessoas". Reprovar isso
 *    obrigaria a inchar texto corrido.
 */

const LARGURA = 375;
const ALTURA  = 812;
const MINIMO  = 24;   // WCAG 2.2 SC 2.5.8, nivel AA

const ROTAS = [
  "/hoje", "/dashboard", "/membros", "/familias", "/ministerios", "/visitantes",
  "/areas", "/ebd", "/pgm", "/eventos", "/assuntos", "/membresia",
  "/usuarios", "/financas", "/painel-pastoral", "/painel-secretaria",
];

async function alvosPequenos(page: Page, minimo: number) {
  return page.evaluate(({ minimo }) => {
    const raiz = document.querySelector("main")!;
    const pequenos: { descricao: string; tag: string; efetivo: string }[] = [];
    let total = 0;

    const seletor = 'button, [role="button"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], a[href], summary';

    for (const el of Array.from(raiz.querySelectorAll<HTMLElement>(seletor))) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      // Alvo desabilitado nao e operavel; a norma so fala dos operaveis.
      if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      total++;

      // Armadilha 1: alvo esticado por pseudo-elemento absoluto.
      let largura = r.width, altura = r.height;
      for (const pseudo of ["::after", "::before"]) {
        const p = getComputedStyle(el, pseudo);
        if (p.content !== "none" && p.position === "absolute") {
          largura = Math.max(largura, parseFloat(p.width) || 0);
          altura  = Math.max(altura,  parseFloat(p.height) || 0);
        }
      }
      if (largura >= minimo && altura >= minimo) continue;

      // Armadilha 3: excecao "inline" da propria SC 2.5.8. Link dentro de um
      // paragrafo com bem mais texto que ele proprio e texto corrido, nao
      // controle — inchar isso estragaria a leitura sem ganho de acerto.
      if (el.tagName === "A") {
        const pai = el.parentElement;
        const textoDoLink = (el.textContent ?? "").trim().length;
        const textoDoPai  = (pai?.textContent ?? "").trim().length;
        if (pai && textoDoPai > textoDoLink + 10) continue;
      }

      pequenos.push({
        descricao: (el.getAttribute("aria-label") || el.textContent || "(sem rotulo)").trim().slice(0, 40),
        tag: el.tagName.toLowerCase(),
        efetivo: `${Math.round(largura)}x${Math.round(altura)}`,
      });
    }
    return { total, pequenos };
  }, { minimo });
}

test.describe(`alvos de toque de ao menos ${MINIMO}px em ${LARGURA}px`, () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: LARGURA, height: ALTURA });
  });

  for (const rota of ROTAS) {
    test(`${rota} nao tem alvo menor que ${MINIMO}px`, async ({ page }) => {
      await page.goto(rota, { waitUntil: "domcontentloaded" });

      // Mesma ordem do transbordo.spec.ts, pelo mesmo motivo: o redirecionamento
      // para /auth so acontece depois da primeira pintura. Conferir antes disso
      // mediria a tela de login e daria verde falso.
      await page.waitForLoadState("networkidle").catch(() => { /* segue */ });
      await page.waitForTimeout(400);

      const destino = new URL(page.url()).pathname;
      if (destino === "/auth" || destino === "/aceite-lgpd") {
        test.skip(true, `Redirecionado para ${destino}. Veja e2e/README.md.`);
      }
      expect(destino, `Esperava continuar em ${rota}`).toBe(rota);
      await expect(page.locator("main"), `Nenhum <main> em ${rota}`).toHaveCount(1);

      const { total, pequenos } = await alvosPequenos(page, MINIMO);

      expect(
        pequenos.length,
        pequenos.length === 0
          ? ""
          : `${pequenos.length} de ${total} alvos abaixo de ${MINIMO}px em ${rota}:\n` +
            pequenos.slice(0, 6)
              .map(p => `  <${p.tag}> ${p.efetivo} — "${p.descricao}"`)
              .join("\n") +
            `\n\nDuas saidas, nesta ordem:\n` +
            `  1. Aumentar o alvo (h-11 = 44px e o padrao das telas principais).\n` +
            `  2. Quando o desenho precisa continuar pequeno, esticar so a AREA:\n` +
            `     "relative after:absolute after:-inset-2 after:content-['']".\n` +
            `     O ::after e absoluto, entao nao ocupa espaco e nada no layout muda.\n` +
            `     Foi o que resolveu as checkboxes de 16px da chamada da EBD.\n` +
            `Detalhes em e2e/README.md.`,
      ).toBe(0);
    });
  }
});
