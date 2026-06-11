// ─── AlertasInteligentes.tsx — Bloco 2 do Dashboard ────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle, Crown, Sparkles, ChevronRight,
  GraduationCap, Loader2, CheckCircle2, ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  familiasSemResponsavel, pessoasSemFamiliaSugerida,
  type FamiliaSemResponsavel, type PessoaSemFamilia,
} from "@/services/agendaPastoralService";

interface AlertaIdade {
  pessoa_id: string;
  nome_completo: string;
  idade_atual: number;
  classe_atual: string;
  classe_sugerida_id: string | null;
}

export function AlertasInteligentes() {
  const [loading, setLoading] = useState(true);
  const [familiasSemResp, setFamiliasSemResp] = useState<FamiliaSemResponsavel[]>([]);
  const [pessoasSugeridas, setPessoasSugeridas] = useState<PessoaSemFamilia[]>([]);
  const [alunosForaFaixa, setAlunosForaFaixa] = useState<AlertaIdade[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fs, ps, vw] = await Promise.all([
          familiasSemResponsavel().catch(() => []),
          pessoasSemFamiliaSugerida().catch(() => []),
          supabase.from("vw_ebd_alertas_idade")
            .select("pessoa_id, nome_completo, idade_atual, classe_atual, classe_sugerida_id")
            .limit(50)
            .then(r => (r.data ?? []) as AlertaIdade[])
            .catch(() => []),
        ]);
        if (!cancelled) {
          setFamiliasSemResp(fs);
          setPessoasSugeridas(ps);
          setAlunosForaFaixa(vw);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando alertas...
        </CardContent>
      </Card>
    );
  }

  const total = familiasSemResp.length + pessoasSugeridas.length + alunosForaFaixa.length;

  if (total === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10">
        <CardContent className="py-5 flex items-center gap-2 justify-center text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">Tudo em ordem — nenhuma pendência pastoral no momento.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-3">
      <AlertaCard
        cor="rose"
        icon={Crown}
        titulo="Famílias sem responsável"
        contagem={familiasSemResp.length}
        descricao="Defina quem responde pela família"
        cta={{ to: "/painel-pastoral", label: "Resolver" }}
      >
        {familiasSemResp.slice(0, 3).map(f => (
          <li key={f.familia_id} className="truncate">
            Família {f.nome_familia}
            <span className="text-[10px] text-muted-foreground ml-1">· {f.qtd_membros}</span>
          </li>
        ))}
        {familiasSemResp.length > 3 && (
          <li className="text-[10px] text-muted-foreground italic">
            ... e mais {familiasSemResp.length - 3}
          </li>
        )}
      </AlertaCard>

      <AlertaCard
        cor="blue"
        icon={Sparkles}
        titulo="Possíveis vínculos familiares"
        contagem={pessoasSugeridas.length}
        descricao="Sobrenomes em comum não vinculados"
        cta={{ to: "/painel-pastoral", label: "Vincular" }}
      >
        {pessoasSugeridas.slice(0, 3).map(p => (
          <li key={p.pessoa_id} className="truncate">
            {p.nome_completo}
            {p.familia_sugerida_nome && (
              <span className="text-[10px] text-muted-foreground ml-1">→ {p.familia_sugerida_nome}</span>
            )}
          </li>
        ))}
        {pessoasSugeridas.length > 3 && (
          <li className="text-[10px] text-muted-foreground italic">
            ... e mais {pessoasSugeridas.length - 3}
          </li>
        )}
      </AlertaCard>

      <AlertaCard
        cor="amber"
        icon={GraduationCap}
        titulo="Alunos fora da faixa EBD"
        contagem={alunosForaFaixa.length}
        descricao="Considere mover de classe"
        cta={{ to: "/ebd", label: "Abrir EBD" }}
      >
        {alunosForaFaixa.slice(0, 3).map(a => (
          <li key={a.pessoa_id} className="truncate">
            {a.nome_completo}
            <span className="text-[10px] text-muted-foreground ml-1">
              · {a.idade_atual} anos em {a.classe_atual}
            </span>
          </li>
        ))}
        {alunosForaFaixa.length > 3 && (
          <li className="text-[10px] text-muted-foreground italic">
            ... e mais {alunosForaFaixa.length - 3}
          </li>
        )}
      </AlertaCard>
    </div>
  );
}

// ─── Card de alerta reutilizável ───────────────────────────────────────────
interface AlertaCardProps {
  cor: "rose" | "blue" | "amber" | "emerald";
  icon: typeof AlertCircle;
  titulo: string;
  contagem: number;
  descricao: string;
  cta: { to: string; label: string };
  children: React.ReactNode;
}

const CORES: Record<AlertaCardProps["cor"], { card: string; chip: string; icon: string }> = {
  rose:    { card: "border-rose-200 bg-rose-50/40 dark:bg-rose-950/10",
             chip: "bg-rose-100 text-rose-700 border-rose-300",
             icon: "text-rose-600" },
  blue:    { card: "border-blue-200 bg-blue-50/40 dark:bg-blue-950/10",
             chip: "bg-blue-100 text-blue-700 border-blue-300",
             icon: "text-blue-600" },
  amber:   { card: "border-amber-200 bg-amber-50/40 dark:bg-amber-950/10",
             chip: "bg-amber-100 text-amber-700 border-amber-300",
             icon: "text-amber-600" },
  emerald: { card: "border-emerald-200 bg-emerald-50/40",
             chip: "bg-emerald-100 text-emerald-700 border-emerald-300",
             icon: "text-emerald-600" },
};

function AlertaCard({ cor, icon: Icon, titulo, contagem, descricao, cta, children }: AlertaCardProps) {
  const cls = CORES[cor];
  if (contagem === 0) {
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
          <Badge variant="outline" className={`text-[10px] ${cls.chip}`}>{contagem}</Badge>
        </div>
        <ul className="text-xs space-y-0.5 ml-1">{children}</ul>
        <Link to={cta.to}>
          <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5 h-7 text-xs">
            {cta.label} <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
