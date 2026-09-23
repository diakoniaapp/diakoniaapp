// ─── useAcoesLancamento.tsx — pagar, aprovar e rejeitar sem trocar de tela ──
//
// Fase 10 do roadmap Financeiro ERP (22/09/2026): "Central Operacional
// Financeira" — o pedido explícito foi "o usuário deve conseguir realizar
// trabalho financeiro sem navegar entre múltiplas telas". Até aqui, Pagar/
// Aprovar/Rejeitar só existiam dentro de `FinancasAgenda.tsx` — o Painel da
// Tesouraria mostrava a mesma fila, mas só como link "abrir agenda".
//
// Em vez de copiar os três diálogos pro Painel (duplicando a mesma lógica
// de Pix/QR/anexo que a Fase 8 já escreveu), este hook isola o que é
// COMPORTAMENTO — estado, chamadas de serviço, os três diálogos prontos —
// de onde ele é DISPARADO. Qualquer tela que já carregue vencimentos ou
// pendências (Agenda, Painel da Tesouraria) monta `{dialogs}` uma vez e
// chama `pagar(v)`/`aprovar(l)`/`rejeitar(l)` a partir da própria lista.
//
// `FinancasAgenda.tsx` foi refeito pra usar este hook em vez da cópia local
// — prova que a extração não mudou comportamento nenhum, só o lugar onde
// mora.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Loader2, Copy, QrCode, Paperclip, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  confirmarPagamento, aprovarLancamento, rejeitarLancamento,
  buscarFornecedor, adicionarAnexo, brl,
  type FinVencimento, type FinLancamentoExtenso, type FinFornecedor,
} from "@/services/finService";
import { montarPayloadPix, formatarChavePix } from "@/lib/pix";
import QRCode from "qrcode";
import { mensagemErro } from "@/lib/erroRede";

