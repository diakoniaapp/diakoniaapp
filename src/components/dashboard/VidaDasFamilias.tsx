// ─── VidaDasFamilias.tsx — Bloco 3 do Dashboard ────────────────────────────
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Cake, Heart, MessageCircle, Loader2, CheckCircle2,
} from "lucide-react";
import {
  proximosDias, linkWhatsApp,
  type EventoPastoral,
} from "@/services/agendaPastoralService";

export function VidaDasFamilias() {
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    proximosDias(7)
      .then(e => { if (!cancelled) setEventos(e); })
      .catch(() => { if (!cancelled) setEventos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function abrirWhats(ev: EventoPastoral) {
    window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando...
        </CardContent>
      </Card>
    );
  }

  const aniversarios = eventos.filter(e => e.tipo === "aniversario");
  const casamentos   = eventos.filter(e => e.tipo === "casamento");

  if (eventos.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 flex items-center gap-2 justify-center text-muted-foreground">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">Nenhum aniversário ou casamento nos próximos 7 dias.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-3">
      <ColunaEventos
        cor="rose"
        icon={Cake}
        titulo="Aniversários"
        lista={aniversarios}
        onWhats={abrirWhats}
        sufixo="anos"
      />
      <ColunaEventos
        cor="pink"
        icon={Heart}
        titulo="Bodas de casamento"
        lista={casamentos}
        onWhats={abrirWhats}
        sufixo="anos de casados"
      />
    </div>
  );
}

interface ColunaProps {
  cor: "rose" | "pink";
  icon: typeof Cake;
  titulo: string;
  lista: EventoPastoral[];
  onWhats: (e: EventoPastoral) => void;
  sufixo: string;
}

function ColunaEventos({ cor, icon: Icon, titulo, lista, onWhats, sufixo }: ColunaProps) {
  const corTitulo = cor === "rose" ? "text-rose-600" : "text-pink-600";
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className={`text-xs font-semibold flex items-center gap-1.5 ${corTitulo}`}>
            <Icon className="w-3.5 h-3.5" /> {titulo}
          </h3>
          <Badge variant="outline" className="text-[10px]">{lista.length}</Badge>
        </div>
        {lista.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Nenhum nos próximos 7 dias
          </p>
        ) : (
          <ul className="space-y-1.5">
            {lista.slice(0, 6).map(ev => {
              const data = new Date(ev.data_evento + "T00:00");
              const dia = data.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
              const quando = ev.dias_ate_evento === 0 ? "hoje"
                           : ev.dias_ate_evento === 1 ? "amanhã"
                           : dia;
              return (
                <li key={ev.ref_id} className="flex items-center justify-between gap-2 border rounded-md px-2 py-1.5 bg-background hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{ev.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {quando}
                      {(ev.anos_completar ?? 0) > 0 && ` · ${ev.anos_completar} ${sufixo}`}
                    </p>
                  </div>
                  {(ev.telefone || ev.telefone_secundario) && (
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="h-7 w-7 p-0 text-emerald-700 hover:bg-emerald-50 shrink-0"
                      onClick={() => onWhats(ev)}
                      title="Enviar mensagem via WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              );
            })}
            {lista.length > 6 && (
              <li className="text-[10px] text-muted-foreground italic text-center pt-1">
                ... e mais {lista.length - 6} esta semana
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
