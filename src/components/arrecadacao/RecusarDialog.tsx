import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, XCircle, X } from "lucide-react";
import { toast } from "sonner";
import { recusarReserva } from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservaId: string;
  onRecusado?: () => void;
}

export function RecusarDialog({ open, onOpenChange, reservaId, onRecusado }: Props) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function recusar() {
    if (!motivo.trim()) { toast.error("Informe o motivo"); return; }
    setSalvando(true);
    try {
      await recusarReserva(reservaId, motivo);
      toast.success("Reserva recusada");
      onRecusado?.();
      onOpenChange(false);
      setMotivo("");
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-700">
            <XCircle className="w-4 h-4" /> Recusar reserva
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            O motivo será exibido pro solicitante. Conflitos de data já são bloqueados
            automaticamente — use este aqui pra outros casos.
          </p>
          <div className="space-y-1">
            <Label className="text-[11px]">Motivo *</Label>
            <Textarea value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex: Período coincide com Conferência Anual" rows={4} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={recusar} disabled={salvando || !motivo.trim()}
              variant="outline" className="gap-1.5 text-rose-700 border-rose-300 hover:bg-rose-50">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
              Confirmar recusa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
