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
import { ArrowRightLeft, Camera, FileUp, X } from "lucide-react";
import {
  listarContas, transferir, brl, FIN_COMPROVANTE_MAX,
  type FinConta,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Conta pré-selecionada como origem */
  contaOrigemPadrao?: string;
  onSaved: () => void;
}

export function TransferenciaForm({ open, onOpenChange, contaOrigemPadrao, onSaved }: Props) {
  const [contas, setContas] = useState<FinConta[]>([]);
  const [origemId, setOrigemId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    listarContas().then((cs) => {
      setContas(cs);
      setOrigemId(contaOrigemPadrao ?? cs[0]?.id ?? "");
      setDestinoId("");
    });
    setValor(0);
    setData(new Date().toISOString().slice(0, 10));
    setDescricao("");
    setArquivo(null);
    setPreviewUrl(null);
  }, [open, contaOrigemPadrao]);

  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith("image/")) { setPreviewUrl(null); return; }
    const u = URL.createObjectURL(arquivo);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  function escolheArquivo(file: File | null) {
    if (!file) return;
    if (file.size > FIN_COMPROVANTE_MAX) { toast.error("Arquivo > 5MB"); return; }
    setArquivo(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origemId || !destinoId) { toast.error("Selecione origem e destino"); return; }
    if (origemId === destinoId) { toast.error("Escolha contas diferentes"); return; }
    if (valor <= 0) { toast.error("Valor inválido"); return; }

    setBusy(true);
    try {
      await transferir({
        contaOrigemId: origemId,
        contaDestinoId: destinoId,
        valor, data,
        descricao: descricao.trim() || null,
        comprovanteFile: arquivo,
      });
      toast.success(`Transferência de ${brl(valor)} realizada`);
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  const origem = contas.find(c => c.id === origemId);
  const destino = contas.find(c => c.id === destinoId);
  const saldoOrigemDepois = origem ? Number(origem.saldo_atual) - valor : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            Transferir entre contas
          </DialogTitle>
          <DialogDescription>
            Mova dinheiro entre contas. Cria saída na origem + entrada no destino — atômico.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>De (origem) *</Label>
            <Select value={origemId} onValueChange={setOrigemId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} · {brl(Number(c.saldo_atual))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-center text-2xl text-muted-foreground">↓</div>

          <div>
            <Label>Para (destino) *</Label>
            <Select value={destinoId} onValueChange={setDestinoId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.filter(c => c.id !== origemId).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} · {brl(Number(c.saldo_atual))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" min={0.01} step="0.01" required
                value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} autoFocus />
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>

          {/* Preview do impacto */}
          {origem && destino && valor > 0 && (
            <div className="rounded-md p-2 border border-blue-300 bg-blue-50/30 text-xs space-y-0.5">
              <p className="font-medium text-blue-900">Resumo:</p>
              <p>
                <strong>{origem.nome}</strong>: {brl(Number(origem.saldo_atual))} → <span className={saldoOrigemDepois < 0 ? "text-rose-700 font-semibold" : ""}>{brl(saldoOrigemDepois)}</span>
                {saldoOrigemDepois < 0 && <span className="text-rose-700 ml-1">⚠ saldo negativo</span>}
              </p>
              <p>
                <strong>{destino.nome}</strong>: {brl(Number(destino.saldo_atual))} → {brl(Number(destino.saldo_atual) + valor)}
              </p>
            </div>
          )}

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Depósito do envelope da semana" />
          </div>

          {/* Comprovante */}
          <div className="space-y-2">
            <Label>📎 Comprovante (opcional)</Label>
            {!arquivo ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-2 hover:border-gold/40">
                    <Camera className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px]">Foto</span>
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input type="file" accept="image/jpeg,image/png,image/jpg,application/pdf"
                    className="hidden" onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-2 hover:border-gold/40">
                    <FileUp className="w-4 h-4 text-muted-foreground" />
                    <span className="text-[10px]">Arquivo</span>
                  </div>
                </label>
              </div>
            ) : (
              <div className="border rounded-md p-2 flex items-center gap-2 bg-muted/30">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="w-10 h-10 object-cover rounded" />
                ) : (
                  <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs">📄</div>
                )}
                <span className="text-xs truncate flex-1">{arquivo.name}</span>
                <Button type="button" variant="ghost" size="icon"
                  className="h-7 w-7 text-destructive" onClick={() => setArquivo(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy} className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5" /> {busy ? "..." : "Transferir"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
