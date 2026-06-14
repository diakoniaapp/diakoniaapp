import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  ClipboardList, Loader2, ArrowRight, MessageSquare, AlertTriangle, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarChecklistPorTipo, marcarChecklistComObs,
  type ChecklistItemV2,
} from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reservaId: string;
  onConcluido?: () => void;          // dispara FechamentoDialog em sequência
}

/** PASSO 1 do fechamento: pós-uso (entrega + manutenção). */
export function PosUsoCheckDialog({ open, onOpenChange, reservaId, onConcluido }: Props) {
  const [itens, setItens] = useState<ChecklistItemV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});

  async function carregar() {
    setLoading(true);
    try {
      const { pos_uso } = await listarChecklistPorTipo(reservaId);
      setItens(pos_uso);
    } finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, reservaId]);

  function atualizarItem(id: string, patch: Partial<ChecklistItemV2>) {
    setItens(itens.map(i => i.id === id ? { ...i, ...patch } : i));
  }

  async function salvarItem(item: ChecklistItemV2) {
    try {
      await marcarChecklistComObs(item.id, item.ok, item.observacao ?? "", item.problema_reportado);
    } catch (err: any) { toast.error(err?.message ?? "Erro ao salvar item"); }
  }

  const obrigatorios = itens.filter(i => i.obrigatorio);
  const obrigatoriosOk = obrigatorios.filter(i => i.ok).length;
  const podeProsseguir = obrigatoriosOk === obrigatorios.length;
  const totalProblemas = itens.filter(i => i.problema_reportado).length;

  async function prosseguir() {
    if (!podeProsseguir) {
      toast.error("Marque todos os itens obrigatórios da entrega"); return;
    }
    try {
      // Persistir alterações pendentes (qualquer item editado)
      await Promise.all(itens.map(salvarItem));
      onConcluido?.();
      onOpenChange(false);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-gold" />
            Checklist de entrega
            <Badge variant="outline" className="text-[10px] ml-2">
              {obrigatoriosOk}/{obrigatorios.length} obrigatórios
            </Badge>
            {totalProblemas > 0 && (
              <Badge className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                ⚠ {totalProblemas} problema{totalProblemas > 1 ? "s" : ""}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Marque o que foi feito e use 📝 pra anotações ou ⚠ pra reportar problema do espaço
          (geladeira, lâmpada, porta, etc).
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {itens.map(item => (
            <div key={item.id} className={
              "border rounded-md p-2 text-sm " +
              (item.problema_reportado ? "border-amber-300 bg-amber-50/40" : "")
            }>
              <div className="flex items-start gap-2">
                <Checkbox checked={item.ok}
                  onCheckedChange={(v) => atualizarItem(item.id, { ok: !!v })}
                  className="mt-0.5" />
                <div className="flex-1">
                  <span className={item.ok ? "line-through text-muted-foreground" : ""}>{item.item}</span>
                  {item.obrigatorio && (
                    <Badge variant="outline" className="text-[9px] ml-1.5 bg-amber-50 text-amber-700 border-amber-200">
                      obrigatório
                    </Badge>
                  )}
                </div>
                <button onClick={() => setExpandido({...expandido, [item.id]: !expandido[item.id]})}
                  className={"text-[10px] px-1.5 py-0.5 rounded hover:bg-muted gap-1 flex items-center " +
                    (item.observacao || expandido[item.id] ? "text-blue-600" : "text-muted-foreground")}>
                  <MessageSquare className="w-3 h-3" /> {item.observacao ? "obs" : "📝"}
                </button>
                <button onClick={() => atualizarItem(item.id, { problema_reportado: !item.problema_reportado })}
                  className={"text-[10px] px-1.5 py-0.5 rounded hover:bg-amber-100 flex items-center gap-1 " +
                    (item.problema_reportado ? "text-amber-700 bg-amber-100" : "text-muted-foreground")}>
                  <AlertTriangle className="w-3 h-3" /> {item.problema_reportado ? "problema" : "⚠"}
                </button>
              </div>

              {(expandido[item.id] || item.observacao || item.problema_reportado) && (
                <Textarea
                  className="mt-2 text-xs"
                  rows={2}
                  placeholder={
                    item.problema_reportado
                      ? "Descreva o problema (ex: 'geladeira não está gelando bem')"
                      : "Anotação (opcional)"
                  }
                  value={item.observacao ?? ""}
                  onChange={e => atualizarItem(item.id, { observacao: e.target.value })}
                  onBlur={() => salvarItem(item)}
                />
              )}
            </div>
          ))}
        </div>

        {!podeProsseguir && (
          <p className="text-[11px] text-rose-700">
            ⚠ Marque os {obrigatorios.length} itens obrigatórios pra continuar.
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="gap-1.5">
            <X className="w-3.5 h-3.5" /> Cancelar
          </Button>
          <Button onClick={prosseguir} disabled={!podeProsseguir}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <ArrowRight className="w-3.5 h-3.5" /> Continuar pro fechamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
