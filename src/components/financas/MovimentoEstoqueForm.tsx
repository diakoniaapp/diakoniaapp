import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowDownToLine, ArrowUpFromLine, Settings2,
} from "lucide-react";
import {
  registrarMovimento,
  type EstoqueItem, type EstoqueMovTipo,
} from "@/services/estoqueService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: EstoqueItem;
  onSaved: () => void;
}

export function MovimentoEstoqueForm({ open, onOpenChange, item, onSaved }: Props) {
  const [tipo, setTipo] = useState<EstoqueMovTipo>("entrada");
  const [quantidade, setQuantidade] = useState<number>(0);
  const [valorUnitario, setValorUnitario] = useState<number | "">("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTipo("entrada");
    setQuantidade(0);
    setValorUnitario("");
    setData(new Date().toISOString().slice(0, 10));
    setMotivo("");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quantidade <= 0) { toast.error("Quantidade inválida"); return; }
    if (tipo === "saida" && quantidade > Number(item.estoque_atual)) {
      if (!confirm(`Saída de ${quantidade} ${item.unidade} mas só tem ${item.estoque_atual} em estoque.\nDeixar saldo negativo?`)) return;
    }

    setBusy(true);
    try {
      await registrarMovimento({
        item_id: item.id,
        tipo,
        quantidade,
        valor_unitario: valorUnitario !== "" ? Number(valorUnitario) : null,
        data,
        motivo: motivo.trim() || null,
      });
      toast.success("Movimento registrado");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  const novoEstoque = tipo === "entrada"
    ? Number(item.estoque_atual) + quantidade
    : tipo === "saida"
      ? Number(item.estoque_atual) - quantidade
      : Number(item.estoque_atual) + quantidade; // ajuste positivo

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Registrar movimento</DialogTitle>
          <DialogDescription>{item.nome} · Estoque atual: <strong>{Number(item.estoque_atual)} {item.unidade}</strong></DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            <Button type="button" size="sm"
              variant={tipo === "entrada" ? "default" : "outline"}
              onClick={() => setTipo("entrada")}
              className={tipo === "entrada" ? "bg-emerald-600 text-white hover:bg-emerald-700 gap-1" : "gap-1"}>
              <ArrowDownToLine className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => setTipo("saida")}
              className={tipo === "saida" ? "bg-rose-600 text-white hover:bg-rose-700 gap-1" : "gap-1"}>
              <ArrowUpFromLine className="w-3.5 h-3.5" /> Saída
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "ajuste" ? "default" : "outline"}
              onClick={() => setTipo("ajuste")}
              className={tipo === "ajuste" ? "bg-blue-600 text-white hover:bg-blue-700 gap-1" : "gap-1"}>
              <Settings2 className="w-3.5 h-3.5" /> Ajuste
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantidade *</Label>
              <Input type="number" step="0.001" min={0.001} required
                value={quantidade || ""} onChange={(e) => setQuantidade(Number(e.target.value))} autoFocus />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          {tipo === "entrada" && (
            <div>
              <Label>Valor unitário (R$)</Label>
              <Input type="number" step="0.01" value={valorUnitario}
                onChange={(e) => setValorUnitario(Number(e.target.value) || "")}
                placeholder="(opcional)" />
              {valorUnitario !== "" && quantidade > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Total: R$ {(Number(valorUnitario) * quantidade).toFixed(2)}
                </p>
              )}
            </div>
          )}

          <div>
            <Label>Motivo / Observação</Label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={
                tipo === "entrada" ? "Ex: Compra mensal, doação..." :
                tipo === "saida" ? "Ex: Uso evento, limpeza semanal..." :
                "Ex: Inventário, perda, quebra..."
              } />
          </div>

          {/* Preview */}
          {quantidade > 0 && (
            <div className="rounded-md p-2 border border-blue-300 bg-blue-50/30 text-xs">
              <p>Estoque após: <strong>{novoEstoque.toFixed(3)} {item.unidade}</strong>
                {novoEstoque < 0 && <span className="text-rose-700 ml-1">⚠ negativo</span>}
                {novoEstoque <= Number(item.estoque_minimo) && novoEstoque >= 0 && (
                  <span className="text-amber-700 ml-1">⚠ abaixo do mínimo ({Number(item.estoque_minimo)})</span>
                )}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
