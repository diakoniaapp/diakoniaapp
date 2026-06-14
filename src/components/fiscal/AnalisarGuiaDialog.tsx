import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, FileSearch, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  analisarGuiaFiscal, uploadDocumentoFiscal, criarLancamentoFiscal,
  type AnaliseGuiaFiscal,
} from "@/services/fiscalService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendaId: string;
  nomeObrigacao: string;
  onAplicado?: () => void;
}

export function AnalisarGuiaDialog({ open, onOpenChange, agendaId, nomeObrigacao, onAplicado }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [analise, setAnalise] = useState<AnaliseGuiaFiscal | null>(null);
  const [rodando, setRodando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [valor, setValor] = useState("");

  async function rodarOCR() {
    if (!arquivo) return;
    setRodando(true);
    try {
      const r = await analisarGuiaFiscal(arquivo);
      setAnalise(r);
      if (r.valor_sugerido) setValor(String(r.valor_sugerido).replace(".", ","));
      toast.success(`OCR concluído (${r.ocr.duracaoMs}ms, ${r.ocr.confianca}% confiança)`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro no OCR");
    } finally {
      setRodando(false);
    }
  }

  async function aplicar() {
    if (!arquivo || !analise) return;
    const valorNum = Number(valor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor válido"); return;
    }
    setAplicando(true);
    try {
      // 1. Anexa o arquivo como guia
      await uploadDocumentoFiscal(agendaId, arquivo, "guia",
        `OCR: ${analise.ocr.confianca}% confiança`);
      // 2. Gera lançamento financeiro com o valor extraído
      await criarLancamentoFiscal(agendaId, valorNum,
        `${nomeObrigacao} (importado via OCR)`);
      toast.success("Guia analisada, anexada e lançamento criado");
      onAplicado?.();
      onOpenChange(false);
      setArquivo(null); setAnalise(null); setValor("");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao aplicar");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" /> Analisar guia com OCR
          </DialogTitle>
          <DialogDescription className="text-xs">
            Envie a guia (PDF/imagem) e a IA extrai valor, competência e tipo automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Arquivo da guia</Label>
            <Input type="file" accept=".pdf,.png,.jpg,.jpeg"
              onChange={e => { setArquivo(e.target.files?.[0] ?? null); setAnalise(null); }} />
          </div>

          <Button onClick={rodarOCR} disabled={!arquivo || rodando} className="w-full gap-2">
            {rodando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSearch className="w-3.5 h-3.5" />}
            {rodando ? "Analisando..." : "Rodar OCR"}
          </Button>

          {analise && (
            <div className="border rounded-md p-3 space-y-2 bg-emerald-50/40 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Campos extraídos
              </div>

              <Linha label="Tipo identificado">
                {analise.nome_obrigacao_sugerida ?
                  <span className="font-medium">{analise.nome_obrigacao_sugerida} ({analise.codigo_obrigacao_sugerido})</span> :
                  <span className="text-muted-foreground">— não identificado —</span>}
              </Linha>
              <Linha label="Competência">
                {analise.competencia_sugerida ?
                  new Date(analise.competencia_sugerida + "T00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) :
                  <span className="text-muted-foreground">não detectada</span>}
              </Linha>
              <Linha label="Vencimento">
                {analise.vencimento_sugerido ?
                  new Date(analise.vencimento_sugerido + "T00:00").toLocaleDateString("pt-BR") :
                  <span className="text-muted-foreground">não detectado</span>}
              </Linha>
              <Linha label="CNPJ">
                {analise.ocr.cnpjFormatado ?? <span className="text-muted-foreground">—</span>}
              </Linha>

              <div className="pt-1 border-t">
                <Label className="text-[11px]">Valor a lançar (confirme antes de aplicar)</Label>
                <Input value={valor} onChange={e => setValor(e.target.value)}
                  placeholder="0,00" className="mt-1" />
              </div>

              <Button onClick={aplicar} disabled={aplicando || !valor}
                className="w-full mt-2 gap-2 bg-emerald-600 hover:bg-emerald-700">
                {aplicando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Anexar guia e criar lançamento
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-32">{label}:</span>
      <span>{children}</span>
    </div>
  );
}
