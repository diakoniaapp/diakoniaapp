// ─── blocos.tsx — as peças visuais do Painel Pastoral ──────────────────────
//
// ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
//
// O mesmo cartão de número estava escrito três vezes, em três arquivos, com
// três nomes: `ResumoCard` no PainelPastoral, `Numero` no bloco da EBD e
// `Numero` de novo no bloco do PGM. Iguais na intenção e diferentes no
// detalhe — e a tela mostrava os três empilhados, um debaixo do outro.
//
// ── O QUE MUDOU NO DESENHO, E POR QUÊ ──────────────────────────────────────
//
// **Zero deixou de gritar.** Antes todo indicador era um bloco de fundo
// saturado com o número em corpo grande, inclusive quando o número era zero:
// "0 BODAS HOJE" e "0 VISITANTES" ocupavam o mesmo peso visual que "77
// ALUNOS". Um painel que anuncia ausências com a mesma ênfase das presenças
// obriga a ler tudo para descobrir o que importa.
//
// Agora a cor vive no número, não no fundo. O fundo é o do cartão, com uma
// borda fina; e zero vem em cinza, mas legivel. Quem olha
// encontra primeiro o que tem substância.
//
// **A faixa não quebra mais.** Cinco indicadores num grid de 3 colunas viram
// 3 + 2, com dois blocos largos e órfãos na segunda linha. O grid agora conta
// quantos são e usa esse número de colunas a partir de `sm`.

import { Children } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

/**
 * As famílias de cor do sistema, por nome.
 *
 * Só os tokens semânticos de `index.css` — a convenção do projeto proíbe cor
 * literal, e `bg-teal-100` do Tailwind não é o `--teal` da casa.
 */
export type Tom =
  | "celebracao" | "info" | "success" | "warning" | "violeta" | "gold" | "neutro";

const TOM_NUMERO: Record<Tom, string> = {
  celebracao: "text-celebracao-text",
  info:       "text-info-text",
  success:    "text-success-text",
  warning:    "text-warning-text",
  violeta:    "text-violeta-text",
  gold:       "text-gold-text",
  neutro:     "text-foreground",
};

interface IndicadorProps {
  rotulo: string;
  /**
   * Ausente, o indicador vira só um atalho: ícone e rótulo, sem número.
   *
   * Serve para seções que não se resumem a uma contagem — "Discipulado" são
   * quatro abas (EBD, Pequenos Grupos, Campanhas, Crescimento), e cada uma
   * carrega os próprios dados dentro de si. Inventar um número aqui exigiria
   * buscar as agregações das quatro só para pintar um algarismo no topo, e
   * um `0` ou um `—` no lugar diria que não há discipulado — que é falso.
   */
  valor?: number | string;
  tom?: Tom;
  icone?: LucideIcon;
  /** Quando dado, o indicador vira botão e leva a algum lugar da tela. */
  onClick?: () => void;
  /** Texto do `title`/`aria-label` quando clicável. */
  descricao?: string;
}

