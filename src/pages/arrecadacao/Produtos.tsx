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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Package, Plus, Loader2, Save, Trash2, Edit3,
  PackagePlus, PackageMinus, ClipboardEdit, AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarProdutos, criarProduto, atualizarProduto, arquivarProduto,
  carregarEspaco, listarReservasDoEspaco, registrarMovimentoEstoque,
  listarMovimentosEstoque,
  type Produto, type Espaco, type ProdutoCategoria, type EstoqueMovimento,
} from "@/services/arrecadacaoService";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CATEGORIA_LABEL: Record<ProdutoCategoria, string> = {
  bazar: "Bazar (item)", cantina_prato: "Cantina (prato)", outro: "Outro",
};

type Filtro = "todos" | "acervo" | "campanha";

export default function ArrecadacaoProdutos() {
  const { espacoId } = useParams<{ espacoId: string }>();
  const [espaco, setEspaco] = useState<Espaco | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [reservas, setReservas] = useState<Array<{ id: string; finalidade: string; status: string }>>([]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [filtroReservaId, setFiltroReservaId] = useState<string>("__todas__");
  const [loading, setLoading] = useState(true);
  const [editar, setEditar] = useState<Produto | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [estoqueDe, setEstoqueDe] = useState<Produto | null>(null);

  async function carregar() {
    if (!espacoId) return;
    setLoading(true);
    try {
      const [e, p, r] = await Promise.all([
        carregarEspaco(espacoId),
        listarProdutos(espacoId, true),
        listarReservasDoEspaco(espacoId, false),
      ]);
      setEspaco(e); setProdutos(p); setReservas(r);
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [espacoId]);

  const acervo    = produtos.filter(p => p.reserva_id === null);
  const campanhas = produtos.filter(p => p.reserva_id !== null);

  const produtosFiltrados = (() => {
    if (filtro === "acervo")    return acervo;
    if (filtro === "campanha") {
      if (filtroReservaId === "__todas__") return campanhas;
      return campanhas.filter(p => p.reserva_id === filtroReservaId);
    }
    if (filtroReservaId === "__todas__") return produtos;
    return produtos.filter(p => p.reserva_id === filtroReservaId || p.reserva_id === null);
  })();

  const baixoEstoque = produtos.filter(p =>
    p.estoque_atual !== null && p.estoque_minimo !== null
    && p.estoque_atual <= p.estoque_minimo
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Package className="w-5 h-5 text-gold" />
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl truncate">Produtos · {espaco?.nome ?? "..."}</h1>
          <p className="text-[10px] text-muted-foreground">
            Acervo do espaço + itens das campanhas
          </p>
        </div>
        <Button size="sm" onClick={() => setNovoOpen(true)} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-3.5 h-3.5" /> Novo
        </Button>
      </header>

      {/* Alertas de estoque baixo */}
      {baixoEstoque.length > 0 && (
        <Card className="border-rose-300 bg-rose-50/60">
          <CardContent className="p-3 flex items-start gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium text-rose-800">
                {baixoEstoque.length} {baixoEstoque.length === 1 ? "produto" : "produtos"} com estoque baixo:
              </span>{" "}
              <span className="text-rose-700">
                {baixoEstoque.slice(0, 5).map(p => p.nome).join(" · ")}
                {baixoEstoque.length > 5 && ` … e mais ${baixoEstoque.length - 5}`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="flex gap-1">
            {(["todos", "acervo", "campanha"] as Filtro[]).map(f => (
              <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"}
                onClick={() => setFiltro(f)} className="h-7 text-xs capitalize flex-1">
                {f === "todos" ? `Todos (${produtos.length})`
                : f === "acervo" ? `Acervo (${acervo.length})`
                : `Campanha (${campanhas.length})`}
              </Button>
            ))}
          </div>
          <Select value={filtroReservaId} onValueChange={setFiltroReservaId}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Reserva..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas as campanhas</SelectItem>
              {reservas.map(r => (
                <SelectItem key={r.id} value={r.id}>{r.finalidade} · {r.status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Listagem */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> carregando...
        </div>
      ) : produtosFiltrados.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhum produto neste filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {produtosFiltrados.map(p => (
            <ProdutoCard key={p.id} produto={p} reservas={reservas}
              onEditar={() => setEditar(p)}
              onEstoque={() => setEstoqueDe(p)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      {(novoOpen || editar) && espaco && (
        <ProdutoDialog
          open
          onOpenChange={(v) => { if (!v) { setNovoOpen(false); setEditar(null); } }}
          produto={editar}
          espaco={espaco}
          reservas={reservas}
          onSalvo={() => { setNovoOpen(false); setEditar(null); carregar(); }}
        />
      )}
      {estoqueDe && (
        <EstoqueDialog
          open
          onOpenChange={(v) => { if (!v) setEstoqueDe(null); }}
          produto={estoqueDe}
          onAplicado={() => { setEstoqueDe(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Card de produto
// ════════════════════════════════════════════════════════════════════════
function ProdutoCard({
  produto, reservas, onEditar, onEstoque,
}: {
  produto: Produto;
  reservas: Array<{ id: string; finalidade: string; status: string }>;
  onEditar: () => void;
  onEstoque: () => void;
}) {
  const estBaixo = produto.estoque_atual !== null && produto.estoque_minimo !== null
                   && produto.estoque_atual <= produto.estoque_minimo;
  const isAcervo = produto.reserva_id === null;
  const campanhaNome = !isAcervo
    ? reservas.find(r => r.id === produto.reserva_id)?.finalidade ?? "(campanha)"
    : null;

  return (
    <Card className={`hover:bg-muted/30 transition ${estBaixo ? "border-rose-300" : ""} ${!produto.ativo ? "opacity-60" : ""}`}>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium truncate">{produto.nome}</span>
              {produto.codigo && <Badge variant="outline" className="text-[9px]">#{produto.codigo}</Badge>}
              {isAcervo
                ? <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200">acervo</Badge>
                : <Badge className="text-[9px] bg-purple-100 text-purple-700 border-purple-300">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5" />{campanhaNome}
                  </Badge>}
              {!produto.ativo && <Badge variant="outline" className="text-[9px]">inativo</Badge>}
            </div>
            <div className="text-[10px] text-muted-foreground">{CATEGORIA_LABEL[produto.categoria]}{produto.subcategoria ? ` · ${produto.subcategoria}` : ""}</div>
          </div>
          <span className="text-sm font-semibold text-emerald-700">{fmtBR(produto.preco_sugerido)}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <div>
            Estoque:{" "}
            <span className={estBaixo ? "text-rose-700 font-medium" : "font-medium"}>
              {produto.estoque_atual ?? "—"}
            </span>
            {produto.estoque_minimo !== null && (
              <span className="text-muted-foreground"> / mín {produto.estoque_minimo}</span>
            )}
            {estBaixo && <Badge className="ml-1.5 text-[8px] bg-rose-100 text-rose-700 border-rose-300">BAIXO</Badge>}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5" onClick={onEstoque}>
              <ClipboardEdit className="w-3 h-3" /> estoque
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-0.5" onClick={onEditar}>
              <Edit3 className="w-3 h-3" /> editar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Dialog: novo/editar produto
// ════════════════════════════════════════════════════════════════════════
function ProdutoDialog({
  open, onOpenChange, produto, espaco, reservas, onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  produto: Produto | null;
  espaco: Espaco;
  reservas: Array<{ id: string; finalidade: string; status: string }>;
  onSalvo: () => void;
}) {
  const editando = !!produto;
  const [form, setForm] = useState({
    nome: produto?.nome ?? "",
    codigo: produto?.codigo ?? "",
    categoria: (produto?.categoria ?? (espaco.codigo === "CANTINA" ? "cantina_prato" : "bazar")) as ProdutoCategoria,
    subcategoria: produto?.subcategoria ?? "",
    preco_sugerido: produto?.preco_sugerido ?? 0,
    estoque_atual: produto?.estoque_atual ?? 0,
    estoque_minimo: produto?.estoque_minimo ?? 5,
    observacao: produto?.observacao ?? "",
    is_acervo: produto ? produto.reserva_id === null : true,
    reserva_id: produto?.reserva_id ?? "",
    ativo: produto?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    if (!form.is_acervo && !form.reserva_id) {
      toast.error("Selecione a campanha do produto"); return;
    }
    setSalvando(true);
    try {
      const payload = {
        espaco_id: espaco.id,
        nome: form.nome.trim(),
        codigo: form.codigo.trim() || null,
        categoria: form.categoria,
        subcategoria: form.subcategoria.trim() || null,
        preco_sugerido: Number(form.preco_sugerido) || 0,
        estoque_atual: Number.isFinite(Number(form.estoque_atual)) ? Number(form.estoque_atual) : null,
        estoque_minimo: Number.isFinite(Number(form.estoque_minimo)) ? Number(form.estoque_minimo) : null,
        observacao: form.observacao.trim() || null,
        reserva_id: form.is_acervo ? null : form.reserva_id,
        ativo: form.ativo,
      };
      if (editando && produto) {
        await atualizarProduto(produto.id, payload);
        toast.success("Produto atualizado");
      } else {
        await criarProduto(payload);
        toast.success("Produto criado");
      }
      onSalvo();
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("Conflito de código")) toast.error(msg, { duration: 9000 });
      else if (msg.includes("mesmo espaco_id da reserva")) toast.error("A campanha selecionada é de outro espaço.");
      else toast.error(msg || "Erro ao salvar");
    } finally { setSalvando(false); }
  }

  async function arquivar() {
    if (!produto) return;
    if (!confirm(`Arquivar "${produto.nome}"? Ele some do PDV.`)) return;
    try {
      await arquivarProduto(produto.id);
      toast.success("Arquivado");
      onSalvo();
    } catch (err: any) { toast.error(err?.message); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-gold" />
            {editando ? "Editar produto" : "Novo produto"}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {espaco.nome} · {form.is_acervo ? "vai pro acervo do espaço" : "vai pra uma campanha"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {/* Toggle acervo / campanha */}
          <div className="border rounded-md p-2 flex items-center gap-2 bg-muted/30">
            <Switch checked={form.is_acervo}
              onCheckedChange={(v) => setForm({...form, is_acervo: v, reserva_id: v ? "" : form.reserva_id})} />
            <Label className="text-xs flex-1 cursor-pointer">
              {form.is_acervo ? "Item de acervo (permanente do espaço)" : "Item de uma campanha"}
            </Label>
          </div>
          {!form.is_acervo && (
            <Field label="Campanha *">
              <Select value={form.reserva_id} onValueChange={(v) => setForm({...form, reserva_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione a campanha..." /></SelectTrigger>
                <SelectContent>
                  {reservas.length === 0 && (
                    <SelectItem value="__sem__" disabled>Nenhuma campanha ativa</SelectItem>
                  )}
                  {reservas.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.finalidade} · {r.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Nome *">
            <Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} placeholder="Ex: Pastel de carne" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Código (cód. barras)">
              <Input value={form.codigo} onChange={(e) => setForm({...form, codigo: e.target.value})} placeholder="opcional" />
            </Field>
            <Field label="Preço *">
              <Input type="number" step="0.01" value={form.preco_sugerido}
                onChange={(e) => setForm({...form, preco_sugerido: Number(e.target.value) || 0})} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Categoria">
              <Select value={form.categoria}
                onValueChange={(v) => setForm({...form, categoria: v as ProdutoCategoria})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bazar">Bazar (item)</SelectItem>
                  <SelectItem value="cantina_prato">Cantina (prato)</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subcategoria">
              <Input value={form.subcategoria} onChange={(e) => setForm({...form, subcategoria: e.target.value})}
                placeholder="opcional" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Estoque inicial">
              <Input type="number" value={form.estoque_atual}
                onChange={(e) => setForm({...form, estoque_atual: Number(e.target.value) || 0})} />
            </Field>
            <Field label="Estoque mínimo">
              <Input type="number" value={form.estoque_minimo}
                onChange={(e) => setForm({...form, estoque_minimo: Number(e.target.value) || 0})} />
            </Field>
          </div>

          <Field label="Observação">
            <Textarea value={form.observacao}
              onChange={(e) => setForm({...form, observacao: e.target.value})}
              placeholder="opcional" className="min-h-[40px] text-xs" />
          </Field>

          {editando && (
            <div className="border rounded-md p-2 flex items-center gap-2 bg-muted/30">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({...form, ativo: v})} />
              <Label className="text-xs cursor-pointer">{form.ativo ? "Ativo (vendável)" : "Inativo"}</Label>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={salvar} disabled={salvando}
              className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </Button>
            {editando && (
              <Button variant="ghost" onClick={arquivar} className="text-rose-600 hover:bg-rose-50 gap-1.5">
                <Trash2 className="w-3.5 h-3.5" /> Arquivar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Dialog: movimento de estoque (ajuste / reabastecimento / perda) + histórico
// ════════════════════════════════════════════════════════════════════════
function EstoqueDialog({
  open, onOpenChange, produto, onAplicado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  produto: Produto;
  onAplicado: () => void;
}) {
  const [tipo, setTipo] = useState<"reabastecimento" | "perda" | "ajuste">("reabastecimento");
  const [qtd, setQtd] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [historico, setHistorico] = useState<EstoqueMovimento[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    setLoadingHist(true);
    listarMovimentosEstoque(produto.id, 30)
      .then(setHistorico)
      .finally(() => setLoadingHist(false));
  }, [produto.id]);

  async function aplicar() {
    if (!Number.isFinite(qtd) || qtd === 0) {
      toast.error("Quantidade precisa ser diferente de zero"); return;
    }
    setAplicando(true);
    try {
      await registrarMovimentoEstoque({
        produto_id: produto.id,
        tipo,
        qtd: Math.abs(qtd),
        motivo: motivo.trim() || undefined,
      });
      toast.success("Movimento registrado");
      onAplicado();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    } finally { setAplicando(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardEdit className="w-4 h-4 text-gold" /> Estoque · {produto.nome}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            Atual: <strong>{produto.estoque_atual ?? "—"}</strong>
            {produto.estoque_minimo !== null && <> · mín {produto.estoque_minimo}</>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-1.5">
            <TipoBtn ativo={tipo === "reabastecimento"} onClick={() => setTipo("reabastecimento")}
              cor="emerald" icone={<PackagePlus className="w-3.5 h-3.5" />} label="Repor" />
            <TipoBtn ativo={tipo === "perda"} onClick={() => setTipo("perda")}
              cor="rose" icone={<PackageMinus className="w-3.5 h-3.5" />} label="Perda" />
            <TipoBtn ativo={tipo === "ajuste"} onClick={() => setTipo("ajuste")}
              cor="amber" icone={<ClipboardEdit className="w-3.5 h-3.5" />} label="Ajuste" />
          </div>

          <Field label={tipo === "ajuste" ? "Delta (+/−) *" : "Quantidade *"}>
            <Input type="number" value={qtd}
              onChange={(e) => setQtd(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Motivo">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="opcional · ex: nota fiscal 123, validade vencida..." />
          </Field>

          <Button onClick={aplicar} disabled={aplicando}
            className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Aplicar
          </Button>

          {/* Histórico */}
          <div className="pt-2 border-t">
            <div className="text-[11px] font-medium text-muted-foreground mb-1">Últimas movimentações</div>
            {loadingHist ? (
              <div className="text-[11px] text-muted-foreground">carregando...</div>
            ) : historico.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic">nenhuma ainda</div>
            ) : (
              <div className="max-h-[180px] overflow-y-auto space-y-0.5 text-[11px]">
                {historico.map(m => (
                  <div key={m.id} className="flex justify-between gap-1 py-0.5 border-b border-dashed">
                    <span className="flex gap-1 items-center min-w-0">
                      <Badge variant="outline" className={`text-[9px] ${
                        m.tipo === "reabastecimento" ? "bg-emerald-50 text-emerald-700" :
                        m.tipo === "perda" ? "bg-rose-50 text-rose-700" :
                        m.tipo === "venda" ? "bg-blue-50 text-blue-700" :
                        "bg-amber-50 text-amber-700"
                      }`}>{m.tipo}</Badge>
                      <span className="font-medium">{m.qtd}</span>
                      {m.motivo && <span className="text-muted-foreground truncate">· {m.motivo}</span>}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {new Date(m.registrado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TipoBtn({
  ativo, onClick, cor, icone, label,
}: { ativo: boolean; onClick: () => void; cor: "emerald" | "rose" | "amber"; icone: React.ReactNode; label: string }) {
  const classe = ativo
    ? `bg-${cor}-600 hover:bg-${cor}-700 text-white`
    : `border border-${cor}-300 text-${cor}-700 hover:bg-${cor}-50`;
  return (
    <Button size="sm" variant="ghost" onClick={onClick}
      className={`h-9 gap-1 text-xs ${classe}`}>
      {icone} {label}
    </Button>
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
