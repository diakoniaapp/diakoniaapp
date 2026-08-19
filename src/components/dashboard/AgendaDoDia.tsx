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
  CalendarDays, MapPin, Clock, Loader2, ChevronRight, ChevronDown, Share2,
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

/**
 * Data local no formato YYYY-MM-DD.
 *
 * NAO usar toISOString().slice(0,10) para isto: ele devolve a data em UTC. No
 * Rio (UTC-3), das 21h em diante o UTC ja esta no dia seguinte — e a
 * separacao entre "hoje" e "amanha" se inverteria justamente no horario em
 * que o bloco precisa virar o dia. Este defeito nasceria funcionando de manha
 * e quebrando a noite, que e a pior forma de nascer.
 */
function dataLocal(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
  const [verPassado, setVerPassado] = useState(false);

  // Relogio: reclassifica os eventos a cada virada de minuto.
  const agoraMin = useAgoraEmMinutos();
  // Classifica so os de HOJE. Aplicar o relogio de hoje a um evento de
  // amanha faria a Live Matinal das 06:30 nascer riscada as 20h de hoje.
  const hojeISO  = dataLocal();
  const momentos = classificar(
    ocorrencias.filter(o => (o.data ?? hojeISO) === hojeISO),
    agoraMin,
  );

  useReportarVazio(loading || ocorrencias.length === 0);

  useEffect(() => {
    let cancelado = false;
    const hoje = hojeLocal();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    (async () => {
      try {
        // A janela vai ate AMANHA, nao so ate hoje. Ver o comentario de
        // `sobrouHoje` mais abaixo: sem o dia seguinte carregado, o bloco vira
        // uma lista de riscados a partir das 22h.
        const [{ data: eventos }, reservas, mapa] = await Promise.all([
          supabase.from("eventos").select("*"),
          fetchReservasAgenda(hoje, amanha).catch(() => []),
          mapEspacoCodigoParaLocalId().catch(() => ({})),
        ]);
        if (cancelado) return;

        // `as unknown as` porque o tipo gerado do banco e EventoRow divergem em
        // campos opcionais. É a mesma conversão que a tela de Agenda faz na
        // linha equivalente — não invento aqui um contrato diferente do dela.
        const internos = expandirOcorrencias((eventos ?? []) as unknown as EventoRow[], hoje, amanha)
          .map(o => ({ ...o, categoria: "igreja" as const }));
        const externos = eventosExternos(hoje, amanha);
        const espacos  = reservasComoOcorrencias(reservas, mapa);

        const tudo = [...internos, ...externos, ...espacos]
          .filter(o => o.evento?.status !== "cancelado")
          .sort((a, b) =>
            (a.data ?? "").localeCompare(b.data ?? "") ||
            (a.evento?.hora_inicio ?? "99").localeCompare(b.evento?.hora_inicio ?? "99"));

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

  // ── Quando o dia vira ────────────────────────────────────────────────────
  //
  // Uma agenda que so olha para hoje fica inutil justamente no fim do dia:
  // as 22h, com tudo ja realizado, o bloco vira uma lista de cinco itens
  // riscados. Nao informa nada, e ainda ocupa o alto da tela.
  //
  // A regra: enquanto sobrar QUALQUER coisa por acontecer hoje, mostra hoje.
  // Quando nao sobrar, mostra amanha — que e a pergunta que a pessoa passa a
  // ter as 22h de uma terca: "o que tem amanha?".
  //
  // Nao e por horario fixo. Um dia que acaba as 15h vira as 15h; um que tem
  // culto as 20h so vira depois das 21h30. Quem manda e a agenda, nao o
  // relogio.
  const chaveHoje = dataLocal();
  const deHoje   = ocorrencias.filter(o => (o.data ?? chaveHoje) === chaveHoje);
  const deAmanha = ocorrencias.filter(o => (o.data ?? chaveHoje) !== chaveHoje);

  const sobrouHoje = deHoje.some(o => momentos.get(o.key) !== "passou");
  const viraOdia   = !sobrouHoje && deAmanha.length > 0;

  // O que já terminou desce para o fim da lista, mantendo a ordem de horário
  // dentro de cada grupo. O bloco passa a responder "o que vem agora" em vez
  // de "como o dia foi planejado de manhã" — e o que passou continua visível,
  // porque saber que a reunião das 9h já aconteceu também é informação.
  const ordenadas = viraOdia
    ? deAmanha
    : [...deHoje].sort((a, b) => {
        const pa = momentos.get(a.key) === "passou" ? 1 : 0;
        const pb = momentos.get(b.key) === "passou" ? 1 : 0;
        return pa - pb;
      });

  // ── O que já passou fica recolhido ───────────────────────────────────────
  //
  // Às 20h49 de uma terça o bloco mostrava CINCO linhas, das quais QUATRO já
  // tinham acontecido. Riscar e esmaecer resolveu a leitura — nenhuma delas
  // era confundida com o que vem —, mas não resolveu o espaço: o único evento
  // que importava ocupava um quinto do bloco, e os outros quatro quintos eram
  // história.
  //
  // Agora a história vira uma linha, que se abre se alguém quiser. Continua
  // acessível porque saber que a reunião das 9h aconteceu é informação — só
  // não é a informação que se procura ao abrir o painel às nove da noite.
  const jaPassaram = viraOdia ? [] : ordenadas.filter(o => momentos.get(o.key) === "passou");
  const visiveis   = viraOdia ? ordenadas : ordenadas.filter(o => momentos.get(o.key) !== "passou");
  const listadas   = verPassado ? [...visiveis, ...jaPassaram] : visiveis;

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

      {/* Diz de que dia e a lista, porque o titulo da secao continua sendo
          "Acontecendo hoje" — e as 22h ele estaria mentindo sem esta linha. */}
      {viraOdia && (
        <p className="text-xs text-muted-foreground px-1 flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 shrink-0" />
          Hoje já passou. <b className="text-foreground font-medium">Amanhã:</b>
        </p>
      )}

      <ul className="divide-y rounded-md border bg-card">
        {listadas.map(o => {
          const ev    = o.evento;
          const hora  = formatarHora(ev?.hora_inicio);
          const fim   = formatarHora(ev?.hora_fim);
          const cat   = o.categoria ?? "igreja";
          const rotulo = cat === "igreja"
            ? (ev?.tipo ? TIPO_LABEL[ev.tipo] ?? ev.tipo : null)
            : CATEGORIA_LABEL[cat] ?? null;
          // Virou o dia: nenhum evento de amanha e "agora", "a seguir" nem
          // "passou" — eles simplesmente ainda vao acontecer.
          const momento = viraOdia ? "futuro" : (momentos.get(o.key) ?? "futuro");
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
                  // Sem relogio: esta e a COLUNA do horario, e ela alterna
                  // com "dia todo" no mesmo lugar. O icone se repetia uma vez
                  // por evento para dizer o que "19:00" ja diz sozinho.
                  <span className="tabular-nums">{hora}</span>
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
                  que reservou, não da igreja.
                  E não para o que já terminou: convidar alguém para um ensaio
                  que acabou às 19h30 é oferecer uma ação impossível. */}
              {cat === "igreja" && !passou && (
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* O dia que já foi, em uma linha. Só aparece quando há o que
            recolher — num dia que ainda nem começou, não há passado a
            esconder e o controle seria ruído. */}
        {jaPassaram.length > 0 ? (
          <Button
            type="button" variant="ghost" size="sm"
            onClick={() => setVerPassado(v => !v)}
            aria-expanded={verPassado}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${verPassado ? "rotate-180" : ""}`} />
            {jaPassaram.length === 1
              ? "1 já aconteceu hoje"
              : `${jaPassaram.length} já aconteceram hoje`}
          </Button>
        ) : <span />}

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
