// ─── AgendaDoDia.tsx — "Acontecendo hoje" ──────────────────────────────────
//
// Mostra TUDO o que a igreja tem marcado para hoje, com as mesmas fontes que
// a tela de Agenda usa:
//
//   1. eventos da igreja, com as recorrências expandidas
//   2. feriados e datas do calendário batista
//   3. reservas de espaço do Bazar/Cantina
//
// Antes este bloco fazia `from("eventos").eq("data", hoje)` e o próprio
// arquivo avisava: "recorrências não expandidas — simplificação MVP". Era o
// bastante para esconder justamente o que mais se repete numa igreja — o
// culto de domingo, o ensaio de sábado, a reunião mensal —, porque evento
// que se repete é guardado como REGRA, não como uma linha por data. Um culto
// semanal cadastrado corretamente nunca apareceu aqui.
//
// Aniversários ficam de fora de propósito: têm bloco próprio logo acima
// ("Ações de hoje"), com telefone e botão de mensagem. Repeti-los aqui seria
// dizer a mesma coisa duas vezes na mesma tela.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, MapPin, Clock, Loader2, ChevronRight, Share2,
} from "lucide-react";
import { ConvidarParaEvento } from "@/components/dashboard/ConvidarParaEvento";
import { supabase } from "@/integrations/supabase/client";
import { useReportarVazio } from "@/components/hoje/vazio";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import { eventosExternos } from "@/lib/agenda/externalEvents";
import {
  fetchReservasAgenda, reservasComoOcorrencias, mapEspacoCodigoParaLocalId,
} from "@/lib/agenda/arrecadacao";
import type { EventoOcorrencia, EventoRow } from "@/lib/agenda/types";

// Os seis valores do enum `evento_tipo` no banco, e só eles.
//
// O mapa anterior listava "estudo", "evento", "visita", "oracao" e "retiro",
// que não existem no enum — nenhum evento poderia tê-los. Rótulo para valor
// impossível não quebra nada, mas descreve um sistema que não é este, e é
// assim que alguém depois passa a acreditar que o tipo existe.
const TIPO_LABEL: Record<string, string> = {
  culto:       "Culto",
  reuniao:     "Reunião",
  ensaio:      "Ensaio",
  acao_social: "Ação social",
  curso:       "Curso",
  outro:       "Outro",
};

const CATEGORIA_LABEL: Record<string, string> = {
  batista: "Calendário batista",
  feriado: "Feriado",
  arrecadacao: "Reserva de espaço",
};

function formatarHora(h: string | null | undefined): string | null {
  if (!h) return null;
  return h.slice(0, 5);
}

