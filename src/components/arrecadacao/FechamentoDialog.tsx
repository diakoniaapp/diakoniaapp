import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, CheckCircle2, X, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  carregarResumoCaixa, listarVendasCaixa, fecharCaixa, moverCaixaParaConciliando,
  type CaixaResumo, type Venda,
} from "@/services/arrecadacaoService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  caixaId: string;
  reservaFinalidade: string;
  espacoNome?: string;
  onFechado?: () => void;
}

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FechamentoDialog({ open, onOpenChange, caixaId, reservaFinalidade, espacoNome, onFechado }: Props) {
  const [resumo, setResumo] = useState<CaixaResumo | null>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [fechando, setFechando] = useState(false);
  // confirm() nativo não funciona em WebView (Risco 3 do CLAUDE.md)
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      carregarResumoCaixa(caixaId),
      listarVendasCaixa(caixaId),
    ]).then(([r, v]) => { setResumo(r); setVendas(v); })
      .finally(() => setLoading(false));
  }, [open, caixaId]);

  async function confirmar() {
    setFechando(true);
    try {
      await moverCaixaParaConciliando(caixaId);
      await fecharCaixa(caixaId, observacao || undefined);
      toast.success("Caixa fechado");
      onFechado?.();
      onOpenChange(false);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setFechando(false); }
  }

  if (loading || !resumo) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /> Calculando...</div>
        </DialogContent>
      </Dialog>
    );
  }

  const vendasAtivas = vendas.filter(v => !v.cancelada);

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relatorio-page max-w-2xl">
        {/* Impressão — achado ao revisar todas as telas de impressão
            (17/09/2026, pedido da Telma: "está limitando apenas para
            alguns dados"). Este Dialog nunca tinha o escape do `<main>` do
            AppLayout nem do próprio `DialogContent` — que por padrão
            (`components/ui/dialog.tsx`) é `position: fixed` com
            `max-h-[92vh] overflow-y-auto`: sem override, a impressão só
            capturava o que já estava visível dentro dessa caixa de 92vh
            rolada até onde a Telma estava olhando, cortando o resto do
            fechamento. Mesmo padrão de `FinancasConta.tsx`, adaptado pra
            cancelar o `fixed`/`transform`/altura máxima do Dialog. */}
        <style>{`
          @media print {
            @page { size: A4; margin: 1.5cm; }
            html, body { background: white !important; height: auto !important; overflow: visible !important; }
            body * { visibility: hidden !important; }
            .relatorio-page, .relatorio-page * { visibility: visible !important; }
            .relatorio-page {
              position: absolute !important;
              left: 0 !important; top: 0 !important; right: 0 !important;
              width: 100% !important; max-width: 100% !important;
              max-height: none !important; overflow: visible !important;
              transform: none !important;
              margin: 0 !important; padding: 0 !important;
              box-shadow: none !important; border: none !important;
              background: white !important;
            }
            .relatorio-page * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .relatorio-page .overflow-y-auto { overflow: visible !important; max-height: none !important; }
            .relatorio-page tr { page-break-inside: avoid; }
          }
        `}</style>
        <DialogHeader>
          <DialogTitle>Fechamento do caixa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {/* Cabeçalho de impressão */}
          <div className="hidden print:block text-center mb-3">
            <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
            <h2 className="text-base mt-1">Relatório de Caixa — {espacoNome}</h2>
            <p className="text-sm">{reservaFinalidade}</p>
            <p className="text-xs">Gerado em {new Date().toLocaleString("pt-BR")}</p>
          </div>

          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Bloco titulo="Vendas" valor={`${resumo.qtd_vendas}`} />
            <Bloco titulo="Bruto" valor={fmtBR(resumo.total_bruto)} cor="emerald" />
            <Bloco titulo="Custos" valor={fmtBR(resumo.total_custos)} cor="rose" />
            <Bloco titulo="LÍQUIDO" valor={fmtBR(resumo.saldo_virtual)} destaque />
          </div>

          {/* Por forma de pagamento */}
          <div className="border rounded-md p-3">
            <Label className="text-xs">Por forma de pagamento</Label>
            <table className="w-full text-xs mt-1">
              <tbody className="divide-y">
                <Linha label="Dinheiro" valor={resumo.total_dinheiro} />
                <Linha label="PIX" valor={resumo.total_pix} />
                <Linha label="Débito" valor={resumo.total_debito} />
                <Linha label="Crédito" valor={resumo.total_credito} />
                {resumo.total_outros > 0 && <Linha label="Outros" valor={resumo.total_outros} />}
              </tbody>
            </table>
          </div>

          {/* Taxas */}
          {(resumo.taxa_debito_calc + resumo.taxa_credito_calc + resumo.taxa_pix_calc) > 0 && (
            <div className="border rounded-md p-3 bg-destructive-soft/30">
              <Label className="text-xs flex items-center gap-1">
                <TrendingDown className="w-3 h-3" /> Taxas descontadas
              </Label>
              <table className="w-full text-xs mt-1">
                <tbody className="divide-y">
                  {resumo.taxa_debito_calc > 0  && <Linha label="Débito"  valor={resumo.taxa_debito_calc} />}
                  {resumo.taxa_credito_calc > 0 && <Linha label="Crédito" valor={resumo.taxa_credito_calc} />}
                  {resumo.taxa_pix_calc > 0     && <Linha label="PIX"     valor={resumo.taxa_pix_calc} />}
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="text-right tabular-nums">
                      {fmtBR(resumo.taxa_debito_calc + resumo.taxa_credito_calc + resumo.taxa_pix_calc)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Movimentos não-venda */}
          {(resumo.total_custos + resumo.total_reemb_pessoa + resumo.total_abate_cnpj + resumo.total_revertido) > 0 && (
            <div className="border rounded-md p-3">
              <Label className="text-xs">Movimentos do livro-razão</Label>
              <table className="w-full text-xs mt-1">
                <tbody className="divide-y">
                  {resumo.total_custos        > 0 && <Linha label="Custos"            valor={resumo.total_custos} />}
                  {resumo.total_reemb_pessoa  > 0 && <Linha label="Reembolso pessoa"  valor={resumo.total_reemb_pessoa} />}
                  {resumo.total_abate_cnpj    > 0 && <Linha label="Abate CNPJ"        valor={resumo.total_abate_cnpj} />}
                  {resumo.total_revertido     > 0 && <Linha label="Revertido Admin"   valor={resumo.total_revertido} />}
                </tbody>
              </table>
            </div>
          )}

          {/* Lista de vendas */}
          {vendasAtivas.length > 0 && (
            <div className="border rounded-md p-3">
              <Label className="text-xs flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Vendas registradas
              </Label>
              {/* Sem corte de 20 linhas (achado 17/09/2026): isto é o
                  registro oficial do fechamento — cortar vendas aqui é
                  perda de dado contábil, não só de tela. A rolagem
                  (`max-h-40 overflow-y-auto`) já resolve a usabilidade na
                  tela sem tirar nenhuma venda do DOM; a impressão cancela
                  esse limite (`.relatorio-page .overflow-y-auto` no
                  `<style>` acima) e mostra todas. */}
              <div className="max-h-40 overflow-y-auto mt-1">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {vendasAtivas.map(v => (
                      <tr key={v.id}>
                        <td className="py-0.5">{new Date(v.data_venda).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="text-muted-foreground">{v.forma_pagamento}</td>
                        <td className="text-right tabular-nums">{fmtBR(v.valor_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="print:hidden">
            <Label className="text-xs">Observação</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: caixa conferido, sem divergências" className="mt-1 text-xs" />
          </div>

          {/* Assinaturas — só na impressão */}
          <div className="hidden print:block pt-12 mt-12">
            <div className="grid grid-cols-2 gap-12">
              <div className="text-center">
                <div className="border-t border-foreground pt-1 text-xs">Responsável pelo caixa</div>
              </div>
              <div className="text-center">
                <div className="border-t border-foreground pt-1 text-xs">Tesouraria / Administração</div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-6">
              Quarta Igreja Batista do Rio de Janeiro · Diakonia APP
            </p>
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="gap-1.5 ml-auto">
            <X className="w-3.5 h-3.5" /> Cancelar
          </Button>
          <Button onClick={() => setConfirmando(true)} disabled={fechando}
            className="bg-destructive hover:bg-destructive gap-1.5">
            {fechando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Fechar caixa
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encerrar o caixa definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>
            Não dá pra registrar mais vendas depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={fechando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); setConfirmando(false); confirmar(); }}
            disabled={fechando}
          >
            {fechando ? "..." : "Fechar caixa"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function Bloco({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor?: string; destaque?: boolean }) {
  const corClasses: Record<string, string> = { emerald: "text-success-text", rose: "text-destructive-text" };
  return (
    <div className={"border rounded-md p-2 " + (destaque ? "border-success-line bg-success-soft/40" : "")}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</div>
      <div className={"text-base font-serif font-medium " + (cor ? corClasses[cor] : "")}>{valor}</div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right tabular-nums font-medium">{fmtBR(valor)}</td>
    </tr>
  );
}
