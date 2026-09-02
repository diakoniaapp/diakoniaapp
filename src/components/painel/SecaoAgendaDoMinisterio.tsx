// ─── A agenda do ministério ───────────────────────────────────────────────
//
// Escala e agenda não são a mesma coisa, e o painel só mostrava a primeira.
// Medido em 02/09/2026: 54 vínculos evento↔ministério contra 10 escalas. Quem
// tinha onze eventos e nenhuma escala via "Nenhuma escala criada para este
// ministério" e mais nada.
//
// Os ícones vêm de `aparenciaDoEvento`, o mesmo módulo que a Agenda da Home e
// o Painel Pastoral usam. Foi pedido da igreja em 01/09 — "use os mesmos
// ícones nas duas agendas" — e vale para esta terceira pelo mesmo motivo:
// um culto tem de parecer um culto em qualquer tela do sistema.

import { Badge } from "@/components/ui/badge";
import { CalendarDays, Radio, Repeat } from "lucide-react";
import { TituloDaSecao } from "@/components/painel/blocos";
import { iconeDaOcorrencia } from "@/lib/agenda/aparenciaDoEvento";
import type { AgendaDoMinisterio, CompromissoDoMinisterio } from "@/services/agendaDoMinisterioService";

/** "hoje" · "amanhã" · "domingo" · "14/09". */
function quando(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias > 1 && dias < 7) return alvo.toLocaleDateString("pt-BR", { weekday: "long" });
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export function SecaoAgendaDoMinisterio({ agenda }: { agenda: AgendaDoMinisterio }) {
  return (
    <section id="agenda-ministerio" className="scroll-mt-[240px]">
      <TituloDaSecao icone={CalendarDays} tom="info" contagem={agenda.proximos.length}>
        Próximos encontros
      </TituloDaSecao>

      {/* ── As lives sem transmissão marcada ──────────────────────────── */}
      {agenda.livesSemTransmissao.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-md border border-warning-line bg-warning-soft/40 px-3 py-2 mb-2 min-w-0">
          <Radio className="w-4 h-4 shrink-0 text-warning-text mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-warning-text">
              {agenda.livesSemTransmissao.length === 1
                ? "1 live sem transmissão marcada"
                : `${agenda.livesSemTransmissao.length} lives sem transmissão marcada`}
            </p>
            {/* Diz o efeito, não o campo: quem lidera não precisa saber que
                existe uma coluna `transmissao_online`, precisa saber que o
                convite sai sem link. */}
            <p className="text-xs text-muted-foreground break-words">
              {agenda.livesSemTransmissao.map(c => c.titulo).join(" · ")}
              {" — o convite que a igreja compartilha sai sem o link para assistir."}
            </p>
          </div>
        </div>
      )}

      {agenda.proximos.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 px-3 border rounded-md">
          {agenda.totalDeEventos === 0
            ? "Este ministério ainda não tem evento na agenda da igreja."
            : `Nenhum encontro nas próximas três semanas. O ministério tem ${agenda.totalDeEventos} ${agenda.totalDeEventos === 1 ? "evento cadastrado" : "eventos cadastrados"}.`}
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-card">
          {agenda.proximos.slice(0, 10).map(c => <Linha key={`${c.id}-${c.data}`} c={c} />)}
        </ul>
      )}

      {agenda.proximos.length > 10 && (
        <p className="text-xs text-muted-foreground mt-1.5 px-1">
          Mostrando 10 de {agenda.proximos.length} nas próximas três semanas.
        </p>
      )}
    </section>
  );
}

function Linha({ c }: { c: CompromissoDoMinisterio }) {
  // `iconeDaOcorrencia` pede categoria e evento; aqui só há tipo, e é o que
  // ele usa quando não há categoria. Sem `as never`: a forma é esta mesmo.
  const Icone = iconeDaOcorrencia({
    categoria: null,
    evento: { tipo: c.tipo } as never,
  });
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 min-w-0">
      <Icone className="w-4 h-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate min-w-0">{c.titulo}</p>
        <p className="text-xs text-muted-foreground truncate">
          {quando(c.data)}
          {c.hora ? `, ${c.hora.slice(0, 5)}` : ""}
          {c.local ? ` · ${c.local}` : ""}
        </p>
      </div>
      {c.ehLive && c.transmissaoMarcada && (
        <Badge variant="outline" className="shrink-0 text-xs gap-1 whitespace-nowrap">
          <Radio className="w-3 h-3" /> transmite
        </Badge>
      )}
      {c.recorrente && (
        <Repeat className="w-3.5 h-3.5 shrink-0 text-muted-foreground"
          aria-label="Evento que se repete" />
      )}
    </li>
  );
}
