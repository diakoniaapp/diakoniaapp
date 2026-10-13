// ─── PrazosDaQuitacao — "Vencidos" e "Vencem em 7 dias": o tempo da Política, sem depender de alguém abrir uma tela ───────────────────────────────────
//
// Fase 1C-d. Os prazos (formalização do Relatado, esclarecimento da intenção, pagamento do reembolso aprovado) são DERIVADOS pelo banco (vw_fin_quitacao_prazos) de datas que já existem e dos
// parâmetros da Política. O realinhamento diário (pg_cron) cuida do status; esta faixa cuida do olhar: o que já venceu e o que vence esta semana. Some quando não há nada.
import { useEffect, useState } from "react";
import { AlarmClock } from "lucide-react";
import { brl } from "@/services/finService";
import { prazosAbertos, type PrazoAberto, type TipoDePrazo } from "@/services/quitacaoService";

const ROTULO_PRAZO: Record<TipoDePrazo, string> = { formalizacao: "Formalizar o Relatado", esclarecimento: "Esclarecer a intenção", reembolso: "Pagar o reembolso aprovado" };
const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const dias = (n: number) => `${n} dia${n === 1 ? "" : "s"}`;

export function PrazosDaQuitacao({ chave, compacto = false }: { chave: number; compacto?: boolean }) {
  const [itens, setItens] = useState<PrazoAberto[] | null>(null);
  useEffect(() => {
    let vivo = true;
    prazosAbertos().then(l => { if (vivo) setItens(l); }).catch(() => { if (vivo) setItens([]); });
    return () => { vivo = false; };
  }, [chave]);
  if (!itens || itens.length === 0) return null;
  const vencidos = itens.filter(i => i.situacao === "vencido");
  const proximos = itens.filter(i => i.situacao === "vence_em_7_dias");

  return (
    <section aria-label="Prazos da Quitação" className="rounded-lg border bg-card lg:col-span-2">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3 pb-2">
        <h2 className="flex items-center gap-1.5 text-sm font-bold"><AlarmClock className="h-4 w-4 text-warning-text" /> Prazos da Quitação</h2>
        <span className={`text-xs tabular-nums ${vencidos.length ? "font-semibold text-destructive-text" : "text-muted-foreground"}`}>Vencidos · {vencidos.length}</span>
        <span className={`text-xs tabular-nums ${proximos.length ? "font-semibold text-warning-text" : "text-muted-foreground"}`}>Vencem em 7 dias · {proximos.length}</span>
      </header>
      {!compacto && (
        <ul className="divide-y border-t">
          {itens.slice(0, 8).map(i => (
            <li key={`${i.quitacaoId}-${i.prazo}`} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.emitente ?? "Despesa"}{i.responsavelNome ? ` · ${i.responsavelNome}` : ""}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {ROTULO_PRAZO[i.prazo]} · limite {dataBr(i.limite)} · {i.situacao === "vencido" ? `venceu há ${dias(Math.abs(i.diasRestantes))}` : i.diasRestantes === 0 ? "vence hoje" : `vence em ${dias(i.diasRestantes)}`}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{brl(i.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      {itens.length > 8 && !compacto && <p className="border-t px-4 py-1.5 text-xs text-muted-foreground">+ {itens.length - 8} outros prazos.</p>}
    </section>
  );
}
