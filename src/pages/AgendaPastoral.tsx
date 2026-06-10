// ─── AgendaPastoral.tsx — Agenda mensal de aniversários e bodas ────────────
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cake, Heart, MessageCircle, ChevronLeft, ChevronRight,
  CalendarCheck, Loader2, Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  agendaDoMes, linkWhatsApp, mensagemPastoral,
  type EventoPastoral,
} from "@/services/agendaPastoralService";

const NOMES_MES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export default function AgendaPastoral() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1); // 1-12
  const [eventos, setEventos] = useState<EventoPastoral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, [ano, mes]);

  async function carregar() {
    setLoading(true);
    try {
      const e = await agendaDoMes(ano, mes);
      setEventos(e);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }

  function abrirWhatsApp(ev: EventoPastoral, tel?: string) {
    const url = linkWhatsApp(ev, tel);
    // Copiar mensagem pra área de transferência (se não tiver telefone)
    if (!tel && !ev.telefone) {
      try { navigator.clipboard.writeText(mensagemPastoral(ev)); toast.info("Mensagem copiada — telefone não cadastrado"); } catch {}
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function navegar(delta: number) {
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes > 12) { novoMes = 1; novoAno++; }
    if (novoMes < 1)  { novoMes = 12; novoAno--; }
    setMes(novoMes);
    setAno(novoAno);
  }

  function voltarParaHoje() {
    const h = new Date();
    setAno(h.getFullYear()); setMes(h.getMonth() + 1);
  }

  const aniversarios = useMemo(() => eventos.filter(e => e.tipo === "aniversario"), [eventos]);
  const casamentos   = useMemo(() => eventos.filter(e => e.tipo === "casamento"), [eventos]);

  const hojeDia = hoje.getDate();
  const ehMesAtual = ano === hoje.getFullYear() && mes === (hoje.getMonth() + 1);

  function diaDoEvento(e: EventoPastoral): number {
    return new Date(e.proxima_data + "T00:00").getDate();
  }

  function ehHoje(e: EventoPastoral): boolean {
    return ehMesAtual && diaDoEvento(e) === hojeDia;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-gold" />
            Agenda Pastoral
          </h1>
          <p className="text-sm text-muted-foreground">
            Aniversários e bodas de casamento da igreja em {NOMES_MES[mes-1]}/{ano}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => navegar(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={voltarParaHoje}>
            Hoje
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => navegar(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : eventos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum aniversário ou casamento em {NOMES_MES[mes-1]}.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Aniversários */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Cake className="w-4 h-4 text-pink-500" /> Aniversários ({aniversarios.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {aniversarios.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhum este mês</p>
              )}
              {aniversarios.map(e => (
                <EventoCard key={e.ref_id} evento={e} ehHoje={ehHoje(e)} dia={diaDoEvento(e)} onWhats={abrirWhatsApp} />
              ))}
            </CardContent>
          </Card>

          {/* Bodas */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-rose-500" /> Bodas de casamento ({casamentos.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {casamentos.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">Nenhuma este mês</p>
              )}
              {casamentos.map(e => (
                <EventoCard key={e.ref_id} evento={e} ehHoje={ehHoje(e)} dia={diaDoEvento(e)} onWhats={abrirWhatsApp} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Card de evento individual ─────────────────────────────────────────────
interface EventoCardProps {
  evento: EventoPastoral;
  ehHoje: boolean;
  dia: number;
  onWhats: (ev: EventoPastoral, tel?: string) => void;
}

function EventoCard({ evento, ehHoje, dia, onWhats }: EventoCardProps) {
  const ehAnis = evento.tipo === "aniversario";
  const cor = ehHoje ? "ring-2 ring-gold border-gold" : "";
  const fundo = ehAnis ? "bg-pink-50/40 dark:bg-pink-950/10" : "bg-rose-50/40 dark:bg-rose-950/10";

  return (
    <div className={`border rounded-lg px-3 py-2 ${fundo} ${cor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate text-sm">{evento.titulo}</p>
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground mt-0.5">
            <span>Dia {dia}</span>
            <span>·</span>
            <span>{evento.anos_vai_completar > 0 
              ? `${evento.anos_vai_completar} ${ehAnis ? "anos" : `${evento.anos_vai_completar === 1 ? "ano" : "anos"} de casados`}` 
              : "—"}</span>
            {ehHoje && (
              <Badge variant="outline" className="text-[9px] bg-gold/15 border-gold text-foreground/80">HOJE</Badge>
            )}
          </div>
          {evento.telefone && (
            <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Phone className="w-2.5 h-2.5" /> {evento.telefone}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end shrink-0">
          {evento.telefone && (
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 px-2 gap-1 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={() => onWhats(evento, evento.telefone!)}
              title="Enviar mensagem por WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {evento.telefone_secundario ? "1" : "Enviar"}
            </Button>
          )}
          {evento.telefone_secundario && (
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 px-2 gap-1 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={() => onWhats(evento, evento.telefone_secundario!)}
              title="Enviar para o cônjuge"
            >
              <MessageCircle className="w-3.5 h-3.5" /> 2
            </Button>
          )}
          {!evento.telefone && (
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 px-2 gap-1 text-xs text-muted-foreground"
              onClick={() => onWhats(evento)}
              title="Sem telefone — copia mensagem"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Copiar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
