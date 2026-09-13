// ─── FinancasFornecedorDetalhe.tsx ───────────────────────────────────────
//
// Ficha do fornecedor — Fase 4.1 do roadmap Financeiro. Dados cadastrais +
// histórico de lançamentos (mesmo padrão de `FinancasCentroDetalhe.tsx`) +
// recorrências vinculadas (o dado já existia em `fin_recorrencias.
// fornecedor_id`, preenchível no form desde sempre, mas nenhuma tela
// jamais mostrava — ver Fase 4.4 do mesmo roadmap, que ainda falta expor
// isso também na própria lista de Recorrências).
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building2, User, Pencil, PowerOff, RotateCcw, TrendingDown,
  TrendingUp, Paperclip, Wallet, CreditCard, RotateCw, Mail, Phone, MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  buscarFornecedor, atualizarFornecedor, listarLancamentos, listarRecorrencias,
  comprovanteSignedUrl, brl, FREQUENCIA_LABEL,
  type FinFornecedor, type FinLancamentoExtenso, type FinRecorrencia,
} from "@/services/finService";
import { FornecedorForm } from "@/components/financas/FornecedorForm";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function FinancasFornecedorDetalhe() {
  const { id = "" } = useParams();
  const [fornecedor, setFornecedor] = useState<FinFornecedor | null>(null);
  const [lancs, setLancs] = useState<FinLancamentoExtenso[]>([]);
  const [recorrencias, setRecorrencias] = useState<FinRecorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [f, ls, recs] = await Promise.all([
        buscarFornecedor(id),
        listarLancamentos({ fornecedorId: id }),
        listarRecorrencias(true),
      ]);
      setFornecedor(f);
      setLancs(ls);
      setRecorrencias(recs.filter(r => r.fornecedor_id === id));
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function abrirComprovante(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  async function confirmarAlternar() {
    if (!fornecedor) return;
    setBusy(true);
    try {
      await atualizarFornecedor(fornecedor.id, { ativo: !fornecedor.ativo });
      toast.success(fornecedor.ativo ? "Fornecedor inativado" : "Fornecedor reativado");
      setConfirmando(false);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  const stats = useMemo(() => {
    const realizados = lancs.filter(l => l.status === "realizado" || l.status === "conciliado");
    return {
      qtd: realizados.length,
      total: realizados.reduce((s, l) => s + Number(l.valor), 0),
      ultima: realizados[0]?.data ?? null,
    };
  }, [lancs]);

  if (loading) return <PaginaSkeleton />;
  if (!fornecedor) return <div className="p-8 text-center text-muted-foreground">
    Fornecedor não encontrado. <Link to="/financas/fornecedores" className="text-primary underline">Voltar</Link>
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas/fornecedores"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-xl flex items-center gap-2 flex-wrap">
            {fornecedor.tipo === "fisica" ? <User className="w-5 h-5 text-gold" /> : <Building2 className="w-5 h-5 text-gold" />}
            {fornecedor.nome}
            {!fornecedor.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Inativo</Badge>}
          </h1>
          {fornecedor.cnpj_cpf && <p className="text-xs text-muted-foreground">{fornecedor.cnpj_cpf}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmando(true)}>
            {fornecedor.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
            {fornecedor.ativo ? "Inativar" : "Reativar"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-muted-foreground">Lançamentos</p>
            <p className="text-base font-semibold">{stats.qtd}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive-soft/30 border-destructive-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-destructive-text">Total pago</p>
            <p className="text-base font-semibold text-destructive-text tabular-nums">− {brl(stats.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-muted-foreground">Última vez</p>
            <p className="text-base font-semibold">{stats.ultima ? dataBr(stats.ultima) : "—"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Dados cadastrais */}
      <Card>
        <CardContent className="py-3 space-y-2">
          <h3 className="font-serif text-base">Dados cadastrais</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {fornecedor.email && (
              <p className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3.5 h-3.5 shrink-0" /> {fornecedor.email}</p>
            )}
            {fornecedor.telefone && (
              <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5 shrink-0" /> {fornecedor.telefone}</p>
            )}
            {fornecedor.chave_pix && (
              <p className="flex items-center gap-1.5 text-muted-foreground"><Wallet className="w-3.5 h-3.5 shrink-0" /> Pix: {fornecedor.chave_pix}</p>
            )}
            {(fornecedor.banco_nome || fornecedor.agencia || fornecedor.conta) && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CreditCard className="w-3.5 h-3.5 shrink-0" />
                {[fornecedor.banco_nome, fornecedor.agencia && `ag. ${fornecedor.agencia}`, fornecedor.conta && `cc ${fornecedor.conta}`]
                  .filter(Boolean).join(" · ")}
              </p>
            )}
            {(fornecedor.endereco || fornecedor.cidade) && (
              <p className="flex items-center gap-1.5 text-muted-foreground md:col-span-2">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {[fornecedor.endereco, fornecedor.bairro, fornecedor.cidade, fornecedor.uf].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          {fornecedor.observacao && (
            <p className="text-xs text-muted-foreground italic border-t pt-2">{fornecedor.observacao}</p>
          )}
          {!fornecedor.email && !fornecedor.telefone && !fornecedor.chave_pix && !fornecedor.banco_nome
            && !fornecedor.endereco && !fornecedor.observacao && (
            <p className="text-xs text-muted-foreground italic">Sem dados cadastrais além do nome. Clique em "Editar" para completar.</p>
          )}
        </CardContent>
      </Card>

      {/* Recorrências vinculadas */}
      {recorrencias.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-1.5">
            <h3 className="font-serif text-base flex items-center gap-2">
              <RotateCw className="w-4 h-4 text-gold" /> Despesas recorrentes ({recorrencias.length})
            </h3>
            {recorrencias.map(r => (
              <Link key={r.id} to="/financas/recorrencias"
                className={`flex items-center justify-between text-sm border-b border-border/40 py-1.5 hover:bg-muted/30 transition-colors ${!r.ativo ? "opacity-60" : ""}`}>
                <span className="truncate">
                  {r.descricao}
                  {!r.ativo && <Badge variant="outline" className="text-xs ml-1.5">Inativa</Badge>}
                </span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">
                  {FREQUENCIA_LABEL[r.frequencia]} · {brl(Number(r.valor))}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lista de lançamentos */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Histórico de lançamentos ({lancs.length})
        </h3>
        {lancs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground italic">
              Nenhum lançamento vinculado a este fornecedor ainda.
            </CardContent>
          </Card>
        ) : (
          lancs.map(l => (
            <div key={l.id} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {l.tipo === "entrada"
                  ? <TrendingUp className="w-3.5 h-3.5 text-success-text shrink-0" />
                  : <TrendingDown className="w-3.5 h-3.5 text-destructive-text shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.descricao ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataBr(l.data)}
                    {l.categoria_nome && ` · ${l.categoria_nome}`}
                    {l.conta_nome && ` · ${l.conta_nome}`}
                  </p>
                </div>
              </div>
              {l.comprovante_url && (
                <button onClick={() => abrirComprovante(l.comprovante_url!)}
                  className="text-info-text hover:text-info-text mr-2" title="Ver comprovante">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
              )}
              <p className={`text-sm font-semibold tabular-nums shrink-0 ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
              </p>
            </div>
          ))
        )}
      </div>

      <FornecedorForm open={editOpen} onOpenChange={setEditOpen} fornecedor={fornecedor} onSaved={carregar} />

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fornecedor.ativo ? "Inativar fornecedor?" : "Reativar fornecedor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {fornecedor.ativo
                ? `"${fornecedor.nome}" deixa de aparecer na busca ao lançar uma despesa nova. O histórico já feito não muda.`
                : `"${fornecedor.nome}" volta a aparecer na busca ao lançar uma despesa.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAlternar} disabled={busy}>
              {busy ? "..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
