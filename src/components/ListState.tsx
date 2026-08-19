import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Inbox, RefreshCw, SearchX } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A tela inteira enquanto os dados não chegaram.
 *
 * ── O QUE ISTO SUBSTITUI ────────────────────────────────────────────────
 *
 * 31 telas faziam a mesma coisa:
 *
 *   if (loading) return <div className="p-8 flex items-center justify-center
 *     text-muted-foreground"><Loader2 className="animate-spin" /> Carregando...
 *
 * O `return` antecipado apaga a página INTEIRA — título, contagem, filtros,
 * tudo — e põe no lugar uma roda girando no meio do branco. A pessoa clica
 * em "Finanças", a tela some, e por um segundo ela não está em lugar nenhum.
 *
 * Contado: 169 usos de `animate-spin` contra 53 esqueletos. E a espera não
 * ficou mais curta com isso — só ficou mais vazia. A percepção de lentidão
 * do sistema vem daqui, não do tempo real das consultas.
 *
 * ── POR QUE O ESQUELETO É MELHOR ────────────────────────────────────────
 *
 * Ele não é enfeite de carregamento: é uma PROMESSA DE LAYOUT. A pessoa vê
 * onde o título vai ficar, quantas linhas esperar, que aquilo é uma lista e
 * não um formulário. Quando o conteúdo chega, ele ocupa o lugar que já
 * estava desenhado — nada salta.
 *
 * É o mesmo tempo de espera parecendo metade, porque o olho já começou a
 * trabalhar.
 */
export function PaginaSkeleton({ linhas = 5, comCabecalho = true }: { linhas?: number; comCabecalho?: boolean }) {
  return (
    <div className="p-4 md:p-8 space-y-6" aria-busy="true" aria-live="polite">
      {/* Leitor de tela não enxerga o esqueleto: para ele, o aviso é este. */}
      <span className="sr-only">Carregando…</span>

      {comCabecalho && (
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />   {/* onde vai o título */}
          <Skeleton className="h-4 w-36" />   {/* onde vai a contagem */}
        </div>
      )}

      <div className="space-y-2.5">
        {Array.from({ length: linhas }).map((_, i) => (
          // Larguras que variam: uma pilha de barras idênticas parece uma
          // barra de progresso quebrada, não uma lista.
          <Card key={i} className="shadow-card-soft">
            <CardContent className="p-4 flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4" style={{ width: `${58 + ((i * 13) % 30)}%` }} />
                <Skeleton className="h-3" style={{ width: `${28 + ((i * 17) % 22)}%` }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? "grid md:grid-cols-2 lg:grid-cols-3 gap-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="shadow-card-soft">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full mt-2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * A tela que aparece quando não há o que mostrar.
 *
 * ── POR QUE ISTO MERECEU ATENÇÃO ────────────────────────────────────────
 *
 * Neste sistema, o vazio NÃO é exceção — é o estado normal. Contado no
 * banco: 61 das 143 tabelas estão vazias e 92 têm cinco linhas ou menos. A
 * primeira tela que quase todo módulo mostra a quem chega é esta.
 *
 * E ela dizia "Nenhum ministério cadastrado" e parava aí. Havia 114 vazios
 * escritos à mão pelo sistema, 8 usando este componente, e NENHUM oferecendo
 * uma saída. Um deles chegava a dizer "Cadastre em arr_acordo_template" —
 * nome de tabela do banco, na cara de quem usa.
 *
 * Uma tela vazia que só informa o vazio devolve a pergunta para o usuário:
 * "e agora?". Ela tem três trabalhos, e nenhum é decorativo:
 *
 *   1. dizer o que ESTE lugar guarda
 *   2. dizer por que vale a pena preencher
 *   3. oferecer o primeiro passo
 *
 * ── DUAS SITUAÇÕES DIFERENTES ───────────────────────────────────────────
 *
 * "Ainda não existe nada aqui" e "seu filtro não encontrou nada" parecem a
 * mesma tela e não são. A primeira convida a começar; a segunda convida a
 * afrouxar a busca. Misturar as duas faz a pessoa procurar um botão de
 * cadastro quando o que ela precisa é limpar o filtro.
 */
export function EmptyState({
  message, descricao, action, icone, className, variante = "vazio",
}: {
  /** O que falta, em uma linha. Sem ponto final: é um título, não uma frase. */
  message: string;
  /** Por que este lugar existe e o que muda quando ele tiver conteúdo. */
  descricao?: string;
  /** O primeiro passo. Um só — dois botões aqui viram uma decisão. */
  action?: ReactNode;
  icone?: ReactNode;
  className?: string;
  variante?: "vazio" | "busca";
}) {
  return (
    <Card className={className}>
      {/* py-14 e não py-12: o vazio precisa de ar em volta, senão parece
          uma mensagem de erro espremida. */}
      <CardContent className="px-6 py-14 text-center flex flex-col items-center">
        <div className="mb-4 text-muted-foreground/40">
          {icone ?? (variante === "busca"
            ? <SearchX className="w-11 h-11" strokeWidth={1.25} />
            : <Inbox   className="w-11 h-11" strokeWidth={1.25} />)}
        </div>

        {/* O título é o degrau que faltava: em `text-sm text-muted-foreground`,
            como era antes, a mensagem tinha o mesmo peso de uma legenda e a
            tela inteira parecia não ter assunto. */}
        <p className="text-base font-medium text-foreground" translate="no">{message}</p>

        {descricao && (
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
            {descricao}
          </p>
        )}

        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ message = "Não foi possível carregar os dados.", onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-12 text-center flex flex-col items-center gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground" translate="no">{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} translate="no">
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}