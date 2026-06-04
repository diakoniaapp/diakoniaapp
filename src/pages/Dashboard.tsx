import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Cake, Heart, HeartHandshake, Quote, Home, UserPlus, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ListState";
import { Button } from "@/components/ui/button";
import { verseOfTheDay } from "@/lib/agenda/verses";
import VisitantesDashWidget from "@/components/membros/VisitantesDashWidget";
import AcessosDashWidget from "@/components/membros/AcessosDashWidget";
import VisitanteRapidoDialog from "@/components/membros/VisitanteRapidoDialog";

interface Stats { membros: number; ativos: number; ministerios: number; familias: number; }
interface Aniv  { id: string; nome_completo: string; data_nascimento: string; }

function getSaudacao(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador", secretaria: "Secretaria",
  diakonia: "Pastor",     lideranca:  "Lideranca",
};

// Labels de role que nao devem ser usados como nome
const ROLE_VALORES = [
  "Administrador","Secretaria","Pastor","Lideranca",
  "admin","secretaria","diakonia","lideranca",
];

export default function Dashboard() {
  const { user, roles } = useAuth();
  const principalRole = roles[0] ?? "lideranca";
  const [stats, setStats]                     = useState<Stats>({ membros: 0, ativos: 0, ministerios: 0, familias: 0 });
  const [loaded, setLoaded]                   = useState(false);
  const [aniversariantes, setAniversariantes] = useState<Aniv[]>([]);
  const [casamentos, setCasamentos]           = useState<Aniv[]>([]);
  const [nome, setNome]                       = useState<string>("Visitante");
  const [error, setError]                     = useState<string | null>(null);
  const [openVisitanteRapido, setOpenVisitanteRapido] = useState(false);
  const verse = verseOfTheDay();

  // Nome vem EXCLUSIVAMENTE de profiles.nome
  // Sem membros. Sem fallback de e-mail. Padrao: "Visitante"
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles").select("nome").eq("id", user.id).maybeSingle();

      const valor = prof?.nome?.trim() ?? "";
      const invalido =
        !valor ||
        valor.includes("@") ||
        /^\d+$/.test(valor) ||
        ROLE_VALORES.includes(valor);

      if (!invalido) {
        const p = valor.split(" ")[0];
        setNome(p.charAt(0).toUpperCase() + p.slice(1));
      } else {
        setNome("Visitante");
      }
    })();
  }, [user]);

  const loadStats = async () => {
    setError(null); setLoaded(false);
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
      const { data: nasc } = await supabase.from("membros").select("id,nome_completo,data_nascimento").not("data_nascimento","is",null);
      const { data: cas  } = await supabase.from("membros").select("id,nome_completo,data_casamento").not("data_casamento","is",null);
      const today = new Date();
      const inWeek = (d: string) => {
        const dt = parse(d,"yyyy-MM-dd",new Date());
        const ty = new Date(today.getFullYear(), dt.getMonth(), dt.getDate());
        const diff = (ty.getTime() - new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime()) / 86400000;
        return diff >= 0 && diff <= 7;
      };
      setAniversariantes((nasc ?? []).filter((p) => inWeek(p.data_nascimento)).slice(0,8));
      setCasamentos((cas ?? []).filter((p: any) => inWeek(p.data_casamento)).map((p: any) => ({...p, data_nascimento: p.data_casamento})).slice(0,8));
      setLoaded(true);
    } catch (e: any) { setError(e?.message ?? "Erro ao carregar dados."); }
  };

  useEffect(() => { loadStats(); }, []);

  const cards = [
    { label: "Membros",     sub: "total cadastrados",  value: stats.membros,     icon: Users,          emptyHint: "Nenhum membro cadastrado ainda", emptyAction: "Inicie cadastrando novos membros" },
    { label: "Ativos",      sub: "em comunhao",        value: stats.ativos,      icon: Heart,          emptyHint: "Nenhum membro ativo ainda",       emptyAction: "Defina o status dos membros" },
    { label: "Familias",    sub: "nucleos familiares", value: stats.familias,    icon: Home as any,    emptyHint: "Nenhuma familia cadastrada",      emptyAction: "Cadastre o primeiro nucleo" },
    { label: "Ministerios", sub: "cadastrados",        value: stats.ministerios, icon: HeartHandshake, emptyHint: "Nenhum ministerio ainda",         emptyAction: "Crie o primeiro ministerio" },
  ];

  return (
    <div>
      <div className="border-b bg-card">
        <div className="px-4 md:px-8 py-4 md:py-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-gold shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
                {ROLE_LABEL[principalRole] ?? principalRole}
              </span>
            </div>
            <h1 className="font-serif text-2xl md:text-4xl text-foreground">
              {getSaudacao()}, {nome}! 🙏
            </h1>
            <p className="text-sm md:text-base text-muted-foreground">
              Que bom ter voce aqui. Vamos servir juntos.
            </p>
          </div>
          <div className="hidden md:flex gap-2 shrink-0">
            <Button onClick={() => setOpenVisitanteRapido(true)}
              className="gap-2 bg-gold hover:bg-gold/90 text-white border-0 shadow-sm">
              <UserPlus className="w-4 h-4" />
              <span translate="no">Visitante Rapido</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-8 space-y-6">
        <Card className="overflow-hidden border-0 shadow-elevated bg-gradient-verse text-foreground relative">
          <div className="absolute -top-8 -right-8 opacity-10 pointer-events-none"><Quote className="w-36 h-36" /></div>
          <CardContent className="px-6 py-6 md:px-8 md:py-8 relative">
            <div className="flex items-start gap-3 md:gap-4">
              <div className="hidden md:flex w-10 h-10 rounded-full bg-gold/20 ring-1 ring-gold/40 items-center justify-center shrink-0">
                <Quote className="w-4 h-4 text-gold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] tracking-[0.2em] uppercase text-gold/90 mb-2">Versiculo do dia</div>
                <p className="font-serif text-lg md:text-xl leading-relaxed text-foreground/95 line-clamp-4">"{verse.texto}"</p>
                <div className="text-gold mt-3 text-sm font-medium tracking-wide">{verse.ref}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card key={c.label} translate="no" className="shadow-card-soft border border-border/60 hover:shadow-elevated transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs tracking-wider uppercase text-muted-foreground">{c.label}</p>
                    {!loaded ? <Skeleton className="h-10 w-16 mt-2" />
                    : c.value === 0 ? (
                      <div className="mt-2">
                        <p className="text-3xl font-serif text-muted-foreground/50">0</p>
                        <p className="text-[11px] text-muted-foreground/70 mt-1 leading-tight">{c.emptyHint}</p>
                      </div>
                    ) : <p className="text-4xl font-serif mt-2 text-primary">{c.value}</p>}
                    {loaded && c.value > 0 && <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>}
                    {loaded && c.value === 0 && <p className="text-[10px] text-gold/70 mt-1 leading-tight">{c.emptyAction}</p>}
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

        <AcessosDashWidget />

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Cake className="w-4 h-4 text-gold" /> Aniversariantes da semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loaded ? <div className="space-y-2">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-6 w-full"/>)}</div>
              : aniversariantes.length === 0 ? (
                <div className="text-center py-4">
                  <Cake className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aniversariante nos proximos 7 dias</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {aniversariantes.map((p) => (
                    <li key={p.id} className="py-2.5 flex justify-between text-sm">
                      <span>{p.nome_completo}</span>
                      <span className="text-muted-foreground">{format(parse(p.data_nascimento,"yyyy-MM-dd",new Date()),"dd 'de' MMMM",{locale:ptBR})}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card-soft">
            <CardHeader>
              <CardTitle className="font-serif flex items-center gap-2">
                <Heart className="w-4 h-4 text-gold" /> Aniversarios de casamento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loaded ? <div className="space-y-2">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-6 w-full"/>)}</div>
              : casamentos.length === 0 ? (
                <div className="text-center py-4">
                  <Heart className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum aniversario de casamento esta semana</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {casamentos.map((p) => (
                    <li key={p.id} className="py-2.5 flex justify-between text-sm">
                      <span>{p.nome_completo}</span>
                      <span className="text-muted-foreground">{format(parse(p.data_nascimento,"yyyy-MM-dd",new Date()),"dd 'de' MMMM",{locale:ptBR})}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <VisitanteRapidoDialog open={openVisitanteRapido} onOpenChange={setOpenVisitanteRapido} onSaved={loadStats} />
    </div>
  );
}
