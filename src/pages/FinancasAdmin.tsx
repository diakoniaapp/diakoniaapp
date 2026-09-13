import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, DollarSign, Loader2, Plus, Pencil, Trash2,
  Wallet, Tag, Layers, RotateCcw, PowerOff,
  TrendingUp, TrendingDown,
  Building2, CreditCard, PiggyBank, Mail, Coins,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarContas, desativarConta, reativarConta, excluirConta,
  listarCategoriasTodas, excluirCategoria, atualizarCategoria,
  listarCentrosCustoTodas, atualizarCentroCusto, excluirCentroCusto,
  VINCULO_LABEL, VINCULO_COR,
  CONTA_TIPO_LABEL, brl,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinCentroVinculo,
} from "@/services/finService";
import { ContaForm } from "@/components/financas/ContaForm";
import { CategoriaForm } from "@/components/financas/CategoriaForm";
import { CentroCustoForm } from "@/components/financas/CentroCustoForm";
import { PaginaSkeleton } from "@/components/ListState";

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
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [loading, setLoading] = useState(true);

  const [contaOpen, setContaOpen] = useState(false);
  const [contaEdit, setContaEdit] = useState<FinConta | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catEdit, setCatEdit] = useState<FinCategoria | null>(null);

  const [ccOpen, setCcOpen] = useState(false);
  const [ccEdit, setCcEdit] = useState<FinCentroCusto | null>(null);
  // Confirmação por `AlertDialog`, não `confirm()` nativo — o resto desta
  // tela ainda usa `confirm()` (`removerConta`/`removerCategoria`, débito
  // pré-existente, fora do escopo de hoje), mas esse botão é novo
  // (13/09/2026) e `confirm()` some sem erro em WebView (CLAUDE.md Risco
  // 3) — exatamente onde a Telma mais usa o app.
  const [ccApagando, setCcApagando] = useState<FinCentroCusto | null>(null);
  const [ccExcluindoBusy, setCcExcluindoBusy] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, ks, ccs] = await Promise.all([
        listarContas(true),  // incluir inativas
        listarCategoriasTodas(),
        listarCentrosCustoTodas(),
      ]);
      setContas(cs);
      setCategorias(ks);
      setCentros(ccs);
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

  async function toggleCentro(c: FinCentroCusto) {
    try {
      await atualizarCentroCusto(c.id, { ativo: !c.ativo });
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  async function confirmarRemoverCentro(e: React.MouseEvent) {
    e.preventDefault(); // ver comentário em `ccApagando` — pula o close automático do AlertDialogAction
    if (!ccApagando) return;
    setCcExcluindoBusy(true);
    try {
      await excluirCentroCusto(ccApagando.id);
      toast.success("Centro de custo excluído");
      setCcApagando(null);
      await carregar();
    } catch (e: any) {
      toast.error("Centro em uso — desative em vez de excluir.");
    } finally { setCcExcluindoBusy(false); }
  }

  const entradas = categorias.filter(c => c.tipo === "entrada");
  const saidas   = categorias.filter(c => c.tipo === "saida");

  // Agrupado por vínculo — "ministerio" e "subgrupo_administracao" juntos
  // primeiro (é a estrutura do Plano de Contas Oficial), depois os
  // demais tipos (área, EBD, PGM, campanha, geral) na ordem de
  // `VINCULO_LABEL`.
  const centrosPorTipo = (Object.keys(VINCULO_LABEL) as FinCentroVinculo[])
    .map(tipo => ({ tipo, lista: centros.filter(c => c.vinculo_tipo === tipo) }))
    .filter(g => g.lista.length > 0);

  if (loading) {
    return <PaginaSkeleton />;
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
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
          <TabsTrigger value="centros" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Centros de custo ({centros.length})
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
                      {/* `<div>`, não `<p>`: `Badge` é sempre um `<div>`
                          (ver `components/ui/badge.tsx`), e `<div>` dentro
                          de `<p>` é HTML inválido. */}
                      <div className="font-medium text-sm truncate flex items-center gap-1.5">
                        {c.nome}
                        {!c.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Desativada</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {CONTA_TIPO_LABEL[c.tipo]}
                        {c.banco_nome && ` · ${c.banco_nome}`}
                        {c.conta_numero && ` · Ag ${c.agencia ?? "-"} / CC ${c.conta_numero}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 mr-2">
                    <p className="text-sm font-semibold tabular-nums">{brl(Number(c.saldo_atual))}</p>
                    <p className="text-xs text-muted-foreground">
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
                      {c.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
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
                <p className="text-xs font-medium flex items-center gap-1.5 text-success-text">
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
                <p className="text-xs font-medium flex items-center gap-1.5 text-destructive-text">
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

          <p className="text-xs text-muted-foreground text-center">
            Categorias do <strong>sistema</strong> não podem ser excluídas — só desativadas.
            Categorias <strong>em uso</strong> em lançamentos também precisam ser desativadas.
          </p>
        </TabsContent>

        {/* ── ABA CENTROS DE CUSTO ───────────────────────────────── */}
        <TabsContent value="centros" className="space-y-3">
          {centrosPorTipo.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-sm text-muted-foreground">
                Nenhum centro de custo cadastrado.
              </CardContent>
            </Card>
          ) : (
            centrosPorTipo.map(({ tipo, lista }) => (
              <Card key={tipo}>
                <CardContent className="py-3 space-y-1.5">
                  <p className="text-xs font-medium">
                    <Badge variant="outline" className={`text-xs ${VINCULO_COR[tipo]}`}>
                      {VINCULO_LABEL[tipo]}
                    </Badge>
                    <span className="text-muted-foreground ml-1.5">({lista.length})</span>
                  </p>
                  {lista.map(c => (
                    <CentroLinha key={c.id} c={c}
                      onEdit={() => { setCcEdit(c); setCcOpen(true); }}
                      onToggle={() => toggleCentro(c)}
                      onDelete={() => setCcApagando(c)} />
                  ))}
                </CardContent>
              </Card>
            ))
          )}

          <p className="text-xs text-muted-foreground text-center">
            Centros de custo nascem sozinhos, sincronizados a partir de ministérios,
            áreas, classes EBD, grupos de PGM e campanhas — não tem tela de criar à
            mão. Centro <strong>em uso</strong> em lançamentos precisa ser desativado
            em vez de excluído.
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
      <CentroCustoForm
        open={ccOpen}
        onOpenChange={(v) => { setCcOpen(v); if (!v) setCcEdit(null); }}
        centro={ccEdit}
        onSaved={carregar}
      />

      <AlertDialog open={!!ccApagando} onOpenChange={(v) => !v && setCcApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir centro de custo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{ccApagando?.nome}" — só funciona se ele não tiver lançamentos.
              Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={ccExcluindoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRemoverCentro} disabled={ccExcluindoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {ccExcluindoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
        {k.sistema && <Badge variant="outline" className="text-xs ml-1">sys</Badge>}
        {!k.ativo && <Badge variant="outline" className="text-xs ml-1 bg-warning-soft text-warning-text">desat.</Badge>}
      </span>
      <div className="flex items-center gap-0 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Editar">
          <Pencil className="w-3 h-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle}
          title={k.ativo ? "Desativar" : "Reativar"}>
          {k.ativo ? <PowerOff className="w-3 h-3 text-warning-text" /> : <RotateCcw className="w-3 h-3 text-success-text" />}
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

function CentroLinha({ c, onEdit, onToggle, onDelete }: {
  c: FinCentroCusto; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-1 text-sm border-l-2 pl-2 py-1 hover:bg-muted/30 ${!c.ativo ? "opacity-50" : ""}`}
         style={{ borderColor: c.cor ?? "#888" }}>
      <span className="truncate flex-1">
        {c.nome}
        {!c.ativo && <Badge variant="outline" className="text-xs ml-1 bg-warning-soft text-warning-text">desat.</Badge>}
      </span>
      <div className="flex items-center gap-0 shrink-0">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Editar">
          <Pencil className="w-3 h-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onToggle}
          title={c.ativo ? "Desativar" : "Reativar"}>
          {c.ativo ? <PowerOff className="w-3 h-3 text-warning-text" /> : <RotateCcw className="w-3 h-3 text-success-text" />}
        </Button>
        <Button type="button" variant="ghost" size="icon"
          className="h-6 w-6 text-destructive" onClick={onDelete} title="Excluir">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
