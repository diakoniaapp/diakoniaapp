import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  criarCampanha, atualizarCampanha, excluirCampanha,
  type CampanhaEbd, type CampanhaInput,
} from "@/services/ebdService";
import { Trash2 } from "lucide-react";

interface Props {
  classeId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campanha: CampanhaEbd | null;
  onSaved: () => void;
}

const EMPTY = (classeId: string): CampanhaInput => ({
  classe_id: classeId,
  nome: "",
  descricao: "",
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  meta_valor: 0,
  ativo: true,
});

export function CampanhaForm({ classeId, open, onOpenChange, campanha, onSaved }: Props) {
  const [form, setForm] = useState<CampanhaInput>(EMPTY(classeId));
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (campanha) {
      setForm({
        classe_id: campanha.classe_id ?? classeId,
        nome: campanha.nome,
        descricao: campanha.descricao ?? "",
        data_inicio: campanha.data_inicio,
        data_fim: campanha.data_fim,
        meta_valor: campanha.meta_valor,
        ativo: campanha.ativo,
      });
    } else {
      setForm(EMPTY(classeId));
    }
    setConfirmDelete(false);
  }, [campanha, classeId, open]);

  function set<K extends keyof CampanhaInput>(k: K, v: CampanhaInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    if (!form.data_fim || form.data_fim < form.data_inicio) {
      toast.error("Data final deve ser após a inicial"); return;
    }
    if (form.meta_valor <= 0) { toast.error("Meta precisa ser maior que zero"); return; }

    setBusy(true);
    try {
      if (campanha) {
        await atualizarCampanha(campanha.id, form);
        toast.success("Campanha atualizada");
      } else {
        await criarCampanha(form);
        toast.success("Campanha criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!campanha) return;
    setBusy(true);
    try {
      await excluirCampanha(campanha.id);
      toast.success("Campanha excluída (entradas removidas em cascata)");
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
            {campanha ? "Editar campanha" : "Nova campanha"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input required value={form.nome} onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Campanha Bíblias 2026" />
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={form.descricao ?? ""} 
              onChange={(e) => set("descricao", e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Início *</Label>
              <Input type="date" required value={form.data_inicio}
                onChange={(e) => set("data_inicio", e.target.value)} />
            </div>
            <div>
              <Label>Fim *</Label>
              <Input type="date" required value={form.data_fim}
                onChange={(e) => set("data_fim", e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Meta (R$) *</Label>
            <Input type="number" min={1} step="0.01" required 
              value={form.meta_valor || ""}
              onChange={(e) => set("meta_valor", Number(e.target.value))}
              placeholder="Ex: 1500.00" />
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-muted/30">
            <Label className="font-medium">Campanha ativa</Label>
            <Switch checked={form.ativo ?? true} onCheckedChange={(v) => set("ativo", v)} />
          </div>

          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            {campanha && (
              <Button type="button" variant="ghost" 
                onClick={() => setConfirmDelete(!confirmDelete)} 
                className="text-destructive hover:bg-destructive/10 sm:mr-auto gap-1.5"
                disabled={busy}>
                <Trash2 className="w-4 h-4" /> 
                {confirmDelete ? "Confirmar exclusão" : "Excluir"}
              </Button>
            )}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" 
                onClick={() => onOpenChange(false)} disabled={busy}>
                Cancelar
              </Button>
              {confirmDelete ? (
                <Button type="button" variant="destructive" onClick={onDelete} disabled={busy}>
                  {busy ? "..." : "Excluir definitivamente"}
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  {busy ? "..." : campanha ? "Salvar" : "Criar"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
