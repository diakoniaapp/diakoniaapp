import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardList, Loader2, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import {
  listarChecklistPorTipo, marcarChecklistComObs,
  type ChecklistItemV2,
} from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservaId: string;
  onConfirmado?: () => void;
}

export function PreUsoCheckDialog({ open, onOpenChange, reservaId, onConfirmado }: Props) {
  const [itens, setItens] = useState<ChecklistItemV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const { pre_uso } = await listarChecklistPorTipo(reservaId);
      setItens(pre_uso);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, reservaId]);

  function toggle(id: string, ok: boolean) {
    setItens(itens.map(i => i.id === id ? { ...i, ok } : i));
  }

  const obrigatorios = itens.filter(i => i.obrigatorio);
  const obrigatoriosOk = obrigatorios.filter(i => i.ok).length;
  const podeIniciar = obrigatoriosOk === obrigatorios.length;

  async function confirmar() {
    if (!podeIniciar) {
      toast.error("Marque todos os itens obrigatórios"); return;
    }
    setSalvando(true);
    try {
      await Promise.all(itens.map(i =>
        marcarChecklistComObs(i.id, i.ok, undefined, false)
      ));
      onConfirmado?.();
      onOpenChange(false);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-sm">
            <Loader2 className="w-4 h-4 animate-spin inline" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-gold" />
            Confirme antes de iniciar
            <Badge variant="outline" className="text-[10px] ml-2">
              {obrigatoriosOk}/{obrigatorios.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Antes de iniciar o uso, confirme que recebeu os recursos e leu as regras:
        </p>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {itens.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhum item pré-uso configurado.
            </p>
          ) : itens.map(item => (
            <label key={item.id}
              className="flex items-start gap-2 p-2 border rounded-md text-sm cursor-pointer hover:bg-muted/30">
              <Checkbox checked={item.ok}
                onCheckedChange={(v) => toggle(item.id, !!v)}
                className="mt-0.5" />
              <span className={"flex-1 " + (item.ok ? "line-through text-muted-foreground" : "")}>
                {item.item}
                {item.obrigatorio && (
                  <Badge variant="outline" className="text-[9px] ml-1.5 bg-amber-50 text-amber-700 border-amber-200">
                    obrigatório
                  </Badge>
                )}
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeIniciar || salvando}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Confirmar e iniciar uso
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
