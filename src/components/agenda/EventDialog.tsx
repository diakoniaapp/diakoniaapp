import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Info, CalendarClock } from "lucide-react";
import {
  AreaOpt, EventoOcorrencia, EventoStatus, EventoTipo, LocalOpt, MinisterioOpt,
  RecorrenciaFreq, RecorrenciaRegra, Resp, STATUS_LABEL, TIPO_LABEL,
} from "@/lib/agenda/types";
import { cn } from "@/lib/utils";
import { EscalaDialog } from "@/components/agenda/EscalaDialog";
import { toast } from "sonner";
import { RecurrenceEditor } from "./RecurrenceEditor";

export interface EventFormPayload {
  titulo: string;
  tipo: EventoTipo;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  local_id: string | null;
  descricao: string;
  status: EventoStatus;
  cor: string | null;
  ministerio_principal_id: string | null;
  ministerios: { ministerio_id: string; responsabilidade: Resp }[];
  areas: string[];
  recorrencia: RecorrenciaRegra | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ocorrencia: EventoOcorrencia | null;
  defaultDate?: string;
  defaultHora?: string;
  ministerios: MinisterioOpt[];
  areas: AreaOpt[];
  locais: LocalOpt[];
  initialMinisterios: { ministerio_id: string; responsabilidade: Resp }[];
  initialAreas: string[];
  onSubmit: (payload: EventFormPayload) => Promise<void>;
  /** Exclui o evento. Ausente = sem botao (evento novo ou somente leitura). */
  onDelete?: (eventoId: string) => Promise<void>;
}

