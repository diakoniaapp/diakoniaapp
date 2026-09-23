// ─── OrcamentoDrawer.tsx — orçamento vs. real sem sair do workspace ────────
//
// Fase 11d do Workspace Financeiro (23/09/2026) — mesma receita da 11b:
// conteúdo idêntico a `FinancasOrcamento.tsx` (mesmo `criarOrcamento`,
// mesmo diálogo "Nova linha" — que já era inline na página, não um
// componente próprio de `components/financas/`, e continua inline aqui),
// só dentro de um `Sheet`. `/financas/orcamento` continua existindo; cada
// linha ainda linka pro Centro de Custo (que ficou como página — Fase 11b
// achou que é ranking de 90 dias, não lista simples).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Target, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listarOrcamentoVsReal, listarCentrosComResumo, criarOrcamento, excluirOrcamento,
  ordenarCentrosParaSeletor, brl, type FinOrcamentoVsReal, type FinCentroResumo,
} from "@/services/finService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function OrcamentoDrawer({ open, onOpenChange }: Props) {
  const [orc, setOrc] = useState<FinOrcamentoVsReal[]>([]);
  const [centros, setCentros] = useState<FinCentroResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [centroId, setCentroId] = useState("");
  const [valor, setValor] = useState<number>(0);
  const [mensal, setMensal] = useState(true);
  const [busy, setBusy] = useState(false);
  const [apagando, setApagando] = useState<FinOrcamentoVsReal | null>(null);
  const [apagandoBusy, setApagandoBusy] = useState(false);

  const centrosOrdenados = useMemo(() => ordenarCentrosParaSeletor(centros), [centros]);

  async function carregar() {
    setLoading(true);
    try {
      const [o, cs] = await Promise.all([listarOrcamentoVsReal(), listarCentrosComResumo()]);
      setOrc(o);
      setCentros(cs);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (open) carregar(); }, [open]);

  async function adicionar() {
    if (!centroId) { toast.error("Selecione o centro"); return; }
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    setBusy(true);
    try {
      const hoje = new Date();
      await criarOrcamento({
        ano: hoje.getFullYear(),
        mes: mensal ? hoje.getMonth() + 1 : null,
        centro_custo_id: centroId,
        valor_planejado: valor,
      });
      toast.success("Orçamento salvo");
      setDlgOpen(false); setCentroId(""); setValor(0);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  async function confirmarDeletar() {
    if (!apagando) return;
    setApagandoBusy(true);
    try {
      await excluirOrcamento(apagando.id);
      setApagando(null);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setApagandoBusy(false); }
  }

  const acimaLimite = orc.filter(o => Number(o.percentual_consumido) >= 100).length;
  const proximoLimite = orc.filter(o => Number(o.percentual_consumido) >= 80 && Number(o.percentual_consumido) < 100).length;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="flex items-center gap-2">
                <Target className="w-4 h-4 text-gold" /> Orçamento
              </SheetTitle>
              <Button size="sm" onClick={() => setDlgOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white shrink-0">
                <Plus className="w-3.5 h-3.5" /> Nova linha
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Planeje gastos por centro de custo — real vs. planejado.
            </SheetDescription>
            {orc.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-md border px-2.5 py-1.5"><p className="text-xs uppercase text-muted-foreground">Linhas</p><p className="text-sm font-semibold">{orc.length}</p></div>
                <div className="rounded-md border bg-destructive-soft/30 border-destructive-line px-2.5 py-1.5"><p className="text-xs uppercase text-destructive-text">Acima</p><p className="text-sm font-semibold text-destructive-text">{acimaLimite}</p></div>
                <div className="rounded-md border bg-warning-soft/30 border-warning-line px-2.5 py-1.5"><p className="text-xs uppercase text-warning-text">≥ 80%</p><p className="text-sm font-semibold text-warning-text">{proximoLimite}</p></div>
              </div>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
            ) : orc.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground space-y-2">
                <Target className="w-10 h-10 mx-auto opacity-30" />
                <p>Ainda sem orçamento.</p>
                <Button onClick={() => setDlgOpen(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
                  <Plus className="w-4 h-4" /> Definir primeiro orçamento
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {orc.map(o => {
                  const pct = Number(o.percentual_consumido);
                  const corBarra = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-success";
                  return (
                    <div key={o.id} className="border rounded-md px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <Link to={`/financas/centro/${o.centro_custo_id}`}
                            className="font-medium text-sm truncate flex items-center gap-1.5 hover:underline">
                            {o.centro_nome}
                            {pct >= 100 && <Badge variant="outline" className="text-xs bg-destructive-soft text-destructive-text border-destructive-line">Estourou</Badge>}
                            {pct >= 80 && pct < 100 && <Badge variant="outline" className="text-xs bg-warning-soft text-warning-text border-warning-line">Alerta</Badge>}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {o.mes ? `Mês ${String(o.mes).padStart(2, "0")}/${o.ano}` : `Ano ${o.ano}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">
                            {brl(Number(o.valor_real))} / <span className="text-muted-foreground">{brl(Number(o.valor_planejado))}</span>
                          </p>
                          <p className={`text-xs font-medium ${pct >= 100 ? "text-destructive-text" : pct >= 80 ? "text-warning-text" : "text-success-text"}`}>
                            {pct.toFixed(1)}%
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setApagando(o)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className={corBarra + " h-full transition-all"} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl flex items-center gap-2">
              <Target className="w-5 h-5 text-gold" /> Definir orçamento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Centro de custo *</Label>
              <Select value={centroId} onValueChange={setCentroId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione">{centros.find(c => c.id === centroId)?.nome}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {centrosOrdenados.map(({ centro, rotulo, indentado }) => (
                    <SelectItem key={centro.id} value={centro.id} className={indentado ? "pl-12 text-muted-foreground" : "font-medium"}>
                      {rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor planejado (R$) *</Label>
              <Input type="number" step="0.01" min={0.01} value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Button type="button" size="sm" variant={mensal ? "default" : "outline"} onClick={() => setMensal(true)}>Mensal</Button>
              <Button type="button" size="sm" variant={!mensal ? "default" : "outline"} onClick={() => setMensal(false)}>Anual</Button>
            </div>
            <p className="text-xs text-muted-foreground">{mensal ? "Aplica para este mês" : "Aplica para todo o ano"}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDlgOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={adicionar} disabled={busy}>{busy ? "..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta linha de orçamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.centro_nome} — {apagando && brl(Number(apagando.valor_planejado))} planejado. Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarDeletar(); }} disabled={apagandoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {apagandoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
