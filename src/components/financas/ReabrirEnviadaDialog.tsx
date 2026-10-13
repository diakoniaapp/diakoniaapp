import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { reabrirDespesaEnviada, reabrirEnvio } from "@/services/fechamentoMensalService";

export type AlvoDaReabertura = { tipo: "despesa"; id: string; nome: string } | { tipo: "envio"; id: string; rotulo: string; despesas: number };

/**
 * Reabrir (D6): a despesa Enviada ao malote — ou o envio inteiro — volta a poder ser corrigida. Só Administrador e Tesouraria (o banco confere), com MOTIVO
 * obrigatório; fica registrado motivo, data e hora, usuário, estado anterior e estado novo. O vínculo bancário e o histórico dos envios permanecem.
 */
export function ReabrirEnviadaDialog({ alvo, onFechar, onFeito }: { alvo: AlvoDaReabertura | null; onFechar: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (alvo) setMotivo(""); }, [alvo]);

  async function reabrir() {
    if (!alvo) return;
    setBusy(true);
    try {
      if (alvo.tipo === "despesa") {
        await reabrirDespesaEnviada(alvo.id, motivo);
        toast.success("Despesa reaberta — o motivo ficou registrado");
      } else {
        const n = await reabrirEnvio(alvo.id, motivo);
        toast.success(`${n} despesa${n === 1 ? "" : "s"} reaberta${n === 1 ? "" : "s"} — o motivo ficou registrado`);
      }
      onFeito();
      onFechar();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível reabrir");
    } finally { setBusy(false); }
  }

  const curto = motivo.trim().length < 5;
  return (
    <Dialog open={!!alvo} onOpenChange={o => { if (!o && !busy) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{alvo?.tipo === "envio" ? `Reabrir o envio de ${alvo.rotulo}` : "Reabrir despesa enviada"}</DialogTitle>
          <DialogDescription>
            {alvo?.tipo === "envio"
              ? `As ${alvo.despesas} despesas deste envio voltam a poder ser corrigidas. Depois de corrigidas, entram no próximo envio.`
              : `${alvo?.nome ?? "A despesa"} volta a poder ser corrigida (valor, data, categoria, centro, favorecido). Depois de corrigida, entra no próximo envio.`}
            {" "}Só o Administrador e a Tesouraria podem reabrir; o motivo, a data, a hora e o usuário ficam registrados.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="motivo-reabertura">Motivo (obrigatório)</Label>
          <Textarea id="motivo-reabertura" value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
            placeholder="Ex.: categoria errada no malote de outubro" />
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onFechar}>Voltar</Button>
          <Button type="button" disabled={busy || curto} onClick={reabrir}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Reabrir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
