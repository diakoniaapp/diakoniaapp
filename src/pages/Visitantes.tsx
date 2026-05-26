import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import VisitanteDialog from "@/components/membros/VisitanteDialog";
import type { Membro } from "@/pages/Membros";
import { UserPlus, TrendingUp, Repeat, ArrowRight, Sparkles } from "lucide-react";

interface VisitaRow {
  membro_id: string;
  data: string;
}

export default function Visitantes() {
  const [visitantes, setVisitantes] = useState<Membro[]>([]);
  const [visitas, setVisitas] = useState<VisitaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Membro | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [{ data: ms, error: e1 }, { data: vs, error: e2 }] = await Promise.all([
      supabase.from("membros").select("*").eq("tipo_pessoa", "visitante").order("created_at", { ascending: false }),
      supabase.from("visitas").select("membro_id,data"),
    ]);
    if (e1 || e2) setError((e1 || e2)!.message);
    setVisitantes((ms ?? []) as Membro[]);
    setVisitas((vs ?? []) as VisitaRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(now.getTime() - 30 * 86400000);

    const visitsByMembro = new Map<string, string[]>();
    for (const v of visitas) {
      const arr = visitsByMembro.get(v.membro_id) ?? [];
      arr.push(v.data);
      visitsByMembro.set(v.membro_id, arr);
    }

    const novosNoMes = visitantes.filter((v) => {
      const d = v.data_entrada ? new Date(v.data_entrada + "T00:00:00") : null;
      return d && d >= monthStart;
    }).length;

    const recorrentes = Array.from(visitsByMembro.values()).filter((arr) => arr.length >= 2).length;

    const ativosUltimo30 = visitantes.filter((v) => {
      const list = visitsByMembro.get(v.id) ?? [];
      const entrada = v.data_entrada;
      const datas = [...list, ...(entrada ? [entrada] : [])];
      return datas.some((d) => new Date(d + "T00:00:00") >= last30);
    }).length;

    const taxaRetencao = visitantes.length === 0
      ? 0
      : Math.round((recorrentes / visitantes.length) * 100);

    return { novosNoMes, recorrentes, ativosUltimo30, taxaRetencao, visitsByMembro };
  }, [visitantes, visitas]);

  return (
    <div>
      <PageHeader
        title="Painel de Visitantes"
        description={`${visitantes.length} visitantes registrados`}
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/membros"><ArrowRight className="w-4 h-4" /> <span translate="no">Ver em Pessoas</span></Link>
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<UserPlus className="w-5 h-5" />} label="Novos no mês" value={stats.novosNoMes} />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Ativos (30d)" value={stats.ativosUltimo30} />
          <StatCard icon={<Repeat className="w-5 h-5" />} label="Recorrentes" value={stats.recorrentes} />
          <StatCard icon={<Sparkles className="w-5 h-5" />} label="Retenção" value={`${stats.taxaRetencao}%`} />
        </div>

        {loading ? (
          <ListSkeleton className="grid gap-3" count={4} />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : visitantes.length === 0 ? (
          <EmptyState message="Nenhum visitante cadastrado ainda." />
        ) : (
          <div className="grid gap-3">
            {visitantes.map((v) => {
              const datas = stats.visitsByMembro.get(v.id) ?? [];
              const total = datas.length + (v.data_entrada ? 1 : 0);
              const ultima = datas.sort().slice(-1)[0] ?? v.data_entrada;
              return (
                <Card
                  key={v.id}
                  className="shadow-card-soft hover:shadow-elevated transition-shadow cursor-pointer"
                  onClick={() => setSelected(v)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-warning/15 text-warning flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{v.nome_completo}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[v.telefone_celular, v.bairro].filter(Boolean).join(" • ") || "—"}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge variant="outline" className="bg-primary/5">
                        {total} {total === 1 ? "visita" : "visitas"}
                      </Badge>
                      {ultima && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          últ. {new Date(ultima + "T00:00:00").toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <VisitanteDialog
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
        pessoa={selected}
        onSaved={load}
      />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="shadow-card-soft">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs" translate="no">
          {icon} {label}
        </div>
        <div className="font-serif text-2xl mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}