// ─── ListaDeMovimentos — a lista da Central de decisões (conciliação OFX) ────────────────────────────────────────────────────────────────────────────────────────
//
// À esquerda, UMA linha por movimento do extrato, em tabela: DATA · MOVIMENTO · VALOR · HIPÓTESE (H0 registrado · H1 conta · H2 recorrência · H3 transf. · H4 nada achado ·
// resolvido). A decisão em si fica no painel ao lado — aqui só se escolhe qual movimento olhar (o Omie faz igual). No celular não há "ao lado": o painel da linha
// selecionada abre logo abaixo dela (`painelInline`).
import { type ReactNode } from "react";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import { ROTULO_DA_HIPOTESE, resolverMovimento, type Resolucao } from "@/lib/resolverMovimento";

const dataCurta = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const valorCurto = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const COR_DA_HIPOTESE: Record<Resolucao["h"], string> = {
  H0: "border-warning-line bg-warning-soft text-warning-text",
  H1: "border-success-line bg-success-soft text-success-text",
  H2: "border-info-line bg-info-soft text-info-text",
  H3: "border-info-line bg-info-soft text-info-text",
  H4: "border-border bg-muted text-muted-foreground",
  resolvida: "border-transparent bg-muted/60 text-muted-foreground",
};

/**
 * O texto curto do chip — SEM as siglas H0–H4 (21/10/2026: "o tesoureiro não deve precisar entender a arquitetura"): diz o que o sistema acredita que o movimento é
 * ("Dízimo", "Dízimo?" quando é só provável, "Conta em aberto", "Recorrência"…) e a dica (passar o mouse) explica a sugestão com a confiança e os motivos.
 */
export function chipDaLinha(l: LinhaAnalisada, lancadaAgora: boolean, categoriaSugerida?: string | null): { texto: string; classe: string; dica: string } {
  if (lancadaAgora) return { texto: "lançado", classe: "border-success-line bg-success-soft text-success-text", dica: "gravado agora — dá para desfazer" };
  const r = resolverMovimento(l);
  if (r.h === "resolvida") return { texto: "resolvido", classe: COR_DA_HIPOTESE.resolvida, dica: r.motivo === "ignorada" ? "ignorado" : "já registrado pelo mesmo identificador do banco" };
  if (r.h === "H4") {
    const s = l.sugestao;
    if (s && categoriaSugerida) {
      const certa = s.banda === "identificada";
      return {
        texto: `${categoriaSugerida}${certa ? "" : "?"}`, classe: COR_DA_HIPOTESE.H4,
        dica: `${categoriaSugerida} sugerido — confiança ${s.confianca}%${s.motivos.length ? ` · ${s.motivos.join(" · ")}` : ""}`,
      };
    }
    return { texto: "Sem sugestão", classe: COR_DA_HIPOTESE.H4, dica: "Nada no histórico lembra este movimento — escolha a classificação" };
  }
  const texto = r.h === "H0" ? (r.modo === "vincular" ? "Já registrado" : r.modo === "conciliar" ? "Conciliar" : "Parecidos")
    : r.h === "H1" ? "Conta em aberto" : r.h === "H2" ? "Recorrência" : r.modo === "debito" ? "Débito automático" : "Transferência";
  return { texto, classe: COR_DA_HIPOTESE[r.h], dica: ROTULO_DA_HIPOTESE[r.h] };
}

interface Props {
  itens: LinhaAnalisada[];
  selecionada: string | null;
  confirmadas: ReadonlyMap<string, string[]>;
  ocupado: boolean;
  /** o nome curto da categoria que o sistema sugere (o chip do H4: "H4 dízimo?") */
  categoriaSugerida?: (l: LinhaAnalisada) => string | null;
  onSelecionar: (fitid: string) => void;
  onDesfazer: (fitid: string, ids: string[]) => void;
  /** celular: o painel abre logo abaixo da linha selecionada */
  painelInline?: ReactNode;
  /** "1–50 de 166" */
  rodape?: string;
}

const COLUNAS = "sm:grid sm:grid-cols-[2.75rem_minmax(0,1fr)_5.5rem_8.5rem]";

export function ListaDeMovimentos({ itens, selecionada, confirmadas, ocupado, categoriaSugerida, onSelecionar, onDesfazer, painelInline, rodape }: Props) {
  return (
    <div className="overflow-hidden rounded-md border bg-card text-sm">
      <div className={`hidden gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground ${COLUNAS}`} aria-hidden>
        <span>Data</span><span>Movimento</span><span className="text-right">Valor</span><span>Sugestão</span>
      </div>
      <ul className="divide-y" aria-label="Movimentos do extrato">
        {itens.map(l => {
          const fitid = l.tx.fitid;
          const entrada = l.tx.tipo === "entrada";
          const lancada = confirmadas.get(fitid);
          const chip = chipDaLinha(l, !!lancada, categoriaSugerida?.(l));
          const sel = fitid === selecionada;
          return (
            <li key={fitid} data-fitid={fitid} data-selecionada={sel ? "true" : undefined} className={`min-w-0 ${sel ? "bg-primary/10" : ""}`}>
              <div className={`flex min-w-0 items-center gap-1 border-l-[3px] pr-2 ${sel ? "border-primary" : "border-transparent"}`}>
                <button type="button" aria-current={sel ? "true" : undefined} onClick={() => onSelecionar(fitid)}
                  className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-2 text-left sm:gap-y-0 ${COLUNAS} sm:items-center`}>
                  {/* celular: o texto do banco ocupa a 1ª linha; dia, valor e hipótese vêm na 2ª */}
                  <span className="order-2 text-xs tabular-nums text-muted-foreground sm:order-none">{dataCurta(l.tx.data)}</span>
                  <span className={`order-1 min-w-0 basis-full truncate sm:order-none sm:basis-auto ${lancada ? "text-muted-foreground" : ""}`} title={l.tx.memo}>{l.tx.memo}</span>
                  <span className={`order-3 ml-auto text-right font-semibold tabular-nums sm:order-none sm:ml-0 ${lancada ? "text-muted-foreground" : entrada ? "text-success-text" : "text-destructive-text"}`}>{valorCurto(l.tx.valor)}</span>
                  <span title={chip.dica} className={`order-4 inline-flex max-w-[8.5rem] items-center justify-center gap-1 truncate rounded border px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap sm:order-none ${chip.classe}`}>
                    {lancada && <CheckCircle2 className="h-3 w-3" aria-hidden />}{chip.texto}
                  </span>
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
      <p className="border-t px-3 py-1.5 text-[11.5px] text-muted-foreground">
        {rodape ? `${rodape} · ` : ""}<span className="hidden md:inline">↑ ↓ navega · Enter executa a ação principal · / abre “Buscar e associar”</span><span className="md:hidden">toque num movimento para decidir</span>
      </p>
    </div>
  );
}
