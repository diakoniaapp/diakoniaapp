// ─── MudarIntencaoDialog — Oferta ⇄ Reembolso, com as consequências à vista e o motivo obrigatório (Fase 2B) ─────────────────────────────────────────────
// Não é um "editar": a intenção é o fato que a Declaração do Terceiro assina, então mudá-la invalida a declaração e as aprovações e gera a nova via. O banco executa tudo numa operação só.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mensagemErro } from "@/lib/erroRede";
import { consequenciasDaMudanca, intencaoOposta, ROTULO_INTENCAO_TROCA, type IntencaoTroca } from "@/lib/mudarIntencao";
import { mudarIntencao } from "@/services/quitacaoService";

export function MudarIntencaoDialog({ quitacaoId, atual, aberto, onFechar, onFeito }: {
  quitacaoId: string; atual: IntencaoTroca; aberto: boolean; onFechar: () => void; onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (aberto) setMotivo(""); }, [aberto]);
  const nova = intencaoOposta(atual);

  async function confirmar() {
    setOcupado(true);
    try {
      const via = await mudarIntencao(quitacaoId, nova, motivo.trim());
      toast.success(via
        ? `Intenção mudada para ${ROTULO_INTENCAO_TROCA[nova]}. A nova via da Declaração do Terceiro foi gerada: imprima, colha a assinatura e registre a via assinada.`
        : `Intenção mudada para ${ROTULO_INTENCAO_TROCA[nova]}. Falta informar dados para gerar a nova via da Declaração (ex.: a forma de pagamento do terceiro).`);
      onFechar(); onFeito();
    } catch (e) { toast.error(mensagemErro(e)); } finally { setOcupado(false); }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={o => { if (!o && !ocupado) onFechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mudar a intenção de {ROTULO_INTENCAO_TROCA[atual]} para {ROTULO_INTENCAO_TROCA[nova]}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>Intenção atual: <b>{ROTULO_INTENCAO_TROCA[atual]}</b> · nova intenção: <b>{ROTULO_INTENCAO_TROCA[nova]}</b>.</p>
              <p className="font-medium text-foreground">O que acontece, de uma vez:</p>
              <ul className="list-disc space-y-1 pl-5">{consequenciasDaMudanca(atual, nova).map(c => <li key={c}>{c}</li>)}</ul>
              <p className="text-xs">Fica registrado: intenção anterior, nova intenção, motivo, quem mudou, a data e a hora. A mudança só é possível com a obrigação em aberto, não enviada à contabilidade e fora de período fechado.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da mudança (obrigatório, pelo menos 5 letras)" aria-label="Motivo da mudança de intenção" />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
          <Button disabled={ocupado || motivo.trim().length < 5} onClick={() => void confirmar()}>{ocupado ? "…" : `Mudar para ${ROTULO_INTENCAO_TROCA[nova]}`}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
