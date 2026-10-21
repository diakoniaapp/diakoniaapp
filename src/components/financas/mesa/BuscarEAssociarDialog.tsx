// ─── BuscarEAssociarDialog — "Buscar e associar a um lançamento que já existe" (a saída quando o motor não achou o par) ──────────────
//
// Aprendido no Omie (20/10/2026): quando a conciliação automática não encontra, a pessoa procura à mão e LIGA — em vez de só poder criar outro.
// Aqui a busca cobre as duas coisas que a linha do extrato pode ter pago: uma conta EM ABERTO (vai para a liquidação) ou um lançamento JÁ
// REGISTRADO nesta conta (vai ser vinculado à linha do banco). Nada é criado.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { brl } from "@/services/finService";
import { buscarParaAssociar, type CandidatoManual, type LinhaAnalisada } from "@/services/importacaoOfxService";

interface Props {
  linha: LinhaAnalisada | null;
  contaId: string;
  ocupado: boolean;
  onFechar: () => void;
  /** a conta em aberto escolhida: segue para a liquidação */
  onLiquidar: (c: CandidatoManual) => void;
  /** o lançamento já registrado escolhido: será vinculado à linha do banco */
  onVincular: (c: CandidatoManual) => void;
}

const dataBr = (ymd: string) => ymd.split("-").reverse().join("/");
const ORIGEM: Record<string, string> = { recorrencia: "recorrência", manual: "à mão", importado_ofx: "outro arquivo OFX", importado_omie: "Omie", nf_quitada_por_terceiro: "nota quitada por terceiro" };

export function BuscarEAssociarDialog({ linha, contaId, ocupado, onFechar, onLiquidar, onVincular }: Props) {
  const [texto, setTexto] = useState("");
  const [soValorIgual, setSoValorIgual] = useState(false);
  const [dias, setDias] = useState(60);
  const [lista, setLista] = useState<CandidatoManual[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tx = linha?.tx;

  useEffect(() => { if (linha) { setTexto(""); setSoValorIgual(false); setDias(60); setLista(null); setErro(null); } }, [linha?.tx.fitid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tx) return;
    let vivo = true;
    setLista(null); setErro(null);
    const t = setTimeout(() => {
      buscarParaAssociar(contaId, tx, { texto, dias, valor: soValorIgual ? tx.valor : undefined })
        .then(r => { if (vivo) setLista(r); })
        .catch(e => { if (vivo) setErro(e?.message ?? "Não foi possível buscar"); });
    }, texto ? 300 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [tx?.fitid, contaId, texto, soValorIgual, dias]); // eslint-disable-line react-hooks/exhaustive-deps

  const nAbertas = useMemo(() => (lista ?? []).filter(c => c.natureza === "em_aberto").length, [lista]);

  return (
    <Dialog open={!!linha} onOpenChange={v => { if (!v) onFechar(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Search className="h-4 w-4" /> Buscar e associar a um lançamento que já existe</DialogTitle>
          <DialogDescription>
            {tx && <>Movimento do banco: <b className="tabular-nums">{tx.tipo === "entrada" ? "+" : "−"}{brl(tx.valor)}</b> em {dataBr(tx.data)} — {tx.memo}.
            Escolha a conta que ele pagou (será liquidada) ou o lançamento que já o registra (será vinculado). Nada novo é criado.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <input type="text" autoFocus aria-label="Buscar por favorecido ou descrição" placeholder="Favorecido ou descrição…" value={texto} onChange={e => setTexto(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={soValorIgual} onChange={e => setSoValorIgual(e.target.checked)} /> só valor igual</label>
          <select aria-label="Período da busca" value={dias} onChange={e => setDias(Number(e.target.value))} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option value={15}>±15 dias</option><option value={60}>±60 dias</option><option value={180}>±180 dias</option>
          </select>
        </div>

        {erro ? <p className="text-sm text-destructive-text" role="alert">{erro}</p>
          : !lista ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Procurando…</p>
          : lista.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado. Amplie o período ou tire o filtro de valor.</p>
          : (
            <>
              <p className="text-xs text-muted-foreground">{lista.length} resultado{lista.length > 1 ? "s" : ""} · {nAbertas} conta{nAbertas !== 1 ? "s" : ""} em aberto · os mais próximos do valor e da data primeiro</p>
              <ul className="divide-y rounded-md border">
                {lista.map(c => {
                  const igual = tx && Math.abs(c.valor - tx.valor) < 0.005;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.rotulo}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className={c.natureza === "em_aberto" ? "text-info-text" : "text-success-text"}>{c.natureza === "em_aberto" ? "Conta em aberto" : "Já registrado"}</span>
                          {" · "}{c.natureza === "em_aberto" ? "vence" : "em"} {dataBr(c.data)} · {ORIGEM[c.origem] ?? c.origem}
                          {c.temMarca && <span className="text-warning-text"> · já ligado a outro identificador do banco</span>}
                        </p>
                      </div>
                      <span className={`tabular-nums ${igual ? "font-semibold text-success-text" : ""}`}>{brl(c.valor)}{igual && " ✓"}</span>
                      <Button type="button" size="sm" variant={c.natureza === "em_aberto" ? "default" : "outline"} className="h-8 text-xs" disabled={ocupado}
                        onClick={() => (c.natureza === "em_aberto" ? onLiquidar(c) : onVincular(c))}>
                        {c.natureza === "em_aberto" ? "Liquidar esta conta" : "Vincular a este lançamento"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      </DialogContent>
    </Dialog>
  );
}
