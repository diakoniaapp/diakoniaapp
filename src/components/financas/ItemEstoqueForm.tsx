import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Package } from "lucide-react";
import {
  criarItem, atualizarItem, UNIDADES, CATEGORIAS_PADRAO,
  type EstoqueItem,
} from "@/services/estoqueService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item?: EstoqueItem | null;
  onSaved: () => void;
}

export function ItemEstoqueForm({ open, onOpenChange, item, onSaved }: Props) {
  const isEdit = !!item;
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("un");
  const [categoria, setCategoria] = useState("Limpeza");
  const [estoqueAtual, setEstoqueAtual] = useState<number>(0);
  const [estoqueMinimo, setEstoqueMinimo] = useState<number>(0);
  const [pontoPedido, setPontoPedido] = useState<number | "">("");
  const [custoMedio, setCustoMedio] = useState<number | "">("");
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (item) {
      setNome(item.nome);
      setDescricao(item.descricao ?? "");
      setUnidade(item.unidade);
      setCategoria(item.categoria ?? "Limpeza");
      setEstoqueAtual(Number(item.estoque_atual));
      setEstoqueMinimo(Number(item.estoque_minimo));
      setPontoPedido(item.ponto_pedido ? Number(item.ponto_pedido) : "");
      setCustoMedio(item.custo_medio ? Number(item.custo_medio) : "");
      setObservacao(item.observacao ?? "");
    } else {
      setNome(""); setDescricao(""); setUnidade("un"); setCategoria("Limpeza");
      setEstoqueAtual(0); setEstoqueMinimo(0);
      setPontoPedido(""); setCustoMedio(""); setObservacao("");
    }
  }, [open, item]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }
    if (estoqueMinimo < 0) { toast.error("Estoque mínimo inválido"); return; }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        unidade,
        categoria,
        estoque_atual: estoqueAtual,
        estoque_minimo: estoqueMinimo,
        ponto_pedido: pontoPedido !== "" ? Number(pontoPedido) : null,
        custo_medio: custoMedio !== "" ? Number(custoMedio) : null,
        observacao: observacao.trim() || null,
      };
      if (isEdit && item) {
        await atualizarItem(item.id, payload);
        toast.success("Item atualizado");
      } else {
        await criarItem(payload);
        toast.success("Item criado");
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
            <Package className="w-5 h-5 text-gold" />
            {isEdit ? "Editar item" : "Novo item de estoque"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required
              placeholder="Ex: Sabão líquido 5L" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_PADRAO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unidade</Label>
              <Select value={unidade} onValueChange={setUnidade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isEdit ? "Estoque atual" : "Estoque inicial"}</Label>
              <Input type="number" step="0.001" value={estoqueAtual}
                onChange={(e) => setEstoqueAtual(Number(e.target.value))} disabled={isEdit}/>
              {isEdit && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Ajuste via "Registrar movimento" (entrada/saída/ajuste)
                </p>
              )}
            </div>
            <div>
              <Label>Estoque mínimo *</Label>
              <Input type="number" step="0.001" value={estoqueMinimo}
                onChange={(e) => setEstoqueMinimo(Number(e.target.value))} required />
              <p className="text-[10px] text-muted-foreground mt-0.5">Abaixo deste, vira alerta crítico</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ponto de pedido</Label>
              <Input type="number" step="0.001" value={pontoPedido}
                onChange={(e) => setPontoPedido(Number(e.target.value) || "")}
                placeholder="(opcional)" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Atingiu = sugere compra</p>
            </div>
            <div>
              <Label>Custo médio (R$)</Label>
              <Input type="number" step="0.01" value={custoMedio}
                onChange={(e) => setCustoMedio(Number(e.target.value) || "")}
                placeholder="Auto pelas entradas" />
            </div>
          </div>

          <div>
            <Label>Descrição/Observação</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Marca preferida, onde fica guardado, etc." />
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
