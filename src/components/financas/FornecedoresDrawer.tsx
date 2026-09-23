// ─── FornecedoresDrawer.tsx — a lista de Fornecedores sem sair do workspace ─
//
// Fase 11b do Workspace Financeiro (23/09/2026, mapa em
// https://claude.ai/artifact/45q7ziY7o3bsJrh9Zap1Rx): "Financeiro → Agenda →
// Volta → Fornecedor → Volta" não parece ERP moderno. Este drawer não
// recria `FinancasFornecedores.tsx` — é o MESMO conteúdo (mesma consulta,
// mesmo `FornecedorForm`, mesmo alternar ativo/inativo), só dentro de um
// `Sheet` que abre por cima do Painel da Tesouraria em vez de trocar de
// rota. `/financas/fornecedores` continua existindo — link direto, aba
// nova, favorito — o drawer é um atalho a mais, não substituição de URL.
//
// Diferença deliberada da página: cada linha ganha um lápis de EDITAR
// direto — na página, editar só existia na Ficha do fornecedor
// (`FinancasFornecedorDetalhe.tsx`, "Editar" → mesmo `FornecedorForm`).
// Dentro do drawer, abrir a ficha inteira só pra corrigir um telefone
// reintroduziria a navegação que a Fase 11 existe pra tirar — o nome
// continua linkando pra ficha (histórico de despesas é conteúdo de
// verdade, fica página), só ganhou um atalho de edição rápida ao lado.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Building2, User, Plus, Search, ChevronRight, Pencil, PowerOff, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listarFornecedores, atualizarFornecedor, type FinFornecedor,
} from "@/services/finService";
import { FornecedorForm } from "@/components/financas/FornecedorForm";

// Mesma normalização de `FinancasFornecedores.tsx` — busca sem acento bate
// com nome gravado com acento.
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function FornecedoresDrawer({ open, onOpenChange }: Props) {
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinFornecedor | null>(null);
  const [alternando, setAlternando] = useState<FinFornecedor | null>(null);
  const [busy, setBusy] = useState(false);

  async function carregar() {
    try {
      setFornecedores(await listarFornecedores(undefined, mostrarInativos));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar fornecedores");
    }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    carregar().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open || loading) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarInativos]);

  const filtrados = useMemo(() => {
    if (busca.length < 2) return fornecedores;
    const termo = normalizar(busca);
    const digitosBusca = busca.replace(/\D/g, "");
    return fornecedores.filter(f =>
      normalizar(f.nome).includes(termo)
      || (digitosBusca.length >= 3 && (f.cnpj_cpf ?? "").includes(digitosBusca)));
  }, [fornecedores, busca]);

  async function confirmarAlternar() {
    if (!alternando) return;
    setBusy(true);
    try {
      await atualizarFornecedor(alternando.id, { ativo: !alternando.ativo });
      toast.success(alternando.ativo ? "Fornecedor inativado" : "Fornecedor reativado");
      setAlternando(null);
      await carregar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-gold" /> Fornecedores
              </SheetTitle>
              <Button size="sm" onClick={() => { setEditando(null); setFormOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white shrink-0">
                <Plus className="w-3.5 h-3.5" /> Novo
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Empresas e prestadores a quem a igreja paga.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center gap-2 p-3 border-b bg-muted/20">
            <div className="relative flex-1">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Buscar por nome ou CNPJ/CPF..." />
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 px-1">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Inativos
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : filtrados.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground space-y-2">
                <Building2 className="w-10 h-10 mx-auto opacity-30" />
                <p>{fornecedores.length === 0 ? "Nenhum fornecedor cadastrado ainda." : "Sem fornecedores com esse filtro."}</p>
                {fornecedores.length === 0 && (
                  <Button onClick={() => setFormOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
                    <Plus className="w-4 h-4" /> Cadastrar o primeiro
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {filtrados.map(f => (
                  <div key={f.id}
                    className={`flex items-center justify-between gap-2 border rounded-md px-3 py-2 hover:bg-muted/30 ${!f.ativo ? "opacity-60 border-dashed" : ""}`}>
                    <Link to={`/financas/fornecedor/${f.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                      {f.tipo === "fisica" ? <User className="w-4 h-4 text-muted-foreground shrink-0" /> : <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-1.5">
                          {f.nome}
                          {!f.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Inativo</Badge>}
                        </div>
                        {f.cnpj_cpf && <p className="text-xs text-muted-foreground">{f.cnpj_cpf}</p>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditando(f); setFormOpen(true); }} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setAlternando(f)} title={f.ativo ? "Inativar" : "Reativar"}>
                        {f.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                      </Button>
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Ver ficha">
                        <Link to={`/financas/fornecedor/${f.id}`}><ChevronRight className="w-3.5 h-3.5" /></Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <FornecedorForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        fornecedor={editando} onSaved={carregar} />

      <AlertDialog open={!!alternando} onOpenChange={(v) => !v && setAlternando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alternando?.ativo ? "Inativar fornecedor?" : "Reativar fornecedor?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {alternando?.ativo
                ? `"${alternando?.nome}" deixa de aparecer na busca ao lançar uma despesa nova. O histórico de lançamentos já feitos não muda.`
                : `"${alternando?.nome}" volta a aparecer na busca ao lançar uma despesa.`}
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
    </>
  );
}
