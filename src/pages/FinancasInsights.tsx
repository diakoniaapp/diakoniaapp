import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  Loader2, Calendar, Building2, ChevronRight,
} from "lucide-react";
import {
  anomaliasMes, previsaoCaixa, comparativoMeses, topFornecedores,
  alertasFinanceiros, brl,
  type FinAnomalia, type FinPrevisaoCaixa, type FinComparativoMes,
  type FinTopFornecedor, type FinAlertaFinanceiro,
} from "@/services/finService";

export default function FinancasInsights() {
  const [previsao, setPrevisao] = useState<FinPrevisaoCaixa | null>(null);
  const [anomalias, setAnomalias] = useState<FinAnomalia[]>([]);
  const [comparativo, setComparativo] = useState<FinComparativoMes[]>([]);
  const [topForns, setTopForns] = useState<FinTopFornecedor[]>([]);
  const [alertas, setAlertas] = useState<FinAlertaFinanceiro[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, a, c, t, al] = await Promise.all([
          previsaoCaixa().catch(() => null),
          anomaliasMes().catch(() => []),
          comparativoMeses(6).catch(() => []),
          topFornecedores(10, 90).catch(() => []),
          alertasFinanceiros().catch(() => []),
        ]);
        setPrevisao(p);
        setAnomalias(a);
        setComparativo(c);
        setTopForns(t);
        setAlertas(al);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando insights...
  </div>;

  const maxComparativo = Math.max(...comparativo.flatMap(c => [c.entradas, c.saidas]), 1);

  // Filtra anomalias importantes
  const anomaliasRelevantes = anomalias.filter(a =>
    a.severidade === "critico" || a.severidade === "atencao"
  ).slice(0, 8);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" /> Insights Financeiros
          </h1>
          <p className="text-xs text-muted-foreground">
            Previsão de caixa, anomalias e padrões — decisões com dados.
          </p>
        </div>
      </div>

      {/* Alertas críticos no topo */}
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map((al, i) => (
            <Card key={i} className={
              al.severidade === "critico" ? "border-rose-300 bg-rose-50/30" :
              al.severidade === "atencao" ? "border-amber-300 bg-amber-50/30" :
              ""
            }>
              <CardContent className="py-2.5 px-3 flex items-center gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 ${al.severidade === "critico" ? "text-rose-700" : "text-amber-700"}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${al.severidade === "critico" ? "text-rose-700" : "text-amber-700"}`}>
                    {al.titulo}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{al.descricao}</p>
                </div>
                {al.link && (
                  <Link to={al.link}>
                    <Button size="sm" variant="ghost" className="h-7 text-[10px]">
                      Ver <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
            <p className="text-[10px] text-muted-foreground text-center">
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
                    <span className={`tabular-nums font-medium ${Number(m.resultado) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {Number(m.resultado) >= 0 ? "+" : ""}{brl(Number(m.resultado))}
                    </span>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div className="bg-emerald-500/60 rounded-l"
                      style={{ flex: Number(m.entradas) / maxComparativo }}
                      title={`Entradas: ${brl(Number(m.entradas))}`} />
                    <div className="bg-rose-500/60 rounded-r"
                      style={{ flex: Number(m.saidas) / maxComparativo }}
                      title={`Saídas: ${brl(Number(m.saidas))}`} />
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>+{brl(Number(m.entradas))}</span>
                    <span>−{brl(Number(m.saidas))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anomalias detectadas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Anomalias do mês
            </h3>
            {anomaliasRelevantes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-3">
                Nenhuma variação significativa detectada. Mês dentro do padrão. ✓
              </p>
            ) : (
              <div className="space-y-1.5">
                {anomaliasRelevantes.map(a => (
                  <div key={a.categoria_id}
                    className={`border rounded-md px-2.5 py-1.5 text-xs ${
                      a.severidade === "critico" ? "border-rose-300 bg-rose-50/30"
                      : a.severidade === "atencao" ? "border-amber-300 bg-amber-50/30"
                      : "border-blue-300 bg-blue-50/30"
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">{a.categoria_nome}</span>
                      {a.variacao_pct != null && (
                        <Badge variant="outline" className={`text-[10px] ${
                          Number(a.variacao_pct) > 0 ? "text-rose-700 border-rose-300" : "text-emerald-700 border-emerald-300"
                        }`}>
                          {Number(a.variacao_pct) > 0 ? "+" : ""}{Number(a.variacao_pct).toFixed(0)}%
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Este mês: <strong>{brl(Number(a.valor_mes))}</strong>
                      {Number(a.media_6m) > 0 && (
                        <> · Média 6m: {brl(Number(a.media_6m))}</>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gold" /> Top fornecedores (90d)
            </h3>
            {topForns.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-3">
                Sem fornecedores nos últimos 90 dias.
              </p>
            ) : (
              <div className="space-y-1">
                {topForns.map((f, i) => (
                  <div key={f.fornecedor_id} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
                    <span className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-muted-foreground w-4">{i + 1}.</span>
                      <span className="font-medium truncate">{f.fornecedor_nome}</span>
                    </span>
                    <span className="tabular-nums font-medium text-rose-700 shrink-0 ml-2">
                      {brl(Number(f.total))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Diakonia Insights — análises atualizadas em tempo real conforme você lança os movimentos.
      </p>
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
      : valorNum < 0 ? "border-rose-300 bg-rose-50/30"
      : ""
    }`}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-semibold tabular-nums ${
        destaque ? "text-lg text-gold"
        : valorNum < 0 ? "text-base text-rose-700"
        : "text-base"
      }`}>
        {brl(valorNum)}
      </p>
      {(entrada != null || saida != null) && (
        <div className="text-[9px] mt-0.5 space-y-0">
          {entrada != null && Number(entrada) > 0 && (
            <p className="text-emerald-700">+{brl(Number(entrada))}</p>
          )}
          {saida != null && Number(saida) > 0 && (
            <p className="text-rose-700">−{brl(Number(saida))}</p>
          )}
        </div>
      )}
    </div>
  );
}
