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

import type { LucideIcon } from "lucide-react";

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
  valor: number | string;
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
  const vazio = valor === 0 || valor === "—" || valor === "0";
  const corNumero = vazio ? "text-muted-foreground" : TOM_NUMERO[tom];

  const conteudo = (
    <>
      <div className="flex items-center justify-center gap-1 min-w-0">
        {Icone && (
          <Icone className={`w-3 h-3 shrink-0 ${vazio ? "text-muted-foreground" : TOM_NUMERO[tom]}`} />
        )}
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground truncate leading-none">
          {rotulo}
        </p>
      </div>
      <p className={`text-2xl font-semibold leading-none tabular-nums mt-1.5 ${corNumero}`}>
        {valor}
      </p>
    </>
  );

  const base = "rounded-lg border bg-card px-2 py-2.5 text-center min-w-0";

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
  return (
    <div className={`grid grid-cols-2 gap-1.5 ${cols[colunas] ?? "sm:grid-cols-4"}`}>
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
