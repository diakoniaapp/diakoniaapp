import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { paraNumero } from "@/lib/dinheiro";
import {
  atualizarCentroCusto, VINCULO_LABEL,
  type FinCentroCusto,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  centro: FinCentroCusto | null;
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
];

// Só edita nome/cor/orçamento — `vinculo_tipo`, `vinculo_id` e
// `centro_pai_id` são estruturais (vêm do seed automático ou de
// migration, nunca de digitação) e mudar um deles à toa desalinha o
// centro do que ele diz representar. Não existe "Novo centro de custo"
// aqui de propósito: `criarCentroCusto()` existe no serviço mas nenhuma
// tela chama — `fin_seed_centros_custo()` é a única forma de nascer um
// centro hoje (ver comentário em FinancasCentros.tsx).
export function CentroCustoForm({ open, onOpenChange, centro, onSaved }: Props) {
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#888");
  const [orcamentoTexto, setOrcamentoTexto] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !centro) return;
    setNome(centro.nome);
    setCor(centro.cor ?? "#888");
    setOrcamentoTexto(centro.orcamento_anual != null ? String(centro.orcamento_anual) : "");
  }, [open, centro]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!centro) return;
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      await atualizarCentroCusto(centro.id, {
        nome: nome.trim(),
        cor,
        orcamento_anual: orcamentoTexto.trim() ? paraNumero(orcamentoTexto) : null,
      });
      toast.success("Centro de custo atualizado");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (!centro) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            Editar centro de custo
            <Badge variant="outline" className="text-xs">{VINCULO_LABEL[centro.vinculo_tipo]}</Badge>
          </DialogTitle>
          <DialogDescription>
            Tipo de vínculo não muda por aqui — vem do jeito que o centro nasceu.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
          </div>

          <div>
            <Label>Orçamento anual (R$)</Label>
            <Input type="text" inputMode="decimal" value={orcamentoTexto}
              onChange={(e) => setOrcamentoTexto(e.target.value)}
              placeholder="Opcional" />
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
              {busy ? "..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
