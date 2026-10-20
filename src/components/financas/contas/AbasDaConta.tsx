// ─── AbasDaConta — Extrato · Conciliação · Diagnóstico · Importações: uma casa só para tudo o que é banco ──────────────────────────────────────────────
// Fase D (20/10/2026). Antes o extrato, a conciliação, a auditoria do extrato e a importação viviam em quatro lugares (página, duas gavetas do Painel e uma página solta); agora são
// as abas da própria conta, cada uma com endereço (`/financas/conta/:id`, `/financas/conta/:id/conciliacao`…), que dá para fixar, voltar e compartilhar.
// Quais abas existem depende do tipo da conta: OFX e diagnóstico só fazem sentido no banco; a fatura só no cartão; as demais contas têm só o extrato.
import { Link } from "react-router-dom";
import { FileSearch, FileUp, Receipt, Scale } from "lucide-react";
import type { FinContaTipo } from "@/services/finService";

export type AbaDaConta = "extrato" | "conciliacao" | "diagnostico" | "importacoes";

const TODAS: { aba: AbaDaConta; rotulo: string; icone: typeof Scale; tipos: FinContaTipo[] | "todos" }[] = [
  { aba: "extrato", rotulo: "Extrato", icone: Receipt, tipos: "todos" },
  { aba: "conciliacao", rotulo: "Conciliação", icone: Scale, tipos: ["banco"] },
  { aba: "diagnostico", rotulo: "Diagnóstico", icone: FileSearch, tipos: ["banco"] },
  { aba: "importacoes", rotulo: "Importações", icone: FileUp, tipos: ["banco", "cartao"] },
];

export const ABAS_VALIDAS: AbaDaConta[] = TODAS.map(a => a.aba);

/** As abas que uma conta deste tipo tem, na ordem em que aparecem. */
export function abasDaConta(tipo: FinContaTipo | undefined) {
  if (!tipo) return TODAS.filter(a => a.tipos === "todos");
  return TODAS.filter(a => a.tipos === "todos" || a.tipos.includes(tipo));
}

export const enderecoDaAba = (contaId: string, aba: AbaDaConta) => (aba === "extrato" ? `/financas/conta/${contaId}` : `/financas/conta/${contaId}/${aba}`);

/** Sem abas (conta que só tem extrato) não desenha nada. */
export function AbasDaConta({ contaId, tipo, aba }: { contaId: string; tipo: FinContaTipo | undefined; aba: AbaDaConta }) {
  const abas = abasDaConta(tipo);
  if (abas.length < 2) return null;
  return (
    <nav aria-label="Seções da conta" className="-mb-px flex gap-0.5 overflow-x-auto sm:gap-1 print:hidden">
      {abas.map(a => {
        const ativa = a.aba === aba;
        const Icone = a.icone;
        return (
          <Link key={a.aba} to={enderecoDaAba(contaId, a.aba)} aria-current={ativa ? "page" : undefined} data-aba-link={a.aba}
            className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 py-1.5 text-[13px] sm:px-3 sm:text-sm ${ativa ? "border-gold font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icone className="hidden h-3.5 w-3.5 sm:block" /> {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
