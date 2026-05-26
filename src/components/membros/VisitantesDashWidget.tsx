import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import AcoesHoje from "@/components/membros/AcoesHoje";
import {
  calcularEtapa,
  calcularPrioridade,
  precisaAcao,
} from "@/lib/visitantesFluxo";
import type { Membro } from "@/pages/Membros";
import {
  UserPlus,
  TrendingUp,
  AlertTriangle,
  Phone,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

interface RawMembro extends Membro {
  numero_visitas?: number | null;
  ultimo_contato_em?: string | null;
  created_at: string;
}

interface VisitantesStats {
  total:           number;
  retornaram:      number;
  naoVoltaram:     number;
  precisamContato: number;
  urgente:         number;   // prioridade = alta
}

const DIAS_RETORNO = 15;

export default function VisitantesDashWidget() {
  const [membros, setMembros]   = useState<RawMembro[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    supabase
      .from("membros")
      .select("id,nome_completo,numero_visitas,ultimo_contato_em,created_at,status_acolhimento,tipo_pessoa")
      .eq("tipo_pessoa", "visitante")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setMembros((data ?? []) as RawMembro[]);
        setLoading(false);
      });
  }, []);

  const stats = useMemo<VisitantesStats>(() => {
    const corte15 = new Date(Date.now() - DIAS_RETORNO * 86_400_000);
    const total   = membros.length;

    const retornaram = membros.filter(
      (m) => (m.numero_visitas ?? 1) >= 2 && new Date(m.created_at) > corte15
    ).length;

    const naoVoltaram = membros.filter(
      (m) => (m.numero_visitas ?? 1) === 1 && new Date(m.created_at) < corte15
    ).length;

    const precisamContato = membros.filter(
      (m) => precisaAcao(m.ultimo_contato_em ?? null)
    ).length;

    const urgente = membros.filter((m) => {
      const nv = m.numero_visitas ?? 1;
      return calcularPrioridade(nv, m.created_at) === "alta";
    }).length;

    return { total, retornaram, naoVoltaram, precisamContato, urgente };
  }, [membros]);

  return (
    <div className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold font-serif" translate="no">
          Visitantes
        </h2>
        <Button asChild size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground">
          <Link to="/visitantes">
            Ver painel completo
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      {/* Cards de indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniCard
          icon={<UserPlus className="w-4 h-4 text-gold" />}
          label="Total"
          sub="visitantes"
          value={stats.total}
          loading={loading}
        />
        <MiniCard
          icon={<TrendingUp className="w-4 h-4 text-success" />}
          label="Retornaram"
          sub="em 15 dias"
          value={stats.retornaram}
          loading={loading}
          color="success"
        />
        <MiniCard
          icon={<AlertTriangle className="w-4 h-4 text-warning" />}
          label="Não voltaram"
          sub="+ 15 dias"
          value={stats.naoVoltaram}
          loading={loading}
          color="warning"
        />
        <MiniCard
          icon={<Phone className="w-4 h-4 text-primary" />}
          label="Precisam contato"
          sub="aguardando"
          value={stats.precisamContato}
          loading={loading}
          color={stats.precisamContato > 0 ? "warning" : undefined}
        />
      </div>

      {/* Banner de urgência */}
      {!loading && stats.urgente > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm font-medium text-destructive" translate="no">
              Ação urgente —{" "}
              <span className="font-bold">{stats.urgente}</span>{" "}
              {stats.urgente === 1 ? "visitante precisa" : "visitantes precisam"} de contato
              imediato (mais de {DIAS_RETORNO} dias sem retorno)
            </p>
          </div>
          <Button asChild size="sm" variant="destructive" className="shrink-0 text-xs h-7 gap-1.5">
            <Link to="/visitantes">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      )}

      {/* Painel de ação do dia — limitado a 5 */}
      <Card className="shadow-card-soft">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="font-serif text-base flex items-center justify-between gap-2">
            <span translate="no">Quem precisa de cuidado hoje</span>
            {stats.precisamContato > 5 && (
              <Badge variant="outline" className="text-[10px] font-normal">
                +{stats.precisamContato - 5} no painel completo
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <AcoesHoje limit={5} />
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Mini card de indicador ----
function MiniCard({
  icon,
  label,
  sub,
  value,
  loading,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  value: number;
  loading: boolean;
  color?: "success" | "warning";
}) {
  const valClass =
    color === "success"
      ? "text-success"
      : color === "warning"
      ? "text-warning"
      : "text-primary";

  return (
    <Card className="shadow-card-soft border border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs tracking-wider uppercase text-muted-foreground" translate="no">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-8 w-12 mt-1.5" />
            ) : (
              <p className={`text-3xl font-serif mt-1 ${valClass}`}>{value}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5" translate="no">
              {sub}
            </p>
          </div>
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