export function Indicador({
  rotulo, valor, tom = "neutro", icone: Icone, onClick, descricao,
}: IndicadorProps) {
  // `0` e `"—"` não são notícia: o bloco recua em vez de competir.
  //
  // A recessão é SÓ na cor do número. A primeira versão somava
  // `opacity-70` no bloco inteiro a um texto já em `/60`, e no tema escuro
  // os dois se multiplicavam: o indicador virava um vão em branco na faixa,
  // como se não existisse. Um zero precisa recuar e continuar legível — quem
  // olha para "Sem contato" quer saber que o número é zero, não descobrir
  // que a caixa sumiu.
  const semNumero = valor === undefined;
  const vazio = valor === 0 || valor === "—" || valor === "0";
  const corNumero = vazio ? "text-muted-foreground" : TOM_NUMERO[tom];

  // O layout vira com a tela, porque a restrição é oposta nas duas.
  //
  // **No celular falta altura.** A faixa quebra em duas colunas, cada uma
  // com folga horizontal; empilhado — rótulo em cima, número embaixo — cada
  // indicador pedia ~70px, e os cinco comiam metade da primeira tela antes
  // de qualquer conteúdo aparecer. Em linha cabem em ~32px.
  //
  // **No desktop LARGO falta largura por coluna.** Cinco colunas dão ~190px
  // cada — não cabe número e rótulo lado a lado, e todos truncavam. Ali o
  // empilhado é que resolve.
  //
  // O corte é `lg` (1024px), e não `sm` (640px). Com `sm` o grid virava cinco
  // colunas cedo demais: numa janela de 700px cada indicador ficava com
  // ~130px — estreito para o empilhado e estreito para o texto. "EM
  // ACOMPANHAMENTO" cortava e os rótulos pareciam se sobrepor. Entre 640 e
  // 1024 ficam duas colunas largas, com o layout em linha.
  //
  // Daí `order`: os mesmos dois elementos, invertidos por breakpoint. No
  // celular o número vem primeiro, porque é ele que se procura — "3" salta e
  // "aniv. hoje" só explica.
  const conteudo = (
    <>
      <span className="flex items-center gap-1 min-w-0 order-2 lg:order-1">
        {Icone && (
          <Icone className={`w-3.5 h-3.5 shrink-0 ${vazio ? "text-muted-foreground" : TOM_NUMERO[tom]}`} />
        )}
        {/* 11px era pequeno demais numa tela de 1920: o rótulo do atalho é
            o único texto do bloco desde que os números saíram, e ele
            precisa se ler sem esforço. Cresce mais um passo no desktop. */}
        <span className="text-xs sm:text-sm uppercase tracking-wide text-muted-foreground truncate min-w-0">
          {rotulo}
        </span>
      </span>
      {!semNumero && (
        <span className={`text-lg lg:text-2xl font-semibold leading-none tabular-nums shrink-0 order-1 lg:order-2 ${corNumero}`}>
          {valor}
        </span>
      )}
      {/* Sem número, uma seta ocupa o lugar dele: o bloco continua alinhado
          com os vizinhos na faixa, e diz que leva a algum lugar. */}
      {semNumero && (
        <ChevronRight className={`w-4 h-4 shrink-0 order-1 lg:order-2 ${TOM_NUMERO[tom]}`} />
      )}
    </>
  );

  // Sem borda nem fundo próprios: quem desenha a moldura é a faixa, uma vez
  // só. Cada indicador contribui com um fio à direita e outro embaixo, e a
  // faixa esconde os das pontas — ver `FaixaDeIndicadores`.
  //
  // Antes eram cinco caixas soltas, cada uma com sua borda arredondada e seu
  // vão. Cinco molduras para cinco números que se leem juntos: a tela ganhava
  // dez linhas de contorno e uma leitura picotada.
  const base =
    "flex items-center gap-1.5 border-r border-b px-2.5 py-2 min-w-0 " +
    "lg:flex-col lg:items-center lg:gap-1.5 lg:px-2 lg:py-2.5 lg:text-center";

  if (!onClick) return <div className={base}>{conteudo}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      title={descricao ?? `Ir para ${rotulo}`}
      // `hover:border-…` saiu junto com a borda própria: o realce agora é só
      // o fundo, senão o hover engrossaria a divisória entre dois vizinhos.
      className={`${base} w-full transition-colors hover:bg-muted
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {conteudo}
    </button>
  );
}

/**
 * A faixa de indicadores.
 *
 * O número de colunas sai da quantidade de filhos: cinco indicadores viram
 * cinco colunas, e não 3 + 2 com dois órfãos embaixo. No celular ficam dois
 * por linha, que é o que cabe sem truncar o rótulo.
 */
export function FaixaDeIndicadores({
  children, colunas,
}: { children: React.ReactNode; colunas: number }) {
  const cols: Record<number, string> = {
    3: "lg:grid-cols-3", 4: "lg:grid-cols-4",
    5: "lg:grid-cols-5", 6: "lg:grid-cols-6",
  };

  // No celular são duas colunas, e um número ímpar de indicadores deixa o
  // último sozinho na linha — meia largura desperdiçada, e justamente onde
  // o rótulo mais comprido costuma cair ("Em acompanhamento" truncava ali).
  // Ele passa a ocupar a linha inteira: some o órfão e some o truncamento.
  const impar = Children.count(children) % 2 === 1;

  return (
    // Uma moldura só, e os indicadores dentro dela.
    //
    // Cada indicador traz `border-r border-b`; o `-mr-px -mb-px` do grid
    // puxa o conteúdo um pixel para fora, e o `overflow-hidden` da moldura
    // corta justamente os fios da última coluna e da última linha. Assim as
    // divisórias aparecem só ENTRE as células, sem fio dobrado na borda.
    //
    // `divide-x`/`divide-y` do Tailwind não serviriam: eles seguem a ordem
    // do DOM, e num grid o primeiro item de cada linha ganharia um fio à
    // esquerda no meio da faixa.
    <div className="rounded-lg border bg-card overflow-hidden">
      <div
        className={`grid grid-cols-2 -mr-px -mb-px ${cols[colunas] ?? "lg:grid-cols-4"} ${
          impar ? "[&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * O título de uma seção do painel.
 *
 * Antes cada seção inventava o seu: umas eram `CardTitle` dentro de um
 * `Card`, outras um `<h2>` solto, com tamanhos e espaçamentos diferentes.
 * Ler a tela exigia reconhecer três formatos de cabeçalho.
 */
export function TituloDaSecao({
  icone: Icone, children, contagem, tom = "gold", acao,
}: {
  icone: LucideIcon;
  children: React.ReactNode;
  contagem?: number;
  tom?: Tom;
  /** Encostado à direita — um link para a tela completa, por exemplo. */
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2 min-w-0">
      <Icone className={`w-4 h-4 shrink-0 ${TOM_NUMERO[tom]}`} />
      <h2 className="font-serif text-base sm:text-lg leading-none min-w-0 truncate">{children}</h2>
      {contagem !== undefined && (
        <span className="text-sm text-muted-foreground tabular-nums shrink-0">{contagem}</span>
      )}
      <div className="h-px flex-1 bg-border" />
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/** Respiro entre a base do cabeçalho fixo e o título da seção. */
const FOLGA = 12;

/** Quem realmente rola: no AppLayout é o `<main>`, não a janela. */
function roladorDe(el: HTMLElement): HTMLElement | null {
  let n = el.parentElement;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (/auto|scroll/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 4) return n;
    n = n.parentElement;
  }
  return null;
}

/** A altura do cabeçalho grudado no topo do rolador, medida agora. */
function alturaDoCabecalhoFixo(rolador: HTMLElement): number {
  const topoDoRolador = rolador.getBoundingClientRect().top;
  let maisBaixo = 0;

  for (const el of Array.from(rolador.querySelectorAll<HTMLElement>("*"))) {
    const cs = getComputedStyle(el);
    if (cs.position !== "sticky") continue;

    // Onde ESTE elemento gruda. Quase sempre `top: 0`, mas não sempre: a tira
    // de atalhos da Home gruda ABAIXO da faixa do "Ver como", com
    // `top: var(--altura-ver-como)`. Sem ler o valor resolvido, ela seria
    // tomada por uma barra solta no meio da página e simplesmente ignorada.
    const ondeGruda = parseFloat(cs.top);
    if (!Number.isFinite(ondeGruda)) continue;

    const r = el.getBoundingClientRect();
    // Grudado é estar no lugar onde grudaria — e não "encostado no topo".
    if (r.top > topoDoRolador + ondeGruda + 1) continue;

    // ── A BORDA DE BAIXO, E NÃO A ALTURA ────────────────────────────────
    //
    // Isto media `Math.max(…, r.height)`. Com UM cabeçalho fixo dá no mesmo;
    // com DOIS empilhados, não: a faixa do "Ver como" tem ~36px e a tira de
    // atalhos ~78, e o maior dos dois é menor que o conjunto. As seções
    // parariam 36px atrás — atrás da própria tira que as chamou.
    //
    // Somar os dois também estaria errado: nada garante que estejam
    // empilhados sem folga. A borda de baixo do que desce mais é a única
    // medida que vale nos dois casos, e não precisa saber quantos são.
    maisBaixo = Math.max(maisBaixo, r.bottom - topoDoRolador);
  }
  return maisBaixo;
}

/**
 * Leva a tela até uma seção, respeitando quem pediu menos movimento.
 *
 * `prefers-reduced-motion` não é detalhe de acessibilidade opcional aqui: a
 * rolagem suave por uma tela longa é exatamente o tipo de animação que causa
 * desconforto em quem tem sensibilidade vestibular.
 *
 * ── POR QUE MEDE, EM VEZ DE CONFIAR NO `scroll-mt` ─────────────────────────
 *
 * Antes isto era um `scrollIntoView` puro, e o desvio ficava por conta do
 * `scroll-mt-[280px] sm:scroll-mt-[230px]` repetido em cada `<section>`. Dois
 * números escritos à mão para descrever a altura do cabeçalho fixo — que
 * muda com a largura da tela E com o conteúdo do próprio cabeçalho.
 *
 * **Eles envelheceram na primeira vez que o cabeçalho mudou.** Ao ganhar um
 * quinto indicador, a faixa passou de duas para três linhas entre 640px e
 * 1024px: o cabeçalho foi a 243px contra os 230 do `scroll-mt`, e TODAS as
 * seções passaram a parar 13px atrás dele. Medido, não deduzido.
 *
 * Medir na hora resolve os dois eixos de uma vez e não tem como envelhecer.
 * O `scroll-mt` das seções continua nos arquivos: ele ainda serve à
 * navegação por âncora do navegador, que não passa por aqui.
 */
export function irParaSecao(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const comportamento: ScrollBehavior = suave ? "smooth" : "auto";

  const rolador = roladorDe(alvo);
  // Sem rolador identificado, o comportamento antigo — que já era o certo
  // quando quem rola é a janela.
  if (!rolador) {
    alvo.scrollIntoView({ behavior: comportamento, block: "start" });
    return;
  }

  const desvio = alturaDoCabecalhoFixo(rolador) + FOLGA;
  const destino =
    rolador.scrollTop +
    (alvo.getBoundingClientRect().top - rolador.getBoundingClientRect().top) -
    desvio;

  rolador.scrollTo({ top: Math.max(0, destino), behavior: comportamento });
}

/**
 * "agora mesmo", "há 3 minutos", "há 2 horas".
 *
 * Morava dentro do `PainelPastoral`. Saiu quando o Painel da Secretaria
 * ganhou a mesma frase de resumo: duas cópias de uma regra de arredondamento
 * dariam, mais cedo ou mais tarde, dois textos diferentes para o mesmo
 * instante — e as duas telas ficam a um clique uma da outra.
 */
export function formatarAtualizadoHa(data: Date | null): string {
  if (!data) return "";
  const diffMin = Math.floor((Date.now() - data.getTime()) / 60000);
  if (diffMin < 1) return "agora mesmo";
  if (diffMin === 1) return "há 1 minuto";
  if (diffMin < 60) return `há ${diffMin} minutos`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "há 1 hora";
  return `há ${diffH} horas`;
}
