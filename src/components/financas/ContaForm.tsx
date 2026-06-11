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
import { Wallet, Building2 } from "lucide-react";
import {
  criarConta, atualizarConta, CONTA_TIPO_LABEL,
  type FinConta, type FinContaTipo,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conta?: FinConta | null;
  onSaved: () => void;
}

const CORES = [
  "#10b981", "#0ea5e9", "#6366f1", "#a855f7",
  "#f59e0b", "#dc2626", "#ec4899", "#737373",
  "#cfa451", "#22d3ee", "#84cc16", "#fb923c",
];

export function ContaForm({ open, onOpenChange, conta, onSaved }: Props) {
  const isEdit = !!conta;

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<FinContaTipo>("banco");
  const [bancoNome, setBancoNome] = useState("");
  const [bancoCodigo, setBancoCodigo] = useState("");
  const [agencia, setAgencia] = useState("");
  const [contaNumero, setContaNumero] = useState("");
  const [saldoInicial, setSaldoInicial] = useState<number>(0);
  const [cor, setCor] = useState("#cfa451");
  const [observacao, setObservacao] = useState("");

  // Cartão
  const [diaVencimento, setDiaVencimento] = useState<number | "">("");
  const [diaFechamento, setDiaFechamento] = useState<number | "">("");
  const [limiteCredito, setLimiteCredito] = useState<number | "">("");

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (conta) {
      setNome(conta.nome);
      setTipo(conta.tipo);
      setBancoNome(conta.banco_nome ?? "");
      setBancoCodigo(conta.banco_codigo ?? "");
      setAgencia(conta.agencia ?? "");
      setContaNumero(conta.conta_numero ?? "");
      setSaldoInicial(Number(conta.saldo_inicial ?? 0));
      setCor(conta.cor ?? "#cfa451");
      setObservacao(conta.observacao ?? "");
      setDiaVencimento(conta.dia_vencimento ?? "");
      setDiaFechamento(conta.dia_fechamento ?? "");
      setLimiteCredito(conta.limite_credito ? Number(conta.limite_credito) : "");
    } else {
      setNome(""); setTipo("banco");
      setBancoNome(""); setBancoCodigo(""); setAgencia(""); setContaNumero("");
      setSaldoInicial(0); setCor("#cfa451"); setObservacao("");
      setDiaVencimento(""); setDiaFechamento(""); setLimiteCredito("");
    }
  }, [open, conta]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(), tipo,
        banco_nome: bancoNome.trim() || null,
        banco_codigo: bancoCodigo.trim() || null,
        agencia: agencia.trim() || null,
        conta_numero: contaNumero.trim() || null,
        saldo_inicial: saldoInicial,
        cor,
        observacao: observacao.trim() || null,
        dia_vencimento: tipo === "cartao" && diaVencimento ? Number(diaVencimento) : null,
        dia_fechamento: tipo === "cartao" && diaFechamento ? Number(diaFechamento) : null,
        limite_credito: tipo === "cartao" && limiteCredito ? Number(limiteCredito) : null,
      };
      if (isEdit && conta) {
        await atualizarConta(conta.id, payload);
        toast.success("Conta atualizada");
      } else {
        await criarConta(payload);
        toast.success("Conta criada");
      }
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Wallet className="w-5 h-5 text-gold" />
            {isEdit ? "Editar conta" : "Nova conta"}
          </DialogTitle>
          <DialogDescription>
            Defina onde o dinheiro fica (caixa, banco, cartão, envelopes, etc.).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome da conta *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required
              placeholder="Ex: Bradesco 111342" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as FinContaTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CONTA_TIPO_LABEL) as [FinContaTipo, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Saldo inicial (R$)</Label>
              <Input type="number" step="0.01" value={saldoInicial || ""}
                onChange={(e) => setSaldoInicial(Number(e.target.value))} />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {isEdit ? "Alterar muda o saldo atual" : "Saldo que já está nesta conta"}
              </p>
            </div>
          </div>

          {/* Cor */}
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

          {/* Banco — só se tipo é banco/pix/aplicacao */}
          {(tipo === "banco" || tipo === "aplicacao" || tipo === "pix") && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Building2 className="w-3 h-3" /> Dados bancários
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Input value={bancoNome} onChange={(e) => setBancoNome(e.target.value)} placeholder="Banco (ex: Bradesco)" />
                <Input value={bancoCodigo} onChange={(e) => setBancoCodigo(e.target.value)} placeholder="Código (ex: 237)" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} placeholder="Agência" />
                <Input value={contaNumero} onChange={(e) => setContaNumero(e.target.value)} placeholder="Conta" />
              </div>
            </div>
          )}

          {/* Cartão de crédito */}
          {tipo === "cartao" && (
            <div className="space-y-2 border rounded-md p-3 bg-muted/20">
              <p className="text-xs font-medium text-muted-foreground">💳 Cartão</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[10px]">Limite (R$)</Label>
                  <Input type="number" step="0.01" value={limiteCredito || ""}
                    onChange={(e) => setLimiteCredito(Number(e.target.value) || "")} />
                </div>
                <div>
                  <Label className="text-[10px]">Fechamento (dia)</Label>
                  <Input type="number" min={1} max={31} value={diaFechamento || ""}
                    onChange={(e) => setDiaFechamento(Number(e.target.value) || "")} />
                </div>
                <div>
                  <Label className="text-[10px]">Vencimento (dia)</Label>
                  <Input type="number" min={1} max={31} value={diaVencimento || ""}
                    onChange={(e) => setDiaVencimento(Number(e.target.value) || "")} />
                </div>
              </div>
            </div>
          )}

          <div>
            <Label>Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
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
