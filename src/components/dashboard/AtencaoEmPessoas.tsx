// ─── AtencaoEmPessoas.tsx — Bloco 7 do Dashboard ───────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UserCheck, Home, GraduationCap, Loader2, ArrowRight, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Pessoa { id: string; nome_completo: string; }
interface Visitante extends Pessoa {
  created_at: string;
  como_conheceu: string | null;
  dias_atras: number;
}

const ATRAS_VISITANTE_DIAS = 14;

export function AtencaoEmPessoas() {
  const [loading, setLoading] = useState(true);
  const [visitantes, setVisitantes] = useState<Visitante[]>([]);
  const [semFamilia, setSemFamilia] = useState<Pessoa[]>([]);
  const [semEbd, setSemEbd] = useState<Pessoa[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Janela de 14 dias para visitantes
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - ATRAS_VISITANTE_DIAS);
        const isoLimite = dataLimite.toISOString();

        const [
          { data: vis },
          { data: vincIds },
          { data: ebdIds },
          { data: membros },
        ] = await Promise.all([
          supabase.from("membros")
            .select("id, nome_completo, created_at, como_conheceu")
            .eq("tipo_pessoa", "visitante")
            .eq("status", "ativo")
            .gte("created_at", isoLimite)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase.from("vinculos_familiares").select("membro_id"),
          supabase.from("ebd_matriculas").select("pessoa_id").eq("ativo", true),
          supabase.from("membros")
            .select("id, nome_completo")
            .eq("status", "ativo")
            .in("tipo_pessoa", ["membro", "congregado"])
            .order("nome_completo"),
        ]);

        if (cancelled) return;

        const idsComFamilia = new Set((vincIds ?? []).map((v: any) => v.membro_id));
        const idsComEbd = new Set((ebdIds ?? []).map((v: any) => v.pessoa_id));
        const todos = (membros ?? []) as Pessoa[];

        // Visitantes com dias_atras
        const hoje = new Date();
        const visParsed: Visitante[] = (vis ?? []).map((v: any) => ({
          ...v,
          dias_atras: Math.floor((hoje.getTime() - new Date(v.created_at).getTime()) / 86400000),
        }));

        setVisitantes(visParsed);
        setSemFamilia(todos.filter(m => !idsComFamilia.has(m.id)));
        setSemEbd(todos.filter(m => !idsComEbd.has(m.id)));
      } catch (e) {
        console.warn("AtencaoEmPessoas erro:", e);
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
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando pendências...
        </CardContent>
      </Card>
    );
  }

  const total = visitantes.length + semFamilia.length + semEbd.length;
  if (total === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
        <CardContent className="py-5 flex items-center gap-2 justify-center text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">Todos com vínculo familiar e classe EBD definidos.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <ColunaPessoas
        cor="amber"
        icon={UserCheck}
        titulo="Visitantes recentes"
        descricao={`Cadastrados nos últimos ${ATRAS_VISITANTE_DIAS} dias`}
        lista={visitantes.slice(0, 4).map(v => ({
          id: v.id,
          nome: v.nome_completo,
          extra: v.dias_atras === 0 ? "hoje" : v.dias_atras === 1 ? "ontem" : `há ${v.dias_atras} dias`,
        }))}
        total={visitantes.length}
        cta={{ to: "/visitantes", label: "Acompanhar visitantes" }}
      />

      <ColunaPessoas
        cor="rose"
        icon={Home}
        titulo="Sem família vinculada"
        descricao="Defina o núcleo familiar"
        lista={semFamilia.slice(0, 4).map(p => ({ id: p.id, nome: p.nome_completo }))}
        total={semFamilia.length}
        cta={{ to: "/painel-pastoral", label: "Ver sugestões" }}
      />

      <ColunaPessoas
        cor="blue"
        icon={GraduationCap}
        titulo="Sem classe EBD"
        descricao="Indique a classe certa"
        lista={semEbd.slice(0, 4).map(p => ({ id: p.id, nome: p.nome_completo }))}
        total={semEbd.length}
        cta={{ to: "/ebd", label: "Matricular alunos" }}
      />
    </div>
  );
}

interface ColunaProps {
  cor: "amber" | "rose" | "blue";
  icon: typeof UserCheck;
  titulo: string;
  descricao: string;
  lista: { id: string; nome: string; extra?: string }[];
  total: number;
  cta: { to: string; label: string };
}

const CORES: Record<ColunaProps["cor"], { card: string; chip: string; icon: string }> = {
  amber: { card: "border-amber-200 bg-amber-50/40 dark:bg-amber-950/10",
           chip: "bg-amber-100 text-amber-700 border-amber-300",
           icon: "text-amber-600" },
  rose:  { card: "border-rose-200 bg-rose-50/40 dark:bg-rose-950/10",
           chip: "bg-rose-100 text-rose-700 border-rose-300",
           icon: "text-rose-600" },
  blue:  { card: "border-blue-200 bg-blue-50/40 dark:bg-blue-950/10",
           chip: "bg-blue-100 text-blue-700 border-blue-300",
           icon: "text-blue-600" },
};

function ColunaPessoas({ cor, icon: Icon, titulo, descricao, lista, total, cta }: ColunaProps) {
  const cls = CORES[cor];
  if (total === 0) {
    return (
      <Card className="border-dashed opacity-50">
        <CardContent className="py-4 text-center">
          <Icon className={`w-4 h-4 mx-auto mb-1 ${cls.icon}`} />
          <p className="text-xs font-medium">{titulo}</p>
          <p className="text-[10px] text-muted-foreground">Nada pendente ✓</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className={cls.card}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${cls.icon}`} />
              {titulo}
            </p>
            <p className="text-[10px] text-muted-foreground">{descricao}</p>
          </div>
          <Badge variant="outline" className={`text-[10px] ${cls.chip}`}>{total}</Badge>
        </div>
        <ul className="text-xs space-y-0.5 ml-1">
          {lista.map(p => (
            <li key={p.id} className="truncate">
              {p.nome}
              {p.extra && <span className="text-[10px] text-muted-foreground ml-1">· {p.extra}</span>}
            </li>
          ))}
          {total > lista.length && (
            <li className="text-[10px] text-muted-foreground italic">
              ... e mais {total - lista.length}
            </li>
          )}
        </ul>
        <Link to={cta.to}>
          <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5 h-7 text-xs">
            {cta.label} <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