export function useAcoesLancamento(onChanged: () => void | Promise<void>) {
  const [aprovando, setAprovando] = useState<FinLancamentoExtenso | null>(null);
  const [rejeitando, setRejeitando] = useState<FinLancamentoExtenso | null>(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [decidindo, setDecidindo] = useState(false);

  // `confirm()` nativo não dispara em WebView (CLAUDE.md Risco 3) — por
  // isso os três são AlertDialog/Dialog, nunca `window.confirm`.
  const [confirmando, setConfirmando] = useState<FinVencimento | null>(null);
  const [confirmandoBusy, setConfirmandoBusy] = useState(false);

  // Central de Pagamentos (Fase 8): Pix pronto pra copiar/escanear e anexo
  // opcional no mesmo instante da confirmação — só pra saída.
  const [fornecedorPagando, setFornecedorPagando] = useState<FinFornecedor | null>(null);
  const [carregandoFornecedor, setCarregandoFornecedor] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [anexoArquivo, setAnexoArquivo] = useState<File | null>(null);

  useEffect(() => {
    if (!confirmando || confirmando.tipo !== "saida" || !confirmando.fornecedor_id) {
      setFornecedorPagando(null);
      setQrDataUrl(null);
      return;
    }
    let cancelado = false;
    setCarregandoFornecedor(true);
    buscarFornecedor(confirmando.fornecedor_id)
      .then(f => {
        if (cancelado) return;
        setFornecedorPagando(f);
        if (f?.chave_pix) {
          const payload = montarPayloadPix({
            chave: f.chave_pix, tipoChave: f.tipo_chave_pix, nomeRecebedor: f.nome, valor: Number(confirmando.valor),
          });
          // Erro no QR não pode travar o "Pagar" — Copiar Pix continua
          // funcionando mesmo se isso falhar.
          QRCode.toDataURL(payload, { margin: 1, width: 220 })
            .then(url => { if (!cancelado) setQrDataUrl(url); })
            .catch(() => { if (!cancelado) setQrDataUrl(null); });
        } else {
          setQrDataUrl(null);
        }
      })
      .finally(() => { if (!cancelado) setCarregandoFornecedor(false); });
    return () => { cancelado = true; };
  }, [confirmando]);

  async function confirmarPagamentoDialog() {
    if (!confirmando) return;
    setConfirmandoBusy(true);
    try {
      await confirmarPagamento(confirmando.id);
      // Anexo é melhoria, não pré-requisito — uma falha só no upload não
      // pode desfazer ou travar um pagamento que já foi confirmado.
      if (anexoArquivo) {
        try {
          await adicionarAnexo(confirmando.id, anexoArquivo, "comprovante");
        } catch (e: any) {
          toast.error(`Pago, mas o comprovante não subiu: ${e?.message ?? "erro"}`);
        }
      }
      toast.success(`${confirmando.tipo === "saida" ? "Pago" : "Recebido"}!`);
      setConfirmando(null);
      setAnexoArquivo(null);
      await onChanged();
    } catch (e: any) {
      toast.error(mensagemErro(e, "Não foi possível confirmar"));
    }
    finally { setConfirmandoBusy(false); }
  }

  async function confirmarAprovacao() {
    if (!aprovando) return;
    setDecidindo(true);
    try {
      await aprovarLancamento(aprovando.id);
      toast.success("Aprovado");
      setAprovando(null);
      await onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setDecidindo(false); }
  }

  async function confirmarRejeicao() {
    if (!rejeitando || !motivoRejeicao.trim()) return;
    setDecidindo(true);
    try {
      await rejeitarLancamento(rejeitando.id, motivoRejeicao);
      toast.success("Rejeitado");
      setRejeitando(null);
      setMotivoRejeicao("");
      await onChanged();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setDecidindo(false); }
  }

  const dialogs = (
    <>
      {/* ── Aprovar ── */}
      <AlertDialog open={!!aprovando} onOpenChange={(v) => !v && setAprovando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {aprovando && (
                <>
                  {aprovando.tipo === "saida" ? "Pagamento" : "Recebimento"} de{" "}
                  <strong className="text-foreground">{brl(Number(aprovando.valor))}</strong>
                  {" "}— {aprovando.descricao ?? "sem descrição"}.
                  {" "}Vira <strong className="text-foreground">realizado</strong>, com data de
                  pagamento hoje.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={decidindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarAprovacao} disabled={decidindo}
              className="bg-success hover:bg-success text-white">
              {decidindo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aprovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Rejeitar — pede o motivo, por isso é Dialog e não AlertDialog:
          o botão de confirmar precisa ficar desabilitado até haver texto. */}
      <Dialog open={!!rejeitando} onOpenChange={(v) => { if (!v) { setRejeitando(null); setMotivoRejeicao(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar lançamento</DialogTitle>
            <DialogDescription>
              {rejeitando && (
                <>
                  {brl(Number(rejeitando.valor))} — {rejeitando.descricao ?? "sem descrição"}.
                  {" "}Vira <strong className="text-foreground">cancelado</strong>. O motivo fica
                  registrado nas observações do lançamento.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoRejeicao}
            onChange={(e) => setMotivoRejeicao(e.target.value)}
            placeholder="Por que está sendo rejeitado?"
            rows={3}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" disabled={decidindo}
              onClick={() => { setRejeitando(null); setMotivoRejeicao(""); }}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={decidindo || !motivoRejeicao.trim()}
              onClick={confirmarRejeicao}>
              {decidindo ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rejeitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmar pagamento/recebimento — Central de Pagamentos (Fase 8) ── */}
      <AlertDialog open={!!confirmando} onOpenChange={(v) => { if (!v) { setConfirmando(null); setAnexoArquivo(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirmar {confirmando?.tipo === "saida" ? "pagamento" : "recebimento"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmando?.descricao ?? "Este lançamento"} — {confirmando && brl(Number(confirmando.valor))}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmando?.tipo === "saida" && (
            <div className="space-y-2.5">
              {carregandoFornecedor && (
                <p className="text-xs text-muted-foreground">Carregando dados do fornecedor…</p>
              )}
              {fornecedorPagando?.chave_pix && (
                <div className="rounded-md border bg-muted/20 p-2.5 space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-gold" /> Pix de {fornecedorPagando.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatarChavePix(fornecedorPagando.chave_pix, fornecedorPagando.tipo_chave_pix)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="gap-1.5"
                      onClick={() => {
                        const payload = montarPayloadPix({
                          chave: fornecedorPagando.chave_pix!, tipoChave: fornecedorPagando.tipo_chave_pix,
                          nomeRecebedor: fornecedorPagando.nome, valor: Number(confirmando.valor),
                        });
                        navigator.clipboard.writeText(payload);
                        toast.success("Código Pix copiado — cole no app do seu banco");
                      }}>
                      <Copy className="w-3.5 h-3.5" /> Copiar Pix
                    </Button>
                    {qrDataUrl && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5" /> ou escaneie:
                      </span>
                    )}
                  </div>
                  {qrDataUrl && (
                    <img src={qrDataUrl} alt="QR Code do Pix" width={140} height={140}
                      className="rounded border bg-white p-1 mx-auto" />
                  )}
                </div>
              )}
              {!carregandoFornecedor && confirmando.fornecedor_id && !fornecedorPagando?.chave_pix && (
                <p className="text-xs text-muted-foreground">
                  Este fornecedor ainda não tem chave Pix cadastrada.{" "}
                  <Link to={`/financas/fornecedor/${confirmando.fornecedor_id}`} className="text-primary hover:underline">
                    Cadastrar
                  </Link>
                </p>
              )}

              <div>
                <label className="text-xs font-medium flex items-center gap-1.5 mb-1 cursor-pointer">
                  <Paperclip className="w-3.5 h-3.5" /> Anexar comprovante (opcional)
                </label>
                <input type="file" accept="image/jpeg,image/png,application/pdf"
                  onChange={(e) => setAnexoArquivo(e.target.files?.[0] ?? null)}
                  className="text-xs w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-background" />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarPagamentoDialog(); }} disabled={confirmandoBusy}
              className="bg-success hover:bg-success text-white">
              {confirmandoBusy ? "..." : (confirmando?.tipo === "saida" ? "Marcar como pago" : "Receber")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    pagar: (v: FinVencimento) => setConfirmando(v),
    aprovar: (l: FinLancamentoExtenso) => setAprovando(l),
    rejeitar: (l: FinLancamentoExtenso) => setRejeitando(l),
    dialogs,
  };
}

/** Botão "Pagar"/"Receber" pronto — mesmo estilo nas duas telas que o usam. */
export function BotaoPagar({ vencimento, onClick }: { vencimento: FinVencimento; onClick: () => void }) {
  return (
    <Button size="sm" onClick={onClick}
      className="bg-success hover:bg-success text-white gap-1 h-7 text-xs shrink-0">
      <CheckCircle2 className="w-3 h-3" /> {vencimento.tipo === "saida" ? "Pagar" : "Receber"}
    </Button>
  );
}

/** Par "Aprovar"/"Rejeitar" pronto — mesmo estilo nas duas telas que o usam. */
export function BotoesAprovacao({ onAprovar, onRejeitar }: { onAprovar: () => void; onRejeitar: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button size="sm" variant="outline" onClick={onRejeitar}
        className="gap-1 h-7 text-xs text-destructive-text hover:text-destructive-text border-destructive-line hover:bg-destructive-soft">
        <XCircle className="w-3 h-3" /> Rejeitar
      </Button>
      <Button size="sm" onClick={onAprovar}
        className="bg-success hover:bg-success text-white gap-1 h-7 text-xs">
        <CheckCircle2 className="w-3 h-3" /> Aprovar
      </Button>
    </div>
  );
}
