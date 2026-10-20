// ─── DebitoChip — onde está o débito automático, em um olhar ─────────────────────────────────────────────────────────────────────────────────────────────
// 🔵 Débito previsto · 🔵 previsto para hoje · 🟡 Aguardando confirmação bancária · 🔴 Possível falha no débito · ✅ Realizado. A situação vem de `situacaoDoDebito`
// (lib/formaLiquidacao.ts); aqui só se desenha: cor (token semântico) + forma + palavra, para não depender da cor. Usado na Mesa de Operações e no Extrato de Obrigações.
import { GLIFO_DO_DEBITO, ROTULO_DO_DEBITO, type SituacaoDoDebito } from "@/lib/formaLiquidacao";

export const CLASSE_DO_DEBITO: Record<SituacaoDoDebito, string> = {
  previsto: "border-info-line bg-info-soft text-info-text",
  previsto_hoje: "border-info-line bg-info-soft text-info-text font-bold",
  aguardando: "border-warning-line bg-warning-soft text-warning-text",
  nao_encontrado: "border-destructive-line bg-destructive-soft text-destructive-text",
  encontrado: "border-success-line bg-success-soft text-success-text",
};

export function DebitoChip({ situacao }: { situacao: SituacaoDoDebito }) {
  return (
    <span data-debito={situacao} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${CLASSE_DO_DEBITO[situacao]}`}>
      <span aria-hidden>{GLIFO_DO_DEBITO[situacao]}</span>{ROTULO_DO_DEBITO[situacao]}
    </span>
  );
}
