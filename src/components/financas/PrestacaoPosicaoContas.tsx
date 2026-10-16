// ─── PrestacaoPosicaoContas — "Posição Financeira das Contas": o saldo de cada conta no começo e no fim do período ─────────────────────────────────────────
// Só leitura e compacta (uma linha por conta + o consolidado). Vem de `posicaoDasContas` (mesmo cálculo de saldo da demonstração, por conta) e não entra em nenhuma conta
// do relatório. Fica logo depois do Resumo Executivo, antes da demonstração.
import { brl } from "@/services/finService";
import type { PosicaoDasContas } from "@/lib/prestacaoIndicadores";

export function PosicaoDasContasDaPrestacao({ posicao, diferenca }: { posicao: PosicaoDasContas; diferenca: number }) {
  if (posicao.contas.length === 0) return null;
  const cor = (v: number) => (v < 0 ? "text-destructive-text" : "");
  return (
    <section aria-label="Posição financeira das contas" className="secao-rel avoid-break mb-5">
      <h3 className="font-serif text-sm text-gold uppercase tracking-[0.12em] border-b-2 border-gold/40 pb-1 mb-1" style={{ breakAfter: "avoid" }}>Posição Financeira das Contas</h3>
      <table className="tabela-posicao w-full text-xs border-collapse">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-semibold">Conta</th>
            <th className="py-1 text-right font-semibold w-36">Saldo Inicial</th>
            <th className="py-1 text-right font-semibold w-36">Saldo Final</th>
          </tr>
        </thead>
        <tbody>
          {posicao.contas.map(c => (
            <tr key={c.id} className="border-b border-border/30">
              <td className="py-0.5">{c.nome}</td>
              <td className={`py-0.5 text-right tabular-nums whitespace-nowrap ${cor(c.saldoInicial)}`}>{brl(c.saldoInicial)}</td>
              <td className={`py-0.5 text-right tabular-nums whitespace-nowrap ${cor(c.saldoFinal)}`}>{brl(c.saldoFinal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gold/40 font-semibold bg-muted/40" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <td className="py-1 uppercase tracking-wide">Total Geral</td>
            <td className={`py-1 text-right tabular-nums whitespace-nowrap ${cor(posicao.totalInicial)}`}>{brl(posicao.totalInicial)}</td>
            <td className={`py-1 text-right tabular-nums whitespace-nowrap ${cor(posicao.totalFinal)}`}>{brl(posicao.totalFinal)}</td>
          </tr>
        </tfoot>
      </table>
      {diferenca !== 0 && (
        <p className="nota-posicao text-[11px] text-muted-foreground mt-1">
          O saldo final consolidado considera todos os lançamentos realizados; difere em <b className="tabular-nums">{brl(Math.abs(diferenca))}</b> {diferenca > 0 ? "a mais" : "a menos"} do
          Saldo Final da demonstração por lançamentos que ela ainda não inclui (sem categoria, fora do Plano de Contas Oficial ou transferências).
        </p>
      )}
    </section>
  );
}
