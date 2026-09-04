// ─── EscalaDialog.tsx ────────────────────────────────────────────────────────
// Montar a escala de um evento.
//
// Sprint 4. Substitui a frase que estava no diálogo do evento desde que a
// agenda foi escrita:
//
//   "Escalas de voluntários poderão ser vinculadas posteriormente."
//
// Era uma promessa que o sistema fazia e nunca cumpria. As tabelas `escalas` e
// `escala_voluntarios` existiam desde o começo, vazias.
//
// ── O QUE ESTA TELA NÃO FAZ ──────────────────────────────────────────────────
//
// Não pede data, hora nem local: tudo vem do evento. A escala é filha dele,
// pela coluna `escalas.evento_id` que já existia. Uma agenda paralela seria a
// forma mais rápida de ter dois horários para o mesmo culto.
//
// E não escala ninguém sozinha. O motor sugere, com o motivo escrito ao lado
// de cada nome, e quem decide é o líder — inclusive contra a sugestão, num
// domingo em que falte gente.

import { useEffect, useState } from "react";
import { NomePessoa } from "@/components/membros/ficha";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CalendarClock, Plus, Trash2, MessageCircle, Check, X, Sparkles,
} from "lucide-react";
import {
  escalasDoEvento, criarEscala, sugestoesPara, escalar, tirarDaEscala,
  responderEscala, marcarNotificado, excluirEscala,
  ROTULO_PRESENCA, turnoDe,
  type EscalaDaArea, type Sugestao, type StatusPresenca,
} from "@/services/escalaService";
import { buildWhatsAppLink } from "@/lib/visitantesFluxo";

interface AreaOpt { id: string; nome: string; ministerio_id: string | null; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  evento: {
    id: string;
    titulo: string;
    data: string;
    hora_inicio: string | null;
    hora_fim: string | null;
    local: string | null;
  } | null;
  /** As áreas marcadas no evento — as candidatas naturais a ter escala. */
  areasDoEvento: AreaOpt[];
}

const COR_PRESENCA: Record<StatusPresenca, string> = {
  pendente:   "bg-muted text-muted-foreground border-border",
  confirmado: "bg-success-soft text-success-text border-success-line",
  recusado:   "bg-destructive-soft text-destructive-text border-destructive-line",
  presente:   "bg-success text-success-foreground border-success",
  ausente:    "bg-warning-soft text-warning-text border-warning-line",
};

