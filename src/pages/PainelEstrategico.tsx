import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, AlertTriangle, UserPlus, Users, Sparkles,
  ArrowRight, BarChart2, Eye, Target, Heart,
} from "lucide-react";
import { avaliarEvolucao } from "@/lib/evolucaoFluxo";

// ── Tipos ────────────────────────────────────────────────────────────────────

interface PessoaDB {
  id:                   string;
  nome_completo:        string;
  tipo_pessoa:          string;
  numero_visitas:       number | null;
  ultimo_contato_em:    string | null;
  ultimo_contato_tipo:  string | null;
  telefone_celular:     string | null;
  created_at:           string;
  data_congregado?:     string | null;
  data_membro?:         string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000);
const fmtPct    = (n: number) => `${Math.round(n)}%`;
const fmtData   = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

// ── Componente principal ──────────────────────────────────────────────────────

export default function PainelEstrategico() {
  const [pessoas, setPessoas] = useState<PessoaDB[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("membros").select("*").order("created_at");
    setPessoas((data ?? []) as PessoaDB[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // ── Segmentos ────────────────────────────────────────────────────────────

  const visitantes   = useMemo(() => pessoas.filter(p => p.tipo_pessoa === "visitante"),   [pessoas]);
  const congregados  = useMemo(() => pessoas.filter(p => p.tipo_pessoa === "congregado"),  [pessoas]);
  const membros      = useMemo(() => pessoas.filter(p => p.tipo_pessoa === "membro"),      [pessoas]);

  // ── Indicadores ──────────────────────────────────────────────────────────

  const indicadores = useMemo(() => {
    const novos7d = visitantes.filter(v => new Date(v.created_at) >= diasAtras(7)).length;

    const comRetorno = visitantes.filter(v => (v.numero_visitas ?? 1) >= 2).length;
    const taxaRetorno = visitantes.length > 0
      ? (comRetorno / visitantes.length) * 100
      : 0;

    const congregado30d = congregados.filter(c =>
      c.data_congregado && new Date(c.data_congregado) >= diasAtras(30)
    ).length;

    const membro30d = membros.filter(m =>
      m.data_membro && new Date(m.data_membro) >= diasAtras(30)
    ).length;

    return { novos7d, taxaRetorno, congregado30d, membro30d };
  }, [visitantes, congregados, membros]);

  // ── Alertas ───────────────────────────────────────────────────────────────

  const alertas = useMemo(() => {
    const semContato3d = visitantes.filter(v =>
      !v.ultimo_contato_em && new Date(v.created_at) < diasAtras(3)
    ).length;

    const emRisco = visitantes.filter(v => {
      const dias = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
      return (v.numero_visitas ?? 1) === 1 && dias > 15 && !v.ultimo_contato_em;
    }).length;

    return { semContato3d, emRisco, baixaRetencao: indicadores.taxaRetorno < 30 && visitantes.length >= 3 };
  }, [visitantes, indicadores.taxaRetorno]);

  // ── Pontos de atenção ─────────────────────────────────────────────────────

  const pontosAtencao = useMemo(() => {
    const prontos = visitantes
      .filter(v => avaliarEvolucao({
        tipo_pessoa:         "visitante",
        numero_visitas:      v.numero_visitas ?? 1,
        ultimo_contato_tipo: v.ultimo_contato_tipo ?? null,
        created_at:          v.created_at,
      }).sugestao !== null)
      .slice(0, 4);

    const semContato = visitantes
      .filter(v => !v.ultimo_contato_em && new Date(v.created_at) < diasAtras(3))
      .slice(0, 4);

    const risco = visitantes
      .filter(v => {
        const dias = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
        return (v.numero_visitas ?? 1) === 1 && dias > 15 && !v.ultimo_contato_em;
      })
      .slice(0, 4);

    return { prontos, semContato, risco };
  }, [visitantes]);

  // ── Gráfico — últimas 4 semanas ───────────────────────────────────────────

  const chartData = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const fim    = diasAtras(i * 7);
      const inicio = diasAtras((i + 1) * 7);
      const label  = i === 0 ? "Esta sem" : i === 1 ? "Sem passada" : `${(i + 1) * 7}d atrás`;
      return {
        semana: label,
        "Novos visitantes": visitantes.filter(v => {
          const dt = new Date(v.created_at);
          return dt >= inicio && dt < fim;
        }).length,
        "Promovidos": [...congregados, ...membros].filter(p => {
          const data = (p as PessoaDB).data_congregado ?? (p as PessoaDB).data_membro;
          if (!data) return false;
          const dt = new Date(data);
          return dt >= inicio && dt < fim;
        }).length,
      };
    }).reverse();
  }, [visitantes, congregados, membros]);

  // ── Funil ─────────────────────────────────────────────────────────────────

  const funil = useMemo(() => {
    const max = Math.max(visitantes.length, 1);
    return [
      { label: "Visitantes",  count: visitantes.length,  pct: 100,                                    cor: "bg-primary/80",  corText: "text-primary"  },
      { label: "Congregados", count: congregados.length, pct: (congregados.length / max) * 100,        cor: "bg-success/70",  corText: "text-success"  },
      { label: "Membros",     count: membros.length,     pct: (membros.length / max) * 100,            cor: "bg-gold/80",     corText: "text-gold"     },
    ];
  }, [visitantes, congregados, membros]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Painel Estratégico"
        description="Crescimento real da igreja através dos visitantes"
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/visitantes">
              <ArrowRight className="w-4 h-4" />
              <span translate="no">Ver visitantes</span>
            </Link>
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6">

        {/* ── CARDS DE INDICADORES ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <IndicadorCard
            icon={<UserPlus className="w-5 h-5" />}
            label="Novos visitantes"
            sub="últimos 7 dias"
            valor={loading ? null : indicadores.novos7d}
            cor="primary"
          />
          <IndicadorCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Taxa de retorno"
            sub="visitantes com 2+ visitas"
            valor={loading ? null : fmtPct(indicadores.taxaRetorno)}
            cor={indicadores.taxaRetorno >= 30 ? "success" : "warning"}
          />
          <IndicadorCard
            icon={<Users className="w-5 h-5" />}
            label="Novos congregados"
            sub="últimos 30 dias"
            valor={loading ? null : indicadores.congregado30d}
            cor="success"
          />
          <IndicadorCard
            icon={<Heart className="w-5 h-5" />}
            label="Novos membros"
            sub="últimos 30 dias"
            valor={loading ? null : indicadores.membro30d}
            cor="gold"
          />
        </div>

        {/* ── ALERTAS ESTRATÉGICOS ─────────────────────────────────────── */}
        {!loading && (alertas.baixaRetencao || alertas.semContato3d > 0 || alertas.emRisco > 0) && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2" translate="no">
              <AlertTriangle className="w-4 h-4" /> Alertas
            </h2>
            <div className="space-y-2">
              {alertas.baixaRetencao && (
                <AlertaBanner
                  tipo="warning"
                  texto={`Taxa de retorno em ${fmtPct(indicadores.taxaRetorno)} — vale revisar o acolhimento dos dias 1 e 3`}
                />
              )}
              {alertas.semContato3d > 0 && (
                <AlertaBanner
                  tipo="warning"
                  texto={`${alertas.semContato3d} ${alertas.semContato3d === 1 ? "visitante ainda não recebeu" : "visitantes ainda não receberam"} contato após 3 dias`}
                />
              )}
              {alertas.emRisco > 0 && (
                <AlertaBanner
                  tipo="destructive"
                  texto={`${alertas.emRisco} ${alertas.emRisco === 1 ? "visitante pode estar se perdendo" : "visitantes podem estar se perdendo"} — mais de 15 dias sem retorno`}
                />
              )}
            </div>
          </div>
        )}

        {/* ── GRÁFICO + FUNIL ──────────────────────────────────────────── */}
        <div className="grid md:grid-cols-5 gap-4">

          {/* Gráfico de crescimento — 3/5 da grade */}
          <Card className="shadow-card-soft md:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="font-serif flex items-center gap-2 text-base">
                <BarChart2 className="w-4 h-4 text-gold" />
                <span translate="no">Crescimento — últimas 4 semanas</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="semana"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 11,
                        borderRadius: 8,
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                        color: "hsl(var(--foreground))",
                      }}
                    />
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                    <Bar dataKey="Novos visitantes" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Promovidos"       fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Funil pastoral — 2/5 da grade */}
          <Card className="shadow-card-soft md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="font-serif flex items-center gap-2 text-base">
                <Target className="w-4 h-4 text-gold" />
                <span translate="no">Funil pastoral</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-2">
              {loading ? (
                <div className="space-y-2">
                  {[100, 65, 40].map((w, i) => (
                    <Skeleton key={i} className="h-8" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                funil.map((f, i) => (
                  <div key={f.label}>
                    {i > 0 && (
                      <div className="flex justify-center text-muted-foreground/30 text-xs my-1">▼</div>
                    )}
                    <div
                      className={`rounded-md px-3 py-2 flex items-center justify-between gap-2 ${f.cor}`}
                      style={{ marginLeft: `${(100 - Math.max(f.pct, 20)) / 2}%`, marginRight: `${(100 - Math.max(f.pct, 20)) / 2}%` }}
                    >
                      <span className="text-xs font-medium text-white/90 truncate" translate="no">{f.label}</span>
                      <span className="text-sm font-bold text-white shrink-0">{f.count}</span>
                    </div>
                  </div>
                ))
              )}
              {!loading && visitantes.length > 0 && (
                <p className="text-[10px] text-muted-foreground text-center pt-1" translate="no">
                  {fmtPct((congregados.length / visitantes.length) * 100)} dos visitantes se tornaram congregados
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── PONTOS DE ATENÇÃO ────────────────────────────────────────── */}
        <Card className="shadow-card-soft">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif flex items-center gap-2 text-base">
              <Eye className="w-4 h-4 text-gold" />
              <span translate="no">👀 Pontos de atenção</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <div className="space-y-4">

                {/* Prontos para evolução */}
                {pontosAtencao.prontos.length > 0 && (
                  <PontoGrupo
                    label="✨ Prontos para o próximo passo"
                    cor="success"
                    items={pontosAtencao.prontos.map(v => ({
                      nome: v.nome_completo,
                      detalhe: `${v.numero_visitas ?? 1} visitas — ${v.ultimo_contato_tipo ?? "sem contato registrado"}`,
                    }))}
                  />
                )}

                {/* Sem contato */}
                {pontosAtencao.semContato.length > 0 && (
                  <PontoGrupo
                    label="📵 Aguardando primeiro contato"
                    cor="warning"
                    items={pontosAtencao.semContato.map(v => ({
                      nome: v.nome_completo,
                      detalhe: `Cadastrado em ${fmtData(v.created_at)} — sem contato ainda`,
                    }))}
                  />
                )}

                {/* Em risco */}
                {pontosAtencao.risco.length > 0 && (
                  <PontoGrupo
                    label="⚠️ Podem estar se perdendo"
                    cor="destructive"
                    items={pontosAtencao.risco.map(v => {
                      const dias = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
                      return {
                        nome: v.nome_completo,
                        detalhe: `Dia ${dias} — 1 visita, sem contato`,
                      };
                    })}
                  />
                )}

                {/* Tudo OK */}
                {pontosAtencao.prontos.length === 0 && pontosAtencao.semContato.length === 0 && pontosAtencao.risco.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4" translate="no">
                    Nenhum ponto crítico de atenção no momento 🎉
                  </p>
                )}

                <div className="pt-2 border-t">
                  <Button asChild variant="link" size="sm" className="p-0 text-xs text-muted-foreground gap-1">
                    <Link to="/visitantes">
                      <ArrowRight className="w-3 h-3" /> Ver todos os visitantes no painel de ação
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ── IndicadorCard ────────────────────────────────────────────────────────────

function IndicadorCard({ icon, label, sub, valor, cor }: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  valor: string | number | null;
  cor: "primary" | "success" | "warning" | "gold";
}) {
  const corMap = {
    primary:     "text-primary",
    success:     "text-success",
    warning:     "text-warning",
    gold:        "text-gold",
  };
  const bgMap = {
    primary:     "bg-primary/10 ring-1 ring-primary/20",
    success:     "bg-success/10 ring-1 ring-success/20",
    warning:     "bg-warning/10 ring-1 ring-warning/20",
    gold:        "bg-gold/10 ring-1 ring-gold/20",
  };
  return (
    <Card className="shadow-card-soft border border-border/60">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p translate="no" className="text-xs tracking-wider uppercase text-muted-foreground truncate">{label}</p>
            {valor === null ? (
              <Skeleton className="h-9 w-16 mt-2" />
            ) : (
              <p className={`text-3xl font-serif mt-1.5 ${corMap[cor]}`}>{valor}</p>
            )}
            <p translate="no" className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${bgMap[cor]} ${corMap[cor]}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── AlertaBanner ─────────────────────────────────────────────────────────────

function AlertaBanner({ tipo, texto }: { tipo: "warning" | "destructive"; texto: string }) {
  const isWarn = tipo === "warning";
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
      isWarn
        ? "border-warning/30 bg-warning/5 text-warning"
        : "border-destructive/30 bg-destructive/5 text-destructive"
    }`}>
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="text-sm font-medium" translate="no">{texto}</p>
    </div>
  );
}

// ── PontoGrupo ────────────────────────────────────────────────────────────────

function PontoGrupo({ label, cor, items }: {
  label: string;
  cor: "success" | "warning" | "destructive";
  items: { nome: string; detalhe: string }[];
}) {
  const corBadge = {
    success:     "bg-success/10 text-success border-success/30",
    warning:     "bg-warning/10 text-warning border-warning/30",
    destructive: "bg-destructive/10 text-destructive border-destructive/30",
  }[cor];
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" translate="no">{label}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start justify-between gap-2 text-xs">
            <span className="font-medium truncate">{item.nome}</span>
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 whitespace-nowrap ${corBadge}`}>
              {item.detalhe}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
