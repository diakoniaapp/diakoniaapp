// ─── RecorrenciasDrawer.tsx — recorrências sem sair do workspace ───────────
//
// Fase 11b do Workspace Financeiro (23/09/2026) — mesma receita do
// `FornecedoresDrawer.tsx`: conteúdo idêntico a `FinancasRecorrencias.tsx`
// (mesma consulta, mesmo `RecorrenciaForm`, mesmo excluir/ativar/desativar),
// só dentro de um `Sheet`. `/financas/recorrencias` continua existindo.
//
// Achado ao migrar (não ao construir): `FinancasCentros.tsx`, cotado no mapa
// original como "lista simples" pra virar drawer, na verdade é ranking de
// gasto de 90 dias com duas abas — mais perto de "página" (relatório) do
// que de "lista de referência rápida". Fica de fora desta fatia; o mapa
// será corrigido depois de confirmar ao vivo. Recorrências entrou no lugar
// por ser exatamente o par simples que faltava: lista pequena, um diálogo
// só, sem relatório embutido.

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  RotateCw, Plus, Pencil, Trash2, PowerOff, RotateCcw,
  TrendingUp, TrendingDown, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarRecorrencias, atualizarRecorrencia, excluirRecorrencia,
  gerarRecorrencias, FREQUENCIA_LABEL, brl,
  type FinRecorrencia,
} from "@/services/finService";
import { RecorrenciaForm } from "@/components/financas/RecorrenciaForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function RecorrenciasDrawer({ open, onOpenChange }: Props) {
  const [recs, setRecs] = useState<FinRecorrencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinRecorrencia | null>(null);
  const [gerando, setGerando] = useState(false);
  const [apagando, setApagando] = useState<FinRecorrencia | null>(null);
  const [apagandoBusy, setApagandoBusy] = useState(false);

  async function carregar() {
    try {
      setRecs(await listarRecorrencias(true));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function gerarTodos() {
    setGerando(true);
    try {
      const qtd = await gerarRecorrencias();
      toast.success(`${qtd} lançamento(s) previsto(s) gerado(s)`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setGerando(false); }
  }

  async function toggle(r: FinRecorrencia) {
    await atualizarRecorrencia(r.id, { ativo: !r.ativo });
    await carregar();
  }

  async function confirmarExcluir() {
    if (!apagando) return;
    setApagandoBusy(true);
    try {
      await excluirRecorrencia(apagando.id);
      toast.success("Excluído");
      setApagando(null);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setApagandoBusy(false); }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-gold" /> Recorrências
              </SheetTitle>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" onClick={gerarTodos} disabled={gerando}>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {gerando ? "..." : "Gerar"}
                </Button>
                <Button size="sm" onClick={() => { setEditando(null); setFormOpen(true); }}
                  className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
                  <Plus className="w-3.5 h-3.5" /> Nova
                </Button>
              </div>
            </div>
            <SheetDescription className="text-xs">
              Despesas e receitas que se repetem — o sistema gera os lançamentos previstos.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : recs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <RotateCw className="w-10 h-10 mx-auto opacity-30" />
                <p>Ainda sem recorrências. Cadastre aluguel, salários, energia, etc.</p>
                <Button onClick={() => setFormOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
                  <Plus className="w-4 h-4" /> Criar a primeira
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recs.map(r => (
                  <div key={r.id} className={`flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30 gap-2 ${!r.ativo ? "opacity-60 border-dashed" : ""}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {r.tipo === "entrada"
                        ? <TrendingUp className="w-4 h-4 text-success-text shrink-0" />
                        : <TrendingDown className="w-4 h-4 text-destructive-text shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate flex items-center gap-1.5">
                          {r.descricao}
                          {!r.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Inativa</Badge>}
                          {r.valor_variavel && <Badge variant="outline" className="text-xs">variável</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {FREQUENCIA_LABEL[r.frequencia]} · todo dia {r.dia_vencimento}
                          {r.fornecedor_nome && ` · ${r.fornecedor_nome}`}
                        </p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums shrink-0 ${r.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {r.tipo === "entrada" ? "+" : "−"} {brl(Number(r.valor))}
                    </p>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditando(r); setFormOpen(true); }} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => toggle(r)} title={r.ativo ? "Desativar" : "Reativar"}>
                        {r.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                      </Button>
                      <Button type="button" variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive" onClick={() => setApagando(r)} title="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RecorrenciaForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        recorrencia={editando} onSaved={carregar} />

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              "{apagando?.descricao}" — os lançamentos previstos já gerados ficam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExcluir(); }} disabled={apagandoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {apagandoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
