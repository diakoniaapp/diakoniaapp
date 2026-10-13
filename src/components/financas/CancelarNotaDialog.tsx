// ─── CancelarNotaDialog — nota CANCELADA com o emitente: desfecho próprio, que exige a PROVA do cancelamento ──────────────────────────────────────────
//
// Fase 1C-e da Política de Compras por Terceiros. Cancelada não é "quitada" nem "não localizada". Sem o documento do cancelamento não há cancelamento: a nota segue A esclarecer.
// A tela sobe a prova (tipo "Prova de cancelamento") e só então pede ao banco para cancelar; o banco confere de novo (despesa em aberto, sem quitação, sem pagamento, não enviada).
import { useState } from "react";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErro } from "@/lib/erroRede";
import { adicionarAnexo } from "@/services/finService";
import { cancelarObrigacao } from "@/services/quitacaoService";

export function CancelarNotaDialog({ alvo, onFechar, onFeito }: { alvo: { id: string; descricao: string } | null; onFechar: () => void; onFeito: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  if (!alvo) return null;
  const pronto = !!arquivo && motivo.trim().length >= 5;

  async function cancelar() {
    if (!alvo || !arquivo || !pronto) return;
    setOcupado(true);
    try {
      await adicionarAnexo(alvo.id, arquivo, "prova_cancelamento");
      await cancelarObrigacao(alvo.id, motivo.trim());
      toast.success("Nota cancelada com a prova anexada. Ela deixa de ser uma conta a pagar.");
      setArquivo(null); setMotivo("");
      onFeito(); onFechar();
    } catch (e) { toast.error(mensagemErro(e, "Não foi possível cancelar a nota")); }
    finally { setOcupado(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !ocupado) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nota cancelada com o emitente</DialogTitle>
          <DialogDescription>
            {alvo.descricao ? <b>{alvo.descricao}. </b> : null}
            Cancelada não é paga nem “não localizada”: é um desfecho próprio e exige o documento do cancelamento. Sem ele, a nota continua A esclarecer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium flex items-center gap-1.5 mb-1"><Paperclip className="w-3.5 h-3.5" /> Prova do cancelamento (obrigatória)</label>
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => setArquivo(e.target.files?.[0] ?? null)} className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-background" />
          </div>
          <Textarea rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (obrigatório, pelo menos 5 letras)" />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>Voltar</Button>
          <Button disabled={ocupado || !pronto} onClick={() => void cancelar()}>{ocupado ? "…" : "Cancelar a nota"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
