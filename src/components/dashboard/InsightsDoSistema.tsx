// ─── InsightsDoSistema.tsx — Bloco 9 do Dashboard ──────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Lightbulb, Users, TrendingUp, AlertTriangle, Loader2,
  CheckCircle2, ArrowRight, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AreaPrecisaVol {
  area_id: string;
  area_nome: string;
  ministerio_nome: string;
  min_voluntarios: number;
  qtd_atual: number;
  faltam: number;
}

interface PessoaDisponivel {
  id: string;
  nome_completo: string;
}

interface Insight {
  tipo: "area_vol" | "disponivel" | "crescimento" | "status";
  severidade: "info" | "warn" | "good";
  titulo: string;
  detalhe: string;
  cta?: { to: string; label: string };
}

export function InsightsDoSistema() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const novos: Insight[] = [];

        // 1. Áreas precisando de voluntários
        const [{ data: areas }, { data: vols }] = await Promise.all([
          supabase.from("areas")
            .select("id, nome, ativo, min_voluntarios, ministerio_id, ministerios(nome, ativo)"),
          supabase.from("area_voluntarios")
            .select("area_id, status, membro_id"),
        ]);

        const volsAtivosPorArea = new Map<string, Set<string>>();
        (vols ?? []).forEach((v: any) => {
          const st = String(v.status ?? "").toLowerCase();
          if (st !== "ativa" && st !== "ativo") return;
          if (!volsAtivosPorArea.has(v.area_id)) volsAtivosPorArea.set(v.area_id, new Set());
          volsAtivosPorArea.get(v.area_id)!.add(v.membro_id);
        });

        const areasComFalta: AreaPrecisaVol[] = (areas ?? [])
          .filter((a: any) => a.ativo && a.ministerios?.ativo && a.min_voluntarios && a.min_voluntarios > 0)
          .map((a: any) => {
            const qtd = volsAtivosPorArea.get(a.id)?.size ?? 0;
            return {
              area_id: a.id,
              area_nome: a.nome,
              ministerio_nome: a.ministerios?.nome ?? "—",
              min_voluntarios: a.min_voluntarios,
              qtd_atual: qtd,
              faltam: a.min_voluntarios - qtd,
            };
          })
          .filter(a => a.faltam > 0)
          .sort((a, b) => b.faltam - a.faltam);

        if (areasComFalta.length > 0) {
          const top3 = areasComFalta.slice(0, 3).map(a => `${a.area_nome} (faltam ${a.faltam})`).join(", ");
          novos.push({
            tipo: "area_vol",
            severidade: "warn",
            titulo: `${areasComFalta.length} ${areasComFalta.length === 1 ? "área precisa" : "áreas precisam"} de voluntários`,
            detalhe: top3 + (areasComFalta.length > 3 ? ` e mais ${areasComFalta.length - 3}` : ""),
            cta: { to: "/areas", label: "Ver áreas" },
          });
        }

        // 2. Pessoas 100% disponíveis (membros/congregados ativos sem nenhum vínculo de serviço)
        const [{ data: membros }, { data: profs }, { data: matrics }] = await Promise.all([
          supabase.from("membros")
            .select("id, nome_completo")
            .eq("status", "ativo")
            .in("tipo_pessoa", ["membro", "congregado"])
            .order("nome_completo")
            .limit(500),
          supabase.from("ebd_professores").select("pessoa_id, ativo"),
          supabase.from("ebd_matriculas").select("pessoa_id, ativo"),
        ]);

        const idsServindo = new Set<string>();
        // Já é voluntário em alguma área
        for (const set of volsAtivosPorArea.values()) {
          for (const id of set) idsServindo.add(id);
        }
        // Já é professor
        (profs ?? []).forEach((p: any) => { if (p.ativo) idsServindo.add(p.pessoa_id); });

        const idsEbdAlunos = new Set<string>();
        (matrics ?? []).forEach((m: any) => { if (m.ativo) idsEbdAlunos.add(m.pessoa_id); });

        // Disponíveis = ativos + sem servir + sem ser aluno EBD
        const disponiveis: PessoaDisponivel[] = (membros ?? [])
          .filter((m: any) => !idsServindo.has(m.id) && !idsEbdAlunos.has(m.id));

        if (disponiveis.length > 0) {
          const top3 = disponiveis.slice(0, 3).map(p => p.nome_completo).join(", ");
          novos.push({
            tipo: "disponivel",
            severidade: "info",
            titulo: `${disponiveis.length} ${disponiveis.length === 1 ? "pessoa" : "pessoas"} sem nenhum vínculo de serviço`,
            detalhe: `Potencial pra engajar em áreas/EBD: ${top3}` + 
              (disponiveis.length > 3 ? ` e mais ${disponiveis.length - 3}` : ""),
            cta: { to: "/membros", label: "Ver pessoas" },
          });
        }

        // 3. Crescimento — novos cadastros nos últimos 30 dias
        const limite30 = new Date();
        limite30.setDate(limite30.getDate() - 30);
        const isoLimite = limite30.toISOString();

        const { count: novos30 } = await supabase.from("membros")
          .select("id", { count: "exact", head: true })
          .gte("created_at", isoLimite);
        
        const limite60 = new Date();
        limite60.setDate(limite60.getDate() - 60);
        const isoLimite60 = limite60.toISOString();
        const { count: novos60 } = await supabase.from("membros")
          .select("id", { count: "exact", head: true })
          .gte("created_at", isoLimite60)
          .lt("created_at", isoLimite);

        if ((novos30 ?? 0) > 0) {
          const n30 = novos30 ?? 0;
          const n60 = novos60 ?? 0;
          let sev: Insight["severidade"] = "good";
          let detalhe = `Novos ${n30} cadastros nos últimos 30 dias`;
          if (n60 > 0) {
            const pct = Math.round(((n30 - n60) / n60) * 100);
            if (pct > 0) detalhe += ` · +${pct}% vs período anterior`;
            else if (pct < 0) { detalhe += ` · ${pct}% vs período anterior`; sev = "warn"; }
            else detalhe += ` · estável vs período anterior`;
          }
          novos.push({
            tipo: "crescimento",
            severidade: sev,
            titulo: `Crescimento: +${n30} pessoas em 30 dias`,
            detalhe,
            cta: { to: "/membros", label: "Ver cadastros" },
          });
        }

        if (cancelled) return;
        setInsights(novos);
      } catch (e) {
        console.warn("InsightsDoSistema erro:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Cruzando dados...
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
        <CardContent className="py-5 flex items-center gap-2 justify-center text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">Sistema saudável — nenhum insight crítico no momento.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {insights.map((ins, i) => (
        <InsightCard key={i} ins={ins} />
      ))}
    </div>
  );
}

function InsightCard({ ins }: { ins: Insight }) {
  const cores = {
    info:  { bg: "border-blue-200 bg-blue-50/40", icon: "text-blue-600", label: "Sugestão" },
    warn:  { bg: "border-amber-200 bg-amber-50/40", icon: "text-amber-600", label: "Atenção" },
    good:  { bg: "border-emerald-200 bg-emerald-50/40", icon: "text-emerald-600", label: "Bom sinal" },
  };
  const cls = cores[ins.severidade];
  const Icon = ins.severidade === "good" ? TrendingUp 
             : ins.severidade === "warn" ? AlertTriangle
             : Sparkles;
  return (
    <Card className={cls.bg}>
      <CardContent className="py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cls.icon}`} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{ins.titulo}</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{ins.detalhe}</p>
          </div>
        </div>
        {ins.cta && (
          <Link to={ins.cta.to}>
            <Button type="button" size="sm" variant="ghost" className="gap-1 text-xs shrink-0">
              {ins.cta.label} <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
