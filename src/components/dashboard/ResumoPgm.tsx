import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Sparkles, HandHeart, Calendar, TrendingUp } from "lucide-react";
import {
  resumoGeralPgm, proximasReunioes, alertasAusencia, diaSemanaTexto, horarioTexto,
  type PgmResumoGeral,
} from "@/services/pgmService";

export function ResumoPgm() {
  const [resumo, setResumo] = useState<PgmResumoGeral | null>(null);
  const [proximas, setProximas] = useState<Awaited<ReturnType<typeof proximasReunioes>>>([]);
  const [alertas, setAlertas] = useState<Awaited<ReturnType<typeof alertasAusencia>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [r, p, a] = await Promise.all([
          resumoGeralPgm(),
          proximasReunioes(),
          alertasAusencia(),
        ]);
        setResumo(r);
        setProximas((p ?? []).slice(0, 4));
        setAlertas((a ?? []).slice(0, 5));
      } catch (e) {
        // silencioso — pode ser que ainda não tenha aplicado as migrations
        console.warn("[Dashboard PGM]", e);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <Card><CardContent className="py-3 text-center text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando PGMs...
      </CardContent></Card>
    );
  }

  if (!resumo || resumo.grupos_ativos === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-sm text-muted-foreground space-y-2">
          <Users className="w-8 h-8 mx-auto opacity-30" />
          <p>Ainda não há PGMs cadastrados.</p>
          <Link to="/pgm" className="text-primary underline text-xs">Criar o primeiro PGM</Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat icon={<Users className="w-4 h-4 text-gold" />} valor={resumo.grupos_ativos} label="Grupos ativos" link="/pgm" />
        <Stat icon={<Users className="w-4 h-4 text-emerald-600" />} valor={resumo.total_membros} label="Participantes" />
        <Stat icon={<TrendingUp className="w-4 h-4 text-blue-600" />} valor={`${resumo.presenca_media_pct}%`} label="Presença (30d)" />
        <Stat icon={<HandHeart className="w-4 h-4 text-rose-600" />} valor={resumo.pedidos_ativos} label="Pedidos ativos" />
      </div>

      {/* Próximos encontros */}
      {proximas.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-gold" /> Próximos encontros
            </p>
            {proximas.map(p => (
              <Link key={p.grupo_id} to={`/pgm/${p.grupo_id}`}
                className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5 hover:bg-muted/40">
                <span className="font-medium truncate">{p.nome}</span>
                <span className="text-muted-foreground shrink-0 ml-2">
                  {p.proxima_data ? new Date(p.proxima_data + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })
                    : diaSemanaTexto(p.dia_semana)}
                  {p.horario && ` · ${horarioTexto(p.horario)}`}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Alertas de ausência */}
      {alertas.length > 0 && (
        <Card className="border-amber-300/40 bg-amber-50/30">
          <CardContent className="py-3 space-y-1.5">
            <p className="text-xs font-medium text-amber-700 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Cuidado pastoral — 3+ faltas seguidas
            </p>
            {alertas.map((a, i) => (
              <Link key={`${a.pessoa_id}-${i}`} to={`/pgm/${a.grupo_id}`}
                className="flex items-center justify-between text-xs border border-amber-200 rounded-md px-2 py-1.5 bg-white hover:bg-amber-50">
                <span className="font-medium truncate">{a.nome}</span>
                <span className="text-amber-700 shrink-0 ml-2">{a.grupo_nome}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon, valor, label, link }: { icon: JSX.Element; valor: number | string; label: string; link?: string }) {
  const inner = (
    <div className="border rounded-md py-2 px-2 text-center bg-card hover:bg-muted/40 transition-colors">
      <div className="flex items-center justify-center gap-1">{icon}</div>
      <p className="text-lg font-semibold tabular-nums leading-tight">{valor}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
  return link ? <Link to={link}>{inner}</Link> : inner;
}
