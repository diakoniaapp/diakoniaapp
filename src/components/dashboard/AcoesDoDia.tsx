// ─── AcoesDoDia.tsx — Bloco 4 do Dashboard ─────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Cake, Heart, MessageCircle, Sun, Loader2, GraduationCap, ChevronRight,
} from "lucide-react";
import {
  proximosDias, linkWhatsApp,
  type EventoPastoral,
} from "@/services/agendaPastoralService";

function ehDomingo(): boolean {
  return new Date().getDay() === 0;
}

export function AcoesDoDia() {
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    proximosDias(7)
      .then(e => {
        if (cancelled) return;
        setEventos(e.filter(ev => ev.dias_ate_evento === 0));
      })
      .catch(() => { if (!cancelled) setEventos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-5 text-center text-muted-foreground text-xs">
          <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Buscando...
        </CardContent>
      </Card>
    );
  }

  const domingoHoje = ehDomingo();
  const semEventos = eventos.length === 0;

  if (semEventos && !domingoHoje) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 text-center text-muted-foreground text-sm">
          <Sun className="w-4 h-4 inline mr-1.5 text-amber-500" />
          Hoje está leve — nenhuma efeméride no calendário pastoral.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sugestão de domingo: fazer chamada */}
      {domingoHoje && (
        <Card className="border-gold/40 bg-gradient-to-br from-gold/10 to-gold/5">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/20 ring-1 ring-gold/40 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="font-medium text-sm">É domingo!</p>
                <p className="text-xs text-muted-foreground">Lembra de fazer a chamada da EBD?</p>
              </div>
            </div>
            <Link to="/ebd">
              <Button type="button" size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white border-0">
                Abrir EBD <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Eventos pastorais de hoje */}
      {!semEventos && (
        <div className="grid md:grid-cols-2 gap-3">
          {eventos.map(ev => {
            const ehAnis = ev.tipo === "aniversario";
            const Icon = ehAnis ? Cake : Heart;
            const grad = ehAnis 
              ? "bg-gradient-to-br from-pink-100 to-pink-50 border-pink-200"
              : "bg-gradient-to-br from-rose-100 to-rose-50 border-rose-200";
            const iconCor = ehAnis ? "text-pink-600" : "text-rose-600";
            const sufixo = ehAnis ? "anos" : "anos de casados";
            const hasTel = !!ev.telefone || !!ev.telefone_secundario;
            return (
              <Card key={ev.ref_id} className={grad}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full bg-white/60 ring-1 ring-current/20 flex items-center justify-center shrink-0 ${iconCor}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ev.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {(ev.anos_completar ?? 0) > 0 
                          ? `${ev.anos_completar} ${sufixo}` 
                          : ehAnis ? "Aniversário" : "Aniversário de casamento"}
                      </p>
                      {ev.telefone && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">📞 {ev.telefone}</p>
                      )}
                    </div>
                  </div>
                  {hasTel && (
                    <Button
                      type="button" size="sm"
                      onClick={() => window.open(linkWhatsApp(ev), "_blank", "noopener,noreferrer")}
                      className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <MessageCircle className="w-4 h-4" /> Enviar mensagem
                    </Button>
                  )}
                  {!hasTel && (
                    <p className="text-[10px] text-muted-foreground text-center italic">
                      Sem telefone cadastrado
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