export function EventDialog({
  open, onClose, ocorrencia, defaultDate, defaultHora,
  ministerios, areas, locais, initialMinisterios, initialAreas, onSubmit, onDelete,
}: Props) {
  const ev = ocorrencia?.evento;
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<EventoTipo>("culto");
  const [data, setData] = useState("");
  const [hi, setHi] = useState("");
  const [hf, setHf] = useState("");
  const [localId, setLocalId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<EventoStatus>("agendado");
  const [cor, setCor] = useState<string>("");
  const [mins, setMins] = useState<{ ministerio_id: string; responsabilidade: Resp }[]>([]);
  const [ars, setArs] = useState<string[]>([]);
  const [escalaAberta, setEscalaAberta] = useState(false);
  const [recFreq, setRecFreq] = useState<RecorrenciaFreq>("nao");
  const [recRegra, setRecRegra] = useState<RecorrenciaRegra | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  // Fecha a confirmacao sempre que o dialogo abre ou troca de evento, para nao
  // reabrir armado de uma vez anterior.
  useEffect(() => { setConfirmandoExclusao(false); }, [open, ocorrencia?.evento?.id]);

  useEffect(() => {
    if (!open) return;
    setTitulo(ev?.titulo || "");
    setTipo(ev?.tipo || "culto");
    setData(ev?.data || defaultDate || new Date().toISOString().slice(0, 10));
    setHi(ev?.hora_inicio || defaultHora || "");
    setHf(ev?.hora_fim || "");
    setLocalId(ev?.local_id || "");
    setDescricao(ev?.descricao || "");
    setStatus(ev?.status || "agendado");
    setCor(ev?.cor || "");
    setMins(initialMinisterios);
    setArs(initialAreas);
    const reg = ev?.recorrencia_regra || null;
    setRecRegra(reg);
    setRecFreq(reg ? reg.freq : "nao");
  }, [open]); // eslint-disable-line

  const principal = mins.find(m => m.responsabilidade === "principal");
  useEffect(() => {
    // Auto-derivar ministerio_principal pelo primeiro principal selecionado
  }, [principal]);

  const allowedAreas = useMemo(
    () => areas.filter(a => a.ativo && mins.some(m => m.ministerio_id === a.ministerio_id)),
    [areas, mins],
  );

  const activeLocais = locais.filter(l => l.status === "ativo" && l.permite_agendamento);
  const editingExisting = !!ev;
  const isExceptionEdit = ocorrencia?.isExcecao;
  const isSeriesMaster = !!ev?.recorrencia_regra;
  const partOfSeries = !!ocorrencia?.serieId;

  // Ministérios ainda não escolhidos. Vira o limite natural: não há teto
  // arbitrário, há a lista da igreja — um evento grande pode envolver
  // Louvor, Recepção, Diaconia e Comunicação de uma vez, e o antigo teto de
  // dois obrigava a mentir sobre quem estava responsável.
  const ministeriosLivres = ministerios.filter(
    m => m.ativo && !mins.find(x => x.ministerio_id === m.id),
  );

  const addMin = () => {
    if (!ministeriosLivres.length) return;
    setMins([
      ...mins,
      {
        ministerio_id: ministeriosLivres[0].id,
        responsabilidade: mins.length === 0 ? "principal" : "apoio",
      },
    ]);
  };

  /**
   * Trocar a responsabilidade de uma linha.
   *
   * Marcar "Principal" rebaixa as outras para apoio. O evento guarda UM
   * `ministerio_principal_id`, e com dois marcados o segundo era descartado em
   * silêncio na hora de salvar — com dois ministérios isso já acontecia, e com
   * onze passaria a ser fácil de fazer sem perceber.
   */
  const setResp = (idx: number, resp: Resp) => {
    setMins(mins.map((m, i) =>
      i === idx ? { ...m, responsabilidade: resp }
      : resp === "principal" ? { ...m, responsabilidade: "apoio" as Resp }
      : m,
    ));
  };
  const removeMin = (i: number) => {
    const next = mins.filter((_, idx) => idx !== i);
    setMins(next);
    setArs(ars.filter(aid => next.some(m => m.ministerio_id === areas.find(a => a.id === aid)?.ministerio_id)));
  };
  const toggleArea = (id: string) =>
    setArs(ars.includes(id) ? ars.filter(x => x !== id) : [...ars, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Estas tres condicoes eram `return` secos: clicar em "Salvar" com um
    // ministerio faltando nao gravava, nao fechava e NAO DIZIA NADA. Do lado
    // de quem usa, o botao simplesmente nao funcionava — e a conclusao
    // razoavel e que o sistema esta quebrado, nao que falta um campo.
    //
    // O aviso na secao ("Adicione ao menos 1 ministério principal") ja existia,
    // mas como texto fixo la embaixo: nao aparece como resposta ao clique, e
    // num formulario com rolagem pode nem estar na tela na hora.
    if (!titulo.trim()) {
      toast.error("Dê um título ao evento.");
      return;
    }
    if (mins.length === 0) {
      toast.error("Escolha ao menos um ministério responsável pelo evento.");
      return;
    }
    if (!mins.some(m => m.responsabilidade === "principal")) {
      toast.error("Marque um dos ministérios como principal.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        titulo: titulo.trim(),
        tipo, data, hora_inicio: hi, hora_fim: hf,
        local_id: localId || null,
        descricao,
        status,
        cor: cor || null,
        ministerio_principal_id: mins.find(m => m.responsabilidade === "principal")?.ministerio_id || null,
        ministerios: mins,
        areas: ars,
        recorrencia: recFreq === "nao" ? null : recRegra,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            {editingExisting ? "Editar evento" : "Novo evento"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input required value={titulo} onChange={e => setTitulo(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v: EventoTipo) => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPO_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={status} onValueChange={(v: EventoStatus) => setStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label>Data *</Label>
              <Input type="date" required value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div><Label>Início</Label>
              <Input type="time" value={hi} onChange={e => setHi(e.target.value)} />
            </div>
            <div><Label>Fim</Label>
              <Input type="time" value={hf} onChange={e => setHf(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label>Local *</Label>
              <Select value={localId || "__none__"} onValueChange={(v) => setLocalId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione um local" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem local —</SelectItem>
                  {activeLocais.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.nome_completo || l.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cor</Label>
              <div className="flex items-center gap-1">
                <Input type="color" className="h-10 w-12 p-1" value={cor || "#7c3aed"} onChange={(e) => setCor(e.target.value)} />
                {cor && <Button type="button" variant="ghost" size="sm" onClick={() => setCor("")}>Auto</Button>}
              </div>
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>

          {!isExceptionEdit && (
            <RecurrenceEditor freq={recFreq} regra={recRegra}
              onChange={(f, r) => { setRecFreq(f); setRecRegra(r); }} />
          )}
          {isExceptionEdit && partOfSeries && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />
              Esta é uma ocorrência específica de uma série recorrente.
            </p>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">
                Ministérios responsáveis
                {mins.length > 0 && <span className="text-muted-foreground font-normal"> · {mins.length}</span>}
              </Label>
              <Button type="button" size="sm" variant="outline" onClick={addMin}
                disabled={ministeriosLivres.length === 0}
                title={ministeriosLivres.length === 0 ? "Todos os ministérios já estão no evento" : undefined}>
                <Plus className="w-3.5 h-3.5 mr-1" />Adicionar
              </Button>
            </div>
            {mins.length === 0 && <p className="text-xs text-muted-foreground">Adicione ao menos 1 ministério principal.</p>}
            {mins.map((mr, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
                <Select value={mr.ministerio_id} onValueChange={(v) => {
                  const list = [...mins]; list[idx] = { ...list[idx], ministerio_id: v };
                  setMins(list);
                  setArs(ars.filter(aid => list.some(m => m.ministerio_id === areas.find(a => a.id === aid)?.ministerio_id)));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ministerios.filter(m => m.ativo && (m.id === mr.ministerio_id || !mins.find(x => x.ministerio_id === m.id))).map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={mr.responsabilidade} onValueChange={(v: Resp) => setResp(idx, v)}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principal">Principal</SelectItem>
                    <SelectItem value="apoio">Apoio</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeMin(idx)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-sm">Áreas atuantes</Label>
            {mins.length === 0 ? (
              <p className="text-xs text-muted-foreground">Selecione ministérios para escolher áreas.</p>
            ) : allowedAreas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma área ativa nos ministérios selecionados.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allowedAreas.map(a => {
                  const sel = ars.includes(a.id);
                  return (
                    <button type="button" key={a.id} onClick={() => toggleArea(a.id)}
                      className={cn("px-3 py-1.5 text-xs rounded-full border transition-colors",
                        sel ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent")}>
                      {a.nome}
                    </button>
                  );
                })}
              </div>
            )}
            {/* A frase que estava aqui — "Escalas de voluntários poderão ser
                vinculadas posteriormente" — era uma promessa que o sistema
                fazia desde que a agenda foi escrita, e nunca cumpria. As
                tabelas `escalas` e `escala_voluntarios` existiam, vazias.

                Só aparece em evento JÁ SALVO: a escala aponta para
                `escalas.evento_id`, e um evento que ainda não existe não tem
                id para apontar. */}
            {ocorrencia?.evento?.id ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 w-full"
                onClick={() => setEscalaAberta(true)}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                {ars.length > 0 ? "Montar escala de voluntários" : "Ver escalas deste evento"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Salve o evento para montar a escala de voluntários.
              </p>
            )}
          </div>

          {/* Excluir fica separado das outras acoes — a esquerda, com o
              `mr-auto` empurrando Cancelar e Atualizar para a direita. Botao
              destrutivo encostado no de confirmar e convite a errar.
              So aparece ao editar um evento existente. */}
          <DialogFooter className="sm:justify-end">
            {editingExisting && onDelete && ev && (
              confirmandoExclusao ? (
                <div className="mr-auto flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-destructive">Excluir mesmo?</span>
                  <Button
                    type="button" variant="destructive" size="sm"
                    disabled={excluindo}
                    onClick={async () => {
                      setExcluindo(true);
                      try { await onDelete(ev.id); } finally { setExcluindo(false); }
                    }}
                  >
                    {excluindo ? "Excluindo…" : "Sim, excluir"}
                  </Button>
                  <Button
                    type="button" variant="ghost" size="sm"
                    disabled={excluindo}
                    onClick={() => setConfirmandoExclusao(false)}
                  >
                    Não
                  </Button>
                </div>
              ) : (
                <Button
                  type="button" variant="ghost" size="sm"
                  className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Excluir
                </Button>
              )
            )}
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : editingExisting ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {/* Fora do <form>: um Dialog dentro de outro form dispara submit ao
          clicar em qualquer botao sem type="button" la dentro. */}
      <EscalaDialog
        open={escalaAberta}
        onOpenChange={setEscalaAberta}
        evento={ocorrencia?.evento ? {
          id:          ocorrencia.evento.id,
          titulo:      ocorrencia.evento.titulo,
          data:        ocorrencia.data ?? ocorrencia.evento.data,
          hora_inicio: ocorrencia.evento.hora_inicio || null,
          hora_fim:    ocorrencia.evento.hora_fim || null,
          local:       locais.find(l => l.id === ocorrencia.evento.local_id)?.nome ?? null,
        } : null}
        areasDoEvento={areas.filter(a => ars.includes(a.id))}
      />
    </Dialog>
  );
}