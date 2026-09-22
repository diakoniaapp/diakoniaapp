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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Wallet, Building2 } from "lucide-react";
import { paraNumero } from "@/lib/dinheiro";
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

// `<input type="number">` rejeita vírgula — a Telma digitou "928,00" (do
// jeito que qualquer brasileiro digita) e o campo não aceitou, sobrando
// um resto tipo "0,01" no lugar. Corrigido trocando por texto livre +
// `inputMode="decimal"` (teclado numérico no celular, mas aceita
// qualquer caractere) e parseando na entrega, não a cada tecla.
// `paraNumero` mora em `src/lib/dinheiro.ts` — mesmo parser usado por
// todo campo de dinheiro do sistema, depois que uma revisão achou o
// mesmo bug (e um segundo, ponto-como-milhar tratado errado) ainda vivo
// nos campos de `LancamentoForm.tsx` e `ContratadoForm.tsx`.

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
  const [saldoInicialTexto, setSaldoInicialTexto] = useState("0");
  const [cor, setCor] = useState("#cfa451");
  const [observacao, setObservacao] = useState("");
  // Item 6 — ordem de exibição em dropdowns/listas/relatórios (a coluna
  // `ordem` já existia no banco desde antes; só faltava a tela pra editar).
  const [ordem, setOrdem] = useState(0);
  // Item 5 — o que esta conta aceita lançar. Transferência em duas flags
  // (22/09/2026, pedido dela vendo a tela em produção): entrada (pode ser
  // destino) e saída (pode ser origem) são independentes — ex.: uma conta
  // de Aplicação só recebe transferência, nunca é origem de uma.
  const [aceitaReceitas, setAceitaReceitas] = useState(true);
  const [aceitaDespesas, setAceitaDespesas] = useState(true);
  const [aceitaTransferenciaEntrada, setAceitaTransferenciaEntrada] = useState(true);
  const [aceitaTransferenciaSaida, setAceitaTransferenciaSaida] = useState(true);

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
      setSaldoInicialTexto(String(conta.saldo_inicial ?? 0));
      setCor(conta.cor ?? "#cfa451");
      setObservacao(conta.observacao ?? "");
      setDiaVencimento(conta.dia_vencimento ?? "");
      setDiaFechamento(conta.dia_fechamento ?? "");
      setLimiteCredito(conta.limite_credito ? Number(conta.limite_credito) : "");
      setOrdem(conta.ordem ?? 0);
      setAceitaReceitas(conta.aceita_receitas ?? true);
      setAceitaDespesas(conta.aceita_despesas ?? true);
      setAceitaTransferenciaEntrada(conta.aceita_transferencia_entrada ?? true);
      setAceitaTransferenciaSaida(conta.aceita_transferencia_saida ?? true);
    } else {
      setNome(""); setTipo("banco");
      setBancoNome(""); setBancoCodigo(""); setAgencia(""); setContaNumero("");
      setSaldoInicialTexto("0"); setCor("#cfa451"); setObservacao("");
      setDiaVencimento(""); setDiaFechamento(""); setLimiteCredito("");
      setOrdem(0);
      setAceitaReceitas(true); setAceitaDespesas(true);
      setAceitaTransferenciaEntrada(true); setAceitaTransferenciaSaida(true);
    }
  }, [open, conta]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (!aceitaReceitas && !aceitaDespesas && !aceitaTransferenciaEntrada && !aceitaTransferenciaSaida) {
      toast.error("Marque ao menos uma operação que esta conta aceita");
      return;
    }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(), tipo,
        banco_nome: bancoNome.trim() || null,
        banco_codigo: bancoCodigo.trim() || null,
        agencia: agencia.trim() || null,
        conta_numero: contaNumero.trim() || null,
        saldo_inicial: paraNumero(saldoInicialTexto),
        cor,
        observacao: observacao.trim() || null,
        dia_vencimento: tipo === "cartao" && diaVencimento ? Number(diaVencimento) : null,
        dia_fechamento: tipo === "cartao" && diaFechamento ? Number(diaFechamento) : null,
        limite_credito: tipo === "cartao" && limiteCredito ? Number(limiteCredito) : null,
        ordem,
        aceita_receitas: aceitaReceitas,
        aceita_despesas: aceitaDespesas,
        aceita_transferencia_entrada: aceitaTransferenciaEntrada,
        aceita_transferencia_saida: aceitaTransferenciaSaida,
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
              <Input type="text" inputMode="decimal" value={saldoInicialTexto}
                onChange={(e) => setSaldoInicialTexto(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-0.5">
                {isEdit ? "Alterar muda o saldo atual" : "Saldo que já está nesta conta"}
              </p>
            </div>
          </div>

          {/* Ordem de exibição — item 6: controla a ordem em dropdowns,
              listas, relatórios e no seletor rápido do extrato. Menor
              aparece primeiro, mesmo padrão já usado em Categoria/Centro
              de custo. */}
          <div>
            <Label>Ordem de exibição</Label>
            <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 0)}
              className="w-24" />
            <p className="text-xs text-muted-foreground mt-0.5">Menor aparece primeiro (ex.: Envelopes=1, Caixinha=2, Bradesco=3)</p>
          </div>

          {/* Operações aceitas — item 5: "o comportamento deve ser
              respeitado em toda a aplicação". Guarda o dado aqui; quem
              lê (LancamentoForm, TransferenciaForm) filtra o seletor de
              conta por essas flags. */}
          <div>
            <Label>Operações aceitas por esta conta</Label>
            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={aceitaReceitas} onCheckedChange={(v) => setAceitaReceitas(!!v)} />
                Receitas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={aceitaDespesas} onCheckedChange={(v) => setAceitaDespesas(!!v)} />
                Despesas
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={aceitaTransferenciaEntrada} onCheckedChange={(v) => setAceitaTransferenciaEntrada(!!v)} />
                Transferências — entrada (pode ser destino)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={aceitaTransferenciaSaida} onCheckedChange={(v) => setAceitaTransferenciaSaida(!!v)} />
                Transferências — saída (pode ser origem)
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ex.: Conta Envelope = Receitas + Despesas + Transferências (entrada e saída) · Conta Banco = idem · Conta Investimento = só Transferências entrada (só recebe, nunca é origem).
            </p>
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
                  <Label className="text-xs">Limite (R$)</Label>
                  <Input type="number" step="0.01" value={limiteCredito || ""}
                    onChange={(e) => setLimiteCredito(Number(e.target.value) || "")} />
                </div>
                <div>
                  <Label className="text-xs">Fechamento (dia)</Label>
                  <Input type="number" min={1} max={31} value={diaFechamento || ""}
                    onChange={(e) => setDiaFechamento(Number(e.target.value) || "")} />
                </div>
                <div>
                  <Label className="text-xs">Vencimento (dia)</Label>
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
