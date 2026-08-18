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

export function AgendaDoDia() {
  const [ocorrencias, setOcorrencias] = useState<EventoOcorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [convite, setConvite] = useState<EventoOcorrencia | null>(null);

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
        {ocorrencias.map(o => {
          const ev    = o.evento;
          const hora  = formatarHora(ev?.hora_inicio);
          const fim   = formatarHora(ev?.hora_fim);
          const cat   = o.categoria ?? "igreja";
          const rotulo = cat === "igreja"
            ? (ev?.tipo ? TIPO_LABEL[ev.tipo] ?? ev.tipo : null)
            : CATEGORIA_LABEL[cat] ?? null;

          return (
            // min-w-0 no item e no bloco de texto: sem isso um título longo
            // empurra a hora para fora e a lista rola de lado no celular.
            <li key={o.key} className="flex items-start gap-3 px-3 py-2.5 min-w-0">
              <div className="w-14 shrink-0 text-xs tabular-nums text-muted-foreground pt-0.5">
                {hora ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />{hora}
                  </span>
                ) : (
                  <span className="italic">dia todo</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{ev?.titulo}</p>
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
