import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { EventoOcorrencia } from "@/lib/agenda/types";

interface Props {
  open: boolean;
  onClose: () => void;
  ocorrencias: EventoOcorrencia[];
  onChanged: () => void;
}

/**
 * Detecta duplicados pelas chaves: titulo (case-insensitive) | data | hora_inicio | local_id.
 * Apenas eventos internos não-recorrentes e sem exceções podem ser excluídos fisicamente.
 * Para os demais, sugere-se cancelamento.
 */
export function DuplicatesDialog({ open, onClose, ocorrencias, onChanged }: Props) {
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const grupos = useMemo(() => {
    const map = new Map<string, EventoOcorrencia[]>();
    for (const o of ocorrencias) {
      if (o.externalReadOnly) continue;
      const key = [
        (o.evento.titulo || "").trim().toLowerCase(),
        o.data,
        (o.evento.hora_inicio || "").slice(0, 5),
        o.evento.local_id || "",
      ].join("|");
      const arr = map.get(key) || [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .filter(([, arr]) => arr.length > 1)
      .sort(([, a], [, b]) => (a[0].data < b[0].data ? -1 : 1));
  }, [ocorrencias]);

  const canHardDelete = (o: EventoOcorrencia) => {
    // só permite excluir registros simples (sem regra de recorrência) e que não sejam séries usadas
    return !o.evento.recorrencia_regra && !o.isOcorrenciaVirtual;
  };

  const handleDelete = async (id: string) => {
    setBusy(true);
    try {
      // bloqueia se há exceções vinculadas
      const { count } = await supabase
        .from("eventos")
        .select("id", { count: "exact", head: true })
        .eq("serie_origem_id", id);
      if ((count || 0) > 0) {
        toast.error("Evento possui exceções vinculadas. Cancele em vez de excluir.");
        return;
      }
      await supabase.from("evento_ministerios").delete().eq("evento_id", id);
      await supabase.from("evento_areas").delete().eq("evento_id", id);
      const { error } = await supabase.from("eventos").delete().eq("id", id);
      if (error) throw error;
      toast.success("Duplicado excluído");
      setConfirmFor(null);
      setConfirmText("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("eventos").update({ status: "cancelado" }).eq("id", id);
      if (error) throw error;
      toast.success("Evento cancelado (mantido no histórico)");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cancelar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle translate="no" className="flex items-center gap-2">
            <Copy className="w-4 h-4" /> Eventos duplicados
          </DialogTitle>
          <DialogDescription>
            Detectados pelo mesmo título, data, horário e local no período visível.
          </DialogDescription>
        </DialogHeader>

        {grupos.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum duplicado encontrado no período exibido.
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {grupos.map(([key, items]) => (
              <div key={key} className="border rounded-md p-3">
                <div className="text-sm font-medium mb-2">
                  {items[0].evento.titulo} ·{" "}
                  <span className="text-muted-foreground">
                    {format(parseISO(items[0].data), "EEE dd/MM/yyyy", { locale: ptBR })}
                    {items[0].evento.hora_inicio ? ` · ${items[0].evento.hora_inicio.slice(0,5)}` : ""}
                    {items[0].evento.local ? ` · ${items[0].evento.local}` : ""}
                  </span>
                </div>
                <ul className="space-y-2">
                  {items.map((o, i) => {
                    const id = o.baseId;
                    const hard = canHardDelete(o);
                    const isConfirming = confirmFor === id;
                    return (
                      <li key={o.key} className="flex flex-col gap-2 border-t pt-2 first:border-0 first:pt-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs text-muted-foreground">
                            <div>{i === 0 ? <strong className="text-foreground">Registro principal sugerido</strong> : "Duplicado"}</div>
                            <div className="font-mono">ID: {id.slice(0, 8)}…</div>
                            <div>Status: {o.evento.status}{o.serieId ? " · pertence a série" : ""}</div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button size="sm" variant="outline" disabled={busy || o.evento.status === "cancelado"} onClick={() => handleCancel(id)}>
                              Cancelar
                            </Button>
                            {hard ? (
                              <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setConfirmFor(id); setConfirmText(""); }}>
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Excluir
                              </Button>
                            ) : (
                              <span className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Use cancelar (série)
                              </span>
                            )}
                          </div>
                        </div>
                        {isConfirming && (
                          <div className="rounded-md bg-destructive/10 p-2 space-y-2">
                            <p className="text-xs">
                              Este evento será removido <strong>permanentemente</strong>. Digite <strong>CONFIRMAR</strong> para prosseguir.
                            </p>
                            <div className="flex gap-2">
                              <Label className="sr-only">Confirmação</Label>
                              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="CONFIRMAR" className="h-8" />
                              <Button size="sm" variant="destructive" disabled={busy || confirmText.trim() !== "CONFIRMAR"} onClick={() => handleDelete(id)}>
                                Excluir agora
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setConfirmFor(null); setConfirmText(""); }}>Voltar</Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DuplicatesDialog;