import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    if (!confirm("Encerrar o caixa definitivamente? Não dá pra registrar mais vendas depois.")) return;
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
            <Label className="text-[11px]">Por forma de pagamento</Label>
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
            <div className="border rounded-md p-3 bg-rose-50/30">
              <Label className="text-[11px] flex items-center gap-1">
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
              <Label className="text-[11px]">Movimentos do livro-razão</Label>
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
              <Label className="text-[11px] flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Vendas registradas
              </Label>
              <div className="max-h-40 overflow-y-auto mt-1">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {vendasAtivas.slice(0, 20).map(v => (
                      <tr key={v.id}>
                        <td className="py-0.5">{new Date(v.data_venda).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="text-muted-foreground">{v.forma_pagamento}</td>
                        <td className="text-right tabular-nums">{fmtBR(v.valor_total)}</td>
                      </tr>
                    ))}
                    {vendasAtivas.length > 20 && (
                      <tr><td colSpan={3} className="text-center text-muted-foreground text-[10px] py-1">
                        + {vendasAtivas.length - 20} venda(s) anteriores
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="print:hidden">
            <Label className="text-[11px]">Observação</Label>
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
            <p className="text-center text-[10px] text-muted-foreground mt-6">
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
          <Button onClick={confirmar} disabled={fechando}
            className="bg-rose-600 hover:bg-rose-700 gap-1.5">
            {fechando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Fechar caixa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ titulo, valor, cor, destaque }: { titulo: string; valor: string; cor?: string; destaque?: boolean }) {
  const corClasses: Record<string, string> = { emerald: "text-emerald-700", rose: "text-rose-700" };
  return (
    <div className={"border rounded-md p-2 " + (destaque ? "border-emerald-300 bg-emerald-50/40" : "")}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</div>
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
