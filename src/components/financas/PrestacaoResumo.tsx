// ─── PrestacaoResumo — o resumo executivo e os indicadores de dízimos da Prestação de Contas ───────────────────────────────────────────────────────────
// Tudo sai de `lib/prestacaoIndicadores.ts`, que lê os MESMOS totais da tabela: o resumo nunca discorda dela. Leitura em tela e impressão (PDF): fundo claro com
// `print-color-adjust: exact`, nada depende de hover, e o bloco não quebra entre páginas.
import { brl } from "@/services/finService";
import type { IndicadoresDeDizimos, ResumoExecutivo } from "@/lib/prestacaoIndicadores";

const EXATO = { printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" } as React.CSSProperties;

function Cartao({ titulo, valor, detalhe, cor, forte }: { titulo: string; valor: string; detalhe?: React.ReactNode; cor?: string; forte?: boolean }) {
  return (
    <div className={`rounded-md border bg-white p-3 min-w-0 ${forte ? "border-gold/60" : "border-border/60"}`} style={EXATO}>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5 min-w-0">
        <span className={`block font-serif tabular-nums ${forte ? "text-xl" : "text-lg"} ${cor ?? ""}`}>{valor}</span>
        {detalhe && <span className="block text-[11px] text-muted-foreground mt-0.5">{detalhe}</span>}
      </dd>
    </div>
  );
}

const ROTULO_RESULTADO: Record<ResumoExecutivo["situacao"], string> = { superavit: "Superávit", deficit: "Déficit", equilibrio: "Resultado equilibrado" };

export function ResumoExecutivoDaPrestacao({ resumo }: { resumo: ResumoExecutivo }) {
  const cor = resumo.situacao === "deficit" ? "text-destructive-text" : resumo.situacao === "superavit" ? "text-success-text" : "text-foreground";
  return (
    <section aria-label="Resumo executivo" className="avoid-break mb-6 rounded-lg border-2 border-gold/40 p-4" style={{ ...EXATO, background: "hsl(var(--gold) / 0.06)" }}>
      <h2 className="font-serif text-sm text-gold uppercase tracking-[0.15em] mb-3">Resumo Executivo</h2>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Cartao titulo="Receita Total" valor={brl(resumo.receitaTotal)} cor="text-success-text" />
        <Cartao titulo="Despesa Total" valor={brl(resumo.despesaTotal)} cor="text-destructive-text"
          detalhe={resumo.despesasDosMinisterios !== resumo.despesaTotal ? `ministérios ${brl(resumo.despesasDosMinisterios)} + financeiras e outras` : "dos ministérios"} />
        <Cartao titulo="Despesas Financeiras" valor={brl(resumo.despesasFinanceiras)} cor="text-destructive-text" detalhe="tarifas, capitalização e outros encargos" />
        <Cartao titulo={`Resultado do Período · ${ROTULO_RESULTADO[resumo.situacao]}`} valor={brl(resumo.resultado)} cor={cor} forte />
        <Cartao titulo="Saldo Inicial" valor={brl(resumo.saldoInicial)} detalhe="no primeiro dia do período" />
        <Cartao titulo="Saldo Final" valor={brl(resumo.saldoFinal)} cor={resumo.saldoFinal < 0 ? "text-destructive-text" : undefined} detalhe="no último dia do período" forte />
        <div className="col-span-2">
          <Cartao titulo="Compras Ofertadas por Terceiros" valor={brl(resumo.comprasOfertadasValor)}
            detalhe={`${resumo.comprasOfertadasQtd} ${resumo.comprasOfertadasQtd === 1 ? "compra" : "compras"} · fora do caixa: não entram no resultado nem no saldo`} />
        </div>
      </dl>
    </section>
  );
}

export function IndicadoresDeDizimosDaPrestacao({ ind }: { ind: IndicadoresDeDizimos }) {
  return (
    <section aria-label="Indicadores de dízimos" className="avoid-break mb-6">
      <h3 className="font-serif text-sm text-gold uppercase tracking-wide mb-2">Indicadores de Dízimos</h3>
      <dl className="grid grid-cols-3 gap-2.5">
        <Cartao titulo="Dizimistas únicos no período" valor={String(ind.dizimistasUnicos)} detalhe="quem deu em mais de um mês conta uma vez" />
        <Cartao titulo="Valor total de dízimos" valor={brl(ind.valorTotal)} cor="text-success-text"
          detalhe={ind.valorNaoIdentificado > 0 ? `inclui ${brl(ind.valorNaoIdentificado)} sem identificação de quem deu` : undefined} />
        <Cartao titulo="Valor médio por dizimista" valor={brl(ind.valorMedio)}
          detalhe={ind.valorNaoIdentificado > 0 ? "só dos dízimos identificados por nome" : undefined} />
      </dl>
    </section>
  );
}
