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

const PRIORIDADE_INFO: Record<PrioridadeAlerta, { label: string; cor: string }> = {
  urgente:      { label: "Urgente",      cor: "border-rose-300 bg-rose-50/30 text-rose-700" },
  atencao:      { label: "Atenção",      cor: "border-amber-300 bg-amber-50/30 text-amber-700" },
  informativo:  { label: "Informativo",  cor: "border-blue-200 bg-blue-50/20 text-blue-700" },
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

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando painel...
  </div>;

  // Agrupar por prioridade
  const porPrioridade: Record<PrioridadeAlerta, AlertaSecretaria[]> = {
    urgente: alertas.filter(a => a.prioridade === "urgente"),
    atencao: alertas.filter(a => a.prioridade === "atencao"),
    informativo: alertas.filter(a => a.prioridade === "informativo"),
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/membresia">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-gold" /> Painel da Secretaria
          </h1>
          <p className="text-xs text-muted-foreground">
            Tudo que precisa da sua atenção em um só lugar.
          </p>
        </div>
        <Link to="/membresia">
          <Button variant="outline" size="sm" className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Ver todas
          </Button>
        </Link>
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
            <Sparkles className="w-10 h-10 mx-auto opacity-30 text-emerald-500" />
            <p className="font-medium text-emerald-700">Tudo em ordem!</p>
            <p className="text-[11px]">Nenhum alerta pendente — secretaria em dia 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {alertasGov.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-1">
                <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-700 border-purple-300">
                  ⚖ Governança
                </Badge>
                <span className="text-xs text-muted-foreground">({alertasGov.length})</span>
              </div>
              {alertasGov.slice(0, 6).map((a, i) => (
                <Card key={i} className={
                  a.prioridade === "urgente" ? "border-rose-300 bg-rose-50/30" :
                  a.prioridade === "atencao" ? "border-amber-300 bg-amber-50/30" :
                  "border-blue-200 bg-blue-50/20"
                }>
                  <CardContent className="py-2.5 px-3 flex items-center gap-2">
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${a.prioridade === "urgente" ? "text-rose-700" : a.prioridade === "atencao" ? "text-amber-700" : "text-blue-700"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{a.titulo}</p>
                      <p className="text-[11px] text-muted-foreground">{a.descricao}</p>
                    </div>
                    {a.link && (
                      <Link to={a.link}>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                          {a.acao_sugerida} <ChevronRight className="w-3 h-3" />
                        </Button>
                      </Link>
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
                  <Badge variant="outline" className={`text-[10px] ${info.cor}`}>{info.label}</Badge>
                  <span className="text-xs text-muted-foreground">({lista.length})</span>
                </div>
                {lista.map((a, i) => (
                  <Card key={i} className={info.cor}>
                    <CardContent className="py-2.5 px-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.titulo}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{a.descricao}</p>
                          {a.acao_sugerida && (
                            <Link to={a.link} className="inline-block mt-1.5">
                              <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
                                {a.acao_sugerida} <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
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

      <div className="text-[10px] text-muted-foreground text-center pt-2">
        ✨ Sistema de alertas inteligentes · Atualiza em tempo real
      </div>
    </div>
  );
}

function Stat({ label, valor, icon, cor }: { label: string; valor: number; icon: React.ReactNode; cor?: "amber" | "blue" | "emerald" }) {
  const corClass = cor === "amber" ? "text-amber-700"
                 : cor === "blue"  ? "text-blue-700"
                 : cor === "emerald" ? "text-emerald-700"
                 : "";
  return (
    <Card>
      <CardContent className="py-2 px-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon} {label}</p>
        <p className={`text-base font-semibold ${corClass}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
