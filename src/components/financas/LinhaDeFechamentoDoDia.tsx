// ─── LinhaDeFechamentoDoDia — "03/08/2026 · SALDO DO DIA · R$ 1,00" entre os dias do extrato ──────────────────────────────────────
//
// Pedido (08/10/2026), inspirado no Omie e no extrato do banco: quando a data muda, uma linha horizontal discreta com o saldo de FECHAMENTO do dia —
// o acumulado depois da última linha dele — para conferir o extrato do sistema contra o do banco dia por dia. Sem cartão, sem soma de resumo.
// Só aparece quando a coluna Saldo é o saldo real da conta (sem filtro de conteúdo e fora de "Atrasados"): com filtro, o acumulado é parcial e a
// linha daria um número falso — a mesma regra que já esconde "Saldo inicial". Quem decide é `podeMostrarFechamentos`.
import { brl } from "@/services/finService";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

export function LinhaDeFechamentoDoDia({ data, saldo }: { data: string; saldo: number }) {
  return (
    <tr className="border-y border-border/60 bg-muted/15" aria-label={`Saldo do dia ${dataBr(data)}: ${brl(saldo)}`}>
      {/* colSpan generoso: a tabela muda de colunas (modo resumido, tela cheia, celular) e a linha acompanha todas */}
      <td colSpan={12} className="py-1 px-2">
        {/* data · rótulo · saldo, juntos à esquerda (a tabela é larga e rola na horizontal: um valor na ponta direita ficaria fora da tela);
            `sticky left-0` mantém a linha à vista mesmo com a tabela rolada para o lado */}
        <div className="sticky left-0 inline-flex items-baseline gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
          <span className="tabular-nums">{dataBr(data)}</span>
          <span className="font-medium">Saldo do dia</span>
          <span className="tabular-nums font-semibold text-foreground normal-case text-xs">{brl(saldo)}</span>
        </div>
      </td>
    </tr>
  );
}

/** A coluna Saldo só é o saldo real da conta quando a lista está completa: período contínuo e nenhum filtro de conteúdo. */
export function podeMostrarFechamentos(f: {
  periodoPreset: string; filtroTipo: string; busca: string; categoriaId: string; centroCustoId: string; fornecedorId: string;
  valorMin: number | null; valorMax: number | null; dataEspecifica?: string;
}): boolean {
  return f.periodoPreset !== "atrasados" && f.filtroTipo === "todos" && f.busca.trim().length < 2 && !f.categoriaId && !f.centroCustoId && !f.fornecedorId
    && f.valorMin == null && f.valorMax == null && !f.dataEspecifica;
}
