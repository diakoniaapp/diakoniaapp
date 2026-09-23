// ─── ContratadosDrawer.tsx — a lista de contratados sem sair do workspace ───
//
// Fase 11d do Workspace Financeiro (23/09/2026). Diferente de Fornecedores/
// Recorrências/Estoque/Projetos, este NÃO é cópia 1:1 de `FinancasFolha.tsx`
// (636 linhas) — só a aba "Contratados" (lista + `ContratadoForm`) vira
// drawer. As 4 calculadoras didáticas (CLT/RPA/MEI/Prebenda) ficam de fora
// de propósito: são ferramenta de trabalho — sentar e conferir um cálculo
// antes de fechar um pagamento —, não referência rápida de consulta
// durante outra tarefa. `/financas/folha` continua tendo as duas.

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Briefcase, Plus, Pencil, PowerOff, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  listarContratados, atualizarContratado, desativarContratado,
  VINCULO_LABEL, VINCULO_COR,
  type FinContratado,
} from "@/services/folhaService";
import { ContratadoForm } from "@/components/financas/ContratadoForm";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ContratadosDrawer({ open, onOpenChange }: Props) {
  const [contratados, setContratados] = useState<FinContratado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<FinContratado | null>(null);
  const [alternando, setAlternando] = useState<FinContratado | null>(null);
  const [busy, setBusy] = useState(false);

  async function carregar() {
    try {
      setContratados(await listarContratados(mostrarInativos));
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
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

  async function confirmarAlternar() {
    if (!alternando) return;
    setBusy(true);
    try {
      if (alternando.ativo) {
        await desativarContratado(alternando.id);
        toast.success("Contratado desativado");
      } else {
        await atualizarContratado(alternando.id, { ativo: true });
        toast.success("Contratado reativado");
      }
      setAlternando(null);
      await carregar();
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
                <Briefcase className="w-4 h-4 text-gold" /> Contratados
              </SheetTitle>
              <Button size="sm" onClick={() => { setEditando(null); setFormOpen(true); }}
                className="gap-1.5 bg-gold hover:bg-gold/90 text-white shrink-0">
                <Plus className="w-3.5 h-3.5" /> Novo
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Quem recebe salário, RPA, MEI ou prebenda. Calculadoras de CLT/RPA/MEI/Prebenda continuam em Folha & Encargos.
            </SheetDescription>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer pt-1">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Mostrar inativos
            </label>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : contratados.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-8">
                Nenhum contratado cadastrado ainda.
              </p>
            ) : (
              <div className="space-y-1">
                {contratados.map(c => (
                  <div key={c.id} className={`border rounded-md px-3 py-2 flex items-center justify-between gap-2 ${!c.ativo ? "opacity-60 border-dashed" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {c.nome}
                        {!c.ativo && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Inativo</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{c.cargo}</p>
                    </div>
                    <Badge variant="outline" className={`text-xs shrink-0 ${VINCULO_COR[c.vinculo]}`}>{VINCULO_LABEL[c.vinculo]}</Badge>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {c.chave_pix && (
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { navigator.clipboard.writeText(c.chave_pix!); toast.success("Chave Pix copiada"); }}
                          title="Copiar chave Pix">
                          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditando(c); setFormOpen(true); }} title="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setAlternando(c)} title={c.ativo ? "Desativar" : "Reativar"}>
                        {c.ativo ? <PowerOff className="w-3.5 h-3.5 text-warning-text" /> : <RotateCcw className="w-3.5 h-3.5 text-success-text" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ContratadoForm open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditando(null); }}
        contratado={editando} onSaved={carregar} />

      <AlertDialog open={!!alternando} onOpenChange={(v) => !v && setAlternando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{alternando?.ativo ? "Desativar contratado?" : "Reativar contratado?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {alternando?.ativo
                ? `"${alternando?.nome}" deixa de aparecer na lista ativa. Nada nos cálculos ou lançamentos já feitos muda.`
                : `"${alternando?.nome}" volta a aparecer na lista ativa.`}
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
