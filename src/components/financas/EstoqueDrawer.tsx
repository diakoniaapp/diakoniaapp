// ─── EstoqueDrawer.tsx — estoque sem sair do workspace ──────────────────────
//
// Fase 11d do Workspace Financeiro (23/09/2026) — mesma receita da 11b:
// conteúdo idêntico a `FinancasEstoque.tsx` (mesmo `listarAlertas`, mesmos
// `ItemEstoqueForm`/`MovimentoEstoqueForm`), só dentro de um `Sheet`.
// `/financas/estoque` continua existindo.

import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package, Plus, AlertTriangle, Pencil, PlusCircle, Search } from "lucide-react";
import { toast } from "sonner";
import {
  listarAlertas, CATEGORIAS_PADRAO, URGENCIA_LABEL, URGENCIA_COR,
  type EstoqueAlerta, type EstoqueItem,
} from "@/services/estoqueService";
import { brl } from "@/services/finService";
import { ItemEstoqueForm } from "@/components/financas/ItemEstoqueForm";
import { MovimentoEstoqueForm } from "@/components/financas/MovimentoEstoqueForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EstoqueDrawer({ open, onOpenChange }: Props) {
  const [alertas, setAlertas] = useState<EstoqueAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("__all__");
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>("__all__");

  const [itemOpen, setItemOpen] = useState(false);
  const [itemEdit, setItemEdit] = useState<EstoqueItem | null>(null);
  const [movOpen, setMovOpen] = useState(false);
  const [itemMov, setItemMov] = useState<EstoqueItem | null>(null);

  async function carregar() {
    try {
      setAlertas(await listarAlertas());
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtrados = useMemo(() => {
    return alertas.filter(a => {
      if (filtroCategoria !== "__all__" && a.categoria !== filtroCategoria) return false;
      if (filtroUrgencia !== "__all__" && a.urgencia !== filtroUrgencia) return false;
      if (busca.length >= 2 && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [alertas, filtroCategoria, filtroUrgencia, busca]);

  const stats = useMemo(() => {
    const total = alertas.length;
    const criticos = alertas.filter(a => a.urgencia === "esgotado" || a.urgencia === "critico").length;
    const comprar  = alertas.filter(a => a.urgencia === "comprar" || a.urgencia === "baixo").length;
    return { total, criticos, comprar };
  }, [alertas]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gold" /> Estoque
              </SheetTitle>
              <Button size="sm" onClick={() => { setItemEdit(null); setItemOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white shrink-0">
                <Plus className="w-3.5 h-3.5" /> Novo item
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Materiais de limpeza, escritório, som — alerta antes de acabar.
            </SheetDescription>

            {stats.criticos + stats.comprar > 0 && (
              <div className="rounded-md border border-warning-line/40 bg-warning-soft/30 px-2.5 py-1.5 text-xs text-warning-text flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{stats.criticos + stats.comprar}</strong> item(ns) precisam de atenção.</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-end pt-1">
              <div className="relative flex-1 min-w-[140px]">
                <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  className="h-8 text-xs pl-6" placeholder="Buscar item..." />
              </div>
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Categoria</SelectItem>
                  {CATEGORIAS_PADRAO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroUrgencia} onValueChange={setFiltroUrgencia}>
                <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Urgência</SelectItem>
                  <SelectItem value="esgotado">Esgotado</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                  <SelectItem value="comprar">Hora de comprar</SelectItem>
                  <SelectItem value="baixo">Baixo</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <Package className="w-10 h-10 mx-auto opacity-30" />
                {alertas.length === 0 ? (
                  <>
                    <p>Nenhum item cadastrado.</p>
                    <Button onClick={() => setItemOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
                      <Plus className="w-4 h-4" /> Adicionar primeiro item
                    </Button>
                  </>
                ) : <p>Sem itens com esse filtro.</p>}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtrados.map(a => (
                  <div key={a.id} className="border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.nome}</span>
                          <Badge variant="outline" className={`text-xs ${URGENCIA_COR[a.urgencia]}`}>{URGENCIA_LABEL[a.urgencia]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                          <span>
                            <strong className="text-foreground">{Number(a.estoque_atual)} {a.unidade}</strong>
                            {Number(a.estoque_minimo) > 0 && <> / mín {Number(a.estoque_minimo)}</>}
                          </span>
                          {a.dias_restantes_estimados != null && (
                            <span className={a.dias_restantes_estimados <= 15 ? "text-warning-text font-medium" : ""}>
                              Acaba em {a.dias_restantes_estimados}d
                            </span>
                          )}
                          {a.custo_medio && <span>~{brl(Number(a.custo_medio))}/un</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                          onClick={() => { setItemMov(a as EstoqueItem); setMovOpen(true); }}>
                          <PlusCircle className="w-3 h-3" /> Mov.
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setItemEdit(a as EstoqueItem); setItemOpen(true); }} title="Editar">
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ItemEstoqueForm open={itemOpen} onOpenChange={(v) => { setItemOpen(v); if (!v) setItemEdit(null); }}
        item={itemEdit} onSaved={carregar} />
      {itemMov && (
        <MovimentoEstoqueForm open={movOpen} onOpenChange={(v) => { setMovOpen(v); if (!v) setItemMov(null); }}
          item={itemMov} onSaved={carregar} />
      )}
    </>
  );
}
