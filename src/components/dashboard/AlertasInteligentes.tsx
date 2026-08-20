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
import { useReportarVazio } from "@/components/hoje/vazio";
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

  // Faixa de Travas do HOJE: sem alerta, a faixa inteira desaparece — em vez
  // de gastar a área mais nobre da tela para dizer que não há nada.
  useReportarVazio(
    loading ||
    (familiasSemResp.length === 0 && pessoasSugeridas.length === 0 && alunosForaFaixa.length === 0)
  );

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
            .then(r => (r.data ?? []) as AlertaIdade[], () => [] as AlertaIdade[]),
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
      <Card className="border-success-line bg-success-soft/40">
        <CardContent className="py-5 flex items-center gap-2 justify-center text-success-text">
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
            <span className="text-xs text-muted-foreground ml-1">· {f.qtd_membros}</span>
          </li>
        ))}
        {familiasSemResp.length > 3 && (
          <li className="text-xs text-muted-foreground italic">
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
              <span className="text-xs text-muted-foreground ml-1">→ {p.familia_sugerida_nome}</span>
            )}
          </li>
        ))}
        {pessoasSugeridas.length > 3 && (
          <li className="text-xs text-muted-foreground italic">
            ... e mais {pessoasSugeridas.length - 3}
          </li>
        )}
      </AlertaCard>

      <AlertaCard
        cor="amber"
        icon={GraduationCap}
        titulo="Alunos prontos para mudar de classe"
        contagem={alunosForaFaixa.length}
        descricao="Passaram da idade maxima da classe onde estao"
        cta={{ to: "/ebd", label: "Abrir EBD" }}
      >
        {alunosForaFaixa.slice(0, 3).map(a => (
          <li key={a.pessoa_id} className="truncate">
            {a.nome_completo}
            <span className="text-xs text-muted-foreground ml-1">
              · {a.idade_atual} anos em {a.classe_atual}
            </span>
          </li>
        ))}
        {alunosForaFaixa.length > 3 && (
          <li className="text-xs text-muted-foreground italic">
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
  rose:    { card: "border-destructive-line bg-destructive-soft/40",
             chip: "bg-destructive-soft text-destructive-text border-destructive-line",
             icon: "text-destructive-text" },
  blue:    { card: "border-info-line bg-info-soft/40",
             chip: "bg-info-soft text-info-text border-info-line",
             icon: "text-info-text" },
  amber:   { card: "border-warning-line bg-warning-soft/40",
             chip: "bg-warning-soft text-warning-text border-warning-line",
             icon: "text-warning-text" },
  emerald: { card: "border-success-line bg-success-soft/40",
             chip: "bg-success-soft text-success-text border-success-line",
             icon: "text-success-text" },
};

function AlertaCard({ cor, icon: Icon, titulo, contagem, descricao, cta, children }: AlertaCardProps) {
  const cls = CORES[cor];
  // DA-016: bloco vazio não existe. Antes, um alerta resolvido virava um
  // cartão "Nada pendente ✓" — gastando espaço para dizer que não há nada.
  if (contagem === 0) return null;
  return (
    // min-w-0: item de grid não encolhe abaixo da largura min-content do
    // conteúdo. Sem isso, um nome longo alarga o cartão para além da célula
    // e a tela ganha rolagem horizontal no celular.
    <Card className={`${cls.card} min-w-0`}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${cls.icon}`} />
              {titulo}
            </p>
            <p className="text-xs text-muted-foreground">{descricao}</p>
          </div>
          <Badge variant="outline" className={`text-xs ${cls.chip}`}>{contagem}</Badge>
        </div>
        <ul className="text-xs space-y-0.5 ml-1">{children}</ul>
        {/* asChild: antes era <Button> dentro de <Link>, ou seja um <button>
            aninhado num <a>. HTML invalido — conteudo interativo nao aninha —
            e o <a> resultante media 19px de altura, abaixo do minimo de 24px
            da WCAG 2.2. Agora e um unico elemento, com 36px de altura. */}
        <Button asChild variant="ghost" size="sm" className="w-full gap-1.5 h-9 text-xs">
          <Link to={cta.to}>
            {cta.label} <ArrowRight className="w-3 h-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
