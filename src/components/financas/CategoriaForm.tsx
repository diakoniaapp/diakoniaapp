import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  criarCategoria, atualizarCategoria,
  type FinCategoria, type FinMovimentoTipo,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoria?: FinCategoria | null;
  tipoPadrao?: FinMovimentoTipo;
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
  "#7c3aed","#16a34a","#eab308","#d97706","#be185d","#3f3f46",
];

export function CategoriaForm({ open, onOpenChange, categoria, tipoPadrao = "saida", onSaved }: Props) {
  const isEdit = !!categoria;
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<FinMovimentoTipo>(tipoPadrao);
  const [cor, setCor] = useState("#888");
  const [ordem, setOrdem] = useState<number>(50);
  const [contaContabil, setContaContabil] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (categoria) {
      setNome(categoria.nome);
      setTipo(categoria.tipo);
      setCor(categoria.cor ?? "#888");
      setOrdem(categoria.ordem ?? 50);
      setContaContabil(categoria.conta_contabil ?? "");
    } else {
      setNome(""); setTipo(tipoPadrao);
      setCor("#888"); setOrdem(50); setContaContabil("");
    }
  }, [open, categoria, tipoPadrao]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        tipo, cor, ordem,
        conta_contabil: contaContabil.trim() || null,
      };
      if (isEdit && categoria) {
        await atualizarCategoria(categoria.id, payload);
        toast.success("Categoria atualizada");
      } else {
        await criarCategoria(payload);
        toast.success("Categoria criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {isEdit ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={tipo === "entrada" ? "default" : "outline"}
              onClick={() => setTipo("entrada")}
              className={tipo === "entrada" ? "bg-emerald-600 text-white hover:bg-emerald-700 gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingUp className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => setTipo("saida")}
              className={tipo === "saida" ? "bg-rose-600 text-white hover:bg-rose-700 gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingDown className="w-3.5 h-3.5" /> Saída
            </Button>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus
              placeholder="Ex: Material de som" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordem</Label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 50)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Menor aparece primeiro</p>
            </div>
            <div>
              <Label>Conta contábil</Label>
              <Input value={contaContabil} onChange={(e) => setContaContabil(e.target.value)}
                placeholder="Ex: 3.1.01" />
            </div>
          </div>

          <div>
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {CORES.map(c => (
                <button key={c} type="button"
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-md border-2 transition-all ${cor === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ background: c }} />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
