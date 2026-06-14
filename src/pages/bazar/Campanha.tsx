import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Loader2, ShoppingCart, Plus, TrendingUp, TrendingDown,
  ListPlus, Trash2, Calendar, Target, AlertCircle, PlayCircle, CheckCircle2,
  Edit3, FileBarChart,
} from "lucide-react";
import { EditarItemCatalogoDialog } from "@/components/bazar/EditarItemCatalogoDialog";
import { FechamentoCaixaDialog } from "@/components/bazar/FechamentoCaixaDialog";
import { toast } from "sonner";
import {
  carregarCampanha, listarCatalogo, criarItemCatalogo, excluirItemCatalogo,
  listarVendas, listarCustos, registrarCusto, excluirCusto,
  ativarCampanha, encerrarCampanha, excluirCampanha,
  type Campanha, type ItemCatalogo, type Venda, type Custo,
} from "@/services/bazarService";

const fmtBR = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function CampanhaPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [camp, setCamp] = useState<Campanha | null>(null);
  const [catalogo, setCatalogo] = useState<ItemCatalogo[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [custos, setCustos] = useState<Custo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<ItemCatalogo | null>(null);
  const [fechamento, setFechamento] = useState<"diario" | "final" | null>(null);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [c, cat, v, cs] = await Promise.all([
        carregarCampanha(id), listarCatalogo(id),
        listarVendas(id), listarCustos(id),
      ]);
      setCamp(c); setCatalogo(cat); setVendas(v); setCustos(cs);
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [id]);

  async function acao(acao: "ativar"|"encerrar"|"excluir") {
    if (!camp) return;
    if (acao === "excluir" && !confirm("Excluir campanha e TODOS os registros vinculados?")) return;
    if (acao === "encerrar" && !confirm("Encerrar campanha? Não dá pra registrar mais vendas depois.")) return;
    try {
      if (acao === "ativar") await ativarCampanha(camp.id);
      if (acao === "encerrar") await encerrarCampanha(camp.id);
      if (acao === "excluir") { await excluirCampanha(camp.id); nav("/bazar"); return; }
      toast.success("Atualizado");
      await carregar();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  if (loading || !camp) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  const STATUS_COR: Record<string, string> = {
    planejada: "bg-blue-50 text-blue-700 border-blue-200",
    ativa: "bg-emerald-50 text-emerald-700 border-emerald-200",
    encerrada: "bg-muted text-muted-foreground border-border",
    cancelada: "bg-rose-50 text-rose-700 border-rose-200",
  };
  const META_PCT = camp.meta_arrecadacao && camp.meta_arrecadacao > 0
    ? (camp.total_bruto / camp.meta_arrecadacao) * 100 : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/bazar"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg md:text-xl truncate">{camp.nome}</h1>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={`text-[9px] ${STATUS_COR[camp.status]}`}>
              {camp.status.toUpperCase()}
            </Badge>
            <Badge variant="outline" className="text-[9px]">{camp.modalidade}</Badge>
          </div>
        </div>
        {camp.status === "planejada" && (
          <Button size="sm" onClick={() => acao("ativar")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            <PlayCircle className="w-3.5 h-3.5" /> Ativar
          </Button>
        )}
        {camp.status === "ativa" && (
          <>
            <Button size="sm" asChild className="gap-1.5">
              <Link to={`/bazar/caixa/${camp.id}`}><ShoppingCart className="w-3.5 h-3.5" /> Abrir caixa</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFechamento("diario")} className="gap-1.5">
              <FileBarChart className="w-3.5 h-3.5" /> Fechar dia (X)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setFechamento("final")} className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Encerrar campanha
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={() => acao("excluir")} className="text-rose-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </header>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Resumo titulo="Arrecadado" valor={camp.total_bruto}
          icon={<TrendingUp className="w-4 h-4 text-emerald-600" />} />
        <Resumo titulo="Custos" valor={camp.total_custos}
          icon={<TrendingDown className="w-4 h-4 text-rose-600" />} />
        <Resumo titulo="Líquido" valor={camp.total_liquido} destaque />
        <Resumo titulo="Vendas" valor={camp.qtd_vendas} formato="num" />
      </div>

      {camp.meta_arrecadacao && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs">
              <Target className="w-3.5 h-3.5 text-gold shrink-0" />
              <span className="text-muted-foreground">Meta:</span>
              <span className="font-medium">{fmtBR(camp.meta_arrecadacao)}</span>
              <span className="ml-auto font-medium">{META_PCT?.toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden mt-2">
              <div className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, META_PCT ?? 0)}%` }} />
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas">Vendas ({vendas.length})</TabsTrigger>
          <TabsTrigger value="catalogo">Cardápio ({catalogo.length})</TabsTrigger>
          <TabsTrigger value="custos">Custos ({custos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-3 space-y-1.5">
          {vendas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Nenhuma venda ainda.</p>
          ) : vendas.map(v => (
            <div key={v.id} className={"border rounded-md p-2 text-xs flex items-center gap-2 " + (v.cancelada ? "opacity-50 line-through" : "")}>
              <div className="flex-1">
                <div className="font-medium">{fmtBR(v.valor_total)}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(v.data_venda).toLocaleString("pt-BR")} · {v.vendedor_nome ?? "—"} · {v.forma_pagamento}
                  {v.cliente_nome && ` · cliente ${v.cliente_nome}`}
                </div>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="catalogo" className="mt-3">
          <NovoItemCatalogo campanhaId={camp.id} onAdded={carregar} />
          <div className="space-y-1.5 mt-2">
            {catalogo.map(item => (
              <div key={item.id} className={"border rounded-md p-2 text-xs flex items-center gap-2 " + (item.ativo ? "" : "opacity-50")}>
                <div className="flex-1">
                  <span className="font-medium">{item.nome}</span>
                  {item.categoria && <Badge variant="outline" className="text-[9px] ml-1.5">{item.categoria}</Badge>}
                  {!item.ativo && <Badge variant="outline" className="text-[9px] ml-1">inativo</Badge>}
                </div>
                <span className="font-medium">{fmtBR(item.preco_sugerido)}</span>
                <button onClick={() => setEditItem(item)}
                  className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Editar">
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir "${item.nome}"?`)) return;
                    try { await excluirItemCatalogo(item.id); toast.success("Excluído"); carregar(); }
                    catch (err: any) { toast.error(err?.message ?? "Erro"); }
                  }}
                  className="text-rose-600 hover:bg-rose-50 p-1 rounded" title="Excluir">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custos" className="mt-3">
          <NovoCusto campanhaId={camp.id} onAdded={carregar} />
          <div className="space-y-1.5 mt-2">
            {custos.map(c => (
              <div key={c.id} className="border rounded-md p-2 text-xs flex items-center gap-2">
                <div className="flex-1">
                  <span className="font-medium">{c.descricao}</span>
                  <span className="text-muted-foreground"> · {new Date(c.data_compra + "T00:00").toLocaleDateString("pt-BR")}</span>
                </div>
                <span className="font-medium">{fmtBR(c.valor)}</span>
                <button onClick={async () => {
                    if (!confirm(`Excluir custo "${c.descricao}"?`)) return;
                    try { await excluirCusto(c.id); toast.success("Excluído"); carregar(); }
                    catch (err: any) { toast.error(err?.message ?? "Erro"); }
                  }}
                  className="text-rose-600 hover:bg-rose-50 p-1 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <EditarItemCatalogoDialog
        open={!!editItem}
        onOpenChange={(v) => { if (!v) setEditItem(null); }}
        item={editItem}
        onSaved={carregar}
      />

      {fechamento && (
        <FechamentoCaixaDialog
          open={!!fechamento}
          onOpenChange={(v) => { if (!v) setFechamento(null); }}
          campanhaId={camp.id}
          tipo={fechamento}
          onFechado={carregar}
        />
      )}
    </div>
  );
}

function Resumo({ titulo, valor, icon, destaque, formato = "moeda" }: {
  titulo: string; valor: number; icon?: React.ReactNode; destaque?: boolean; formato?: "moeda" | "num";
}) {
  return (
    <Card className={destaque ? "border-emerald-300 bg-emerald-50/50" : ""}>
      <CardContent className="p-3 flex items-center gap-2">
        {icon}
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
          <div className="text-base font-serif font-medium">
            {formato === "moeda" ? fmtBR(valor) : valor}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NovoItemCatalogo({ campanhaId, onAdded }: { campanhaId: string; onAdded: () => void }) {
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [categoria, setCategoria] = useState("");

  async function add() {
    const v = Number(preco.replace(",", "."));
    if (!nome.trim() || isNaN(v) || v <= 0) { toast.error("Preencha nome e preço"); return; }
    try {
      await criarItemCatalogo({
        campanha_id: campanhaId, nome, preco_sugerido: v,
        categoria: categoria || null, ativo: true,
      });
      setNome(""); setPreco(""); setCategoria("");
      onAdded();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  return (
    <div className="border rounded-md p-2 bg-muted/30 space-y-1.5">
      <Label className="text-[10px]">Novo item do cardápio</Label>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-1.5">
        <Input placeholder="Nome (ex: Cachorro-quente)" value={nome} onChange={e => setNome(e.target.value)} className="md:col-span-2 text-xs" />
        <Input placeholder="R$ 0,00" value={preco} onChange={e => setPreco(e.target.value)} className="text-xs" />
        <Input placeholder="Categoria" value={categoria} onChange={e => setCategoria(e.target.value)} className="text-xs" />
      </div>
      <Button size="sm" onClick={add} className="w-full gap-1.5">
        <ListPlus className="w-3.5 h-3.5" /> Adicionar ao cardápio
      </Button>
    </div>
  );
}

function NovoCusto({ campanhaId, onAdded }: { campanhaId: string; onAdded: () => void }) {
  const [desc, setDesc] = useState("");
  const [valor, setValor] = useState("");
  const [fornecedor, setFornecedor] = useState("");

  async function add() {
    const v = Number(valor.replace(",", "."));
    if (!desc.trim() || isNaN(v) || v <= 0) { toast.error("Preencha descrição e valor"); return; }
    try {
      await registrarCusto({
        campanha_id: campanhaId, descricao: desc, valor: v,
        fornecedor: fornecedor || null,
      });
      setDesc(""); setValor(""); setFornecedor("");
      onAdded();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  return (
    <div className="border rounded-md p-2 bg-muted/30 space-y-1.5">
      <Label className="text-[10px]">Registrar custo</Label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
        <Input placeholder="Descrição" value={desc} onChange={e => setDesc(e.target.value)} className="text-xs" />
        <Input placeholder="R$ 0,00" value={valor} onChange={e => setValor(e.target.value)} className="text-xs" />
        <Input placeholder="Fornecedor" value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="text-xs" />
      </div>
      <Button size="sm" onClick={add} className="w-full gap-1.5">
        <Plus className="w-3.5 h-3.5" /> Adicionar custo
      </Button>
    </div>
  );
}
