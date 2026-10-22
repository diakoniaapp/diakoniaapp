// ─── FunilDeAcolhimento — chegou → foi procurado → voltou → pronto para o próximo passo → já virou congregado ──────────────────────────────────────────────────────────────────────────────────────────────
// Cada barra mede quantos visitantes chegaram àquela etapa EM RELAÇÃO A QUEM CHEGOU (o número e a porcentagem estão escritos: a barra só ajuda o olho). Entre uma etapa e a seguinte aparece quantos % seguiram,
// que é onde o acolhimento "vaza". A última etapa são os que já saíram do acolhimento para o vínculo (últimos 90 dias): por isso não é "dentro" das anteriores.
import { Progress } from "@/components/ui/progress";
import type { EtapaDoFunil } from "@/lib/centralDeAcolhimento";

const COR: Record<EtapaDoFunil["chave"], string> = {
  chegaram: "bg-primary", procurados: "bg-info", voltaram: "bg-success", prontos: "bg-gold", congregados: "bg-success",
};

export function FunilDeAcolhimento({ etapas, tarefas }: { etapas: EtapaDoFunil[]; tarefas?: { feitas: number; total: number; pct: number } | null }) {
  return (
    <section aria-label="Funil de acolhimento" className="rounded-lg border bg-card p-4" data-funil>
      <h2 className="text-sm font-bold">Funil de acolhimento</h2>
      <p className="text-xs text-muted-foreground">Da chegada ao próximo passo na jornada.</p>
      <ol className="mt-3 space-y-1">
        {etapas.map((e, i) => {
          const anterior = i > 0 && i < 4 ? etapas[i - 1] : null;
          const seguiram = anterior && anterior.n > 0 ? Math.round((e.n / anterior.n) * 100) : null;
          return (
            <li key={e.chave} data-etapa={e.chave} className={i === 4 ? "pt-2 border-t border-dashed" : ""}>
              {seguiram !== null && <p className="pl-1 text-[11px] text-muted-foreground" data-seguiram>↓ {seguiram}% seguiram</p>}
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium" title={e.dica}>{e.rotulo}</span>
                <span className="shrink-0 tabular-nums"><strong data-n>{e.n}</strong> <span className="text-xs text-muted-foreground">· {e.pct}%</span></span>
              </div>
              <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-muted" role="presentation">
                <div className={`h-full rounded-full ${COR[e.chave]}`} style={{ width: `${e.n > 0 ? Math.max(e.pct, 4) : 0}%` }} data-barra />
              </div>
            </li>
          );
        })}
      </ol>
      {tarefas && tarefas.total > 0 && (
        <div className="mt-3 border-t pt-2" data-tarefas-do-funil>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Tarefas de acolhimento concluídas</span>
            <span className="font-semibold tabular-nums">{tarefas.feitas}/{tarefas.total} · {tarefas.pct}%</span>
          </div>
          <Progress value={tarefas.pct} className="mt-1 h-1.5" />
        </div>
      )}
    </section>
  );
}
