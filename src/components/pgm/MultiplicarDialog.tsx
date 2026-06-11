import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  multiplicarGrupo, listarMembrosDoGrupo,
  type PgmMembroComPessoa,
} from "@/services/pgmService";
import { BuscaPessoa } from "@/components/ui/BuscaPessoa";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  grupoPaiId: string;
  grupoPaiNome: string;
}

export function MultiplicarDialog({ open, onOpenChange, grupoPaiId, grupoPaiNome }: Props) {
  const navigate = useNavigate();
  const [membros, setMembros] = useState<PgmMembroComPessoa[]>([]);
  const [nome, setNome] = useState("");
  const [liderId, setLiderId] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(`${grupoPaiNome} · Multiplicação`);
    setLiderId("");
    setSelecionados(new Set());
    listarMembrosDoGrupo(grupoPaiId).then(setMembros);
  }, [open, grupoPaiId, grupoPaiNome]);

  function toggle(id: string) {
    setSelecionados(s => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome do novo grupo"); return; }
    if (!liderId) { toast.error("Selecione o líder do novo grupo"); return; }

    setBusy(true);
    try {
      const filhoId = await multiplicarGrupo(
        grupoPaiId, nome.trim(), liderId,
        Array.from(selecionados),
      );
      toast.success("Multiplicação realizada 🌱");
      onOpenChange(false);
      navigate(`/pgm/${filhoId}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" /> Multiplicar grupo
          </DialogTitle>
          <DialogDescription>
            Você está prestes a gerar um <strong>grupo filho</strong> a partir de <em>{grupoPaiNome}</em>.
            As pessoas selecionadas serão transferidas; o grupo pai continua ativo como <strong>Multiplicador</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome do novo grupo *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>

          <div>
            <Label>Líder do novo grupo *</Label>
            <BuscaPessoa value={liderId} onChange={(id) => setLiderId(id)}
              placeholder="Quem vai liderar?" />
          </div>

          <div>
            <Label className="text-xs">Quem vai com o líder ({selecionados.size} selecionado{selecionados.size === 1 ? "" : "s"})</Label>
            <p className="text-[10px] text-muted-foreground mb-1">
              Selecione os que vão para o novo grupo. Eles deixam o atual.
            </p>
            <div className="border rounded-md max-h-48 overflow-y-auto">
              {membros.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center italic">Sem membros</p>
              ) : membros.map(m => (
                <label key={m.id}
                  className={`flex items-center gap-2 px-2 py-1.5 border-b last:border-0 cursor-pointer text-sm hover:bg-muted/40 ${
                    selecionados.has(m.pessoa_id) ? "bg-emerald-50" : ""
                  }`}>
                  <input type="checkbox" checked={selecionados.has(m.pessoa_id)}
                    onChange={() => toggle(m.pessoa_id)} />
                  <span>{m.nome_completo ?? "—"}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline"
              onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="bg-emerald-700 hover:bg-emerald-700/90 text-white gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> {busy ? "..." : "Multiplicar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
