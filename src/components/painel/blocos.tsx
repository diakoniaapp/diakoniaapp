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
  // **No desktop falta largura.** Cinco colunas num painel de 1024px dão
  // ~100px cada — não cabe número e rótulo lado a lado, e TODOS truncavam
  // ("ANIV. H...", "EM ACO..."). Ali o empilhado é que resolve.
  //
  // Daí `order`: os mesmos dois elementos, invertidos por breakpoint. No
  // celular o número vem primeiro, porque é ele que se procura — "3" salta e
  // "aniv. hoje" só explica.
  const conteudo = (
    <>
      <span className="flex items-center gap-1 min-w-0 order-2 sm:order-1">
        {Icone && (
          <Icone className={`w-3.5 h-3.5 shrink-0 ${vazio ? "text-muted-foreground" : TOM_NUMERO[tom]}`} />
        )}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate min-w-0">
          {rotulo}
        </span>
      </span>
      {!semNumero && (
        <span className={`text-lg sm:text-2xl font-semibold leading-none tabular-nums shrink-0 order-1 sm:order-2 ${corNumero}`}>
          {valor}
        </span>
      )}
      {/* Sem número, uma seta ocupa o lugar dele: o bloco continua alinhado
          com os vizinhos na faixa, e diz que leva a algum lugar. */}
      {semNumero && (
        <ChevronRight className={`w-4 h-4 shrink-0 order-1 sm:order-2 ${TOM_NUMERO[tom]}`} />
      )}
    </>
  );

  const base =
    "flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 min-w-0 " +
    "sm:flex-col sm:items-center sm:gap-1.5 sm:px-2 sm:py-2.5 sm:text-center";

  if (!onClick) return <div className={base}>{conteudo}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      title={descricao ?? `Ir para ${rotulo}`}
      className={`${base} w-full transition-colors hover:bg-muted hover:border-foreground/20
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
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
    3: "sm:grid-cols-3", 4: "sm:grid-cols-4",
    5: "sm:grid-cols-5", 6: "sm:grid-cols-6",
  };

  // No celular são duas colunas, e um número ímpar de indicadores deixa o
  // último sozinho na linha — meia largura desperdiçada, e justamente onde
  // o rótulo mais comprido costuma cair ("Em acompanhamento" truncava ali).
  // Ele passa a ocupar a linha inteira: some o órfão e some o truncamento.
  const impar = Children.count(children) % 2 === 1;

  return (
    <div
      className={`grid grid-cols-2 gap-1.5 ${cols[colunas] ?? "sm:grid-cols-4"} ${
        impar ? "[&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1" : ""
      }`}
    >
      {children}
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
      <h2 className="font-serif text-base leading-none min-w-0 truncate">{children}</h2>
      {contagem !== undefined && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{contagem}</span>
      )}
      <div className="h-px flex-1 bg-border" />
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

/**
 * Leva a tela até uma seção, respeitando quem pediu menos movimento.
 *
 * `prefers-reduced-motion` não é detalhe de acessibilidade opcional aqui: a
 * rolagem suave por uma tela longa é exatamente o tipo de animação que causa
 * desconforto em quem tem sensibilidade vestibular.
 */
export function irParaSecao(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  alvo.scrollIntoView({ behavior: suave ? "smooth" : "auto", block: "start" });
}
