// ─── VinculoBancario — o lançamento está LIGADO a uma linha do extrato do banco: aviso, travas e o botão "Desvincular do extrato" ───────────────────────────────────────────────────────
//
// 22/10/2026 (caso Light). Enquanto existe vínculo bancário ativo o banco recusa mudar valor, sentido, data de pagamento, voltar o status para previsto/cancelado e tirar a marca [ofx:…]
// (migration 20261022150000). Esta peça mostra isso na tela ANTES de a pessoa tentar, e dá o caminho: "Desvincular do extrato" — motivo obrigatório, trilha completa — e só então editar.
// Fluxo: lançamento conciliado → Desvincular do extrato → motivo → Editar.
import { useCallback, useEffect, useState } from "react";
import { Landmark, Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { desvincularDoExtrato, vinculosAtivosDoLancamento } from "@/services/importacaoOfxService";

export const MOTIVO_MINIMO_DO_VINCULO = 5;

/** As linhas do extrato (FITID) a que o lançamento está ligado AGORA. Sem lançamento (ou sem a tabela, antes da migration D4) = nenhuma. */
export function useVinculosDoLancamento(lancamentoId: string | null | undefined) {
  const [fitids, setFitids] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(false);
  const recarregar = useCallback(async () => {
    if (!lancamentoId) { setFitids([]); return; }
    setCarregando(true);
    try { setFitids(await vinculosAtivosDoLancamento(lancamentoId)); }
    catch { setFitids([]); }
    finally { setCarregando(false); }
  }, [lancamentoId]);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { fitids, carregando, recarregar };
}

/** O aviso com o botão. Some quando não há vínculo ativo. */
export function FaixaDoVinculoBancario({ lancamentoId, fitids, onDesvinculado, compacta }: {
  lancamentoId: string; fitids: string[]; onDesvinculado: () => void; compacta?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  if (fitids.length === 0) return null;
  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO_DO_VINCULO;

  async function confirmar(e: React.MouseEvent) {
    e.preventDefault();   // AlertDialogAction fecha antes do await (mesmo cuidado dos outros diálogos)
    if (!motivoOk) return;
    setBusy(true);
    try {
      await desvincularDoExtrato(lancamentoId, motivo.trim());
      toast.success("Lançamento desvinculado do extrato — agora dá para editar valor, status e data de pagamento");
      setAberto(false); setMotivo("");
      onDesvinculado();
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível desvincular");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div role="note" data-vinculo-bancario className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-info-line bg-info-soft px-3 py-2 text-sm text-info-text">
        <Landmark className="h-4 w-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <b>Ligado ao extrato do banco</b> <span className="text-xs opacity-80">({fitids.join(", ")})</span>
          {!compacta && <span className="block text-xs">O dinheiro já passou pelo banco: valor, status e data do pagamento ficam travados. Para mudar, desvincule do extrato (com o motivo).</span>}
        </p>
        <Button type="button" size="sm" variant="outline" className="gap-1.5 bg-background" onClick={() => setAberto(true)}>
          <Link2Off className="h-3.5 w-3.5" /> Desvincular do extrato
        </Button>
      </div>

      <AlertDialog open={aberto} onOpenChange={v => { if (!v && !busy) { setAberto(false); setMotivo(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular este lançamento do extrato?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  A linha do banco ({fitids.join(", ")}) fica livre e o lançamento deixa de contar como conciliado com ela. Os dados dele <b>não mudam</b> agora — você só passa a poder editar valor,
                  status e data do pagamento. A decisão fica registrada (quem, quando e o motivo).
                </p>
                <label className="block text-xs font-medium text-foreground" htmlFor="motivo-desvinculo">Motivo (obrigatório)</label>
                <Textarea id="motivo-desvinculo" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} disabled={busy} autoFocus
                  placeholder="Ex.: o débito pagou duas faturas e o lançamento precisa ser dividido" />
                {motivo.length > 0 && !motivoOk && <p className="text-xs text-destructive-text">Escreva pelo menos {MOTIVO_MINIMO_DO_VINCULO} letras.</p>}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar} disabled={busy || !motivoOk}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desvincular"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
