import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Package, Plus, Loader2, AlertTriangle, Pencil, PlusCircle,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarAlertas, CATEGORIAS_PADRAO, URGENCIA_LABEL, URGENCIA_COR,
  type EstoqueAlerta, type EstoqueItem,
} from "@/services/estoqueService";
import { brl } from "@/services/finService";
import { ItemEstoqueForm } from "@/components/financas/ItemEstoqueForm";
import { MovimentoEstoqueForm } from "@/components/financas/MovimentoEstoqueForm";

export default function FinancasEstoque() {
  const [alertas, setAlertas] = useState<EstoqueAlerta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("__all__");
  const [filtroUrgencia, setFiltroUrgencia] = useState<string>("__all__");

  const [itemOpen, setItemOpen] = useState(false);
  const [itemEdit, setItemEdit] = useState<EstoqueItem | null>(null);

  const [movOpen, setMovOpen] = useState(false);
  const [itemMov, setItemMov] = useState<EstoqueItem | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarAlertas();
      setAlertas(data);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  const filtrados = useMemo(() => {
    return alertas.filter(a => {
      if (filtroCategoria !== "__all__" && a.categoria !== filtroCategoria) return false;
      if (filtroUrgencia !== "__all__" && a.urgencia !== filtroUrgencia) return false;
      if (busca.length >= 2 && !a.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [alertas, filtroCategoria, filtroUrgencia, busca]);

  // Stats topo
  const stats = useMemo(() => {
    const total = alertas.length;
    const criticos = alertas.filter(a => a.urgencia === "esgotado" || a.urgencia === "critico").length;
    const comprar  = alertas.filter(a => a.urgencia === "comprar" || a.urgencia === "baixo").length;
    const valorEstoque = alertas.reduce((s, a) => s + (Number(a.estoque_atual) * Number(a.custo_medio ?? 0)), 0);
    return { total, criticos, comprar, valorEstoque };
  }, [alertas]);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando estoque...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Package className="w-5 h-5 text-gold" /> Estoque
          </h1>
          <p className="text-xs text-muted-foreground">
            Materiais de limpeza, escritório, som — alerta antes de acabar.
          </p>
        </div>
        <Button onClick={() => { setItemEdit(null); setItemOpen(true); }}
          className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Novo item
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Itens cadastrados" valor={stats.total} />
        <Stat label="Críticos / Esgotados" valor={stats.criticos} cor="rose" />
        <Stat label="Hora de comprar" valor={stats.comprar} cor="amber" />
        <Stat label="Valor em estoque" valor={brl(stats.valorEstoque)} />
      </div>

      {/* Alerta de itens em risco */}
      {stats.criticos + stats.comprar > 0 && (
        <Card className="border-amber-300/40 bg-amber-50/30">
          <CardContent className="py-2.5 px-3 text-xs text-amber-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>{stats.criticos + stats.comprar} item(s)</strong> precisam de atenção. Filtre por "urgência" abaixo pra ver só esses.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
          <div className="md:col-span-2 relative">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs pl-6" placeholder="Buscar item..." />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas categorias</SelectItem>
                {CATEGORIAS_PADRAO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroUrgencia} onValueChange={setFiltroUrgencia}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toda urgência</SelectItem>
                <SelectItem value="esgotado">Esgotado</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
                <SelectItem value="comprar">Hora de comprar</SelectItem>
                <SelectItem value="baixo">Baixo</SelectItem>
                <SelectItem value="ok">OK</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <Package className="w-10 h-10 mx-auto opacity-30" />
            {alertas.length === 0 ? (
              <>
                <p>Nenhum item cadastrado.</p>
                <Button onClick={() => setItemOpen(true)} variant="outline" className="gap-1.5 mt-2">
                  <Plus className="w-4 h-4" /> Adicionar primeiro item
                </Button>
              </>
            ) : (
              <p>Sem itens com esse filtro.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {filtrados.map(a => (
            <div key={a.id} className="border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.nome}</span>
                    <Badge variant="outline" className={`text-[9px] ${URGENCIA_COR[a.urgencia]}`}>
                      {URGENCIA_LABEL[a.urgencia]}
                    </Badge>
                    {a.categoria && <Badge variant="outline" className="text-[9px]">{a.categoria}</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                    <span>
                      <strong className="text-foreground">{Number(a.estoque_atual)} {a.unidade}</strong>
                      {Number(a.estoque_minimo) > 0 && <> / mín {Number(a.estoque_minimo)}</>}
                    </span>
                    {a.consumo_medio_mes > 0 && (
                      <span>Consumo: {a.consumo_medio_mes.toFixed(1)}/mês</span>
                    )}
                    {a.dias_restantes_estimados != null && (
                      <span className={a.dias_restantes_estimados <= 15 ? "text-amber-700 font-medium" : ""}>
                        Acaba em {a.dias_restantes_estimados}d
                      </span>
                    )}
                    {a.custo_medio && (
                      <span>~{brl(Number(a.custo_medio))}/un</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-[11px]"
                    onClick={() => { setItemMov(a as EstoqueItem); setMovOpen(true); }}>
                    <PlusCircle className="w-3 h-3" /> Movimento
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

      <ItemEstoqueForm
        open={itemOpen}
        onOpenChange={(v) => { setItemOpen(v); if (!v) setItemEdit(null); }}
        item={itemEdit}
        onSaved={carregar}
      />
      {itemMov && (
        <MovimentoEstoqueForm
          open={movOpen}
          onOpenChange={(v) => { setMovOpen(v); if (!v) setItemMov(null); }}
          item={itemMov}
          onSaved={carregar}
        />
      )}
    </div>
  );
}

function Stat({ label, valor, cor }: { label: string; valor: number | string; cor?: "rose" | "amber" }) {
  const corClass = cor === "rose" ? "text-rose-700"
                : cor === "amber" ? "text-amber-700"
                : "";
  return (
    <Card>
      <CardContent className="py-2 px-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-base font-semibold tabular-nums ${corClass}`}>{valor}</p>
      </CardContent>
    </Card>
  );
}
