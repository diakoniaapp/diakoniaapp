// ─── CriteriosDoGrupo — POR QUE o agrupamento é 🟢 seguro, 🟡 parcial ou 🔴 inseguro ──────────────────────────
//
// Pedido dela (08/10/2026): "quero entender claramente o motivo". Cada critério da decisão em lote aparece com ✓ ou ✗; o que falha
// traz o detalhe ("valores de R$ 20,00 a R$ 200,00"). O grupo só é seguro quando TODOS passam.

import { Check, X } from "lucide-react";
import type { Criterio, Seguranca } from "@/lib/mesaOfx";

export const SELO: Record<Seguranca, { emoji: string; titulo: string; classe: string }> = {
  seguro: { emoji: "🟢", titulo: "Agrupamento seguro", classe: "text-success-text" },
  parcial: { emoji: "🟡", titulo: "Agrupamento parcial", classe: "text-warning-text" },
  inseguro: { emoji: "🔴", titulo: "Agrupamento inseguro", classe: "text-destructive-text" },
};

export function CriteriosDoGrupo({ criterios }: { criterios: Criterio[] }) {
  return (
    <ul className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2" aria-label="Critérios do agrupamento">
      {criterios.map(c => (
        <li key={c.rotulo} className="flex items-start gap-1.5">
          {c.ok
            ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-text" aria-label="atendido" />
            : <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive-text" aria-label="não atendido" />}
          <span className="min-w-0">
            <span className={c.ok ? "" : "font-medium"}>{c.rotulo}</span>
            {c.detalhe && <span className="text-muted-foreground"> — {c.detalhe}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
