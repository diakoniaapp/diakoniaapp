import { resumoDoEncargo, type CamposDeEncargo } from "@/lib/encargos";
import { brl } from "@/services/finService";

/**
 * A sub-linha do extrato quando a obrigação foi paga com juros, multa ou desconto: "Detalhamento: Valor original R$ 312,70 · Multa R$ 12,50".
 * O extrato continua com UMA linha por obrigação (valor = o total que saiu do banco); o encargo é só informação complementar. Sem encargo, não ocupa nada.
 */
export function DetalheDeEncargos({ lancamento, className = "text-xs" }: { lancamento: CamposDeEncargo; className?: string }) {
  const resumo = resumoDoEncargo(lancamento, brl);
  if (!resumo) return null;
  return (
    <p className={`${className} text-muted-foreground truncate`} title={resumo}>
      <span className="font-medium">Detalhamento:</span> {resumo}
    </p>
  );
}
