import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, FileText, ExternalLink, Trash2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  uploadDocumentoFiscal, listarDocumentosObrigacao,
  excluirDocumentoFiscal, urlDocumentoFiscal,
  type FiscalDocumento, type FiscalDocTipo,
} from "@/services/fiscalService";

const TIPO_LABEL: Record<FiscalDocTipo, string> = {
  guia: "Guia / Boleto",
  comprovante: "Comprovante de pagamento",
  recibo: "Recibo / Protocolo",
  outro: "Outro documento",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  agendaId: string;
  nomeObrigacao: string;
  onChange?: () => void;
}

export function DocumentosFiscaisDialog({ open, onOpenChange, agendaId, nomeObrigacao, onChange }: Props) {
  const [docs, setDocs] = useState<FiscalDocumento[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<FiscalDocTipo>("comprovante");
  const [obs, setObs] = useState("");

  async function carregar() {
    setLoading(true);
    try { setDocs(await listarDocumentosObrigacao(agendaId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, agendaId]);

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    try {
      await uploadDocumentoFiscal(agendaId, arquivo, tipo, obs || undefined);
      toast.success("Documento anexado");
      setArquivo(null); setObs("");
      await carregar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  async function ver(doc: FiscalDocumento) {
    try {
      const url = await urlDocumentoFiscal(doc.storage_path);
      window.open(url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao abrir");
    }
  }

  async function excluir(doc: FiscalDocumento) {
    if (!confirm(`Excluir "${doc.nome_arquivo}"?`)) return;
    try {
      await excluirDocumentoFiscal(doc);
      toast.success("Documento removido");
      await carregar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao excluir");
    }
  }

  const fmtTam = (b: number | null) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024*1024) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1024/1024).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-gold" /> Documentos — {nomeObrigacao}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Anexe guias, comprovantes e recibos. Tudo vai pro Malote ZIP do mês.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <Label className="text-xs">Anexar novo documento</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FiscalDocTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            placeholder="Observação (opcional)"
            value={obs}
            onChange={e => setObs(e.target.value)}
            className="text-xs"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={enviar} disabled={!arquivo || enviando} className="gap-2">
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Enviar
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-1.5 max-h-80 overflow-y-auto pt-1">
          {loading && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Carregando...
            </div>
          )}
          {!loading && docs.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              Nenhum documento anexado ainda.
            </div>
          )}
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-xs">
              <FileText className="w-3.5 h-3.5 text-gold shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{d.nome_arquivo}</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-[9px]">{TIPO_LABEL[d.tipo]}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {fmtTam(d.tamanho_bytes)} · {new Date(d.enviado_em).toLocaleString("pt-BR")}
                  {d.observacao && ` · ${d.observacao}`}
                </div>
              </div>
              <button onClick={() => ver(d)} title="Abrir" className="p-1 hover:bg-muted rounded">
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
              </button>
              <button onClick={() => excluir(d)} title="Excluir" className="p-1 hover:bg-rose-50 rounded">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
