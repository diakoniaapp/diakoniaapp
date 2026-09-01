// ─── A agenda da semana, na Home ──────────────────────────────────────────
//
// Uma seção só, com a tira de sete dias filtrando tudo o que há no dia: as
// celebrações das pessoas e os compromissos da igreja.
//
// ── POR QUE DEIXARAM DE SER DUAS ───────────────────────────────────────────
//
// Nasceram separadas: "Para celebrar" mostrava sete dias de aniversários, e
// "Convide alguém" listava os cinco próximos eventos. Eram dois títulos, duas
// listas e dois recortes de tempo diferentes para responder à mesma pergunta —
// "o que tem por aí?".
//
// É o mesmo caminho que o Painel Pastoral já percorreu, e o comentário dele
// registra a razão: "eram dois títulos, dois blocos e duas listas para
// responder a mesma pergunta, e a de cima só sabia falar de hoje". A tira
// resolve com um controle o que duas listas resolviam com rolagem.
//
// ── AS DUAS LISTAS CONTINUAM SEPARADAS DENTRO DO DIA ───────────────────────
//
// Uma celebração não é um compromisso: não tem hora, não tem lugar, e o que se
// faz com ela é mandar uma mensagem. Um evento tem hora, tem lugar, e o que se
// faz com ele é convidar alguém. Misturá-los numa lista só transformaria o
// aniversário numa linha "dia todo" sem ação nenhuma.
//
// A ordem dentro do dia é a mesma do Painel Pastoral: celebrações primeiro.
// Felicitar é o que se faz assim que se lê; o culto das 19h já se sabe de cor.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cake, Heart, MessageCircle, Copy, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  proximosDias, linkWhatsApp, type EventoPastoral,
} from "@/services/agendaPastoralService";
import { montarConvite, atalhoDoCanal } from "@/lib/agenda/convite";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import { eventosExternos } from "@/lib/agenda/externalEvents";
import {
  fetchReservasAgenda, reservasComoOcorrencias, mapEspacoCodigoParaLocalId,
} from "@/lib/agenda/arrecadacao";
import type { EventoRow, EventoOcorrencia } from "@/lib/agenda/types";
import {
  identidadeParaConvite, type IdentidadeParaConvite, type MinhaFicha,
} from "@/services/meuEspacoService";
import { useReportarVazio } from "@/components/hoje/vazio";
import { TiraDaSemana, rotuloDoDia } from "@/components/painel/TiraDaSemana";
import { iconeDaOcorrencia, rotuloDaOcorrencia } from "@/lib/agenda/aparenciaDoEvento";

/** Hoje + 6 — sete casas, iguais às do Painel Pastoral. */
const DIAS_A_FRENTE = 6;