export function EscalaDialog({ open, onOpenChange, evento, areasDoEvento }: Props) {
  const [escalas, setEscalas] = useState<EscalaDaArea[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const [sugestoesDe, setSugestoesDe] = useState<string | null>(null);   // escala_id
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [buscandoSugestoes, setBuscando] = useState(false);

  const recarregar = async () => {
    if (!evento) return;
    setCarregando(true);
    setEscalas(await escalasDoEvento(evento.id, evento.data));
    setCarregando(false);
  };

  useEffect(() => {
    if (!open || !evento) return;
    setSugestoesDe(null);
    recarregar();
  }, [open, evento?.id]);

  if (!evento) return null;

  /** Áreas do evento que ainda não têm escala. */
  const semEscala = areasDoEvento.filter(a => !escalas.some(e => e.area_id === a.id));

  const abrirEscala = async (area: AreaOpt) => {
    setOcupado(true);
    const r = await criarEscala({
      eventoId:     evento.id,
      areaId:       area.id,
      ministerioId: area.ministerio_id,
      titulo:       `${area.nome} — ${evento.titulo}`,
      data:         evento.data,
      horaInicio:   evento.hora_inicio,
      horaFim:      evento.hora_fim,
      local:        evento.local,
    });
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    await recarregar();
    if (r.id) verSugestoes(r.id, area.id);
  };

  const verSugestoes = async (escalaId: string, areaId: string) => {
    setSugestoesDe(escalaId);
    setBuscando(true);
    const { sugestoes: s, erro } = await sugestoesPara(
      areaId, evento.data, evento.hora_inicio, 12, evento.hora_fim);
    setBuscando(false);
    if (erro) return toast.error("Não deu para sugerir: " + erro);
    setSugestoes(s);
  };

  const adicionar = async (escalaId: string, s: Sugestao) => {
    setOcupado(true);
    const r = await escalar(escalaId, s.pessoa_id, { sugerido: true, score: s.score });
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    setSugestoes(prev => prev.filter(x => x.pessoa_id !== s.pessoa_id));
    await recarregar();
  };

  const responder = async (id: string, status: StatusPresenca) => {
    let motivo: string | null = null;
    if (status === "recusado") {
      motivo = window.prompt("Motivo da recusa (opcional):") ?? null;
    }
    setOcupado(true);
    const r = await responderEscala(id, status, motivo);
    setOcupado(false);
    if (!r.ok) return toast.error(r.erro);
    await recarregar();
  };

  const avisar = async (e: { id: string; nome_completo: string; telefone: string | null }, escalaTitulo: string) => {
    const texto = `Olá, ${e.nome_completo.split(" ")[0]}! Você está escalado(a) para ${escalaTitulo}, `
      + `dia ${new Date(evento.data + "T12:00:00").toLocaleDateString("pt-BR")}`
      + (evento.hora_inicio ? ` às ${evento.hora_inicio.slice(0, 5)}` : "")
      + `. Pode confirmar?`;
    const link = buildWhatsAppLink(e.telefone, texto);
    if (!link) return toast.error("Esta pessoa não tem telefone cadastrado.");
    await marcarNotificado(e.id);
    window.open(link, "_blank", "noopener,noreferrer");
    recarregar();
  };

  const turno = turnoDe(evento.hora_inicio);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Escala — {evento.titulo}</DialogTitle>
          <DialogDescription className="text-xs">
            {new Date(evento.data + "T12:00:00").toLocaleDateString("pt-BR", {
              weekday: "long", day: "2-digit", month: "long",
            })}
            {evento.hora_inicio && ` · ${evento.hora_inicio.slice(0, 5)}`}
            {turno && ` · ${turno === "manha" ? "manhã" : turno}`}
            {evento.local && ` · ${evento.local}`}
          </DialogDescription>
        </DialogHeader>

        {carregando ? (
          <div className="space-y-3 py-2" aria-busy="true">
            <span className="sr-only">Carregando as escalas…</span>
            <Skeleton className="h-5 w-40" /><Skeleton className="h-16" /><Skeleton className="h-16" />
          </div>
        ) : (
          <div className="space-y-5">

            {areasDoEvento.length === 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 border border-border rounded-md px-3 py-2.5 leading-relaxed">
                Este evento não tem nenhuma área marcada. Escolha as áreas atuantes na
                aba do evento e elas aparecem aqui para montar escala.
              </p>
            )}

            {/* ── As escalas já montadas ──────────────────────────────── */}
            {escalas.map(esc => (
              <section key={esc.id} className="rounded-md border">
                <header className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40">
                  <h3 className="font-medium text-sm flex-1 min-w-0 truncate">{esc.area_nome}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {esc.escalados.filter(e => e.status === "confirmado" || e.status === "presente").length}
                    {" de "}{esc.escalados.length}
                  </span>
                  <Button
                    type="button" variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs"
                    disabled={ocupado}
                    onClick={() => verSugestoes(esc.id, esc.area_id)}
                  >
                    <Sparkles className="w-3 h-3" /> Sugerir
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    aria-label={`Excluir a escala de ${esc.area_nome}`}
                    disabled={ocupado}
                    onClick={async () => {
                      if (!window.confirm(`Excluir a escala de ${esc.area_nome}? Quem já confirmou perde o registro.`)) return;
                      const r = await excluirEscala(esc.id);
                      if (!r.ok) return toast.error(r.erro);
                      recarregar();
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </header>

                {esc.escalados.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-3 py-3">
                    Ninguém escalado ainda. Use <strong>Sugerir</strong> para ver quem pode servir.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {esc.escalados.map(e => (
                      <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <NomePessoa id={e.pessoa_id} nome={e.nome_completo} className="text-sm truncate block w-full" />
                          {e.motivo_recusa && (
                            <p className="text-xs text-destructive-text truncate">“{e.motivo_recusa}”</p>
                          )}
                          {e.sugerido_automaticamente && (
                            <p className="text-xs text-muted-foreground">
                              sugerido{e.score_sugestao != null && ` · score ${Math.round(e.score_sugestao)}`}
                            </p>
                          )}
                        </div>

                        <Badge variant="outline" className={`text-xs shrink-0 ${COR_PRESENCA[e.status]}`}>
                          {ROTULO_PRESENCA[e.status]}
                        </Badge>

                        {e.status === "pendente" && (
                          <>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                              aria-label={`${e.nome_completo} confirmou`} disabled={ocupado}
                              onClick={() => responder(e.id, "confirmado")}>
                              <Check className="w-3.5 h-3.5 text-success-text" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                              aria-label={`${e.nome_completo} recusou`} disabled={ocupado}
                              onClick={() => responder(e.id, "recusado")}>
                              <X className="w-3.5 h-3.5 text-destructive-text" />
                            </Button>
                          </>
                        )}

                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          aria-label={`Avisar ${e.nome_completo} no WhatsApp`} disabled={ocupado}
                          title={e.notificado_em ? "Já avisado — avisar de novo" : "Avisar no WhatsApp"}
                          onClick={() => avisar(e, esc.area_nome)}>
                          <MessageCircle className={`w-3.5 h-3.5 ${e.notificado_em ? "text-success-text" : ""}`} />
                        </Button>

                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          aria-label={`Tirar ${e.nome_completo} da escala`} disabled={ocupado}
                          onClick={async () => {
                            const r = await tirarDaEscala(e.id);
                            if (!r.ok) return toast.error(r.erro);
                            recarregar();
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* ── As sugestões desta escala ─────────────────────────── */}
                {sugestoesDe === esc.id && (
                  <div className="border-t bg-muted/20 px-3 py-2.5 space-y-1.5">
                    {buscandoSugestoes ? (
                      <><Skeleton className="h-4 w-32" /><Skeleton className="h-8" /></>
                    ) : sugestoes.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhum voluntário cadastrado nesta área.
                      </p>
                    ) : (
                      sugestoes.map(s => (
                        <div key={s.pessoa_id} className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">
                              <NomePessoa id={s.pessoa_id} nome={s.nome_completo} />
                              <span className="text-xs text-muted-foreground tabular-nums"> · {Math.round(s.score)}</span>
                            </p>
                            {/* O motivo é o que separa uma sugestão útil de um
                                oráculo: ele explica, e o líder decide. */}
                            <p className={`text-xs truncate ${s.disponivel ? "text-muted-foreground" : "text-warning-text"}`}>
                              {s.motivo}
                            </p>
                          </div>
                          <Button type="button" variant="outline" size="sm"
                            className="h-7 px-2 text-xs gap-1 shrink-0"
                            disabled={ocupado}
                            onClick={() => adicionar(esc.id, s)}>
                            <Plus className="w-3 h-3" /> Escalar
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            ))}

            {/* ── Áreas que ainda não têm escala ──────────────────────── */}
            {semEscala.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Áreas deste evento sem escala
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {semEscala.map(a => (
                    <Button key={a.id} type="button" variant="outline" size="sm"
                      className="gap-1.5" disabled={ocupado}
                      onClick={() => abrirEscala(a)}>
                      <CalendarClock className="w-3.5 h-3.5" /> {a.nome}
                    </Button>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
