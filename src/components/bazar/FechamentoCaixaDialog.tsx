import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Printer, CheckCircle2, X, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { previewFechamento, fecharCaixa, type ResumoFechamento } from "@/services/bazarService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  campanhaId: string;
  tipo: "diario" | "final";
  data?: string;
  onFechado?: () => void;
}

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function FechamentoCaixaDialog({ open, onOpenChange, campanhaId, tipo, data, onFechado }: Props) {
  const [preview, setPreview] = useState<ResumoFechamento | null>(null);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    previewFechamento(campanhaId, tipo === "diario" ? (data ?? new Date().toISOString().slice(0,10)) : undefined)
      .then(setPreview)
      .finally(() => setLoading(false));
  }, [open, campanhaId, tipo, data]);

  async function confirmar() {
    if (tipo === "final" && !confirm("Encerrar a campanha definitivamente? Não dá pra voltar atrás.")) return;
    setSalvando(true);
    try {
      await fecharCaixa(campanhaId, tipo, data, observacao || undefined);
      toast.success(tipo === "diario" ? "Caixa do dia fechado" : "Campanha encerrada");
      onFechado?.();
      onOpenChange(false);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  if (loading || !preview) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="py-8 text-center text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /> Calculando...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {tipo === "diario" ? "Fechamento do dia" : "Encerramento do evento"}
            {" · "}
            <span className="text-muted-foreground text-sm font-normal">{preview.campanha_nome}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="hidden print:block text-center mb-3">
            <h1 className="font-serif text-2xl">Quarta Igreja Batista do Rio de Janeiro</h1>
            <h2 className="text-base mt-1">
              {tipo === "diario" ? "Fechamento Diário" : "Relatório Final"} — {preview.campanha_nome}
            </h2>
            <p className="text-xs">Gerado em {new Date().toLocaleString("pt-BR")}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Bloco titulo="Vendas" valor={`${preview.qtd_vendas}`} />
            <Bloco titulo="Bruto" valor={fmtBR(preview.total_bruto)} cor="emerald" />
            <Bloco titulo="Custos" valor={fmtBR(preview.total_custos)} cor="rose" />
            <Bloco titulo="Líquido" valor={fmtBR(preview.total_liquido)} destaque />
          </div>

          <div className="border rounded-md p-3">
            <Label className="text-[11px]">Por forma de pagamento</Label>
            <table className="w-full text-xs mt-1">
              <tbody className="divide-y">
                {Object.entries(preview.vendas_por_forma).map(([forma, total]) => (
                  <tr key={forma}><td className="py-1 capitalize">{forma}</td><td className="py-1 text-right tabular-nums font-medium">{fmtBR(total)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.total_taxas > 0 && (
            <div className="border rounded-md p-3 bg-rose-50/30">
              <Label className="text-[11px] flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Taxas descontadas</Label>
              <table className="w-full text-xs mt-1">
                <tbody className="divide-y">
                  {preview.taxa_debito > 0 && <tr><td>Débito ({preview.taxa_debito_pct}%)</td><td className="text-right tabular-nums">{fmtBR(preview.taxa_debito)}</td></tr>}
                  {preview.taxa_credito > 0 && <tr><td>Crédito ({preview.taxa_credito_pct}%)</td><td className="text-right tabular-nums">{fmtBR(preview.taxa_credito)}</td></tr>}
                  {preview.taxa_pix > 0 && <tr><td>PIX ({preview.taxa_pix_pct}%)</td><td className="text-right tabular-nums">{fmtBR(preview.taxa_pix)}</td></tr>}
                  <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{fmtBR(preview.total_taxas)}</td></tr>
                </tbody>
              </table>
            </div>
          )}

          {preview.top_vendedores.length > 0 && (
            <div className="border rounded-md p-3">
              <Label className="text-[11px] flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Top vendedores</Label>
              <table className="w-full text-xs mt-1">
                <tbody className="divide-y">
                  {preview.top_vendedores.map((v, i) => (
                    <tr key={i}><td>{v.vendedor}</td><td className="text-right text-muted-foreground">{v.qtd} venda(s)</td><td className="text-right tabular-nums font-medium">{fmtBR(v.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="print:hidden">
            <Label className="text-[11px]">Observação</Label>
            <Textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Ex: caixa conferido, sem divergências" className="mt-1 text-xs" />
          </div>

          {/* Assinatura — só aparece na impressão */}
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
          <Button onClick={confirmar} disabled={salvando}
            className={tipo === "final" ? "bg-rose-600 hover:bg-rose-700 gap-1.5" : "bg-emerald-600 hover:bg-emerald-700 gap-1.5"}>
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {tipo === "diario" ? "Confirmar fechamento" : "Encerrar evento"}
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
