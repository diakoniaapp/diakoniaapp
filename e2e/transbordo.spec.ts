import { test, expect, type Page } from "@playwright/test";

/**
 * Transbordo horizontal em tela de celular.
 *
 * Por que este teste existe: `min-w-0` faltando num item de flex ou de grid ja
 * causou o mesmo defeito SEIS vezes neste projeto — AppLayout, AlertasInteligentes,
 * AcoesDoDia, Pessoas, Familias e VisitanteCard. O sintoma e sempre o mesmo: um
 * item de flex/grid nao encolhe abaixo da largura min-content do seu conteudo,
 * entao um nome longo, uma trilha de etapas ou um botao com `truncate` (que traz
 * `white-space: nowrap`) estica o cartao para alem da tela.
 *
 * POR QUE NAO DA PARA FAZER ISSO EM JSDOM
 *
 * O projeto ja tem vitest com jsdom, mas jsdom nao calcula layout:
 * getBoundingClientRect() devolve zero em tudo. Um teste de transbordo em jsdom
 * passaria sempre, inclusive nas seis vezes em que o defeito era real. Por isso
 * este arquivo roda em Playwright, com Chromium de verdade, e fica fora do
 * `include` do vitest.
 *
 * POR QUE MEDIR ELEMENTO POR ELEMENTO, E NAO scrollWidth
 *
 * O reflexo e comparar document.scrollWidth com clientWidth. Nao serve: quando o
 * transbordo acontece dentro de um ancestral com overflow-hidden — o caso comum
 * neste layout — o documento nao rola de lado e o scrollWidth fica limpo,
 * enquanto o conteudo esta cortado na borda. No defeito de Familias o cartao
 * media 593px numa tela de 375px e o scrollWidth do documento nao acusou nada.
 * Aqui a medida e a posicao de cada elemento.
 */

const LARGURA = 375;   // iPhone SE / base mobile-first do projeto
const ALTURA  = 812;
const FOLGA   = 1;     // 1px absorve arredondamento de subpixel

const ROTAS = [
  "/hoje",
  "/dashboard",
  "/membros",
  "/familias",
  "/ministerios",
  "/visitantes",
  "/areas",   // o menu chama de "Equipes"; nao existe rota /equipes
  "/ebd",
  "/pgm",
  "/agenda",
  "/eventos",
  "/locais",
  "/assuntos",
  "/membresia",
  "/organograma",
  "/estrutura",
  "/governanca",
  "/usuarios",
  "/financas",
  "/arrecadacao",
  "/painel-pastoral",
  "/painel-secretaria",
];

/** Coleta os elementos cuja borda direita passa da largura da janela. */
async function elementosForaDaBorda(page: Page, largura: number) {
  return page.evaluate(
    ({ largura, folga }) => {
      // Sem `?? document.body`: a chamada so acontece depois de o teste
      // garantir que <main> existe, e o fallback silencioso era justamente o
      // que deixava a tela de login passar por rota medida.
      const raiz = document.querySelector("main")!;
      const fora: {
        el: HTMLElement;
        tag: string; classe: string; largura: number; direita: number; texto: string;
      }[] = [];

      for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
        const estilo = getComputedStyle(el);
        if (estilo.display === "none" || estilo.visibility === "hidden") continue;
        // Elemento posicionado fora da tela de proposito (menu fechado, tooltip)
        // nao e transbordo de layout.
        if (estilo.position === "fixed" || estilo.position === "absolute") continue;

        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= largura + folga) continue;

        // Truncagem INTENCIONAL nao e defeito; corte pelo casco do app e.
        //
        // getBoundingClientRect() devolve a caixa de LAYOUT e ignora recorte.
        // Isso cria duas situacoes que parecem iguais na medida e sao opostas
        // no produto:
        //
        //  - um <span> dentro de <li class="truncate">: a caixa passa da tela,
        //    mas o li corta e mostra reticencias. E o comportamento pedido.
        //    Reprovar isso e o tipo de falso positivo que faz uma equipe apagar
        //    o teste em vez de consertar o produto. (Acontecia em /hoje.)
        //
        //  - um cartao largo demais dentro de <main>: o <main> deste app tem
        //    `overflow-x-hidden` — existe para a pagina nao rolar de lado —
        //    entao ele corta tambem. Mas aqui o corte E o defeito: foi assim
        //    que "os nomes dos cards nao cabem" apareceu. O nome nao vazava,
        //    ele sumia.
        //
        // Por isso a busca por ancestral que corta para ANTES da raiz: so conta
        // como truncagem intencional quem esta abaixo do <main>. O corte do
        // proprio casco nao absolve ninguem.
        //
        // E tambem por isso o teste nao pode se apoiar em document.scrollWidth:
        // com overflow-x-hidden no <main>, o documento nunca rola de lado e o
        // scrollWidth fica limpo mesmo com o conteudo cortado.
        let truncadoDeProposito = false;
        for (let p = el.parentElement; p && p !== raiz; p = p.parentElement) {
          if (getComputedStyle(p).overflowX === "visible") continue;
          // So absolve se o proprio ancestral cabe na tela — senao e ele que
          // esta transbordando, e e ele que deve ser reportado.
          if (p.getBoundingClientRect().right <= largura + folga) {
            truncadoDeProposito = true;
            break;
          }
        }
        if (truncadoDeProposito) continue;

        fora.push({
          el,
          tag: el.tagName.toLowerCase(),
          classe: (typeof el.className === "string" ? el.className : "").slice(0, 80),
          largura: Math.round(r.width),
          direita: Math.round(r.right),
          texto: (el.textContent ?? "").trim().slice(0, 60),
        });
      }

      // ESCOLHA DO CULPADO — a parte que exigiu medicao, nao intuicao.
      //
      // Ordenar por largura aponta as VITIMAS: quando um elemento largo entra
      // num grid, todas as colunas incham juntas e os cartoes empatam no topo.
      // Pegar o mais fundo tambem nao serve — cai num <path> de 13px dentro de
      // um icone, que so foi carregado junto.
      //
      // Medido com um defeito injetado de proposito: o causador ficou em 42o
      // por largura bruta, e em 1o entre as FOLHAS cujo texto nao quebra. Faz
      // sentido — e exatamente essa a falha que este teste existe para pegar:
      // conteudo com nowrap/truncate forcando a largura min-content do pai.
      const naoQuebra = (el: HTMLElement) =>
        /nowrap|^pre$/.test(getComputedStyle(el).whiteSpace);

      const suspeitos = fora
        .filter(e => e.el.children.length === 0 && naoQuebra(e.el) && e.largura > 40)
        .sort((a, b) => b.largura - a.largura);

      const limpar = (e: (typeof fora)[number]) => ({
        tag: e.tag, classe: e.classe, largura: e.largura, direita: e.direita, texto: e.texto,
      });

      return {
        total: fora.length,
        // Sem folha de texto sem quebra, sobra o mais largo: e o caso de um
        // ancestral com largura fixa, e nao de conteudo esticando.
        culpadoProvavel: suspeitos.length
          ? limpar(suspeitos[0])
          : limpar([...fora].sort((a, b) => b.largura - a.largura)[0]),
        porNowrap: suspeitos.length > 0,
        maisLargos: [...fora].sort((a, b) => b.largura - a.largura).slice(0, 2).map(limpar),
      };
    },
    { largura, folga: FOLGA },
  );
}

