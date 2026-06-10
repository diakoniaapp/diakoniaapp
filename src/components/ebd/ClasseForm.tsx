import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  criarClasse, atualizarClasse, type EbdClasse, type ClasseInput,
} from "@/services/ebdService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  classe: EbdClasse | null;
  onSaved: () => void;
}

const EMPTY: ClasseInput = {
  nome: "",
  idade_min: null,
  idade_max: null,
  genero: "misto",
  descricao: "",
  cor: "#cfa451",
  ordem: 0,
  ativo: true,
};

export function ClasseForm({ open, onOpenChange, classe, onSaved }: Props) {
  const [form, setForm] = useState<ClasseInput>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (classe) {
      setForm({
        nome: classe.nome,
        idade_min: classe.idade_min,
        idade_max: classe.idade_max,
        genero: classe.genero,
        descricao: classe.descricao ?? "",
        cor: classe.cor ?? "#cfa451",
        ordem: classe.ordem ?? 0,
        ativo: classe.ativo,
      });
    } else {
      setForm(EMPTY);
    }
  }, [classe, open]);

  function set<K extends keyof ClasseInput>(k: K, v: ClasseInput[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function validar(): string | null {
    if (!form.nome.trim()) return "Informe o nome da classe.";
    if (form.idade_min != null && form.idade_max != null && form.idade_min > form.idade_max) {
      return "Idade mínima não pode ser maior que a máxima.";
    }
    if (form.idade_min != null && (form.idade_min < 0 || form.idade_min > 120)) {
      return "Idade mínima fora do intervalo (0–120).";
    }
    if (form.idade_max != null && (form.idade_max < 0 || form.idade_max > 120)) {
      return "Idade máxima fora do intervalo (0–120).";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erro = validar();
    if (erro) { toast.error(erro); return; }

    setBusy(true);
    try {
      const payload: ClasseInput = {
        ...form,
        nome: form.nome.trim(),
        descricao: form.descricao?.trim() || null,
      };
      if (classe) {
        await atualizarClasse(classe.id, payload);
        toast.success("Classe atualizada");
      } else {
        await criarClasse(payload);
        toast.success("Classe criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      if (e?.code === "23505") toast.error("Já existe uma classe com esse nome.");
      else toast.error(e?.message ?? "Erro ao salvar");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {classe ? "Editar classe" : "Nova classe"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input required value={form.nome}
              onChange={(e) => set("nome", e.target.value)}
              placeholder="Ex: Adolescentes" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Idade mínima</Label>
              <Input type="number" min={0} max={120}
                value={form.idade_min ?? ""}
                onChange={(e) => set("idade_min", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="ex: 12" />
            </div>
            <div>
              <Label>Idade máxima</Label>
              <Input type="number" min={0} max={120}
                value={form.idade_max ?? ""}
                onChange={(e) => set("idade_max", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="ex: 15" />
            </div>
          </div>

          <div>
            <Label>Gênero</Label>
            <Select value={form.genero} onValueChange={(v) => set("genero", v as ClasseInput["genero"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="misto">Misto</SelectItem>
                <SelectItem value="masculino">Homens</SelectItem>
                <SelectItem value="feminino">Mulheres</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cor</Label>
              <Input type="color" value={form.cor ?? "#cfa451"}
                onChange={(e) => set("cor", e.target.value)} className="h-10" />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input type="number" value={form.ordem ?? 0}
                onChange={(e) => set("ordem", Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={form.descricao ?? ""}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="Detalhes sobre a classe, sala, professor titular, etc" />
          </div>

          <div className="flex items-center justify-between p-2 rounded bg-muted/30">
            <div>
              <Label className="font-medium">Classe ativa</Label>
              <p className="text-xs text-muted-foreground">Quando desativada, não aparece nas listagens.</p>
            </div>
            <Switch checked={form.ativo ?? true} onCheckedChange={(v) => set("ativo", v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Salvando..." : classe ? "Salvar alterações" : "Criar classe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
