// ─── DataDoPagamento — "quando o dinheiro saiu?", sugerido pelo comprovante e decidido pela pessoa ───
//
// Pedido dela (14/10/2026): o "Pagar" gravava HOJE (a data do registro) — um Pix de 28/09 registrado em 03/10 ficava com 03/10 e não
// batia com o extrato nem com o OFX. Com um comprovante (escolhido no diálogo ou já anexado à despesa), o sistema LÊ a data da operação
// e a SUGERE; a pessoa escolhe "Usar data sugerida" ou "Alterar manualmente" (e aí diz por quê). Sem comprovante, ou se a leitura
// não achar data, vale hoje — editável. Nada é decidido sozinho: com sugestão na tela, o "Marcar como pago" espera a escolha.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck2, Loader2, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { hojeLocal } from "@/lib/data";
import { ROTULO_CONFIANCA, ROTULO_TIPO } from "@/lib/documentos/comprovante";
import {
  comprovanteJaAnexado, decisaoDe, lerTextoDoComprovante, textoDoComprovante,
  type ComprovanteLido, type TextoDoComprovante,
} from "@/services/comprovanteService";

export interface EstadoDaDataDoPagamento {
  data: string;
  /** pode confirmar? (data válida e, havendo sugestão, a escolha feita — com motivo se mudou) */
  pronto: boolean;
  problema: string | null;
  /** o comprovante lido (para a auditoria); null sem comprovante */
  comprovante: ComprovanteLido | null;
  motivo: string | null;
}

// O OCR baixa o motor pela internet na primeira vez e pode demorar: passado o teto, a leitura vale como "não identificada" (o pagamento nunca fica preso nela).
const TETO_DA_LEITURA_MS = 45_000;
const comTeto = <T,>(p: Promise<T>) => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("tempo esgotado")), TETO_DA_LEITURA_MS))]);

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COR: Record<string, string> = { alta: "text-success-text", media: "text-warning-text", baixa: "text-destructive-text" };

