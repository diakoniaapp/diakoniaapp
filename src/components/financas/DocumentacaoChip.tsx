// ─── DocumentacaoChip — a situação documental de uma obrigação, em um olhar ───────────────────────────────────────────────────────────────────────────────
// Usado na Auditoria de documentos (fila de pendências) e no Extrato de Obrigações. A situação vem da regra única (`lib/documentacaoExigida.ts`); aqui só se desenha: cor (token
// semântico) + forma + palavra, para não depender da cor.
import { ROTULO_DA_GRAVIDADE, ROTULO_DA_SITUACAO_DOCUMENTAL, type Gravidade, type SituacaoDocumental } from "@/lib/documentacaoExigida";

const CLASSE: Record<SituacaoDocumental, string> = {
  sem: "border-destructive-line bg-destructive-soft text-destructive-text",
  parcial: "border-warning-line bg-warning-soft text-warning-text",
  completa: "border-success-line bg-success-soft text-success-text",
  dispensa: "border-border bg-muted text-muted-foreground",
};
const FORMA: Record<SituacaoDocumental, string> = { sem: "○", parcial: "◐", completa: "●", dispensa: "–" };

export function DocumentacaoChip({ situacao }: { situacao: SituacaoDocumental }) {
  const texto = ROTULO_DA_SITUACAO_DOCUMENTAL[situacao];
  return (
    <span data-documentacao={situacao} title={texto}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-bold leading-tight ${CLASSE[situacao]}`}>
      <span aria-hidden>{FORMA[situacao]}</span>{texto}
    </span>
  );
}

const CLASSE_GRAVIDADE: Record<Gravidade, string> = {
  critica: "border-destructive-line bg-destructive-soft text-destructive-text",
  parcial: "border-warning-line bg-warning-soft text-warning-text",
  administrativa: "border-info-line bg-info-soft text-info-text",
};
const FORMA_GRAVIDADE: Record<Gravidade, string> = { critica: "●", parcial: "◐", administrativa: "◆" };

/** 🔴 Crítica · 🟠 Parcial · 🔵 Administrativa — a gravidade da pendência, na fila. */
export function GravidadeChip({ gravidade }: { gravidade: Gravidade }) {
  return (
    <span data-gravidade={gravidade} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px] font-bold leading-tight ${CLASSE_GRAVIDADE[gravidade]}`}>
      <span aria-hidden>{FORMA_GRAVIDADE[gravidade]}</span>{ROTULO_DA_GRAVIDADE[gravidade]}
    </span>
  );
}