/** Data local em ISO. `toISOString()` é UTC e das 21h à meia-noite dá amanhã. */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AgendaDaSemana({ eu }: { eu: MinhaFicha | null }) {
  const hoje = useMemo(() => isoLocal(new Date()), []);
  const [diaAberto, setDiaAberto] = useState(hoje);
  const [efemerides, setEfemerides] = useState<EventoPastoral[] | null>(null);
  const [ocorrencias, setOcorrencias] = useState<EventoOcorrencia[] | null>(null);
  const [identidade, setIdentidade] = useState<IdentidadeParaConvite | null>(null);

  useEffect(() => {
    (async () => {
      // ── A janela começa à MEIA-NOITE ─────────────────────────────────
      //
      // `new Date()` traz a hora, e `expandirOcorrencias` compara com a data
      // do evento à meia-noite. Às 02h26 de hoje, um culto de hoje é anterior
      // ao início da janela e sai da lista: a tira marcava traço em HOJE
      // enquanto o Painel Pastoral, no mesmo instante, marcava 4.
      const inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + DIAS_A_FRENTE);

      // ── AS TRÊS FONTES ───────────────────────────────────────────────
      //
      // Eventos da igreja, calendário externo (feriados e CBB) e reservas de
      // espaço do Bazar/Cantina. Não é zelo: o comentário de
      // `AgendaDoDia.onJanela` conta que quem contou por fora replicou uma
      // fonte e esqueceu as outras — o indicador marcava 21 e a soma da tela
      // dava 22. Faltando duas aqui, esta tira discordaria daquela.
      const [{ data: eventos }, ident, efem, reservas, mapaLocal] = await Promise.all([
        supabase.from("eventos").select("*"),
        identidadeParaConvite().catch(() => ({ igreja: null, canalYoutube: null })),
        proximosDias(DIAS_A_FRENTE).catch(() => [] as EventoPastoral[]),
        fetchReservasAgenda(inicio, fim).catch(() => []),
        mapEspacoCodigoParaLocalId().catch(() => ({})),
      ]);
      setIdentidade(ident);
      setEfemerides(efem);
      // `as unknown as` porque o tipo gerado do banco e `EventoRow` divergem
      // em campos opcionais. É a mesma conversão que a tela de Agenda e o
      // widget do painel fazem — não invento aqui um contrato diferente deles.
      const internos = expandirOcorrencias((eventos ?? []) as unknown as EventoRow[], inicio, fim);
      setOcorrencias(
        [...internos, ...eventosExternos(inicio, fim), ...reservasComoOcorrencias(reservas, mapaLocal)]
          .filter(o => o.evento?.status !== "cancelado")
          .sort((a, b) =>
            (a.data ?? "").localeCompare(b.data ?? "") ||
            (a.evento?.hora_inicio ?? "99").localeCompare(b.evento?.hora_inicio ?? "99")),
      );
    })().catch(() => { setOcorrencias([]); setEfemerides([]); });
  }, []);

  // ── Tudo indexado por dia ────────────────────────────────────────────
  //
  // Um mapa com as sete casas SEMPRE presentes, mesmo vazias: a tira mostra
  // os sete dias, e um dia ausente do mapa viraria `undefined` no lugar de
  // zero, que é resposta diferente de "não há nada".
  const porDia = useMemo(() => {
    const mapa: Record<string, { celebra: EventoPastoral[]; agenda: EventoOcorrencia[] }> = {};
    for (let i = 0; i <= DIAS_A_FRENTE; i++) {
      const d = new Date(hoje + "T00:00");
      d.setDate(d.getDate() + i);
      mapa[isoLocal(d)] = { celebra: [], agenda: [] };
    }
    for (const ev of efemerides ?? []) {
      const data = ev.data_evento ?? ev.proxima_data;
      if (data && data in mapa) mapa[data].celebra.push(ev);
    }
    for (const o of ocorrencias ?? []) {
      if (o.data in mapa) mapa[o.data].agenda.push(o);
    }
    return mapa;
  }, [efemerides, ocorrencias, hoje]);

  /**
   * A contagem de cada casa soma AS DUAS listas.
   *
   * A tira filtra a seção inteira, e um contador que ignorasse metade do que
   * ela abre daria números sem relação com a lista logo abaixo — o defeito
   * que `AgendaDoDia.onJanela` documenta ter custado uma conferência.
   */
  const dias = useMemo(
    () => Object.keys(porDia).sort().map(iso => ({
      data: iso,
      total: porDia[iso].celebra.length + porDia[iso].agenda.length,
    })),
    [porDia],
  );

  const carregando = !ocorrencias || !efemerides;
  const totalDaSemana = dias.reduce((s, d) => s + d.total, 0);
  useReportarVazio(carregando || totalDaSemana === 0);
  if (carregando || totalDaSemana === 0) return null;

  const doDia = porDia[diaAberto] ?? { celebra: [], agenda: [] };

  const assina = eu
    ? {
        nome: eu.nome_social || eu.nome_completo,
        // A primeira da lista é a principal — a ordem que `funcaoMinisterial.ts`
        // define e que o catálogo já respeita.
        funcao: (eu.funcoes_ministeriais ?? [])[0] ?? null,
        sexo: eu.sexo,
        igreja: identidade?.igreja ?? null,
      }
    : undefined;

  const textoDoConvite = (o: EventoOcorrencia): string => {
    const ev: any = o.evento;
    const programada = ev?.transmissao_online ? (ev.transmissao_url ?? null) : null;
    const doCanal = ev?.transmissao_online ? atalhoDoCanal(identidade?.canalYoutube) : null;
    return montarConvite({
      titulo: ev?.titulo ?? "Evento",
      data: o.data,
      horaInicio: ev?.hora_inicio ?? null,
      horaFim: ev?.hora_fim ?? null,
      local: ev?.local_nome ?? ev?.local ?? null,
      transmitido: !!ev?.transmissao_online,
      urlTransmissao: programada ?? doCanal,
      // Muda a frase: um endereço programado se agenda com lembrete; o atalho
      // do canal só serve para assistir quando já está no ar.
      urlEhProgramada: !!programada,
      quemAssina: assina,
    });
  };

  const compartilhar = async (o: EventoOcorrencia, comoLink: boolean) => {
    const texto = textoDoConvite(o);
    if (comoLink) {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Convite copiado — é só colar onde quiser.");
    } catch {
      toast.error("Não consegui copiar. Tente pelo botão do WhatsApp.");
    }
  };

  return (
    <div className="space-y-3">
      {/* A tira vem antes da lista: é o filtro, e o que ele pede abre logo
          abaixo. Um controle depois do resultado obrigaria a rolar de volta
          para trocar de dia. */}
      <TiraDaSemana dias={dias} hojeIso={hoje} aberto={diaAberto} onAbrir={setDiaAberto} />

      {doDia.celebra.length === 0 && doDia.agenda.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">
          Nada marcado {diaAberto === hoje ? "para hoje" : `para ${rotuloDoDia(diaAberto, hoje).toLowerCase()}`}.
        </p>
      )}

      {doDia.celebra.length > 0 && (
        <div className="grid gap-2">
          {doDia.celebra.map(ev => (
            <Card key={`${ev.tipo}-${ev.ref_id}`} className="min-w-0">
              <CardContent className="p-3 flex items-center gap-3">
                {ev.tipo === "casamento"
                  ? <Heart className="w-4 h-4 shrink-0 text-gold" />
                  : <Cake className="w-4 h-4 shrink-0 text-gold" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate min-w-0">{ev.titulo}</p>
                  <p className="text-xs text-muted-foreground truncate">{resumoDaEfemeride(ev)}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5">
                  <a href={linkWhatsApp(ev)} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Felicitar</span>
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {doDia.agenda.length > 0 && (
        <div className="grid gap-2">
          {doDia.agenda.map(o => {
            const ev: any = o.evento;
            // O mesmo ícone e a mesma etiqueta que o Painel Pastoral usa para
            // este evento — os dois leem `aparenciaDoEvento`. Duas agendas
            // mostrando o mesmo culto com caras diferentes ensinariam que a
            // cara não quer dizer nada.
            const Icone = iconeDaOcorrencia(o);
            const rotulo = rotuloDaOcorrencia(o);
            return (
              <Card key={o.key} className="min-w-0">
                <CardContent className="p-3 flex items-center gap-3">
                  <Icone className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* `min-w-0` no próprio <p>: ele é item de flex, e item
                          de flex nasce com `min-width: auto` — o `truncate`
                          não corta nada e o título empurra o cartão para fora
                          da tela. Já aconteceu sete vezes neste repositório. */}
                      <p className="text-sm font-medium truncate min-w-0">{ev?.titulo}</p>
                      {ev?.transmissao_online && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                          <Radio className="w-3 h-3" /> ao vivo
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        rotulo,
                        ev?.hora_inicio ? String(ev.hora_inicio).slice(0, 5) : null,
                        ev?.local_nome ?? null,
                      ].filter(Boolean).join(" · ") || "dia todo"}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="px-2"
                      title="Copiar o convite" onClick={() => compartilhar(o, false)}>
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => compartilhar(o, true)}>
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Convidar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * "82 anos · amanhã".
 *
 * O `subtitulo` que `agenda_pastoral_proximos_dias` devolve é uma CÓPIA do
 * título — medido em produção: os dois trazem o nome da pessoa. Usá-lo
 * escrevia o nome duas vezes, um sobre o outro.
 */
function resumoDaEfemeride(ev: EventoPastoral): string {
  const anos = ev.anos_vai_completar ?? 0;
  const sufixo = ev.tipo === "casamento" ? "anos de casados" : "anos";
  // Zero anos acontece quando a ficha não tem o ano de nascimento — são 10 no
  // cadastro. "0 anos" seria pior que não dizer idade nenhuma.
  const idade = anos > 0 ? `${anos} ${sufixo}` : null;
  const rotulo: Record<string, string> = {
    aniversario: "aniversário", casamento: "bodas",
    membresia: "anos de membresia", pastorado: "anos de pastorado",
  };
  return [idade, rotulo[ev.tipo] ?? null].filter(Boolean).join(" · ") || "celebração";
}
