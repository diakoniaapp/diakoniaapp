import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, AlertTriangle, FileText, Loader2, ChevronRight,
  Sparkles, BarChart3, Users, Plus,
} from "lucide-react";
import {
  alertasSecretaria, listarSolicitacoes,
  type AlertaSecretaria, type PrioridadeAlerta,
} from "@/services/membresiaService";
import { alertasGovernanca, type AlertaGovernanca } from "@/services/governancaService";
import { PaginaSkeleton } from "@/components/ListState";

const PRIORIDADE_INFO: Record<PrioridadeAlerta, { label: string; cor: string }> = {
  urgente:      { label: "Urgente",      cor: "border-destructive-line bg-destructive-soft/30 text-destructive-text" },
  atencao:      { label: "Atenção",      cor: "border-warning-line bg-warning-soft/30 text-warning-text" },
  informativo:  { label: "Informativo",  cor: "border-info-line bg-info-soft/20 text-info-text" },
};

export default function PainelSecretaria() {
  const [alertas, setAlertas] = useState<AlertaSecretaria[]>([]);
  const [alertasGov, setAlertasGov] = useState<AlertaGovernanca[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendentes: 0, assembleia: 0, aprovadas: 0 });

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [als, lista, gov] = await Promise.all([
        alertasSecretaria().catch(() => []),
        listarSolicitacoes().catch(() => []),
        alertasGovernanca().catch(() => []),
      ]);
      setAlertas(als);
      setAlertasGov(gov);
      setStats({
        total: lista.length,
        pendentes: lista.filter(s => s.status !== "concluida" && s.status !== "cancelada" && s.status !== "rejeitada").length,
        assembleia: lista.filter(s => s.status === "pronta_assembleia").length,
        aprovadas: lista.filter(s => s.status === "aprovada").length,
      });
    } finally { setLoading(false); }
  }

  if (loading) return <PaginaSkeleton />;

  // Agrupar por prioridade
  const porPrioridade: Record<PrioridadeAlerta, AlertaSecretaria[]> = {
    urgente: alertas.filter(a => a.prioridade === "urgente"),
    atencao: alertas.filter(a => a.prioridade === "atencao"),
    informativo: alertas.filter(a => a.prioridade === "informativo"),
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/membresia"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" /> Pendências da Secretaria
          </h1>
          <p className="text-xs text-muted-foreground">
            Tudo que precisa da sua atenção em um só lugar.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to="/membresia">
            <BarChart3 className="w-3.5 h-3.5" /> Ver todas
          </Link></Button>
      </div>

      {/* Stats topo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Solicitações" valor={stats.total} icon={<FileText className="w-3 h-3" />} />
        <Stat label="Pendentes" valor={stats.pendentes} icon={<AlertTriangle className="w-3 h-3" />} cor="amber" />
        <Stat label="Para assembleia" valor={stats.assembleia} icon={<Users className="w-3 h-3" />} cor="blue" />
        <Stat label="Aprovadas" valor={stats.aprovadas} icon={<BarChart3 className="w-3 h-3" />} cor="emerald" />
      </div>

      {alertas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <Sparkles className="w-10 h-10 mx-auto opacity-30 text-success-text" />
            <p className="font-medium text-success-text">Tudo em ordem!</p>
            <p className="text-xs">Nenhum alerta pendente — secretaria em dia 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {alertasGov.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                  ⚖ Governança
                </Badge>
                <span className="text-xs text-muted-foreground">({alertasGov.length})</span>
              </div>
              {alertasGov.slice(0, 6).map((a, i) => (
                <Card key={i} className={
                  a.prioridade === "urgente" ? "border-destructive-line bg-destructive-soft/30" :
                  a.prioridade === "atencao" ? "border-warning-line bg-warning-soft/30" :
                  "border-info-line bg-info-soft/20"
                }>
                  <CardContent className="py-2.5 px-3 flex items-center gap-2">
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${a.prioridade === "urgente" ? "text-destructive-text" : a.prioridade === "atencao" ? "text-warning-text" : "text-info-text"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{a.titulo}</p>
                      <p className="text-xs text-muted-foreground">{a.descricao}</p>
                    </div>
                    {a.link && (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1"><Link to={a.link}>
                          {a.acao_sugerida} <ChevronRight className="w-3 h-3" />
                        </Link></Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {(["urgente", "atencao", "informativo"] as PrioridadeAlerta[]).map(prio => {
            const lista = porPrioridade[prio];
            if (lista.length === 0) return null;
            const info = PRIORIDADE_INFO[prio];
            return (
              <div key={prio} className="space-y-1.5">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="outline" className={`text-xs ${info.cor}`}>{info.label}</Badge>
                  <span className="text-xs text-muted-foreground">({lista.length})</span>
                </div>
                {lista.map((a, i) => (
                  <Card key={i} className={info.cor}>
                    <CardContent className="py-2.5 px-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.titulo}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{a.descricao}</p>
                          {a.acao_sugerida && (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1"><Link to={a.link} className="inline-block mt-1.5">
                                {a.acao_sugerida} <ChevronRight className="w-3 h-3" />
                              </Link></Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
        </>
      )}

      <div className="text-xs text-muted-foreground text-center pt-2">
        ✨ Sistema de alertas inteligentes · Atualiza em tempo real
      </div>
    </div>
  );
}

function Stat({ label, valor, icon, cor }: { label: string; valor: number; icon: React.ReactNode; cor?: "amber" | "blue" | "emerald" }) {
  const corClass = cor === "amber" ? "text-warning-text"
                 : cor === "blue"  ? "text-info-text"
                 : cor === "emerald" ? "text-success-text"
                 : "";
  return (
    <Card>
      <CardContent className="py-2 px-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon} {label}</p>
        <p className={`text-base font-semibold ${corClass}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
