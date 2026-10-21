// ─── ListaDeMovimentos — a lista da Central de decisões (conciliação OFX) ────────────────────────────────────────────────────────────────────────────────────────
//
// À esquerda, UMA linha por movimento do extrato: dia, texto do banco, valor e a HIPÓTESE (H0 já registrado · H1 conta em aberto · H2 recorrência · H3 transferência/débito ·
// H4 nada encontrado). A decisão em si fica no painel ao lado — aqui só se escolhe qual movimento olhar (o Omie faz igual: tabela + um painel por vez).
// No celular não há "ao lado": o painel da linha selecionada abre logo abaixo dela (`painelInline`).
import { type ReactNode } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { brl } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import { ROTULO_DA_HIPOTESE, resolverMovimento, type Resolucao } from "@/lib/resolverMovimento";

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

const COR_DA_HIPOTESE: Record<Resolucao["h"], string> = {
  H0: "border-warning-line bg-warning-soft text-warning-text",
  H1: "border-success-line bg-success-soft text-success-text",
  H2: "border-info-line bg-info-soft text-info-text",
  H3: "border-info-line bg-info-soft text-info-text",
  H4: "border-border bg-muted text-muted-foreground",
  resolvida: "border-border bg-muted/50 text-muted-foreground",
};
const COR_DA_BANDA: Record<string, string> = {
  identificada: "border-success-line bg-success-soft text-success-text",
  revisar: "border-warning-line bg-warning-soft text-warning-text",
  nao_identificada: "border-destructive-line bg-destructive-soft text-destructive-text",
};

/** O texto curto do chip: a hipótese e, no H4, o quanto o sistema acredita na classificação sugerida. */
export function chipDaLinha(l: LinhaAnalisada, lancadaAgora: boolean): { texto: string; classe: string; dica: string } {
  if (lancadaAgora) return { texto: "lançado", classe: "border-success-line bg-success-soft text-success-text", dica: "gravado agora — dá para desfazer" };
  const r = resolverMovimento(l);
  if (r.h === "H4" && l.sugestao) {
    return { texto: `${l.sugestao.confianca}% · ${l.sugestao.banda === "identificada" ? "identificada" : l.sugestao.banda === "revisar" ? "revisar" : "não identif."}`, classe: COR_DA_BANDA[l.sugestao.banda] ?? COR_DA_HIPOTESE.H4, dica: `${ROTULO_DA_HIPOTESE.H4} — ${l.sugestao.motivos.join(" · ")}` };
  }
  if (r.h === "resolvida") return { texto: r.motivo === "ignorada" ? "ignorada" : "já registrada", classe: COR_DA_HIPOTESE.resolvida, dica: ROTULO_DA_HIPOTESE.resolvida };
  const sufixo = r.h === "H0" ? (r.modo === "vincular" ? " · vincular" : r.modo === "conciliar" ? " · conciliar" : " · parecidos")
    : r.h === "H3" ? (r.modo === "debito" ? " · débito" : " · transf.") : "";
  return { texto: `${r.h}${sufixo}`, classe: COR_DA_HIPOTESE[r.h], dica: ROTULO_DA_HIPOTESE[r.h] };
}

interface Props {
  itens: LinhaAnalisada[];
  selecionada: string | null;
  confirmadas: ReadonlyMap<string, string[]>;
  marcadas: ReadonlySet<string>;
  /** a linha pode ser marcada para o lote ("Lançar marcadas")? */
  podeMarcar: (l: LinhaAnalisada) => boolean;
  ocupado: boolean;
  onSelecionar: (fitid: string) => void;
  onMarcar: (fitid: string, v: boolean) => void;
  onDesfazer: (fitid: string, ids: string[]) => void;
  /** celular: o painel abre logo abaixo da linha selecionada */
  painelInline?: ReactNode;
}

export function ListaDeMovimentos({ itens, selecionada, confirmadas, marcadas, podeMarcar, ocupado, onSelecionar, onMarcar, onDesfazer, painelInline }: Props) {
  return (
    <ul className="divide-y rounded-md border text-sm" aria-label="Movimentos do extrato">
      {itens.map(l => {
        const fitid = l.tx.fitid;
        const entrada = l.tx.tipo === "entrada";
        const lancada = confirmadas.get(fitid);
        const chip = chipDaLinha(l, !!lancada);
        const sel = fitid === selecionada;
        return (
          <li key={fitid} data-fitid={fitid} data-selecionada={sel ? "true" : undefined} className={`min-w-0 ${sel ? "bg-primary/5" : ""}`}>
            <div className={`flex min-w-0 items-center gap-2 px-2.5 py-1.5 ${sel ? "border-l-2 border-primary" : "border-l-2 border-transparent"}`}>
              {podeMarcar(l) && !lancada
                ? <Checkbox aria-label={`Marcar ${l.tx.memo}`} checked={marcadas.has(fitid)} disabled={ocupado} onCheckedChange={c => onMarcar(fitid, c === true)} />
                : <span className="w-4 shrink-0" aria-hidden>{lancada ? <CheckCircle2 className="h-4 w-4 text-success-text" /> : null}</span>}
              <button type="button" aria-current={sel ? "true" : undefined} onClick={() => onSelecionar(fitid)}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left sm:grid sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto]">
                {/* celular: o texto do banco ocupa a 1ª linha; dia, valor e hipótese vêm na 2ª */}
                <span className="order-2 text-xs tabular-nums text-muted-foreground sm:order-none">{dataCurta(l.tx.data)}</span>
                <span className={`order-1 min-w-0 basis-full truncate sm:order-none sm:basis-auto ${lancada ? "text-muted-foreground" : ""}`} title={l.tx.memo}>{l.tx.memo}</span>
                <span className={`order-3 ml-auto text-right tabular-nums sm:order-none sm:ml-0 ${lancada ? "text-muted-foreground" : entrada ? "text-success-text" : "text-destructive-text"}`}>{entrada ? "+" : "−"}{brl(l.tx.valor)}</span>
                <span title={chip.dica} className={`order-4 rounded-full border px-2 py-0.5 text-[11px] tabular-nums whitespace-nowrap sm:order-none ${chip.classe}`}>{chip.texto}</span>
              </button>
              {lancada && (
                <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-1.5 text-xs" disabled={ocupado} onClick={() => onDesfazer(fitid, lancada)}>
                  <Undo2 className="h-3 w-3" /> Desfazer
                </Button>
              )}
            </div>
            {sel && painelInline && <div className="min-w-0 border-t bg-card px-3 py-2.5">{painelInline}</div>}
          </li>
        );
      })}
    </ul>
  );
}
