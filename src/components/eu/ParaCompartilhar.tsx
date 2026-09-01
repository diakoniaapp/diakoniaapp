// ─── Para compartilhar ────────────────────────────────────────────────────
//
// Dois blocos que existem pelo mesmo motivo: a igreja convida melhor quando
// quem convida é alguém, e não a instituição.
//
//   Aniversários   a felicitação sai do celular de quem conhece a pessoa
//   Agenda         o convite ao culto sai para os contatos de quem vai
//
// ── O QUE ISTO REUSA, E O QUE NÃO REFAZ ────────────────────────────────────
//
// Nada aqui inventa mensagem. As felicitações vêm de `mensagemPastoral`, com
// versículo sorteado, que já servia ao Painel Pastoral; o convite ao evento
// vem de `montarConvite`, que já sabe saudar pelo horário, dizer as duas
// formas de participar num evento híbrido e assinar com o tratamento certo.
//
// A diferença é a assinatura: no Painel Pastoral quem assina é a igreja
// falando com um membro; aqui é a PESSOA falando com os contatos dela. O
// mesmo texto, outra boca.
//
// ── A TRANSMISSÃO ENTRA AQUI ───────────────────────────────────────────────
//
// Este é o primeiro consumidor de `eventos.transmissao_online` e
// `transmissao_url`. Quando a data tem endereço próprio, ele vai na mensagem
// com o convite a ativar o lembrete; quando não tem, cai no atalho permanente
// do canal (…/@qibrj/live), montado a partir de `identidade_igreja`.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cake, Heart, MessageCircle, Copy, Radio, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  proximosDias, mensagemPastoral, linkWhatsApp, type EventoPastoral,
} from "@/services/agendaPastoralService";
import { montarConvite, atalhoDoCanal } from "@/lib/agenda/convite";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import type { EventoRow, EventoOcorrencia } from "@/lib/agenda/types";
import {
  identidadeParaConvite, type IdentidadeParaConvite, type MinhaFicha,
} from "@/services/meuEspacoService";
import { useReportarVazio } from "@/components/hoje/vazio";

// ─── Aniversários e bodas ─────────────────────────────────────────────────

export function AniversariosParaCelebrar() {
  const [eventos, setEventos] = useState<EventoPastoral[] | null>(null);

  useEffect(() => {
    proximosDias(7)
      .then(l => setEventos(l.filter(e => e.tipo === "aniversario" || e.tipo === "casamento")))
      .catch(() => setEventos([]));
  }, []);

  useReportarVazio(!eventos || eventos.length === 0);
  if (!eventos || eventos.length === 0) return null;

  return (
    <div className="grid gap-2">
      {eventos.slice(0, 6).map(ev => (
        <Card key={`${ev.tipo}-${ev.ref_id}`}>
          <CardContent className="p-3 flex items-center gap-3">
            {ev.tipo === "casamento"
              ? <Heart className="w-4 h-4 shrink-0 text-gold" />
              : <Cake className="w-4 h-4 shrink-0 text-gold" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{ev.titulo}</p>
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
  );
}

/**
 * "82 anos · amanhã".
 *
 * O `subtitulo` que a função `agenda_pastoral_proximos_dias` devolve é uma
 * CÓPIA do título — medido em produção: `titulo` e `subtitulo` trazem os dois
 * o nome da pessoa. Usá-lo escrevia o nome duas vezes, um por cima do outro.
 * Quem monta a frase é a tela, como as outras deste repositório já fazem.
 */
function resumoDaEfemeride(ev: EventoPastoral): string {
  const anos = ev.anos_vai_completar ?? 0;
  const sufixo = ev.tipo === "casamento" ? "anos de casados" : "anos";
  // Zero anos acontece quando a ficha não tem o ano de nascimento — são 10
  // no cadastro. "0 anos" seria pior que não dizer idade nenhuma.
  const idade = anos > 0 ? `${anos} ${sufixo}` : null;
  const dias = ev.dias_ate_evento;
  const quando =
    dias === 0 ? "hoje"
    : dias === 1 ? "amanhã"
    : dias != null ? `em ${dias} dias`
    : null;
  return [idade, quando].filter(Boolean).join(" · ") || "nos próximos dias";
}

// ─── A agenda, para convidar ──────────────────────────────────────────────

export function AgendaParaConvidar({ eu }: { eu: MinhaFicha | null }) {
  const [ocorrencias, setOcorrencias] = useState<EventoOcorrencia[] | null>(null);
  const [identidade, setIdentidade] = useState<IdentidadeParaConvite | null>(null);

  useEffect(() => {
    (async () => {
      const hoje = new Date();
      const ate = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 14);
      const [{ data: eventos }, ident] = await Promise.all([
        supabase.from("eventos").select("*"),
        identidadeParaConvite().catch(() => ({ igreja: null, canalYoutube: null })),
      ]);
      setIdentidade(ident);
      // `as unknown as` porque o tipo gerado do banco e `EventoRow` divergem
      // em campos opcionais. É a mesma conversão que a tela de Agenda e o
      // widget do painel fazem — não invento aqui um contrato diferente deles.
      const lista = expandirOcorrencias((eventos ?? []) as unknown as EventoRow[], hoje, ate)
        .filter(o => o.evento?.status !== "cancelado")
        .sort((a, b) =>
          (a.data ?? "").localeCompare(b.data ?? "") ||
          (a.evento?.hora_inicio ?? "99").localeCompare(b.evento?.hora_inicio ?? "99"));
      setOcorrencias(lista);
    })().catch(() => setOcorrencias([]));
  }, []);

  const assina = useMemo(() => {
    if (!eu) return undefined;
    return {
      nome: eu.nome_social || eu.nome_completo,
      // A primeira da lista é a principal — é a ordem que `funcaoMinisterial.ts`
      // define e que o catálogo já respeita.
      funcao: (eu.funcoes_ministeriais ?? [])[0] ?? null,
      sexo: eu.sexo,
      igreja: identidade?.igreja ?? null,
    };
  }, [eu, identidade]);

  useReportarVazio(!ocorrencias || ocorrencias.length === 0);
  if (!ocorrencias || ocorrencias.length === 0) return null;

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
    <div className="grid gap-2">
      {ocorrencias.slice(0, 5).map(o => {
        const ev: any = o.evento;
        return (
          <Card key={o.key}>
            <CardContent className="p-3 flex items-center gap-3">
              <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-sm font-medium truncate">{ev?.titulo}</p>
                  {ev?.transmissao_online && (
                    <Badge variant="outline" className="shrink-0 gap-1 text-xs">
                      <Radio className="w-3 h-3" /> ao vivo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {dataCurta(o.data)}
                  {ev?.hora_inicio ? ` · ${String(ev.hora_inicio).slice(0, 5)}` : ""}
                  {ev?.local_nome ? ` · ${ev.local_nome}` : ""}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="px-2"
                  title="Copiar o convite"
                  onClick={() => compartilhar(o, false)}>
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
  );
}

/** "dom, 07/09" — sem `new Date(iso)`, que é UTC e escorrega de dia. */
function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  const semana = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
