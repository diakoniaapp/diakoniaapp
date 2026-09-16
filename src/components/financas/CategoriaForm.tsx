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
import { toast } from "sonner";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  criarCategoria, atualizarCategoria,
  type FinCategoria, type FinMovimentoTipo, type FinClassificacaoDRE,
} from "@/services/finService";

// Pedido da Telma (16/09/2026), depois de criar "Devoluções e Estornos"
// por aqui e a categoria nascer sem `classificacao_dre`: o campo nunca
// esteve neste formulário — só migration/SQL direto preenchia. Sem ele,
// TODA categoria nova criada pela tela fica de fora da Prestação de
// Contas/DRE em silêncio (a mesma lacuna já achada com "Assistência
// Social / Ação Social" da Diaconia). Opções filtradas por `tipo`
// porque uma categoria de entrada não pode ser "despesas", e vice-versa.
const CLASSIFICACAO_POR_TIPO: Record<FinMovimentoTipo, { valor: FinClassificacaoDRE; rotulo: string }[]> = {
  entrada: [
    { valor: "receitas_regulares", rotulo: "Receitas Regulares (dízimos, ofertas)" },
    { valor: "outras_receitas", rotulo: "Outras Receitas" },
  ],
  saida: [
    { valor: "despesas", rotulo: "Despesas" },
    { valor: "despesas_financeiras", rotulo: "Despesas Financeiras" },
    { valor: "outras_despesas", rotulo: "Outras Despesas" },
  ],
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoria?: FinCategoria | null;
  tipoPadrao?: FinMovimentoTipo;
  onSaved: () => void;
}

const CORES = [
  "#10b981","#0ea5e9","#6366f1","#a855f7","#f59e0b","#dc2626",
  "#ec4899","#737373","#cfa451","#22d3ee","#84cc16","#fb923c",
  "#7c3aed","#16a34a","#eab308","#d97706","#be185d","#3f3f46",
];

export function CategoriaForm({ open, onOpenChange, categoria, tipoPadrao = "saida", onSaved }: Props) {
  const isEdit = !!categoria;
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<FinMovimentoTipo>(tipoPadrao);
  const [cor, setCor] = useState("#888");
  const [ordem, setOrdem] = useState<number>(50);
  const [contaContabil, setContaContabil] = useState("");
  const [classificacaoDre, setClassificacaoDre] = useState<FinClassificacaoDRE | "">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (categoria) {
      setNome(categoria.nome);
      setTipo(categoria.tipo);
      setCor(categoria.cor ?? "#888");
      setOrdem(categoria.ordem ?? 50);
      setContaContabil(categoria.conta_contabil ?? "");
      setClassificacaoDre(categoria.classificacao_dre ?? "");
    } else {
      setNome(""); setTipo(tipoPadrao);
      setCor("#888"); setOrdem(50); setContaContabil(""); setClassificacaoDre("");
    }
  }, [open, categoria, tipoPadrao]);

  // Trocar entrada↔saída invalida a classificação escolhida (uma
  // categoria de entrada não pode ser "despesas") — mesma guarda que já
  // existia pra `tipo` em si (desabilitado pra categoria do sistema).
  function mudarTipo(novoTipo: FinMovimentoTipo) {
    setTipo(novoTipo);
    if (!CLASSIFICACAO_POR_TIPO[novoTipo].some(o => o.valor === classificacaoDre)) {
      setClassificacaoDre("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Informe o nome"); return; }

    setBusy(true);
    try {
      const payload: any = {
        nome: nome.trim(),
        tipo, cor, ordem,
        conta_contabil: contaContabil.trim() || null,
        classificacao_dre: classificacaoDre || null,
      };
      if (isEdit && categoria) {
        await atualizarCategoria(categoria.id, payload);
        toast.success("Categoria atualizada");
      } else {
        await criarCategoria(payload);
        toast.success("Categoria criada");
      }
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
            {isEdit ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={tipo === "entrada" ? "default" : "outline"}
              onClick={() => mudarTipo("entrada")}
              className={tipo === "entrada" ? "bg-success text-white hover:bg-success gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingUp className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => mudarTipo("saida")}
              className={tipo === "saida" ? "bg-destructive text-white hover:bg-destructive gap-1.5" : "gap-1.5"}
              disabled={isEdit && categoria?.sistema}>
              <TrendingDown className="w-3.5 h-3.5" /> Saída
            </Button>
          </div>

          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus
              placeholder="Ex: Material de som" />
          </div>

          <div>
            <Label>Classificação no Plano de Contas</Label>
            <Select value={classificacaoDre || "__fora__"} onValueChange={(v) => setClassificacaoDre(v === "__fora__" ? "" : v as FinClassificacaoDRE)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__fora__">Fora do Plano Oficial</SelectItem>
                {CLASSIFICACAO_POR_TIPO[tipo].map(o => (
                  <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-0.5">
              "Fora do Plano Oficial" não entra na Prestação de Contas nem na DRE — só no extrato.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordem</Label>
              <Input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value) || 50)} />
              <p className="text-xs text-muted-foreground mt-0.5">Menor aparece primeiro</p>
            </div>
            <div>
              <Label>Conta contábil</Label>
              <Input value={contaContabil} onChange={(e) => setContaContabil(e.target.value)}
                placeholder="Ex: 3.1.01" />
            </div>
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
              {busy ? "..." : isEdit ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
