// ─── Resumo do período em UMA linha — Saldo inicial · Entradas · Saídas · Movimento · Saldo final ───────────────────────────────────────────────────────────
//
// Eram cinco cartões (64 px + respiro); agora é uma linha de texto (21/10/2026). Entradas e saídas mantêm a cor; no celular só Entradas · Saídas · Saldo final
// (o saldo inicial já aparece como a primeira linha da lista e o movimento é a diferença). "Só vencidos em aberto" não tem saldo (sem chão de data): mostra contagem e total.
import { TrendingDown, TrendingUp } from "lucide-react";
import { brl } from "@/services/finService";

interface Totais {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
}

function Item({ rotulo, children, className = "", soTelaLarga }: { rotulo: React.ReactNode; children: React.ReactNode; className?: string; soTelaLarga?: boolean }) {
  return (
    <span className={`items-baseline gap-1.5 whitespace-nowrap ${soTelaLarga ? "hidden md:inline-flex print:inline-flex" : "inline-flex"} ${className}`}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <strong className="text-sm font-semibold tabular-nums">{children}</strong>
    </span>
  );
}

export function ResumoEmLinha({ totais, vencidos }: { totais: Totais; vencidos?: { quantidade: number; total: number } }) {
  if (vencidos) {
    return (
      <div className="avoid-break flex flex-wrap items-baseline gap-x-5 gap-y-0.5 text-warning-text print:mb-2" aria-label="Resumo dos vencidos">
        <Item rotulo="Itens vencidos">{vencidos.quantidade}</Item>
        <Item rotulo="Total vencido (líquido)">{brl(vencidos.total)}</Item>
      </div>
    );
  }
  return (
    <div className="avoid-break flex flex-wrap items-baseline gap-x-5 gap-y-0.5 print:mb-2" aria-label="Resumo do período">
      <Item rotulo="Saldo inicial" soTelaLarga>{brl(totais.saldoInicial)}</Item>
      <Item rotulo={<span className="inline-flex items-center gap-1 text-success-text"><TrendingUp className="h-3 w-3" /> Entradas</span>} className="text-success-text">{brl(totais.entradas)}</Item>
      <Item rotulo={<span className="inline-flex items-center gap-1 text-destructive-text"><TrendingDown className="h-3 w-3" /> Saídas</span>} className="text-destructive-text">{brl(totais.saidas)}</Item>
      <Item rotulo="Movimento" soTelaLarga>{brl(totais.entradas - totais.saidas)}</Item>
      <Item rotulo="Saldo final">{brl(totais.saldoFinal)}</Item>
    </div>
  );
}
