import { useCallback, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { VazioCtx, type ReportarVazio } from "@/components/hoje/vazio";

/**
 * Faixa da tela HOJE que se apaga sozinha quando não tem o que mostrar.
 *
 * A regra "bloco vazio não existe" não se resolve no CSS: quem sabe se há
 * conteúdo é o widget, depois de consultar o banco. Então o widget avisa,
 * por contexto, e a faixa se esconde.
 *
 * Detalhe de implementação que evita um laço: a faixa usa `hidden` em vez
 * de devolver null. Se devolvesse null, o filho desmontaria, o aviso se
 * perderia, a faixa voltaria a aparecer e o ciclo recomeçaria. Com
 * `hidden` o filho continua montado — sai do layout e da árvore de
 * acessibilidade, mas segue reportando.
 *
 * Widget que não reporta nada continua visível, então converter os widgets
 * existentes é incremental: nenhum quebra por não ter sido convertido.
 */

export type TomBloco = "trava" | "tarefa" | "gente" | "agenda";

const TOM: Record<TomBloco, { faixa: string; titulo: string }> = {
  trava:  { faixa: "border-destructive/40 bg-destructive/5", titulo: "text-destructive" },
  tarefa: { faixa: "border-gold/40 bg-gold/5",               titulo: "text-gold" },
  gente:  { faixa: "border-border bg-card",                  titulo: "text-foreground" },
  agenda: { faixa: "border-border bg-card",                  titulo: "text-foreground" },
};

interface Props {
  titulo: string;
  subtitulo?: string;
  tom: TomBloco;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}

export function BlocoHoje({ titulo, subtitulo, tom, icon: Icon, children }: Props) {
  const [vazio, setVazio] = useState(false);
  const reportar = useCallback<ReportarVazio>((v) => setVazio(v), []);
  const cor = TOM[tom];

  return (
    <VazioCtx.Provider value={reportar}>
      <section
        hidden={vazio}
        aria-hidden={vazio || undefined}
        className={`rounded-lg border ${cor.faixa} p-4 space-y-3`}
      >
        <div className="flex items-baseline gap-2">
          {Icon && <Icon className={`w-4 h-4 shrink-0 ${cor.titulo}`} />}
          <h2 className={`font-serif text-base leading-none ${cor.titulo}`}>{titulo}</h2>
          {subtitulo && (
            <span className="text-xs text-muted-foreground truncate">{subtitulo}</span>
          )}
        </div>
        {children}
      </section>
    </VazioCtx.Provider>
  );
}

export default BlocoHoje;
