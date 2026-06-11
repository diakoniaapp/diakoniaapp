// ─── ResumoEbd.tsx — Bloco 5 do Dashboard ──────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Users, TrendingUp, TrendingDown, Loader2, AlertCircle,
  ChevronRight, CheckCircle2, Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Resumo {
  total_alunos: number;
  total_classes_ativas: number;
  ultimo_domingo: string;
  domingo_anterior: string;
  classes_com_aula_ult: number;
  presentes_ult: number;
  matriculados_classes_ult: number;
  taxa_presenca_ult: number;
  presentes_ant: number;
  matriculados_classes_ant: number;
  taxa_presenca_ant: number;
  variacao_presenca: number;
}

interface ClasseBaixa {
  classe_id: string;
  classe_nome: string;
  qtd_aulas_recentes: number;
  taxa_media: number;
  total_matriculados: number;
}

export function ResumoEbd() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [classesBaixas, setClassesBaixas] = useState<ClasseBaixa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: r }, { data: c }] = await Promise.all([
          supabase.rpc("resumo_ebd_dashboard"),
          supabase.rpc("ebd_classes_baixa_presenca"),
        ]);
        if (cancelled) return;
        const linhas = (r ?? []) as Resumo[];
        setResumo(linhas[0] ?? null);
        setClassesBaixas((c ?? []) as ClasseBaixa[]);
      } catch (e) {
        console.warn("ResumoEbd erro:", e);
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
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Calculando...
        </CardContent>
      </Card>
    );
  }

  if (!resumo) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 text-center text-muted-foreground text-sm">
          <GraduationCap className="w-5 h-5 inline mr-2 text-gold/60" />
          Sem dados de EBD ainda.
        </CardContent>
      </Card>
    );
  }

  const dataUlt = new Date(resumo.ultimo_domingo + "T00:00")
    .toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  const teveAula = resumo.classes_com_aula_ult > 0;

  const variacao = resumo.variacao_presenca;
  const corVariacao = variacao > 0 ? "text-emerald-600" : variacao < 0 ? "text-rose-600" : "text-muted-foreground";
  const IconVariacao = variacao >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-3">
      {/* 4 cards de estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card>
          <CardContent className="py-3 text-center">
            <Users className="w-4 h-4 mx-auto text-gold mb-1" />
            <p className="text-2xl font-semibold leading-none">{resumo.total_alunos}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Matriculados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 text-center">
            <GraduationCap className="w-4 h-4 mx-auto text-gold mb-1" />
            <p className="text-2xl font-semibold leading-none">{resumo.total_classes_ativas}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">Classes ativas</p>
          </CardContent>
        </Card>

        <Card className={teveAula ? "bg-emerald-50/40 border-emerald-200" : "border-dashed"}>
          <CardContent className="py-3 text-center">
            <Calendar className="w-4 h-4 mx-auto text-emerald-600 mb-1" />
            {teveAula ? (
              <>
                <p className="text-2xl font-semibold leading-none">
                  {resumo.taxa_presenca_ult}<span className="text-sm">%</span>
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                  Presença · {dataUlt}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground py-2">Sem aula registrada em {dataUlt}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 text-center">
            <IconVariacao className={`w-4 h-4 mx-auto mb-1 ${corVariacao}`} />
            <p className={`text-2xl font-semibold leading-none ${corVariacao}`}>
              {variacao > 0 ? "+" : ""}{variacao}<span className="text-sm">pp</span>
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">vs semana ant.</p>
          </CardContent>
        </Card>
      </div>

      {/* Classes em alerta */}
      {classesBaixas.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="py-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <AlertCircle className="w-3.5 h-3.5" /> 
                Classes com baixa presença
              </p>
              <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">
                {classesBaixas.length}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Média &lt; 60% nas últimas aulas. Considere ação pastoral.
            </p>
            <ul className="space-y-0.5 text-xs">
              {classesBaixas.slice(0, 5).map(c => (
                <li key={c.classe_id} className="flex items-center justify-between">
                  <Link to={`/ebd/${c.classe_id}`} className="hover:underline truncate flex-1">
                    {c.classe_nome}
                  </Link>
                  <span className="text-muted-foreground text-[10px] ml-2 shrink-0">
                    {c.taxa_media}% · {c.qtd_aulas_recentes} aulas
                  </span>
                </li>
              ))}
              {classesBaixas.length > 5 && (
                <li className="text-[10px] text-muted-foreground italic">
                  ... e mais {classesBaixas.length - 5}
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="text-center pt-1">
        <Link to="/ebd">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
            Ver EBD completa <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {!teveAula && classesBaixas.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center italic">
          Faça a chamada das classes hoje para ver presença atualizada.
        </p>
      )}
    </div>
  );
}
