import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { atualizarItemCatalogo, type ItemCatalogo } from "@/services/bazarService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ItemCatalogo | null;
  onSaved: () => void;
}

export function EditarItemCatalogoDialog({ open, onOpenChange, item, onSaved }: Props) {
  const [form, setForm] = useState({ nome: "", preco: "", categoria: "", ativo: true });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (item) {
      setForm({
        nome: item.nome,
        preco: String(item.preco_sugerido).replace(".", ","),
        categoria: item.categoria ?? "",
        ativo: item.ativo,
      });
    }
  }, [item]);

  async function salvar() {
    if (!item) return;
    const v = Number(form.preco.replace(",", "."));
    if (!form.nome.trim() || isNaN(v) || v <= 0) { toast.error("Preencha nome e preço"); return; }
    setSalvando(true);
    try {
      await atualizarItemCatalogo(item.id, {
        nome: form.nome, preco_sugerido: v,
        categoria: form.categoria || null, ativo: form.ativo,
      });
      toast.success("Item atualizado");
      onSaved();
      onOpenChange(false);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar item do cardápio</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-[11px]">Nome</Label>
            <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Preço</Label>
              <Input value={form.preco} onChange={e => setForm({...form, preco: e.target.value})} placeholder="R$ 0,00" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Categoria</Label>
              <Input value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})} />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t pt-2">
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({...form, ativo: v})} />
            <span className="text-xs">Item ativo (aparece no PDV)</span>
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
