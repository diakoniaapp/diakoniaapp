import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { CampoData } from "@/components/CampoData";
import { atualizarTransferencia, brl, type FinLancamentoExtenso } from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lancamento: FinLancamentoExtenso | null;
  onSaved: () => void;
}

// Edição de transferência, restrita a Data + Descrição — pedido da Telma
// (22/09/2026, achado ao vivo clicando o lápis de uma perna de
// transferência no extrato: abria o `LancamentoForm` inteiro, que deixa
// mudar Conta/Valor/Categoria). Conta e Valor não aparecem aqui de
// propósito: mudar o valor de só uma perna quebraria a transferência
// (as duas pernas precisam ter o mesmo valor, e nada mais garante isso
// fora do fluxo de criação). Pra mudar conta ou valor, exclui e cria de
// novo — mesmo princípio já usado no lançamento comum.
export function EditarTransferenciaForm({ open, onOpenChange, lancamento, onSaved }: Props) {
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !lancamento) return;
    setData(lancamento.data);
    setDescricao(lancamento.descricao ?? "");
  }, [open, lancamento]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lancamento) return;
    setBusy(true);
    try {
      await atualizarTransferencia(lancamento.id, { data, descricao: descricao.trim() || null });
      toast.success("Transferência atualizada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  if (!lancamento) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-info-text" /> Editar transferência
          </DialogTitle>
          <DialogDescription>
            Conta e valor não mudam por aqui — as duas pernas precisam
            continuar com o mesmo valor. Pra corrigir isso, exclua e
            crie a transferência de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{lancamento.conta_nome}</p>
          <p className={lancamento.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}>
            {lancamento.tipo === "entrada" ? "+ " : "− "}{brl(Number(lancamento.valor))}
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Data *</Label>
            <CampoData value={data} onChange={setData} />
          </div>
          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
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
