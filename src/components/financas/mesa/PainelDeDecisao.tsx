// ─── PainelDeDecisao — as peças do painel da Central de decisões (conciliação OFX) ─────────────────────────────────────────────────────────────────────────────
//
// Pedido dela (20/10/2026): "quero que a tela fique assim" — cabeçalho do movimento, uma CAIXA com a resposta ("Este movimento já parece estar registrado"), e logo abaixo uma
// lista curta de AÇÕES, uma por linha: a principal destacada (com a tecla Enter), "Buscar e associar" sempre presente (tecla /), as saídas ("Não é este…", "Ignorar").
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { brl } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/** O movimento do banco: o texto em destaque e, abaixo, dia · conta · sentido · valor. */
export function CabecalhoDoPainel({ linha, contaNome }: { linha: Pick<LinhaAnalisada, "tx">; contaNome: string }) {
  const { tx } = linha;
  const entrada = tx.tipo === "entrada";
  return (
    <div className="border-b pb-2">
      <p className="truncate text-sm font-semibold" title={tx.memo}>{tx.memo}</p>
      <p className="text-xs text-muted-foreground">
        {dataCurta(tx.data)} · {contaNome} · {entrada ? "entrada" : "saída"} ·{" "}
        <b className={cn("tabular-nums", entrada ? "text-success-text" : "text-destructive-text")}>{entrada ? "+" : "−"} {brl(tx.valor)}</b>
      </p>
    </div>
  );
}

export type TomDaCaixa = "h0" | "h1" | "h2" | "h3" | "h4" | "ok";
const CAIXA: Record<TomDaCaixa, { caixa: string; titulo: string }> = {
  h0: { caixa: "border-warning-line bg-warning-soft/50", titulo: "text-warning-text" },
  h1: { caixa: "border-success-line bg-success-soft/50", titulo: "text-success-text" },
  h2: { caixa: "border-info-line bg-info-soft/50", titulo: "text-info-text" },
  h3: { caixa: "border-info-line bg-info-soft/50", titulo: "text-info-text" },
  h4: { caixa: "border-border bg-muted/50", titulo: "text-foreground" },
  ok: { caixa: "border-success-line bg-success-soft/50", titulo: "text-success-text" },
};

/** A resposta à pergunta "o que este movimento é?": título forte, o achado, e o porquê em letra miúda. */
export function CaixaDeResposta({ tom, titulo, children, porque }: { tom: TomDaCaixa; titulo: ReactNode; children?: ReactNode; porque?: ReactNode }) {
  return (
    <div role="note" className={cn("rounded-md border p-2.5 text-xs", CAIXA[tom].caixa)}>
      <p className={cn("text-sm font-semibold", CAIXA[tom].titulo)}>{titulo}</p>
      {children && <p className="mt-0.5">{children}</p>}
      {porque && <p className="mt-0.5 text-[11px] text-muted-foreground">{porque}</p>}
    </div>
  );
}

export const ListaDeAcoes = ({ children }: { children: ReactNode }) => <div className="grid gap-1.5" role="group" aria-label="Ações">{children}</div>;

const ACAO = {
  principal: "border-success bg-success text-success-foreground font-semibold hover:bg-success/90",
  azul: "border-info bg-info text-white font-semibold hover:opacity-90",
  fixa: "border-dashed bg-background hover:bg-muted",
  normal: "bg-background hover:bg-muted",
  discreta: "border-transparent text-muted-foreground hover:bg-muted",
} as const;

/** Uma ação do painel: uma linha inteira, ícone + rótulo + (à direita) a tecla ou a dica. */
export function AcaoDoPainel({ variante = "normal", icone, atalho, dica, onClick, disabled, title, children }: {
  variante?: keyof typeof ACAO; icone?: ReactNode; atalho?: string; dica?: string; onClick?: () => void; disabled?: boolean; title?: string; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={cn("flex w-full min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50", ACAO[variante])}>
      {icone && <span className="flex shrink-0 items-center" aria-hidden>{icone}</span>}
      <span className="min-w-0 flex-1">{children}</span>
      {(atalho || dica) && <span className={cn("shrink-0 text-[11px] font-normal", variante === "principal" || variante === "azul" ? "opacity-80" : "text-muted-foreground")}>{atalho ?? dica}</span>}
    </button>
  );
}
