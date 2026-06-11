import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { registrarEntrada, CENTAVOS_SIMBOLICOS, type EntradaEbd } from "@/services/ebdService";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function EntradaForm({ campanhaId, open, onOpenChange, onSaved }: Props) {
  const [valor, setValor] = useState<number>(0);
  const [tipo, setTipo] = useState<EntradaEbd["tipo"]>("oferta");
  const [forma, setForma] = useState<EntradaEbd["forma"]>("envelope");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [usarSimbolico, setUsarSimbolico] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValor(0);
      setTipo("oferta");
      setForma("envelope");
      setData(new Date().toISOString().slice(0, 10));
      setDescricao("");
      setUsarSimbolico(true);
    }
  }, [open]);

  const valorFinal = usarSimbolico ? valor + CENTAVOS_SIMBOLICOS : valor;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valor <= 0) { toast.error("Valor precisa ser maior que zero"); return; }

    setBusy(true);
    try {
      await registrarEntrada(campanhaId, {
        data, valor: valorFinal, tipo, forma,
        descricao: descricao.trim() || null,
      });
      toast.success(`Entrada registrada: R$ ${valorFinal.toFixed(2)}`);
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
          <DialogTitle className="font-serif text-xl">Registrar entrada</DialogTitle>
          <DialogDescription>
            Quanto entrou para a campanha?
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Valor (R$) *</Label>
            <Input
              type="number" min={0.01} step="0.01" required
              value={valor || ""}
              onChange={(e) => setValor(Number(e.target.value))}
              placeholder="Ex: 50.00"
              autoFocus
            />
          </div>

          <label className={`flex items-start gap-2 text-sm cursor-pointer p-2 rounded border ${usarSimbolico ? "bg-gold/5 border-gold/30" : "bg-muted/30"}`}>
            <input
              type="checkbox"
              checked={usarSimbolico}
              onChange={(e) => setUsarSimbolico(e.target.checked)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className={`w-3.5 h-3.5 ${usarSimbolico ? "text-gold" : "text-muted-foreground"}`} />
                <span className="font-medium">Adicionar R$ 0,10 simbólicos</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Identifica essa entrada como oferta de campanha (útil ao bater no extrato).
                {usarSimbolico && valor > 0 && (
                  <> Valor final: <strong>R$ {valorFinal.toFixed(2)}</strong></>
                )}
              </p>
            </div>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oferta">Oferta direta</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma *</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="envelope">Envelope</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Data *</Label>
            <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Maria do louvor, Almoço do mês, Artesanato Joana" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" 
              onClick={() => onOpenChange(false)} disabled={busy}>
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
