// ─── CampanhasEbd.tsx — Bloco 6 do Dashboard ───────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DollarSign, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resumoCampanha, type CampanhaEbd, type ResumoCampanha } from "@/services/ebdService";

function brl(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

interface ComResumo extends CampanhaEbd { 
  resumo: ResumoCampanha | null;
  classe_nome: string;
}

export function CampanhasEbd() {
  const [campanhas, setCampanhas] = useState<ComResumo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from("ebd_campanhas")
          .select("*, ebd_classes(nome)")
          .eq("ativo", true)
          .order("data_fim", { ascending: true })
          .limit(6);
        if (cancelled) return;
        const lista = (data ?? []) as any[];
        const enriched: ComResumo[] = await Promise.all(
          lista.map(async (c) => {
            const r = await resumoCampanha(c.id).catch(() => null);
            return { ...c, classe_nome: c.ebd_classes?.nome ?? "—", resumo: r };
          })
        );
        if (!cancelled) setCampanhas(enriched);
      } catch (e) {
        console.warn("CampanhasEbd erro:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <Card className="border-dashed"><CardContent className="py-5 text-center text-xs text-muted-foreground">
      <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Carregando campanhas...
    </CardContent></Card>;
  }

  if (campanhas.length === 0) {
    return <Card className="border-dashed bg-muted/30">
      <CardContent className="py-5 flex flex-col items-center gap-2 text-muted-foreground">
        <DollarSign className="w-5 h-5 text-gold/60" />
        <p className="text-sm">Nenhuma campanha ativa.</p>
        <Link to="/ebd">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
            Criar via classe EBD <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>;
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      {campanhas.map(c => {
        const r = c.resumo;
        const pct = Math.round(r?.percentual ?? 0);
        const atingiu = (r?.percentual ?? 0) >= 100;
        return (
          <Link key={c.id} to={`/ebd/${c.classe_id}/campanhas/${c.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{c.nome}</h3>
                    <p className="text-[11px] text-muted-foreground truncate">{c.classe_nome}</p>
                  </div>
                  {atingiu && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                </div>
                {r && (
                  <>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-semibold">{brl(r.arrecadado)}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {pct}% de {brl(r.meta)}
                      </Badge>
                    </div>
                    <div className="h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-gold to-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