test.describe("transbordo horizontal em 375px", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: LARGURA, height: ALTURA });
  });

  for (const rota of ROTAS) {
    test(`${rota} nao empurra nada para fora da tela`, async ({ page }) => {
      const respostas: string[] = [];
      page.on("response", r => {
        if (r.status() >= 500) respostas.push(`${r.status()} ${r.url()}`);
      });

      await page.goto(rota, { waitUntil: "domcontentloaded" });

      // ORDEM IMPORTA. O redirecionamento para /auth e feito pelo router depois
      // da primeira pintura: logo apos o goto a URL ainda e a pedida. Checar
      // aqui daria verde em cima da tela de login — foi o que aconteceu na
      // primeira versao deste arquivo, com 23 rotas "passando" sem sessao.
      // Por isso o app assenta primeiro, e so entao se olha onde se esta.
      await page.waitForLoadState("networkidle").catch(() => { /* segue com o que ja pintou */ });
      await page.waitForTimeout(400);

      const destino = new URL(page.url()).pathname;
      if (destino === "/auth" || destino === "/aceite-lgpd") {
        test.skip(
          true,
          `Redirecionado para ${destino}. Defina E2E_TELEFONE e E2E_SENHA ` +
            `(veja e2e/README.md) e aceite a politica uma vez com essa conta.`,
        );
      }
      expect(destino, `Esperava continuar em ${rota}`).toBe(rota);

      // Segunda trava contra medir a tela errada: toda rota autenticada monta
      // dentro de <main>. Sem ele, o que esta na tela nao e a rota pedida — e
      // medir o body no lugar passaria despercebido, porque tela de login e
      // pagina de erro nao transbordam.
      await expect(
        page.locator("main"),
        `Nenhum <main> em ${rota} — a rota nao montou, e medir o body daria um verde falso`,
      ).toHaveCount(1);

      const { total, culpadoProvavel, porNowrap, maisLargos } =
        await elementosForaDaBorda(page, LARGURA);

      const descrever = (e: NonNullable<typeof culpadoProvavel>) =>
        `  <${e.tag} class="${e.classe}">\n` +
        `    ${e.largura}px de largura, borda direita em ${e.direita}px — "${e.texto}"`;

      expect(
        total,
        total === 0
          ? ""
          : `${total} elemento(s) passam da borda em ${rota}, numa tela de ${LARGURA}px.\n\n` +
            (porNowrap
              ? `Culpado provavel — a folha mais larga cujo texto nao quebra:\n`
              : `Nenhuma folha com texto sem quebra; segue o mais largo:\n`) +
            descrever(culpadoProvavel) +
            `\n\nMais largos (provavelmente vitimas — num grid a linha inteira incha junto):\n` +
            maisLargos.map(descrever).join("\n") +
            `\n\nAs duas causas prováveis, nesta ordem:\n` +
            `  1. min-w-0 faltando num item de flex/grid — item de flex/grid nao encolhe\n` +
            `     abaixo da largura min-content do proprio conteudo.\n` +
            `  2. filho com truncate/whitespace-nowrap esticando o pai — <button> e\n` +
            `     inline-block e encolhe-para-caber; use block w-full.\n` +
            `Detalhes em e2e/README.md.`,
      ).toBe(0);
    });
  }
});