export function DataDoPagamento({ lancamentoId, arquivo, valorEsperado, onMudar }: {
  lancamentoId: string;
  /** o comprovante escolhido agora no diálogo (tem prioridade sobre o já anexado) */
  arquivo: File | null;
  /** o que saiu do banco segundo a tela — para conferir com o valor do comprovante */
  valorEsperado: number | null;
  onMudar: (e: EstadoDaDataDoPagamento) => void;
}) {
  const hoje = hojeLocal();
  const [texto, setTexto] = useState<TextoDoComprovante | null>(null);
  const [lendo, setLendo] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [data, setData] = useState(hoje);
  const [modo, setModo] = useState<"sem_comprovante" | "pendente" | "sugerida" | "manual" | "sem_sugestao">("sem_comprovante");
  const [motivo, setMotivo] = useState("");

  // o comprovante JÁ anexado à despesa (antes de pagar): lido ao abrir, se nada foi escolhido no diálogo
  useEffect(() => {
    if (arquivo) return;
    let vivo = true;
    setTexto(null); setFalhou(false);   // tirou o arquivo escolhido: a leitura dele não vale mais
    (async () => {
      const f = await comprovanteJaAnexado(lancamentoId).catch(() => null);
      if (!f || !vivo) return;
      setLendo(true);
      try { const t = await comTeto(textoDoComprovante(f, "anexado")); if (vivo) setTexto(t); }
      catch { if (vivo) setFalhou(true); }
      finally { if (vivo) setLendo(false); }
    })();
    return () => { vivo = false; };
  }, [lancamentoId, arquivo]);

  // o comprovante escolhido agora
  useEffect(() => {
    if (!arquivo) return;
    let vivo = true;
    setLendo(true); setFalhou(false); setTexto(null);
    comTeto(textoDoComprovante(arquivo, "agora"))
      .then(t => { if (vivo) setTexto(t); })
      .catch(() => { if (vivo) setFalhou(true); })
      .finally(() => { if (vivo) setLendo(false); });
    return () => { vivo = false; };
  }, [arquivo]);

  const lido = useMemo(() => (texto ? lerTextoDoComprovante(texto, valorEsperado) : null), [texto, valorEsperado]);
  const sugerida = lido?.leitura.data ?? null;

  // nova leitura ⇒ nova decisão (nunca herda a escolha feita sobre outro comprovante)
  useEffect(() => {
    setMotivo("");
    if (!texto && !falhou) { setModo("sem_comprovante"); setData(hoje); return; }
    if (sugerida) { setModo("pendente"); setData(hoje); } else { setModo("sem_sugestao"); setData(hoje); }
  }, [texto, falhou, sugerida, hoje]);

  const decisao = decisaoDe(sugerida, data);
  const problema = useMemo(() => {
    if (lendo) return "Aguarde a leitura do comprovante.";
    if (!data) return "Informe a data do pagamento.";
    if (data > hoje) return "A data do pagamento não pode ser futura.";
    if (modo === "pendente") return "Escolha: usar a data do comprovante ou alterar manualmente.";
    if (modo === "manual" && decisao === "alterou" && !motivo.trim()) return "Diga por que a data é diferente da do comprovante.";
    return null;
  }, [lendo, data, hoje, modo, decisao, motivo]);

  useEffect(() => {
    onMudar({ data, pronto: !problema, problema, comprovante: lido, motivo: motivo.trim() || null });
  }, [data, problema, lido, motivo, onMudar]);

  const l = lido?.leitura;
  return (
    <div className="space-y-2 rounded-md border p-2.5">
      <p className="text-xs font-medium flex items-center gap-1.5"><CalendarCheck2 className="w-3.5 h-3.5 text-gold" /> Data do pagamento</p>

      {lendo && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo o comprovante para achar a data da operação…</p>}

      {!lendo && l && sugerida && (
        <div className="rounded-md bg-muted/30 p-2.5 space-y-1.5" aria-live="polite">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ScanSearch className="w-3.5 h-3.5" /> {ROTULO_TIPO[l.tipo]}{l.banco ? ` · ${l.banco}` : ""} · {texto?.origem === "anexado" ? "comprovante já anexado" : "comprovante escolhido"}
          </p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
            <dt className="text-muted-foreground">Data sugerida pelo comprovante</dt><dd className="font-semibold tabular-nums">{dataBr(sugerida)}</dd>
            {l.hora && <><dt className="text-muted-foreground">Horário</dt><dd className="tabular-nums">{l.hora}</dd></>}
            {l.valor != null && <><dt className="text-muted-foreground">Valor encontrado</dt><dd className="tabular-nums">{brl(l.valor)}</dd></>}
            {l.confianca && <><dt className="text-muted-foreground">Confiança</dt><dd className={`font-medium ${COR[l.confianca]}`}>{ROTULO_CONFIANCA[l.confianca]}</dd></>}
          </dl>
          {l.motivos.length > 0 && <p className="text-2xs text-muted-foreground">{l.motivos.join(" · ")}</p>}
          {l.avisos.map(a => (
            <p key={a} className="text-xs text-warning-text flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {a}</p>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant={modo === "sugerida" ? "default" : "outline"}
              onClick={() => { setData(sugerida); setModo("sugerida"); setMotivo(""); }}>
              Usar data sugerida
            </Button>
            <Button type="button" size="sm" variant={modo === "manual" ? "default" : "outline"} onClick={() => setModo("manual")}>
              Alterar manualmente
            </Button>
          </div>
        </div>
      )}

      {!lendo && (falhou || (texto && !sugerida)) && (
        <p className="text-xs text-warning-text flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Não foi possível identificar a data do comprovante. Confira no extrato e ajuste se não foi hoje.
        </p>
      )}
      {!lendo && l && !sugerida && l.avisos.map(a => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}

      {modo !== "pendente" && modo !== "sugerida" && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="data-pagamento" className="text-xs text-muted-foreground">
            {modo === "manual" ? "Data escolhida" : "Data em que o dinheiro saiu"}
          </label>
          <Input id="data-pagamento" type="date" max={hoje} value={data} onChange={e => setData(e.target.value)} className="h-9 w-auto" />
          {modo === "sem_comprovante" && <span className="text-2xs text-muted-foreground">Anexe o comprovante para o sistema sugerir a data.</span>}
        </div>
      )}
      {modo === "sugerida" && <p className="text-xs text-success-text">Pagamento em {dataBr(data)}, a data do comprovante.</p>}
      {modo === "manual" && decisao === "alterou" && (
        <div className="space-y-1">
          <label htmlFor="motivo-data" className="text-xs text-muted-foreground">Por que a data é diferente da do comprovante ({sugerida && dataBr(sugerida)})?</label>
          <Textarea id="motivo-data" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: o extrato mostra o débito no dia seguinte" />
        </div>
      )}
      {problema && !lendo && modo !== "sem_comprovante" && <p className="text-xs text-muted-foreground" role="status">{problema}</p>}
    </div>
  );
}
