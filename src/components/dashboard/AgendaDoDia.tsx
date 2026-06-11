// ─── AgendaDoDia.tsx — Bloco 8 do Dashboard ────────────────────────────────
// Lê tabela `eventos` filtrando data = hoje (recorrências não expandidas — simplificação MVP).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, MapPin, Clock, Loader2, CheckCircle2, ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface EventoHoje {
  id: string;
  titulo: string;
  tipo: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  local: string | null;
  status: string | null;
  cor: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  culto: "Culto",
  ensaio: "Ensaio",
  reuniao: "Reunião",
  estudo: "Estudo",
  evento: "Evento",
  visita: "Visita",
  oracao: "Oração",
  retiro: "Retiro",
};

function formatarHora(h: string | null): string | null {
  if (!h) return null;
  return h.slice(0, 5); // HH:MM
}

export function AgendaDoDia() {
  const [eventos, setEventos] = useState<EventoHoje[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const hoje = new Date().toISOString().slice(0, 10);
    supabase.from("eventos")
      .select("id, titulo, tipo, hora_inicio, hora_fim, local, status, cor")
      .eq("data", hoje)
      .neq("status", "cancelado")
      .order("hora_inicio", { ascending: true, nullsFirst: false })
      .then(({ data }) => { if (!cancelled) setEventos((data ?? []) as EventoHoje[]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando agenda...
        </CardContent>
      </Card>
    );
  }

  if (eventos.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 flex flex-col items-center gap-2 justify-center text-muted-foreground">
          <CalendarDays className="w-5 h-5 text-gold/60" />
          <p className="text-sm">Nenhum evento programado para hoje.</p>
          <Link to="/eventos">
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
              Ver agenda completa <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid md:grid-cols-2 gap-2">
        {eventos.map(ev => (
          <Card key={ev.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{ev.titulo}</p>
                  {ev.tipo && (
                    <Badge variant="outline" className="text-[10px] mt-1" 
                           style={ev.cor ? { borderColor: ev.cor, color: ev.cor } : undefined}>
                      {TIPO_LABEL[ev.tipo] ?? ev.tipo}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {formatarHora(ev.hora_inicio) && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatarHora(ev.hora_inicio)}
                    {formatarHora(ev.hora_fim) && ` – ${formatarHora(ev.hora_fim)}`}
                  </span>
                )}
                {ev.local && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span className="truncate">{ev.local}</span>
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="text-center pt-1">
        <Link to="/eventos">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs">
            Ver agenda completa <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
