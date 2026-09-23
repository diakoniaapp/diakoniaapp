// ─── AnexosLancamentoDialog.tsx — ver/gerenciar os anexos de um lançamento ──
//
// Fase 7 do roadmap Financeiro ERP já tinha construído o schema e o serviço
// (`fin_lancamento_anexos`, `listarAnexos`/`adicionarAnexo`/`removerAnexo` em
// `finService.ts`) e até um upload de UM anexo embutido no diálogo de
// confirmar pagamento (`FinancasAgenda.tsx`) — mas nenhuma tela deixava ver
// ou apagar o que já foi anexado. Esta é essa tela, pedida explicitamente em
// 22/09/2026 como a última peça pendente da Fase 9.
//
// Copiado de `components/fiscal/DocumentosFiscaisDialog.tsx` — mesmo
// problema (lista de arquivos por registro, enviar/abrir/excluir), mesmo
// bucket por trás (`fin-comprovantes`, reaproveitado — não é uma segunda
// regra de LGPD pro mesmo tipo de dado sensível). Duas diferenças do
// original: `FinLancamentoAnexo` não guarda `tamanho_bytes` nem
// `observacao` (não existem essas colunas em `fin_lancamento_anexos`), então
// a lista mostra só nome, tipo e data — nada inventado que o banco não tem.

import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Upload, FileText, ExternalLink, Trash2, Files } from "lucide-react";
import { toast } from "sonner";
import {
  listarAnexos, adicionarAnexo, removerAnexo, anexoSignedUrl,
  type FinLancamentoAnexo, type FinAnexoTipo,
} from "@/services/finService";

const TIPO_LABEL: Record<FinAnexoTipo, string> = {
  documento: "Documento",
  xml: "XML",
  comprovante: "Comprovante de pagamento",
  outro: "Outro",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lancamentoId: string;
  descricaoLancamento: string;
  onChange?: () => void;
}

export function AnexosLancamentoDialog({ open, onOpenChange, lancamentoId, descricaoLancamento, onChange }: Props) {
  const [anexos, setAnexos] = useState<FinLancamentoAnexo[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState<FinAnexoTipo>("documento");
  // `confirm()` nativo não dispara em WebView (CLAUDE.md Risco 3) — mesmo
  // AlertDialog de confirmação que `DocumentosFiscaisDialog` já usa.
  const [apagando, setApagando] = useState<FinLancamentoAnexo | null>(null);
  const [apagandoBusy, setApagandoBusy] = useState(false);

  async function carregar() {
    setLoading(true);
    try { setAnexos(await listarAnexos(lancamentoId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, lancamentoId]);

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    try {
      await adicionarAnexo(lancamentoId, arquivo, tipo);
      toast.success("Anexo enviado");
      setArquivo(null);
      await carregar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  async function ver(anexo: FinLancamentoAnexo) {
    try {
      const url = await anexoSignedUrl(anexo.url);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else toast.error("Não foi possível abrir o anexo");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao abrir");
    }
  }

  async function confirmarExcluir() {
    if (!apagando) return;
    setApagandoBusy(true);
    try {
      await removerAnexo(apagando.id);
      toast.success("Anexo removido");
      setApagando(null);
      await carregar();
      onChange?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao excluir");
    } finally {
      setApagandoBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="w-4 h-4 text-gold" /> Anexos — {descricaoLancamento}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Documento, XML ou comprovante deste lançamento — quantos precisar, cada um com o próprio tipo.
          </DialogDescription>
        </DialogHeader>

        {/* Upload */}
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <Label className="text-xs">Anexar novo arquivo</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="md:col-span-2">
              <Input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.xml"
                onChange={e => setArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FinAnexoTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          {!loading && anexos.length === 0 && (
            <div className="text-center py-4 text-xs text-muted-foreground">
              Nenhum anexo enviado ainda.
            </div>
          )}
          {anexos.map(a => (
            <div key={a.id} className="flex items-center gap-2 border rounded-md px-2 py-1.5 text-xs">
              <FileText className="w-3.5 h-3.5 text-gold shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{a.nome ?? "Sem nome"}</span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-xs">{TIPO_LABEL[a.tipo]}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.enviado_em).toLocaleString("pt-BR")}
                </div>
              </div>
              <button onClick={() => ver(a)} title="Abrir" className="p-1 hover:bg-muted rounded">
                <ExternalLink className="w-3.5 h-3.5 text-info-text" />
              </button>
              <button onClick={() => setApagando(a)} title="Excluir" className="p-1 hover:bg-destructive-soft rounded">
                <Trash2 className="w-3.5 h-3.5 text-destructive-text" />
              </button>
            </div>
          ))}
        </div>
      </DialogContent>

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo?</AlertDialogTitle>
            <AlertDialogDescription>
              "{apagando?.nome ?? "Este arquivo"}" — não pode ser desfeito.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagandoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmarExcluir(); }} disabled={apagandoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {apagandoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
