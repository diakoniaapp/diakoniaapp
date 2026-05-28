import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { Users, Cake, Heart, HeartHandshake, Quote, Home, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ListState";
import { Button } from "@/components/ui/button";
import { verseOfTheDay } from "@/lib/agenda/verses";
import VisitantesDashWidget from "@/components/membros/VisitantesDashWidget";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";

interface Stats { membros: number; ativos: number; ministerios: number; familias: number; }
interface Aniv  { id: string; nome_completo: string; data_nascimento: string; }

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({ membros: 0, ativos: 0, ministerios: 0, familias: 0 });
  const [loaded, setLoaded] = useState(false);
  const [aniversariantes, setAniversariantes] = useState<Aniv[]>([]);
  const [casamentos, setCasamentos] = useState<Aniv[]>([]);
  const [nome, setNome] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [openVisitanteRapido, setOpenVisitanteRapido] = useState(false);
  const verse = verseOfTheDay();

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.nome) {
          setNome(data.nome.split(" ")[0]);
        } else if (user.email) {
          // fallback: usar parte do email antes do @
          setNome(user.email.split("@")[0]);
        }
      });
  }, [user]);

  const loadStats = async () => {
    setError(null);
    setLoaded(false);
    try {
      const [m, a, mi, f] = await Promise.all([
        supabase.from("membros").select("*", { count: "exact", head: true }),
        supabase.from("membros").select("*", { count: "exact", head: true }).eq("status", "ativo"),
        supabase.from("ministerios").select("*", { count: "exact", head: true }),
        supabase.from("familias").select("*", { count: "exact", head: true }),
      ]);
      const firstErr = [m, a, mi, f].find((r: any) => r.error)?.error;
      if (firstErr) throw firstErr;
      setStats({ membros: m.count ?? 0, ativos: a.count ?? 0, ministerios: mi.count ?? 0, familias: f.count ?? 0 });

      const { data: nasc } = await supabase.from("membros").select("id,nome_completo,data_nascimento").not("data_nascimento", "is", null);
      const { data: cas  } = await supabase.from("membros").select("id,nome_completo,data_casamento").not("data_casamento", "is", null);

      const today = new Date();
      const inWeek = (d: string) => {
        const dt = parse(d, "yyyy-MM-dd", new Date());
        const thisYear = new Date(today.getFullYear(), dt.getMonth(), dt.getDate());
        const diff = (thisYear.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000;
        return diff >= 0 && diff <= 7;
      };
      setAniversariantes((nasc ?? []).filter((p) => inWeek(p.data_nascimento)).slice(0, 8));
      setCasamentos((cas ?? []).filter((p: any) => inWeek(p.data_casamento)).map((p: any) => ({ ...p, data_nascimento: p.data_casamento })).slice(0, 8));
      setLoaded(true);
    } catch (e: any) {
      setError(e?.message ?? "Erro ao carregar dados do painel.");
    }
  };

  useEffect(() => { loadStats(); }, []);

  const cards = [
    {
      label: "Membros",
      sub: "total cadastrados",
      value: stats.membros ?? 0,
      icon: Users,
      emptyHint: "Nenhum membro cadastrado ainda",
      emptyAction: "Inicie cadastrando novos membros",
    },
    {
      label: "Ativos",
      sub: "em comunhão",
      value: stats.ativos ?? 0,
      icon: Heart,
      emptyHint: "Nenhum membro ativo ainda",
      emptyAction: "Defina o status dos membros",
    },
    {
      label: "Famílias",
      sub: "núcleos familiares",
      value: stats.familias ?? 0,
      icon: Home as any,
      emptyHint: "Nenhuma família cadastrada",
      emptyAction: "Cadastre o primeiro núcleo",
    },
    {
      label: "Ministérios",
      sub: "cadastrados",
      value: stats.ministerios ?? 0,
      icon: HeartHandshake,
      emptyHint: "Nenhum ministério ainda",
      emptyAction: "Crie o primeiro ministério",
    },
  ];

  return (
    <div>
      <PageHeader
        title={`Graça e Paz${nome ? `, ${nome}` : ""} 🙏`}
        description="Que bom ter você aqui. Vamos servir juntos."
        actions={
          <Button
            onClick={() => setOpenVisitanteRapido(true)}
            title="Adicionar visitante rapidamente"
            className="gap-2 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span translate="no">Visitante Rápido</span>
          </Button>
        }
      />
      <div className="p-4 md:p-8 space-y-6">

        {/* Card Versículo — responsivo, sem ocupar muito espaço */}
        <Card className="overflow-hidden border-0 shadow-elevated bg-gradient-verse text-foreground relative">
          <div className="absolute -top-8 -right-8 opacity-10 pointer-events-none">
            <Quote className="w-36 h-36" />
          </div>
          <CardContent className="px-6 py-6 md:px-8 md:py-8 relative">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="hidden md:flex w-10 h-10 rounded-full bg-gold/20 ring-1 ring-gold/40 items-center justify-center shrink-0">
                <Quote className="w-4 h-4 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold/90 mb-2">Versículo do dia</div>
                <p className="font-serif text-lg md:text-xl leading-relaxed text-foreground/95 line-clamp-4">
                  "{verse.texto}"
                </p>
                <div className="text-gold mt-3 text-sm font-medium tracking-wide">{verse.ref}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cards de estatísticas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card key={c.label} translate="no" className="shadow-card-soft border border-border/60 hover:shadow-elevated transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p translate="no" className="text-xs tracking-wider uppercase text-muted-foreground">{c.label}</p>
                    {!loaded ? (
                      <Skeleton className="h-10 w-16 mt-2" />
                    ) : c.value === 0 ? (
                      <div className="mt-2">
                        <p className="text-3xl font-serif text-muted-foreground/50">0</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1 leading-tight">{c.emptyHint}</p>
                      </div>
                    ) : (
                      <p className="text-4xl font-serif mt-2 text-primary">{c.value}</p>
                    )}
                    {loaded && c.value > 0 && (
                      <p translate="no" className="text-xs text-muted-foreground mt-1">{c.sub}</p>
                    )}
                    {loaded && c.value === 0 && (
                      <p translate="no" className="text-[10px] text-gold/70 mt-1 leading-tight">{c.emptyAction}</p>
                    )}
                  </div>
                  <div className="w-10 h-10 rounded-md bg-gold/15 ring-1 ring-gold/30 flex items-center justify-center shrink-0 ml-2">
                    <c.icon className="w-5 h-5 text-gold" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {error && <ErrorState message={error} onRetry={loadStats} />}

        <VisitantesDashWidget />

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Cake className="w-4 h-4 text-gold" /> Aniversariantes da semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loaded ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : aniversariantes.length === 0 ? (
                <div className="text-center py-4">
                  <Cake className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aniversariante nos próximos 7 dias 🎂</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {aniversariantes.map((p) => (
                    <li key={p.id} className="py-2.5 flex justify-between text-sm">
                      <span>{p.nome_completo}</span>
                      <span className="text-muted-foreground">{format(parse(p.data_nascimento, "yyyy-MM-dd", new Date()), "dd 'de' MMMM", { locale: ptBR })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Heart className="w-4 h-4 text-gold" /> Aniversários de casamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loaded ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
              ) : casamentos.length === 0 ? (
                <div className="text-center py-4">
                  <Heart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aniversário de casamento esta semana 💍</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {casamentos.map((p) => (
                    <li key={p.id} className="py-2.5 flex justify-between text-sm">
                      <span>{p.nome_completo}</span>
                      <span className="text-muted-foreground">{format(parse(p.data_nascimento, "yyyy-MM-dd", new Date()), "dd 'de' MMMM", { locale: ptBR })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <VisitanteRapidoDialog
        open={openVisitanteRapido}
        onOpenChange={setOpenVisitanteRapido}
        onSaved={loadStats}
      />
    </div>
  );
}
