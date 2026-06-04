import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getResumoAcessos, type ResumoAcessos } from "@/services/acessoService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, ShieldOff, Clock, ExternalLink } from "lucide-react";

export default function AcessosDashWidget() {
  const [resumo, setResumo] = useState<ResumoAcessos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getResumoAcessos().then((r) => {
      setResumo(r);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold font-serif" translate="no">
          Acessos ao sistema
        </h2>
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <Link to="/usuarios">
            Gerenciar acessos
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <AcessoCard
          icon={<ShieldCheck className="w-4 h-4 text-success" />}
          label="Acessos ativos"
          sub="logaram ao menos 1x"
          value={resumo?.ativos ?? 0}
          loading={loading}
          color="success"
        />
        <AcessoCard
          icon={<Clock className="w-4 h-4 text-warning" />}
          label="Aguardando"
          sub="primeiro acesso"
          value={resumo?.aguardando ?? 0}
          loading={loading}
          color="warning"
        />
        <AcessoCard
          icon={<ShieldOff className="w-4 h-4 text-muted-foreground" />}
          label="Sem vínculo"
          sub="sem pessoa associada"
          value={resumo?.semVinculo ?? 0}
          loading={loading}
        />
        <AcessoCard
          icon={<ShieldCheck className="w-4 h-4 text-primary" />}
          label="Com vínculo"
          sub="vinculados a membros"
          value={resumo?.comVinculo ?? 0}
          loading={loading}
          color="primary"
        />
      </div>

      {!loading && resumo && resumo.aguardando > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning shrink-0" />
            <p className="text-sm font-medium text-warning" translate="no">
              <span className="font-bold">{resumo.aguardando}</span>{" "}
              {resumo.aguardando === 1
                ? "pessoa ainda não fez o primeiro acesso"
                : "pessoas ainda não fizeram o primeiro acesso"}
            </p>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 text-xs h-7 gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
          >
            <Link to="/usuarios">Ver acessos</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function AcessoCard({
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
  color?: "success" | "warning" | "primary";
}) {
  const valClass =
    color === "success"
      ? "text-success"
      : color === "warning"
      ? "text-warning"
      : color === "primary"
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <Card className="shadow-card-soft border border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p
              className="text-xs tracking-wider uppercase text-muted-foreground"
              translate="no"
            >
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
