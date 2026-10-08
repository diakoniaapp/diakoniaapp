// ─── LiquidarPeloExtratoDialog — a linha do extrato quitou um documento: igual ou com DIFERENÇA ───────────
//
// Abre sozinho, ao importar o OFX, quando o valor do extrato difere do documento (pedido dela, 06/10/2026):
//   ⚠ Diferença identificada — Documento R$ 1.418,00 · Extrato R$ 1.538,00 · Diferença R$ 120,00 → Motivo → [Confirmar]
// Também serve para o documento de valor IGUAL (um clique, sem pergunta). O motivo vira juros/multa/outro documento/
// complemento/ajuste (com motivo) dentro da MESMA liquidação, com o FITID do banco: o mesmo extrato não liquida duas vezes.

import { useEffect, useState } from "react";
import { Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { LiquidacaoPainel } from "@/components/financas/LiquidacaoPainel";
import { liquidar } from "@/services/liquidacaoService";
import { brl } from "@/services/finService";
import type { LinhaAnalisada } from "@/services/importacaoOfxService";
import type { PlanoDeLiquidacao } from "@/lib/liquidacao";

const dataBr = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

export function LiquidarPeloExtratoDialog({ linha, contaId, onFechar, onFeito }: {
  linha: LinhaAnalisada | null;
  contaId: string;
  onFechar: () => void;
  onFeito: () => void | Promise<void>;
}) {
  const [escolhido, setEscolhido] = useState(0);
  // vários documentos abertos do mesmo fornecedor e nenhum com o valor do extrato: NINGUÉM é escolhido de antemão (nada de "desconto" automático)
  const ambiguo = !!linha?.documentos?.[0]?.ambiguo;
  const [plano, setPlano] = useState<PlanoDeLiquidacao | null>(null);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { setEscolhido(ambiguo ? -1 : 0); setPlano(null); }, [linha?.tx.fitid, ambiguo]);

  const candidatos = linha?.documentos ?? [];
  const alvo = escolhido >= 0 ? candidatos[escolhido] : undefined;
  const diverge = !!alvo && Math.abs(alvo.diferenca) >= 0.005;

  async function confirmar() {
    if (!linha || !alvo || !plano?.pronto) { toast.error(plano?.problemas[0] ?? "Explique a diferença antes de confirmar."); return; }
    setGravando(true);
    try {
      await liquidar({ contaId, data: linha.tx.data, plano, ofxFitid: linha.tx.fitid, observacoes: linha.tx.memo });
      toast.success(plano.saldoPendente > 0 ? `Pago parcialmente — saldo pendente ${brl(plano.saldoPendente)}` : "Documento liquidado e conciliado com o extrato");
      await onFeito();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível liquidar");
    } finally { setGravando(false); }
  }

  return (
    <Dialog open={!!linha} onOpenChange={(v) => { if (!v && !gravando) onFechar(); }}>
      <DialogContent className="max-w-lg w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold" /> {diverge ? "Diferença entre o documento e o extrato" : "Liquidar documento pelo extrato"}
          </DialogTitle>
          {linha && (
            <DialogDescription>
              Extrato de {dataBr(linha.tx.data)}: <strong>{linha.tx.memo}</strong> — saída de <strong className="tabular-nums">{brl(linha.tx.valor)}</strong>.
              {alvo && <> Documento previsto: <strong>{alvo.documento.descricao ?? "sem descrição"}</strong>, vencimento {dataBr(alvo.documento.data)}, <strong className="tabular-nums">{brl(alvo.documento.valor)}</strong>.</>}
            </DialogDescription>
          )}
        </DialogHeader>

        {linha && candidatos.length > 1 && (
          <RadioGroup value={String(escolhido)} onValueChange={(v) => { setEscolhido(Number(v)); setPlano(null); }} className="gap-1.5">
            <p className="text-xs">{ambiguo ? "O fornecedor tem mais de um documento em aberto e nenhum com este valor. Qual contrato este pagamento quitou?" : "Mais de um documento combina. Qual este pagamento quitou?"}</p>
            {candidatos.map((c, i) => (
              <label key={c.documento.id} className="flex items-center gap-2 text-xs rounded border px-2 py-1">
                <RadioGroupItem value={String(i)} />
                <span className="min-w-0 flex-1 truncate">{c.documento.descricao ?? "Documento"} · vence {dataBr(c.documento.data)}{c.exato && <span className="text-success-text"> · valor igual · {c.confianca}%</span>}</span>
                <span className="tabular-nums font-medium">{brl(c.documento.valor)}</span>
              </label>
            ))}
          </RadioGroup>
        )}

        {linha && alvo && (
          <LiquidacaoPainel
            key={`${linha.tx.fitid}-${alvo.documento.id}`}
            lancamento={{ id: alvo.documento.id, valor: alvo.documento.valor, data: alvo.documento.data, fornecedor_id: alvo.documento.fornecedor_id }}
            valorPagoFixo={linha.tx.valor}
            onPlano={setPlano}
          />
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onFechar} disabled={gravando}>Agora não</Button>
          <Button type="button" variant="success" onClick={confirmar} disabled={gravando || !plano?.pronto}>
            {gravando ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
