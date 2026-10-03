// ─── CoberturaDocumentalCard.tsx — o KPI oficial, no topo da Central ─────────
//
// Pedido da Telma (03/10/2026): um card logo no topo da Central de Documentos com
//
//     Cobertura Documental · 2026 · 0,3% documentado · 2 de 772 lançamentos
//
// e, depois da Central implantada, a trilha 0,3% → 15% → 45% → 80% (meta 80%,
// meta ideal 95%). A conta é a da Auditoria de documentos (`resumirAuditoria`):
// saídas pagas que EXIGEM documento (sem tarifas bancárias) e que TÊM anexo.
// Definição e linha de base: `lib/documentos/cobertura.ts`.

import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { resumirAuditoria } from "@/lib/pacoteContabil";
import {
  COBERTURA_LINHA_DE_BASE, COBERTURA_META, COBERTURA_META_IDEAL,
  faltaParaOProximo, formatarPercentual, marcosDaTrilha, percentualCobertura,
} from "@/lib/documentos/cobertura";
import { auditarPeriodo } from "@/services/pacoteContabilService";

interface Props {
  ano?: number;
  /** Muda quando algo foi gravado: o card recalcula. */
  atualizacao?: number;
}

export function CoberturaDocumentalCard({ ano = new Date().getFullYear(), atualizacao = 0 }: Props) {
  const [dados, setDados] = useState<{ com: number; exigem: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    auditarPeriodo(`${ano}-01-01`, `${ano}-12-31`)
      .then(linhas => {
        if (!vivo) return;
        const r = resumirAuditoria(linhas);
        setDados({ com: r.com, exigem: r.com + r.sem });
      })
      .catch(e => vivo && setErro(e?.message ?? "Erro ao medir a cobertura"));
    return () => { vivo = false; };
  }, [ano, atualizacao]);

  const pct = dados ? percentualCobertura(dados.com, dados.exigem) : 0;
  const marcos = marcosDaTrilha(pct);
  const falta = dados ? faltaParaOProximo(pct) : null;
  const largura = Math.min(100, Math.max(pct, dados && pct > 0 ? 0.6 : 0)); // 0,3% ainda precisa ser visível

  return (
    <Card aria-label="Cobertura documental">
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5 text-gold" /> Cobertura Documental
            </p>
            <p className="text-sm text-muted-foreground tabular-nums">{ano}</p>
          </div>

          <div className="text-left sm:text-right">
            {dados ? (
              <>
                <p className="font-serif text-4xl leading-none tabular-nums">
                  {formatarPercentual(pct)}%
                  <span className="ml-2 text-base font-sans text-muted-foreground">documentado</span>
                </p>
                <p className="text-sm text-muted-foreground tabular-nums mt-1.5">
                  <strong className="text-foreground">{dados.com}</strong> de{" "}
                  <strong className="text-foreground">{dados.exigem}</strong> lançamentos
                </p>
              </>
            ) : erro ? (
              <p className="text-sm text-destructive-text">{erro}</p>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Medindo…
              </p>
            )}
          </div>
        </div>

        {/* Trilha: 0 ───●─────── 15 ──── 45 ──────── 80 meta ── 95 ideal */}
        <div>
          <div
            className="relative h-2.5 rounded-full bg-muted"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 10) / 10}
            aria-label={`Cobertura documental de ${ano}: ${formatarPercentual(pct)}%`}
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-gold" style={{ width: `${largura}%` }} />
            {[15, 45, COBERTURA_META, COBERTURA_META_IDEAL].map(m => (
              <span key={m} className="absolute top-[-3px] bottom-[-3px] w-px bg-foreground/35" style={{ left: `${m}%` }} aria-hidden />
            ))}
          </div>
          <div className="relative h-5 mt-1 text-[11px] text-muted-foreground tabular-nums" aria-hidden>
            {[
              { m: 15, t: "15%" }, { m: 45, t: "45%" },
              { m: COBERTURA_META, t: `Meta ${COBERTURA_META}%` }, { m: COBERTURA_META_IDEAL, t: `Ideal ${COBERTURA_META_IDEAL}%` },
            ].map(x => (
              <span key={x.m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x.m}%` }}>{x.t}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm tabular-nums" aria-label="Trilha de acompanhamento">
            {marcos.map((m, i) => (
              <li key={m.valor} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground" aria-hidden>→</span>}
                <span
                  className={
                    m.atingido ? "px-2 py-0.5 rounded-md bg-success-soft text-success-text font-medium"
                    : m.proximo ? "px-2 py-0.5 rounded-md border border-gold/60 text-foreground font-medium"
                    : "px-2 py-0.5 rounded-md text-muted-foreground"
                  }
                  aria-current={m.proximo ? "step" : undefined}
                >
                  {formatarPercentual(m.valor)}%
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            {falta
              ? <>Faltam <strong className="text-foreground tabular-nums">{formatarPercentual(Math.ceil(falta.pontos * 10) / 10)}</strong> pontos para {formatarPercentual(falta.alvo)}%</>
              : dados ? "Meta ideal alcançada." : null}
            {" · "}
            <span title="Medido em 03/10/2026, antes da Central de Documentos">
              linha de base {formatarPercentual(COBERTURA_LINHA_DE_BASE.percentual)}% ({COBERTURA_LINHA_DE_BASE.comDocumento} de {COBERTURA_LINHA_DE_BASE.exigem})
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
