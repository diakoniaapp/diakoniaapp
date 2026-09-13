// ─── FinancasFornecedores.tsx ────────────────────────────────────────────
//
// Fase 4.1 do roadmap Financeiro (docs/ROADMAP_FINANCEIRO_ERP.md) — gap
// achado comparando com o Omie: `fin_fornecedores` e o CRUD básico
// (`criarFornecedor`, `buscarFornecedorPorCnpj`) já existiam, mas só
// embutidos dentro do formulário de lançamento. Nenhuma tela listava,
// editava ou inativava um fornecedor. Esta tela fecha isso; a ficha de
// histórico por fornecedor é `FinancasFornecedorDetalhe.tsx`.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Building2, User, Plus, Search, ChevronRight, PowerOff, RotateCcw,
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
import { PaginaSkeleton } from "@/components/ListState";

export default function FinancasFornecedores() {
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinFornecedor | null>(null);
  const [alternando, setAlternando] = useState<FinFornecedor | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { carregar(); }, [mostrarInativos]);

  async function carregar() {
    setLoading(true);
    try {
      setFornecedores(await listarFornecedores(undefined, mostrarInativos));
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao carregar fornecedores");
    } finally { setLoading(false); }
  }

  const filtrados = useMemo(() => {
    if (busca.length < 2) return fornecedores;
    const termo = busca.toLowerCase();
    return fornecedores.filter(f =>
      f.nome.toLowerCase().includes(termo) || (f.cnpj_cpf ?? "").includes(busca.replace(/\D/g, "")));
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

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Building2 className="w-5 h-5 text-gold" /> Fornecedores
          </h1>
          <p className="text-xs text-muted-foreground">
            Empresas e prestadores a quem a igreja paga — cadastro e histórico de despesas.
          </p>
        </div>
        <Button onClick={() => { setEditando(null); setFormOpen(true); }}
          className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Novo
        </Button>
      </div>

      <Card>
        <CardContent className="py-2.5 px-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs pl-6" placeholder="Buscar por nome ou CNPJ/CPF..." />
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer shrink-0 px-1">
            <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar inativos
          </label>
        </CardContent>
      </Card>

      {filtrados.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-2">
            <Building2 className="w-10 h-10 mx-auto opacity-30" />
            <p>{fornecedores.length === 0 ? "Nenhum fornecedor cadastrado ainda." : "Sem fornecedores com esse filtro."}</p>
            {fornecedores.length === 0 && (
              <Button onClick={() => setFormOpen(true)} variant="outline" className="gap-1.5 mt-2">
                <Plus className="w-4 h-4" /> Cadastrar o primeiro
              </Button>
            )}
          </CardContent>
        </Card>
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
                  onClick={() => setAlternando(f)} title={f.ativo ? "Inativar" : "Reativar"}>
                  {f.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                </Button>
                <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                  <Link to={`/financas/fornecedor/${f.id}`}><ChevronRight className="w-3.5 h-3.5" /></Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

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
    </div>
  );
}
