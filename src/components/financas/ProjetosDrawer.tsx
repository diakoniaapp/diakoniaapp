// ─── ProjetosDrawer.tsx — projetos sem sair do workspace ────────────────────
//
// Fase 11d do Workspace Financeiro (23/09/2026) — mesma receita da 11b:
// conteúdo idêntico a `FinancasProjetos.tsx` (mesmo `ProjetoForm`, mesmo
// encerrar/reabrir/excluir), só dentro de um `Sheet`.
// `/financas/projetos` continua existindo — e a seção "Projetos em
// andamento" do Painel também: aquela já mostra os ativos com progresso,
// este drawer é "ver todos, inclusive encerrados, e gerenciar o cadastro",
// não uma segunda versão da mesma lista.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FolderKanban, Plus, Search, ChevronRight, Lock, LockOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listarProjetosTodos, encerrarProjeto, reabrirProjeto, excluirProjeto,
  contarLancamentosPorProjeto, brl,
  type FinProjeto,
} from "@/services/finService";
import { ProjetoForm } from "@/components/financas/ProjetoForm";

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChange?: () => void;
}

export function ProjetosDrawer({ open, onOpenChange, onChange }: Props) {
  const [projetos, setProjetos] = useState<FinProjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinProjeto | null>(null);
  const [alternando, setAlternando] = useState<FinProjeto | null>(null);
  const [excluindo, setExcluindo] = useState<{ projeto: FinProjeto; qtdLancamentos: number } | null>(null);
  const [busy, setBusy] = useState(false);

  async function carregar() {
    try {
      setProjetos(await listarProjetosTodos());
    } catch (e: any) { toast.error(e?.message ?? "Erro ao carregar projetos"); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtrados = useMemo(() => {
    const base = mostrarEncerrados ? projetos : projetos.filter(p => p.status === "ativo");
    if (busca.length < 2) return base;
    const termo = normalizar(busca);
    return base.filter(p => normalizar(p.nome).includes(termo));
  }, [projetos, busca, mostrarEncerrados]);

  async function confirmarAlternar() {
    if (!alternando) return;
    setBusy(true);
    try {
      if (alternando.status === "ativo") await encerrarProjeto(alternando.id);
      else await reabrirProjeto(alternando.id);
      toast.success(alternando.status === "ativo" ? "Projeto encerrado" : "Projeto reaberto");
      setAlternando(null);
      await carregar();
      onChange?.();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function pedirExclusao(p: FinProjeto) {
    const qtd = await contarLancamentosPorProjeto(p.id);
    setExcluindo({ projeto: p, qtdLancamentos: qtd });
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setBusy(true);
    try {
      await excluirProjeto(excluindo.projeto.id);
      toast.success("Projeto excluído");
      setExcluindo(null);
      await carregar();
      onChange?.();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-gold" /> Projetos
              </SheetTitle>
              <Button size="sm" onClick={() => { setEditando(null); setFormOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white shrink-0">
                <Plus className="w-3.5 h-3.5" /> Novo
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Iniciativas específicas — campanhas, reformas, congressos.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center gap-2 p-3 border-b bg-muted/20">
            <div className="relative flex-1">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Buscar por nome..." />
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 px-1">
              <input type="checkbox" checked={mostrarEncerrados} onChange={(e) => setMostrarEncerrados(e.target.checked)} />
              Encerrados
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <FolderKanban className="w-10 h-10 mx-auto opacity-30" />
                <p>{projetos.length === 0 ? "Nenhum projeto cadastrado ainda." : "Sem projetos com esse filtro."}</p>
                {projetos.length === 0 && (
                  <Button onClick={() => setFormOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
                    <Plus className="w-4 h-4" /> Cadastrar o primeiro
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filtrados.map(p => (
                  <div key={p.id}
                    className={`flex items-center justify-between gap-2 border rounded-md px-3 py-2 hover:bg-muted/30 ${p.status === "encerrado" ? "opacity-60 border-dashed" : ""}`}>
                    <Link to={`/financas/projeto/${p.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                      <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-1.5">
                          {p.nome}
                          {p.status === "encerrado" && <Badge variant="outline" className="text-xs">Encerrado</Badge>}
                        </div>
                        {p.meta_valor != null && <p className="text-xs text-muted-foreground">Meta: {brl(p.meta_valor)}</p>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditando(p); setFormOpen(true); }} title="Editar">
                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setAlternando(p)} title={p.status === "ativo" ? "Encerrar" : "Reabrir"}>
                        {p.status === "ativo" ? <Lock className="w-3.5 h-3.5 text-warning-text" /> : <LockOpen className="w-3.5 h-3.5 text-success-text" />}
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => pedirExclusao(p)} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5 text-destructive-text" />
                      </Button>
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                        <Link to={`/financas/projeto/${p.id}`}><ChevronRight className="w-3.5 h-3.5" /></Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ProjetoForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        projeto={editando} onSaved={() => { carregar(); onChange?.(); }} />

      <AlertDialog open={!!alternando} onOpenChange={(v) => !v && setAlternando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alternando?.status === "ativo" ? "Encerrar projeto?" : "Reabrir projeto?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {alternando?.status === "ativo"
                ? `"${alternando?.nome}" deixa de aparecer na busca ao lançar um lançamento novo. O histórico já lançado não muda.`
                : `"${alternando?.nome}" volta a aparecer na busca ao lançar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarAlternar(); }} disabled={busy}>
              {busy ? "..." : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{excluindo?.projeto.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo && excluindo.qtdLancamentos > 0
                ? `${excluindo.qtdLancamentos} lançamento(s) usam este projeto — eles não são apagados, só perdem essa classificação.`
                : "Nenhum lançamento usa este projeto ainda."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExclusao(); }} disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90">
              {busy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
