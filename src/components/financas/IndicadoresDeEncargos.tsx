import { useEffect, useState } from "react";
import { brl } from "@/services/finService";
import { totaisDeEncargosNoPeriodo } from "@/services/encargosService";
import type { TotaisDeEncargos } from "@/lib/encargos";

/**
 * Total de Juros · Total de Multas · Total de Descontos do período — SÓ informativo. O valor pago já está na categoria da obrigação (ex.: "Impostos e Taxas"),
 * então estes números NÃO se somam a nada e não criam linha no DRE nem no orçamento. Some quando não houve encargo no período (ou a migration não foi aplicada).
 */
export function IndicadoresDeEncargos({ de, ate, className = "" }: { de: string; ate: string; className?: string }) {
  const [t, setT] = useState<TotaisDeEncargos | null>(null);

  useEffect(() => {
    let vivo = true;
    setT(null);
    totaisDeEncargosNoPeriodo(de, ate).then(r => { if (vivo) setT(r); }).catch(() => { if (vivo) setT(null); });
    return () => { vivo = false; };
  }, [de, ate]);

  if (!t || t.comIndicador === 0) return null;
  const itens = [
    { rotulo: "Total de Juros", valor: t.juros, menos: false },
    { rotulo: "Total de Multas", valor: t.multas, menos: false },
    { rotulo: "Total de Descontos", valor: t.descontos, menos: true },
  ];
  return (
    <div className={`rounded-md border bg-muted/30 px-3 py-2 ${className}`} aria-label="Juros, multas e descontos do período (informativo)">
      <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {itens.map(i => (
          <div key={i.rotulo} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{i.rotulo}</dt>
            <dd className="text-sm font-semibold tabular-nums">{i.menos && i.valor > 0 ? "− " : ""}{brl(i.valor)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Informativo: o valor pago de cada obrigação já está na sua categoria ({t.comIndicador} {t.comIndicador === 1 ? "obrigação" : "obrigações"} com juros, multa ou desconto). Não é linha do DRE nem do orçamento.
      </p>
    </div>
  );
}