/** Meia-noite local de hoje — o mesmo instante nas duas pontas da janela. */
function hojeLocal(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── O dia andando ──────────────────────────────────────────────────────────
//
// Um bloco chamado "Acontecendo hoje" que mostra às 21h o mesmo que mostrava
// às 8h não está dizendo o que acontece: está dizendo o que aconteceria. Às
// 19h30 o culto que começou às 19h é a informação; o ensaio das 9h não é.
//
// Três estados, e cada um muda o que a linha pesa na tela:
//
//   agora   → está em curso (já começou, ainda não terminou)
//   proximo → é o próximo a começar
//   passou  → já terminou
//
// Evento sem hora ("dia todo") nunca é "passou": ele vale o dia inteiro.

type Momento = "agora" | "proximo" | "futuro" | "passou";

/** Minutos desde a meia-noite, a partir de "HH:MM[:SS]". */
function emMinutos(h: string | null | undefined): number | null {
  if (!h) return null;
  const [hh, mm] = h.split(":");
  const n = Number(hh) * 60 + Number(mm);
  return Number.isFinite(n) ? n : null;
}

/**
 * Classifica cada ocorrência contra o relógio.
 *
 * O "próximo" é único de propósito: se três eventos ainda vão começar, apontar
 * os três como próximos não ajuda a decidir nada. Só o primeiro ganha o
 * destaque; os outros ficam em espera.
 */
function classificar(ocorrencias: EventoOcorrencia[], agoraMin: number): Map<string, Momento> {
  const fora = new Map<string, Momento>();
  let proximoAchado = false;

  for (const o of ocorrencias) {
    const ini = emMinutos(o.evento?.hora_inicio);
    const fim = emMinutos(o.evento?.hora_fim);

    if (ini === null) { fora.set(o.key, "agora"); continue; }   // dia todo

    // Sem hora de fim, assume-se uma hora de duração — é o suficiente para o
    // evento não sumir da tela no minuto seguinte ao começo.
    const termina = fim ?? ini + 60;

    if (agoraMin >= ini && agoraMin < termina) { fora.set(o.key, "agora"); continue; }
    if (agoraMin >= termina) { fora.set(o.key, "passou"); continue; }

    if (!proximoAchado) { fora.set(o.key, "proximo"); proximoAchado = true; }
    else fora.set(o.key, "futuro");
  }

  return fora;
}

/** "em 25 min" / "em 2h10" — quanto falta para começar. */
function faltam(o: EventoOcorrencia, agoraMin: number): string {
  const ini = emMinutos(o.evento?.hora_inicio);
  if (ini === null) return "";
  const d = ini - agoraMin;
  if (d <= 0) return "instantes";
  if (d < 60) return `${d} min`;
  const h = Math.floor(d / 60), m = d % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Minutos desde a meia-noite, agora. Recalculado a cada minuto. */
function useAgoraEmMinutos(): number {
  const calc = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const [min, setMin] = useState(calc);

  useEffect(() => {
    // Acorda no segundo zero do próximo minuto e depois de minuto em minuto,
    // em vez de a cada 60s a partir da montagem: assim a mudança de estado
    // acontece na virada do relógio, e não 40 segundos depois dela.
    let intervalo: ReturnType<typeof setInterval>;
    const ateOProximoMinuto = (60 - new Date().getSeconds()) * 1000;
    const inicio = setTimeout(() => {
      setMin(calc());
      intervalo = setInterval(() => setMin(calc()), 60_000);
    }, ateOProximoMinuto);
    return () => { clearTimeout(inicio); clearInterval(intervalo); };
  }, []);

  return min;
}

export function AgendaDoDia() {
  const [ocorrencias, setOcorrencias] = useState<EventoOcorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [convite, setConvite] = useState<EventoOcorrencia | null>(null);

  // Relogio: reclassifica os eventos a cada virada de minuto.
  const agoraMin = useAgoraEmMinutos();
  const momentos = classificar(ocorrencias, agoraMin);

  useReportarVazio(loading || ocorrencias.length === 0);

  useEffect(() => {
    let cancelado = false;
    const hoje = hojeLocal();

    (async () => {
      try {
        const [{ data: eventos }, reservas, mapa] = await Promise.all([
          supabase.from("eventos").select("*"),
          fetchReservasAgenda(hoje, hoje).catch(() => []),
          mapEspacoCodigoParaLocalId().catch(() => ({})),
        ]);
        if (cancelado) return;

        // `as unknown as` porque o tipo gerado do banco e EventoRow divergem em
        // campos opcionais. É a mesma conversão que a tela de Agenda faz na
        // linha equivalente — não invento aqui um contrato diferente do dela.
        const internos = expandirOcorrencias((eventos ?? []) as unknown as EventoRow[], hoje, hoje)
          .map(o => ({ ...o, categoria: "igreja" as const }));
        const externos = eventosExternos(hoje, hoje);
        const espacos  = reservasComoOcorrencias(reservas, mapa);

        const tudo = [...internos, ...externos, ...espacos]
          .filter(o => o.evento?.status !== "cancelado")
          .sort((a, b) => (a.evento?.hora_inicio ?? "99").localeCompare(b.evento?.hora_inicio ?? "99"));

        setOcorrencias(tudo);
      } catch {
        if (!cancelado) setOcorrencias([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
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

  // O que já terminou desce para o fim da lista, mantendo a ordem de horário
  // dentro de cada grupo. O bloco passa a responder "o que vem agora" em vez
  // de "como o dia foi planejado de manhã" — e o que passou continua visível,
  // porque saber que a reunião das 9h já aconteceu também é informação.
  const ordenadas = [...ocorrencias].sort((a, b) => {
    const pa = momentos.get(a.key) === "passou" ? 1 : 0;
    const pb = momentos.get(b.key) === "passou" ? 1 : 0;
    return pa - pb;
  });

  if (ocorrencias.length === 0) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardContent className="py-5 flex flex-col items-center gap-2 justify-center text-muted-foreground">
          <CalendarDays className="w-5 h-5 text-gold/60" />
          <span className="text-sm">Nada marcado para hoje.</span>
          <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
            <Link to="/eventos">Abrir agenda <ChevronRight className="w-3.5 h-3.5" /></Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-md border bg-card">
        {ordenadas.map(o => {
          const ev    = o.evento;
          const hora  = formatarHora(ev?.hora_inicio);
          const fim   = formatarHora(ev?.hora_fim);
          const cat   = o.categoria ?? "igreja";
          const rotulo = cat === "igreja"
            ? (ev?.tipo ? TIPO_LABEL[ev.tipo] ?? ev.tipo : null)
            : CATEGORIA_LABEL[cat] ?? null;
          const momento = momentos.get(o.key) ?? "futuro";
          const passou  = momento === "passou";

          return (
            // min-w-0 no item e no bloco de texto: sem isso um título longo
            // empurra a hora para fora e a lista rola de lado no celular.
            <li
              key={o.key}
              className={`flex items-start gap-3 px-3 py-2.5 min-w-0 transition-colors ${
                momento === "agora"   ? "bg-gold/10" :
                momento === "proximo" ? "bg-muted/40" : ""
              } ${passou ? "opacity-45" : ""}`}
            >
              <div className={`w-14 shrink-0 text-xs tabular-nums pt-0.5 ${
                momento === "agora" ? "text-gold font-medium" : "text-muted-foreground"
              }`}>
                {hora ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />{hora}
                  </span>
                ) : (
                  <span className="italic">dia todo</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${passou ? "font-normal line-through decoration-1" : "font-medium"}`}>
                  {ev?.titulo}
                </p>
                {/* O estado dito por extenso, e não só por cor: quem enxerga
                    mal, ou está no sol da rua, não lê um fundo dourado. */}
                {momento === "agora" && (
                  <p className="text-xs text-gold font-medium mt-0.5">Acontecendo agora</p>
                )}
                {momento === "proximo" && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    A seguir{hora ? ` — em ${faltam(o, agoraMin)}` : ""}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  {rotulo && (
                    <Badge variant="outline" className="text-xs font-normal">{rotulo}</Badge>
                  )}
                  {fim && hora && (
                    <span className="text-xs text-muted-foreground">até {fim}</span>
                  )}
                  {ev?.local && (
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1 min-w-0">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{ev.local}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Convidar só para o que é da igreja. Feriado nacional e data
                  do calendário batista não se convida ninguém para ir, e
                  reserva de espaço é de terceiro — o convite seria da pessoa
                  que reservou, não da igreja. */}
              {cat === "igreja" && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => setConvite(o)}
                  className="shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Convidar</span>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="text-right">
        <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
          <Link to="/eventos">Abrir agenda <ChevronRight className="w-3.5 h-3.5" /></Link>
        </Button>
      </div>

      <ConvidarParaEvento
        open={!!convite}
        onOpenChange={(v) => { if (!v) setConvite(null); }}
        titulo={convite?.evento?.titulo ?? ""}
        data={convite?.data ?? ""}
        horaInicio={convite?.evento?.hora_inicio}
        horaFim={convite?.evento?.hora_fim}
        local={convite?.evento?.local}
      />
    </div>
  );
}
