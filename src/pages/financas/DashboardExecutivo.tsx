import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  Briefcase, Loader2, Printer, TrendingUp, TrendingDown, Wallet,
  AlertCircle, AlertTriangle, ChevronRight, Building, Sparkles, Heart,
} from "lucide-react";
import {
  buscarSaldoConsolidado, buscarFluxo12m, buscarCentrosAno,
  buscarIndicadoresEclesiasticos, buscarAlertasExecutivos,
  type SaldoConsolidado, type FluxoCaixaMes, type CentroCustoAno,
  type IndicadorEclesiastico, type AlertaExecutivo,
} from "@/services/dashboardExecutivoService";

const fmtBR = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtMes = () =>
  new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function DashboardExecutivo() {
  const [saldo, setSaldo] = useState<SaldoConsolidado | null>(null);
  const [fluxo, setFluxo] = useState<FluxoCaixaMes[]>([]);
  const [centros, setCentros] = useState<CentroCustoAno[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadorEclesiastico[]>([]);
  const [alertas, setAlertas] = useState<AlertaExecutivo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      buscarSaldoConsolidado(),
      buscarFluxo12m(),
      buscarCentrosAno(),
      buscarIndicadoresEclesiasticos(),
      buscarAlertasExecutivos(),
    ])
      .then(([s, f, c, i, a]) => {
        setSaldo(s); setFluxo(f); setCentros(c); setIndicadores(i); setAlertas(a);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Carregando dashboard executivo...
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-5 print:max-w-full">
      {/* Header */}
      <header className="flex items-center gap-2 print:hidden">
        <Briefcase className="w-5 h-5 text-gold" />
        <div className="flex-1">
          <h1 className="font-serif text-xl md:text-2xl">Dashboard Executivo</h1>
          <p className="text-xs text-muted-foreground">Visão estratégica financeira · {fmtMes()}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
        </Button>
      </header>

      {/* Cabeçalho imprimível */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
        <h2 className="font-serif text-lg mt-1">Relatório Executivo Mensal — {fmtMes()}</h2>
        <p className="text-xs text-muted-foreground">Gerado em {new Date().toLocaleString("pt-BR")}</p>
      </div>

      {/* ZONA 1 — VISÃO MACRO */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricaGrande
          titulo="Saldo total"
          valor={saldo?.saldo_atual ?? 0}
          subtitulo={`${saldo?.qtd_contas ?? 0} conta(s)`}
          icon={<Wallet className="w-4 h-4 text-gold" />}
        />
        <MetricaGrande
          titulo="Previsão 30 dias"
          valor={saldo?.previsao_30d ?? 0}
          subtitulo={`A pagar R$ ${fmtBR(saldo?.a_pagar_30d).replace("R$", "")}`}
          variacao={saldo && saldo.previsao_30d < saldo.saldo_atual ? "-" : "+"}
        />
        <MetricaGrande
          titulo="Previsão 60 dias"
          valor={saldo?.previsao_60d ?? 0}
          variacao={saldo && saldo.previsao_60d < (saldo.previsao_30d || 0) ? "-" : "+"}
        />
        <MetricaGrande
          titulo="Previsão 90 dias"
          valor={saldo?.previsao_90d ?? 0}
          variacao={saldo && saldo.previsao_90d < (saldo.previsao_60d || 0) ? "-" : "+"}
        />
      </div>

      {/* ZONA 2 — FLUXO DE CAIXA 12 MESES */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gold" /> Fluxo de caixa — últimos 12 meses
          </CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {fluxo.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Sem dados ainda.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fluxo} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number) => fmtBR(v)}
                  contentStyle={{ fontSize: "11px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="entradas" stroke="#059669" strokeWidth={2} name="Entradas" dot={{ r: 3 }} />
                <Line type="monotone" dataKey="saidas"   stroke="#dc2626" strokeWidth={2} name="Saídas"   dot={{ r: 3 }} />
                <Line type="monotone" dataKey="saldo"    stroke="#b89348" strokeWidth={2} name="Saldo"    dot={{ r: 3 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ZONA 3 — INDICADORES + CENTROS DE CUSTO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Indicadores eclesiásticos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500" /> Indicadores eclesiásticos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {indicadores.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Nenhuma categoria identificada (procura "Dízimo", "Oferta", "Missões").
              </p>
            ) : (
              <div className="space-y-2">
                {indicadores.map(i => (
                  <div key={i.indicador} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{i.indicador}</div>
                      <div className="text-[10px] text-muted-foreground">
                        Mês atual {fmtBR(i.total_mes_atual)} · Ano {fmtBR(i.total_ano)}
                      </div>
                    </div>
                    {i.variacao_pct != null && (
                      <div className={"flex items-center gap-1 text-xs " + (i.variacao_pct >= 0 ? "text-emerald-700" : "text-rose-700")}>
                        {i.variacao_pct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {i.variacao_pct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 centros de custo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="w-4 h-4 text-gold" /> Top 5 centros de custo (ano)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {centros.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                Sem gastos registrados em centros de custo.
              </p>
            ) : (
              <div className="space-y-2">
                {centros.map((c, idx) => (
                  <div key={c.centro_id} className="border-b pb-1.5 last:border-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-4 text-right">{idx + 1}.</span>
                      <span className="flex-1 truncate">{c.nome}</span>
                      <span className="font-medium tabular-nums">{fmtBR(c.realizado)}</span>
                    </div>
                    {c.orcado > 0 && c.percentual != null && (
                      <div className="flex items-center gap-2 mt-1 ml-6">
                        <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                          <div
                            className={
                              "h-full transition-all " +
                              (c.percentual >= 100 ? "bg-rose-500" :
                               c.percentual >= 90 ? "bg-amber-500" : "bg-emerald-500")
                            }
                            style={{ width: `${Math.min(100, c.percentual)}%` }}
                          />
                        </div>
                        <span className={
                          "text-[10px] tabular-nums " +
                          (c.percentual >= 100 ? "text-rose-700 font-semibold" :
                           c.percentual >= 90 ? "text-amber-700" : "text-muted-foreground")
                        }>
                          {c.percentual.toFixed(0)}% de {fmtBR(c.orcado)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ZONA 4 — ALERTAS EXECUTIVOS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Alertas executivos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alertas.length === 0 ? (
            <p className="text-xs text-emerald-700 text-center py-2">
              ✓ Tudo em ordem — sem alertas críticos
            </p>
          ) : (
            <div className="space-y-1.5">
              {alertas.map((a, i) => (
                <div key={i} className={
                  "flex items-start gap-2 p-2 border rounded-md text-xs " +
                  (a.severidade === "alta" ? "border-rose-200 bg-rose-50/30" :
                   a.severidade === "media" ? "border-amber-200 bg-amber-50/30" : "border-blue-200 bg-blue-50/30")
                }>
                  {a.severidade === "alta"
                    ? <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <div className="font-medium">{a.mensagem}</div>
                    {a.detalhe && <div className="text-muted-foreground text-[10px] mt-0.5">{a.detalhe}</div>}
                  </div>
                  <Badge variant="outline" className="text-[9px] shrink-0">{a.categoria}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-right print:text-center pt-2 border-t print:border-0">
        _Dashboard Executivo · Diakonia APP_ · Gerado em {new Date().toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

// ─── Componente: card de métrica grande ──────────────────────────────
function MetricaGrande({ titulo, valor, subtitulo, icon, variacao }: {
  titulo: string; valor: number; subtitulo?: string;
  icon?: React.ReactNode; variacao?: "+" | "-";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
            <div className="text-lg md:text-xl font-serif font-medium mt-0.5">{fmtBR(valor)}</div>
            {subtitulo && (
              <div className="text-[10px] text-muted-foreground mt-0.5">{subtitulo}</div>
            )}
          </div>
          {icon && <div className="shrink-0">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
