import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, DollarSign, Loader2, Plus, Pencil, Trash2,
  Wallet, Tag, RotateCcw, PowerOff,
  TrendingUp, TrendingDown,
  Building2, CreditCard, PiggyBank, Mail, Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarContas, desativarConta, reativarConta, excluirConta,
  listarCategoriasTodas, excluirCategoria, atualizarCategoria,
  CONTA_TIPO_LABEL, brl,
  type FinConta, type FinCategoria,
} from "@/services/finService";
import { ContaForm } from "@/components/financas/ContaForm";
import { CategoriaForm } from "@/components/financas/CategoriaForm";

const ICONE_CONTA: Record<string, JSX.Element> = {
  caixa:     <Wallet className="w-4 h-4" />,
  banco:     <Building2 className="w-4 h-4" />,
  cartao:    <CreditCard className="w-4 h-4" />,
  envelope:  <Mail className="w-4 h-4" />,
  aplicacao: <PiggyBank className="w-4 h-4" />,
  cofre:     <Coins className="w-4 h-4" />,
  pix:       <Wallet className="w-4 h-4" />,
};

export default function FinancasAdmin() {
  const [contas, setContas] = useState<FinConta[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [loading, setLoading] = useState(true);

  const [contaOpen, setContaOpen] = useState(false);
  const [contaEdit, setContaEdit] = useState<FinConta | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<FinCategoria | null>(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, ks] = await Promise.all([
        listarContas(true),  // incluir inativas
        listarCategoriasTodas(),
      ]);
      setContas(cs);
      setCategorias(ks);
    } finally { setLoading(false); }
  }

  async function toggleConta(c: FinConta) {
    try {
      if (c.ativo) await desativarConta(c.id);
      else         await reativarConta(c.id);
      toast.success(c.ativo ? "Conta desativada" : "Conta reativada");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function removerConta(c: FinConta) {
    if (!confirm(`Excluir definitivamente "${c.nome}"?\nSó funciona se a conta NÃO tiver lançamentos.`)) return;
    try {
      await excluirConta(c.id);
      toast.success("Conta excluída");
      await carregar();
    } catch (e: any) {
      toast.error("Não foi possível excluir (provavelmente tem lançamentos). Use 'Desativar'.");
    }
  }

  async function toggleCategoria(k: FinCategoria) {
    try {
      await atualizarCategoria(k.id, { ativo: !k.ativo });
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function removerCategoria(k: FinCategoria) {
    if (k.sistema) { toast.error("Categoria do sistema — só dá pra desativar"); return; }
    if (!confirm(`Excluir categoria "${k.nome}"?`)) return;
    try {
      await excluirCategoria(k.id);
      toast.success("Categoria excluída");
      await carregar();
    } catch (e: any) {
      toast.error("Categoria em uso — desative em vez de excluir.");
    }
  }

  const entradas = categorias.filter(c => c.tipo === "entrada");
  const saidas   = categorias.filter(c => c.tipo === "saida");

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gold" /> Configurações financeiras
          </h1>
          <p className="text-xs text-muted-foreground">
            Cadastre e personalize suas contas e o plano de contas da igreja.
          </p>
        </div>
      </div>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas" className="gap-1.5">
            <Wallet className="w-3.5 h-3.5" /> Contas ({contas.length})
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Categorias ({categorias.length})
          </TabsTrigger>
        </TabsList>

        {/* ── ABA CONTAS ─────────────────────────────────────────── */}
        <TabsContent value="contas" className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setContaEdit(null); setContaOpen(true); }}
              className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Plus className="w-3.5 h-3.5" /> Nova conta
            </Button>
          </div>

          {contas.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma conta cadastrada.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {contas.map(c => (
                <div key={c.id}
                  className={`flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30 ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ring-1 ring-border"
                      style={{ background: (c.cor ?? "#cfa451") + "22", color: c.cor ?? "#cfa451" }}>
                      {ICONE_CONTA[c.tipo] ?? <Wallet className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate flex items-center gap-1.5">
                        {c.nome}
                        {!c.ativo && <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300">Desativada</Badge>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {CONTA_TIPO_LABEL[c.tipo]}
                        {c.banco_nome && ` · ${c.banco_nome}`}
                        {c.conta_numero && ` · Ag ${c.agencia ?? "-"} / CC ${c.conta_numero}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-sm font-semibold tabular-nums">{brl(Number(c.saldo_atual))}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Inicial: {brl(Number(c.saldo_inicial))}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setContaEdit(c); setContaOpen(true); }} title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => toggleConta(c)}
                      title={c.ativo ? "Desativar" : "Reativar"}>
                      {c.ativo ? <PowerOff className="w-3.5 h-3.5 text-amber-600" /> : <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />}
                    </Button>
                    <Button type="button" variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => removerConta(c)} title="Excluir">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── ABA CATEGORIAS ─────────────────────────────────────── */}
        <TabsContent value="categorias" className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setCatEdit(null); setCatOpen(true); }}
              className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Plus className="w-3.5 h-3.5" /> Nova categoria
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* ENTRADAS */}
            <Card>
              <CardContent className="py-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5 text-emerald-700">
                  <TrendingUp className="w-3.5 h-3.5" /> Entradas ({entradas.length})
                </p>
                {entradas.map(k => (
                  <CategoriaLinha key={k.id} k={k}
                    onEdit={() => { setCatEdit(k); setCatOpen(true); }}
                    onToggle={() => toggleCategoria(k)}
                    onDelete={() => removerCategoria(k)} />
                ))}
              </CardContent>
            </Card>

            {/* SAÍDAS */}
            <Card>
              <CardContent className="py-3 space-y-1.5">
                <p className="text-xs font-medium flex items-center gap-1.5 text-rose-700">
                  <TrendingDown className="w-3.5 h-3.5" /> Saídas ({saidas.length})
                </p>
                {saidas.map(k => (
                  <CategoriaLinha key={k.id} k={k}
                    onEdit={() => { setCatEdit(k); setCatOpen(true); }}
                    onToggle={() => toggleCategoria(k)}
                    onDelete={() => removerCategoria(k)} />
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            Categorias do <strong>sistema</strong> não podem ser excluídas — só desativadas.
            Categorias <strong>em uso</strong> em lançamentos também precisam ser desativadas.
          </p>
        </TabsContent>
      </Tabs>

      <ContaForm
        open={contaOpen}
        onOpenChange={(v) => { setContaOpen(v); if (!v) setContaEdit(null); }}
        conta={contaEdit}
        onSaved={carregar}
      />
      <CategoriaForm
        open={catOpen}
        onOpenChange={(v) => { setCatOpen(v); if (!v) setCatEdit(null); }}
        categoria={catEdit}
        onSaved={carregar}
      />
    </div>
  );
}

function CategoriaLinha({ k, onEdit, onToggle, onDelete }: {
  k: FinCategoria; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-1 text-sm border-l-2 pl-2 py-1 hover:bg-muted/30 ${!k.ativo ? "opacity-50" : ""}`}
         style={{ borderColor: k.cor ?? "#888" }}>
      <span className="truncate flex-1">
        {k.nome}
        {k.sistema && <Badge variant="outline" className="text-[8px] ml-1">sys</Badge>}
        {!k.ativo && <Badge variant="outline" className="text-[8px] ml-1 bg-amber-50 text-amber-700">desat.</Badge>}
      </span>
      <div className="flex items-center gap-0 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Editar">
          <Pencil className="w-3 h-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle}
          title={k.ativo ? "Desativar" : "Reativar"}>
          {k.ativo ? <PowerOff className="w-3 h-3 text-amber-600" /> : <RotateCcw className="w-3 h-3 text-emerald-600" />}
        </Button>
        {!k.sistema && (
          <Button type="button" variant="ghost" size="icon"
            className="h-6 w-6 text-destructive" onClick={onDelete} title="Excluir">
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
