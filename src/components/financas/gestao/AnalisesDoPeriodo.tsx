// ─── AnalisesDoPeriodo — previsão de caixa, últimos 6 meses, gasto por tipo de centro e maiores favorecidos ──────────────────────────────────────────
// Fase F (20/10/2026): era a página "Insights Financeiros" (/financas/insights). Os alertas e as anomalias que ela repetia no topo já são o bloco "Alertas" do Painel de gestão
// (mesma fonte: alertasFinanceiros + anomaliasMes) e saíram daqui; o que ficou é o que SÓ ela tinha. Mora como seção do Painel de gestão, carregada quando se abre (6 consultas que
// não precisam rodar toda vez que a aba aparece). O endereço antigo redireciona para cá.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Sparkles, TrendingUp, Loader2, Calendar, Building2 } from "lucide-react";
import {
  previsaoCaixa, comparativoMeses, topFornecedores, listarCentrosComResumo, brl,
  type FinPrevisaoCaixa, type FinComparativoMes, type FinTopFornecedor, type FinCentroResumo,
} from "@/services/finService";
import { DonutChart } from "@/components/financas/DonutChart";

/** Seção recolhida do Painel de gestão. `abertaInicial`: o link antigo dos Insights chega já aberto. */
export function AnalisesDoPeriodo({ abertaInicial = false }: { abertaInicial?: boolean }) {
  const [aberta, setAberta] = useState(abertaInicial);
  return (
    <div className="rounded-md border bg-card" data-analises>
      <button type="button" aria-expanded={aberta} onClick={() => setAberta(a => !a)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30">
        <Sparkles className="h-4 w-4 shrink-0 text-gold" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Análises do período</span>
          <span className="block text-xs text-muted-foreground">Previsão de caixa, últimos 6 meses, gasto por tipo de centro e maiores favorecidos</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberta ? "rotate-180" : ""}`} />
      </button>
      {aberta && <div className="border-t p-3"><ConteudoDasAnalises /></div>}
    </div>
  );
}

function ConteudoDasAnalises() {
  const [previsao, setPrevisao] = useState<FinPrevisaoCaixa | null>(null);
  const [comparativo, setComparativo] = useState<FinComparativoMes[]>([]);
  const [topForns, setTopForns] = useState<FinTopFornecedor[]>([]);
  const [centros, setCentros] = useState<FinCentroResumo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, c, t, ce] = await Promise.all([
          previsaoCaixa().catch(() => null),
          comparativoMeses(6).catch(() => []),
          topFornecedores(10, 90).catch(() => []),
          listarCentrosComResumo().catch(() => []),
        ]);
        setPrevisao(p);
        setComparativo(c);
        setTopForns(t);
        setCentros(ce);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>;

  const maxComparativo = Math.max(...comparativo.flatMap(c => [c.entradas, c.saidas]), 1);

  return (
    <div className="space-y-4">

      {/* Previsão de caixa */}
      {previsao && (
        <Card>
          <CardContent className="py-3 space-y-3">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" /> Previsão de Caixa
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <PrevisaoBox label="Saldo atual" valor={previsao.saldo_atual} destaque />
              <PrevisaoBox label="Em 30 dias" valor={previsao.saldo_projetado_30d}
                entrada={previsao.entradas_previstas_30d} saida={previsao.saidas_previstas_30d} />
              <PrevisaoBox label="Em 60 dias" valor={previsao.saldo_projetado_60d}
                entrada={previsao.entradas_previstas_60d} saida={previsao.saidas_previstas_60d} />
              <PrevisaoBox label="Em 90 dias" valor={previsao.saldo_projetado_90d}
                entrada={previsao.entradas_previstas_90d} saida={previsao.saidas_previstas_90d} />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Baseado no saldo atual + lançamentos previstos (recorrências e contas a pagar/receber)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Comparativo 6 meses */}
      {comparativo.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gold" /> Últimos 6 meses
            </h3>
            <div className="space-y-1.5">
              {comparativo.map(m => (
                <div key={`${m.ano}-${m.mes}`} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize">{m.rotulo}</span>
                    <span className={`tabular-nums font-medium ${Number(m.resultado) >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                      {Number(m.resultado) >= 0 ? "+" : ""}{brl(Number(m.resultado))}
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="bg-success/60 rounded-l"
                      style={{ flex: Number(m.entradas) / maxComparativo }}
                      title={`Entradas: ${brl(Number(m.entradas))}`} />
                    <div className="bg-destructive/60 rounded-r"
                      style={{ flex: Number(m.saidas) / maxComparativo }}
                      title={`Saídas: ${brl(Number(m.saidas))}`} />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>+{brl(Number(m.entradas))}</span>
                    <span>−{brl(Number(m.saidas))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distribuição por tipo de centro */}
      {centros.length > 0 && (() => {
        const porTipo: Record<string, { label: string; valor: number; cor: string }> = {
          ministerio: { label: "Ministérios", valor: 0, cor: "#a855f7" },
          area:       { label: "Áreas", valor: 0, cor: "#3b82f6" },
          ebd_classe: { label: "EBD", valor: 0, cor: "#10b981" },
          pgm_grupo:  { label: "PGM", valor: 0, cor: "#f59e0b" },
          campanha:   { label: "Campanhas", valor: 0, cor: "#ec4899" },
          evento:     { label: "Eventos", valor: 0, cor: "#06b6d4" },
          geral:      { label: "Geral/Operacional", valor: 0, cor: "#737373" },
        };
        // Subgrupo contábil não soma aqui — pula de propósito. Desde a
        // migration 20260917010000, `gasto_90d` do centro PAI já vem
        // somado com os subgrupos dele direto do banco
        // (vw_fin_centros_resumo); somar de novo aqui (mesmo redirecionando
        // pro tipo do pai, como uma versão anterior deste trecho fazia)
        // contaria o mesmo lançamento duas vezes — uma no total do pai,
        // outra no total "solto" do subgrupo. Achado revisando esta tela
        // depois de corrigir a view (17/09/2026).
        centros.forEach(c => {
          if (c.vinculo_tipo === "subgrupo_administracao") return;
          if (porTipo[c.vinculo_tipo]) porTipo[c.vinculo_tipo].valor += Number(c.gasto_90d);
        });
        const lista = Object.values(porTipo).filter(p => p.valor > 0);
        const total = lista.reduce((s, p) => s + p.valor, 0);
        if (total === 0) return null;
        return (
          <Card>
            <CardContent className="py-3 space-y-2">
              <h3 className="font-serif text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-gold" /> Distribuição de gastos por tipo de centro
              </h3>
              <p className="text-xs text-muted-foreground">Últimos 90 dias</p>
              <div className="flex flex-wrap gap-4 items-center justify-center">
                <DonutChart data={lista} tamanho={160} espessura={28} />
                <div className="space-y-1 min-w-[200px]">
                  {lista.sort((a, b) => b.valor - a.valor).map(p => {
                    const pct = (p.valor / total) * 100;
                    return (
                      <div key={p.label} className="flex items-center gap-2 text-xs">
                        <span className="w-3 h-3 rounded shrink-0" style={{ background: p.cor }} />
                        <span className="flex-1 truncate">{p.label}</span>
                        <span className="tabular-nums font-medium">{brl(p.valor)}</span>
                        <span className="tabular-nums text-muted-foreground text-xs w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Maiores favorecidos (as anomalias do mês estão no bloco "Alertas" do Painel de gestão) */}
      <div className="grid grid-cols-1 gap-3">
        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gold" /> Top fornecedores (90d)
            </h3>
            {topForns.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-3">
                Sem favorecidos nos últimos 90 dias.
              </p>
            ) : (
              <div className="space-y-1">
                {topForns.map((f, i) => (
                  <div key={f.fornecedor_id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-medium truncate">{f.fornecedor_nome}</span>
                    </span>
                    <span className="tabular-nums font-medium text-destructive-text shrink-0 ml-2">
                      {brl(Number(f.total))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function PrevisaoBox({ label, valor, entrada, saida, destaque }: {
  label: string; valor: number; entrada?: number; saida?: number; destaque?: boolean;
}) {
  const valorNum = Number(valor);
  return (
    <div className={`border rounded-md py-2 px-2.5 ${
      destaque ? "border-gold bg-gold/5"
      : valorNum < 0 ? "border-destructive-line bg-destructive-soft/30"
      : ""
    }`}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${
        destaque ? "text-lg text-gold"
        : valorNum < 0 ? "text-base text-destructive-text"
        : "text-base"
      }`}>
        {brl(valorNum)}
      </p>
      {(entrada != null || saida != null) && (
        <div className="text-xs mt-0.5 space-y-0">
          {entrada != null && Number(entrada) > 0 && (
            <p className="text-success-text">+{brl(Number(entrada))}</p>
          )}
          {saida != null && Number(saida) > 0 && (
            <p className="text-destructive-text">−{brl(Number(saida))}</p>
          )}
        </div>
      )}
    </div>
  );
}
