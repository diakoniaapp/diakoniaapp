// ─── IgnorarLinhaDialog — "este movimento não vira lançamento", com o motivo, e a decisão fica guardada ───────

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { brl } from "@/services/finService";
import { ROTULO_DO_MOTIVO, type LinhaAnalisada, type MotivoDeIgnorar } from "@/services/importacaoOfxService";

interface Props {
  linha: LinhaAnalisada | null;
  ocupado: boolean;
  onFechar: () => void;
  onConfirmar: (l: LinhaAnalisada, motivo: MotivoDeIgnorar, observacao: string) => void;
}

export function IgnorarLinhaDialog({ linha, ocupado, onFechar, onConfirmar }: Props) {
  const [motivo, setMotivo] = useState<MotivoDeIgnorar>("duplicado");
  const [observacao, setObservacao] = useState("");
  useEffect(() => { if (linha) { setMotivo("duplicado"); setObservacao(""); } }, [linha]);
  return (
    <Dialog open={!!linha} onOpenChange={v => { if (!v && !ocupado) onFechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ignorar este movimento?</DialogTitle>
          <DialogDescription>
            {linha && <><span className="font-medium">{linha.tx.memo}</span> · {brl(linha.tx.valor)}.<br /></>}
            Ele não vira lançamento e não volta a aparecer quando o mesmo extrato for importado de novo. Dá para reativar depois, no filtro "Ignoradas".
          </DialogDescription>
        </DialogHeader>
        <fieldset className="grid grid-cols-2 gap-2" aria-label="Motivo">
          {(Object.keys(ROTULO_DO_MOTIVO) as MotivoDeIgnorar[]).map(m => (
            <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)}
              className={`h-10 rounded-md border px-2 text-sm ${motivo === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>
              {ROTULO_DO_MOTIVO[m]}
            </button>
          ))}
        </fieldset>
        <Input aria-label="Observação (opcional)" placeholder="Observação (opcional)" maxLength={300} value={observacao} onChange={e => setObservacao(e.target.value)} />
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onFechar} disabled={ocupado}>Voltar</Button>
          <Button type="button" onClick={() => linha && onConfirmar(linha, motivo, observacao)} disabled={ocupado}>Ignorar movimento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
