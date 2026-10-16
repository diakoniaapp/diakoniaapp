// ─── fechoNoRodape — empurra as assinaturas para o pé da ÚLTIMA página impressa ─────────────────────────────────────────────────
// Pedido (15/10/2026): "a parte final do relatório, onde ficam as assinaturas, deve ficar ao final, sempre na parte inferior da última página".
// CSS sozinho não resolve: o navegador só sabe onde a página termina depois de paginar, e nenhuma regra de impressão diz "cole isto no pé da última folha"
// (position: fixed repete em TODAS as folhas; rodapé de tabela também). Então medimos: copiamos o relatório para um iframe invisível, tiramos o
// `@media print` das regras (para o iframe ver o mesmo CSS que a impressão verá) e deixamos o próprio navegador paginar com colunas de altura fixa (`column-fill: auto`): cada coluna é uma folha, e as regras de quebra do relatório (`avoid-break`, linhas inteiras) valem igual.
// O que sobra abaixo do bloco final, na última folha, é a folga que a impressão devolve como margem superior do bloco.
// Sem layout (jsdom) ou com medida absurda devolve null e o relatório imprime como sempre imprimiu — as assinaturas seguem o conteúdo.

/** Área útil da folha A4, em mm, descontadas as margens do @page. */
export function areaUtilDaFolha(retrato: boolean): { larguraMm: number; alturaMm: number } {
  // espelha o `@page` da Prestação de Contas: retrato 1,5 × 1,8 cm; paisagem 1,3 × 1,8 cm (vertical × horizontal)
  const [folhaL, folhaA] = retrato ? [210, 297] : [297, 210];
  const margemV = retrato ? 15 : 13;
  const margemH = 18;
  return { larguraMm: folhaL - 2 * margemH, alturaMm: folhaA - 2 * margemV };
}

/** Folga mínima que NUNCA se gasta: se o navegador imprimir um pouco diferente do medidor, o bloco ainda cabe na folha (um bloco a mais criaria uma folha só de assinaturas). */
export const FOLGA_DE_SEGURANCA_MM = 5;

/** Reescreve as folhas de estilo da página como o navegador as veria ao imprimir: o conteúdo de `@media print` passa a valer sempre, `@media screen` sai. */
function cssComoNaImpressao(): string {
  const partes: string[] = [];
  const emitir = (regras: CSSRuleList) => {
    for (const regra of Array.from(regras)) {
      if (typeof CSSMediaRule !== "undefined" && regra instanceof CSSMediaRule) {
        const alvo = regra.conditionText || regra.media.mediaText;
        if (/\bprint\b/.test(alvo) && !/\bnot\b/.test(alvo)) emitir(regra.cssRules);
        else if (!/\bscreen\b/.test(alvo)) partes.push(regra.cssText);
      } else if (typeof CSSPageRule !== "undefined" && regra instanceof CSSPageRule) {
        continue;
      } else partes.push(regra.cssText);
    }
  };
  for (const folha of Array.from(document.styleSheets)) {
    try { emitir(folha.cssRules); } catch { /* folha de outra origem (fonte do Google): o iframe a recebe pelo <link> abaixo */ }
  }
  return partes.join("\n");
}

/**
 * Mede, numa paginação de verdade, quantos px sobram abaixo de `fecho` na última folha.
 * @param pagina o elemento `.relatorio-page` (o relatório inteiro)
 * @param fecho  o bloco final dentro dele (assinaturas + versículo), identificado por `seletorDoFecho`
 * @returns px de folga (≥ 0) ou null se não foi possível medir
 */
export async function medirFolgaDoFecho(pagina: HTMLElement, seletorDoFecho: string, retrato: boolean): Promise<number | null> {
  if (typeof document === "undefined") return null;
  const { larguraMm, alturaMm } = areaUtilDaFolha(retrato);
  // a largura do iframe é a da FOLHA inteira, como na impressão: as consultas de largura do Tailwind (md:, lg:) escolhem o layout por ela
  const folhaPx = Math.round((retrato ? 210 : 297) * (96 / 25.4));
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${folhaPx}px;height:1200px;border:0;visibility:hidden;pointer-events:none`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument;
    if (!doc) return null;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(l => `<link rel="stylesheet" href="${l.href}">`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8">${links}<style>${cssComoNaImpressao()}</style>
      <style>
        html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
        body * { visibility: visible !important; }
        #medidor { position: relative; width: ${larguraMm}mm; height: ${alturaMm}mm; column-width: ${larguraMm}mm; column-gap: 0; column-fill: auto; }
        #medidor .relatorio-page { position: static !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
      </style></head><body><div id="medidor">${pagina.outerHTML}</div></body></html>`;
    doc.open(); doc.write(html); doc.close();
    // folhas de estilo externas (fontes) e as fontes em si carregam à parte: sem esperar, o texto mede com a fonte reserva e a conta sai errada
    const aguardar = async () => {
      await Promise.all(Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]")).map(l => l.sheet ? null : new Promise(r => { l.onload = l.onerror = () => r(null); })));
      void doc.body.offsetHeight;   // força o layout: só então o navegador sabe quais fontes buscar
      await doc.fonts?.ready;
    };
    await Promise.race([aguardar(), new Promise(r => setTimeout(r, 2500))]);
    await new Promise(r => requestAnimationFrame(() => r(null)));

    const medidor = doc.getElementById("medidor");
    const fechoCopia = doc.querySelector<HTMLElement>(seletorDoFecho);
    if (!medidor || !fechoCopia) return null;
    const m = medidor.getBoundingClientRect();
    const f = fechoCopia.getBoundingClientRect();
    // o bloco é `avoid-break`: se ele aparecer partido entre colunas (retângulo maior que a folha) a medida não vale
    if (m.height === 0 || f.height === 0 || f.height > m.height) return null;
    // mesma folha: o bloco não pode começar numa coluna e terminar em outra (ele é `avoid-break`), então a base dele é top + height
    const baseDoFecho = f.bottom - m.top;
    const folga = m.height - baseDoFecho - FOLGA_DE_SEGURANCA_MM * (96 / 25.4);
    return folga > 0 && Number.isFinite(folga) ? Math.floor(folga) : 0;
  } catch {
    return null;
  } finally {
    iframe.remove();
  }
}
