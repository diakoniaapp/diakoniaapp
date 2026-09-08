import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Pencil, RepeatIcon, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AreaOpt, EventoOcorrencia, MinisterioOpt, LocalOpt, STATUS_LABEL, TIPO_LABEL,
} from "@/lib/agenda/types";
import { formatLocal, temHora, timeRange } from "@/components/agenda/AgendaViews";
import { escalasDoEvento, type EscalaDaArea } from "@/services/escalaService";

interface Props {
  open: boolean;
  onClose: () => void;
  ocorrencia: EventoOcorrencia | null;
  ministerios: MinisterioOpt[];
  areas: AreaOpt[];
  locais: LocalOpt[];
  minsDoEvento: { ministerio_id: string; responsabilidade: "principal" | "apoio" }[];
  areasDoEvento: string[];
  /** Ausente = sem permissão de editar (o botão nem aparece). */
  onEdit?: () => void;
}

/**
 * Tela de visualização, aberta ao clicar num evento na agenda.
 *
 * Antes, clicar num evento — no celular ou no computador — já abria direto
 * pro formulário de edição, com todos os campos liberados pra mexer. Pedido
 * da Telma: separar "ver o que é esse evento" de "editar esse evento" — o
 * clique mostra um resumo só de leitura, e as opções de edição (e a escolha
 * de escopo pra série recorrente) só aparecem se ela tocar em "Editar".
 */
export function EventoViewDialog({
  open, onClose, ocorrencia, ministerios, areas, locais, minsDoEvento, areasDoEvento, onEdit,
}: Props) {
  const [resumo, setResumo] = useState<EscalaDaArea[]>([]);
  const ev = ocorrencia?.evento;
  const eventoId = ev?.id ?? null;
  const dataDaOcorrencia = ocorrencia?.data ?? ev?.data ?? null;

  useEffect(() => {
    if (!open || !eventoId) { setResumo([]); return; }
    escalasDoEvento(eventoId, dataDaOcorrencia ?? undefined).then(setResumo);
  }, [open, eventoId, dataDaOcorrencia]);

  if (!ev || !ocorrencia) return null;

  const localNome = locais.find(l => l.id === ev.local_id)?.nome_completo
    || locais.find(l => l.id === ev.local_id)?.nome
    || formatLocal(ev.local);
  const minsNomes = minsDoEvento.map(m => ministerios.find(x => x.id === m.ministerio_id)?.nome).filter(Boolean);
  const areasNomes = areasDoEvento.map(id => areas.find(a => a.id === id)?.nome).filter(Boolean);
  const cancelado = ev.status === "cancelado";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <span className={cancelado ? "line-through text-muted-foreground" : ""}>{ev.titulo}</span>
            {ocorrencia.serieId && <RepeatIcon className="w-4 h-4 shrink-0 mt-1 opacity-60" />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{TIPO_LABEL[ev.tipo]}</Badge>
            {ev.status !== "agendado" && (
              <Badge
                variant="outline"
                className={cancelado ? "border-destructive text-destructive" : "border-success-line text-success-text"}
              >
                {STATUS_LABEL[ev.status]}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="w-4 h-4 shrink-0" />
            <span className="first-letter:uppercase text-foreground">
              {format(parseISO(ocorrencia.data), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </span>
          </div>

          {temHora(ocorrencia) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="w-4 h-4 shrink-0" />
              <span className="text-foreground">{timeRange(ocorrencia)}</span>
            </div>
          )}

          {localNome && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="text-foreground">{localNome}</span>
            </div>
          )}

          {(minsNomes.length > 0 || areasNomes.length > 0) && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {minsNomes.map((nome, i) => (
                <Badge key={`m-${i}`} variant="secondary">{nome}</Badge>
              ))}
              {areasNomes.map((nome, i) => (
                <Badge key={`a-${i}`} variant="outline">{nome}</Badge>
              ))}
            </div>
          )}

          {ev.descricao && (
            <p className="text-foreground whitespace-pre-wrap border-t pt-3">{ev.descricao}</p>
          )}

          {resumo.length > 0 && (
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-1.5">Escala de voluntários</p>
              <ul className="space-y-1">
                {resumo.map(e => {
                  const total = e.escalados.length;
                  const ok = e.escalados.filter(x => x.status === "confirmado" || x.status === "presente").length;
                  const tom = total === 0 ? "text-muted-foreground"
                    : ok === total ? "text-success-text"
                    : "text-warning-text";
                  return (
                    <li key={e.id} className="flex items-center gap-2 text-xs">
                      <Users className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 truncate">{e.area_nome}</span>
                      <span className={`tabular-nums whitespace-nowrap ${tom}`}>
                        {total === 0 ? "ninguém escalado" : `${ok} de ${total} confirmou`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {onEdit && (
            <Button onClick={onEdit} className="gap-1.5">
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
