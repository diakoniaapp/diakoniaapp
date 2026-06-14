import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Package, Plus, Loader2, Save, Trash2, Edit3,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarProdutos, criarProduto, atualizarProduto, arquivarProduto,
  carregarEspaco, type Produto, type Espaco, type ProdutoCategoria,
} from "@/services/arrecadacaoService";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORIA_LABEL: Record<ProdutoCategoria, string> = {
  bazar: "Bazar (item)", cantina_prato: "Cantina (prato)", outro: "Outro",
};

export default function ArrecadacaoProdutos() {
  const { espacoId } = useParams<{ espacoId: string }>();
  const [espaco, setEspaco] = useState<Espaco | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editar, setEditar] = useState<Produto | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  async function carregar() {
    if (!espacoId) return;
    setLoading(true);
    try {
      const [e, p] = await Promise.all([
        carregarEspaco(espacoId),
        listarProdutos(espacoId, true),
      ]);
      setEspaco(e); setProdutos(p);
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [espacoId]);

  async function excluir(p: Produto) {
    if (!confirm(`Arquivar "${p.nome}"? (soft delete)`)) return;
    try {
      await arquivarProduto(p.id);
      toast.success("Produto arquivado");
      carregar();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  }

  if (loading || !espaco) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  const categoriaPadrao: ProdutoCategoria =
    espaco.codigo === "BAZAR" ? "bazar" : "cantina_prato";

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao/espacos"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Package className="w-5 h-5 text-gold" />
        <div className="flex-1">
          <h1 className="font-serif text-xl">Produtos — {espaco.nome}</h1>
          <p className="text-xs text-muted-foreground">{espaco.codigo}</p>
        </div>
        <Button size="sm" onClick={() => setNovoOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo produto
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{produtos.length} produto(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {produtos.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum produto. Crie o primeiro com "+ Novo produto".
            </p>
          ) : produtos.map(p => (
            <div key={p.id} className={
              "flex items-center gap-2 border rounded-md p-2 text-xs " +
              (!p.ativo ? "opacity-50" : "")
            }>
              <div className="flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium">{p.nome}</span>
                  <Badge variant="outline" className="text-[9px]">{CATEGORIA_LABEL[p.categoria]}</Badge>
                  {p.subcategoria && <Badge variant="outline" className="text-[9px]">{p.subcategoria}</Badge>}
                  {p.estoque_atual != null && (
                    <Badge className={
                      "text-[9px] " +
                      (p.estoque_atual <= 0 ? "bg-rose-100 text-rose-700" :
                       p.estoque_atual <= (p.estoque_minimo ?? 5) ? "bg-amber-100 text-amber-700"
                       : "bg-emerald-100 text-emerald-700")
                    }>estoque: {p.estoque_atual}</Badge>
                  )}
                  {!p.ativo && <Badge variant="outline" className="text-[9px]">inativo</Badge>}
                </div>
                {p.observacao && <div className="text-[10px] text-muted-foreground mt-0.5 italic">{p.observacao}</div>}
                {p.codigo && <div className="text-[10px] text-muted-foreground">código: {p.codigo}</div>}
              </div>
              <span className="font-medium">{fmtBR(p.preco_sugerido)}</span>
              <button onClick={() => setEditar(p)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => excluir(p)} className="text-rose-600 hover:bg-rose-50 p-1 rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {(novoOpen || editar) && (
        <ProdutoDialog
          espacoId={espacoId!}
          categoriaPadrao={categoriaPadrao}
          produto={editar}
          open={novoOpen || !!editar}
          onOpenChange={(v) => { if (!v) { setNovoOpen(false); setEditar(null); } }}
          onSaved={() => { setNovoOpen(false); setEditar(null); carregar(); }}
        />
      )}
    </div>
  );
}

function ProdutoDialog({ espacoId, categoriaPadrao, produto, open, onOpenChange, onSaved }: {
  espacoId: string;
  categoriaPadrao: ProdutoCategoria;
  produto: Produto | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nome: "", codigo: "", categoria: categoriaPadrao,
    subcategoria: "", preco: "", estoque: "", estoque_min: "5",
    observacao: "", ativo: true,
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (produto) {
      setForm({
        nome: produto.nome,
        codigo: produto.codigo ?? "",
        categoria: produto.categoria,
        subcategoria: produto.subcategoria ?? "",
        preco: String(produto.preco_sugerido).replace(".", ","),
        estoque: produto.estoque_atual != null ? String(produto.estoque_atual) : "",
        estoque_min: produto.estoque_minimo != null ? String(produto.estoque_minimo) : "5",
        observacao: produto.observacao ?? "",
        ativo: produto.ativo,
      });
    }
  }, [produto]);

  async function salvar() {
    const v = Number(form.preco.replace(",", "."));
    if (!form.nome.trim() || isNaN(v) || v <= 0) { toast.error("Nome e preço"); return; }
    setSalvando(true);
    try {
      const dados = {
        espaco_id: espacoId,
        nome: form.nome,
        codigo: form.codigo || null,
        categoria: form.categoria,
        subcategoria: form.subcategoria || null,
        preco_sugerido: v,
        estoque_atual: form.estoque ? Number(form.estoque) : null,
        estoque_minimo: form.estoque_min ? Number(form.estoque_min) : null,
        observacao: form.observacao || null,
        ativo: form.ativo,
      };
      if (produto) await atualizarProduto(produto.id, dados);
      else await criarProduto(dados);
      toast.success(produto ? "Atualizado" : "Criado");
      onSaved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="w-4 h-4 text-gold" /> {produto ? "Editar" : "Novo"} produto
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Field label="Nome *">
            <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Código (opcional)">
              <Input value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})}
                placeholder="Barras ou ID" />
            </Field>
            <Field label="Preço *">
              <Input value={form.preco} onChange={e => setForm({...form, preco: e.target.value})}
                placeholder="0,00" />
            </Field>
            <Field label="Categoria">
              <Select value={form.categoria} onValueChange={(v) => setForm({...form, categoria: v as ProdutoCategoria})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bazar">Bazar (item)</SelectItem>
                  <SelectItem value="cantina_prato">Cantina (prato)</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategoria (livre)">
              <Input value={form.subcategoria} onChange={e => setForm({...form, subcategoria: e.target.value})}
                placeholder="bebida, comida..." />
            </Field>
            <Field label="Estoque (vazio = sem controle)">
              <Input type="number" value={form.estoque} onChange={e => setForm({...form, estoque: e.target.value})} />
            </Field>
            <Field label="Alerta quando ≤">
              <Input type="number" value={form.estoque_min} onChange={e => setForm({...form, estoque_min: e.target.value})} />
            </Field>
          </div>
          <Field label="Observação">
            <Textarea value={form.observacao} onChange={e => setForm({...form, observacao: e.target.value})}
              placeholder="Ex: 'doação de Maria'" />
          </Field>
          <div className="flex items-center gap-2 border-t pt-2">
            <Switch checked={form.ativo} onCheckedChange={(v) => setForm({...form, ativo: v})} />
            <span className="text-xs">Ativo (aparece no PDV)</span>
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
