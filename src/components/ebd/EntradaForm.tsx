import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Camera, FileUp, X, FileText, Image as ImageIcon } from "lucide-react";
import {
  registrarEntrada, atualizarEntrada, uploadComprovante, removerComprovante,
  CENTAVOS_SIMBOLICOS, COMPROVANTE_MAX_BYTES,
  type EntradaEbd,
} from "@/services/ebdService";

interface Props {
  campanhaId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  /** Se vier preenchido, o form abre em modo edição. */
  entrada?: EntradaEbd | null;
}

export function EntradaForm({ campanhaId, open, onOpenChange, onSaved, entrada }: Props) {
  const isEdit = !!entrada;

  const [valor, setValor] = useState<number>(0);
  const [tipo, setTipo] = useState<EntradaEbd["tipo"]>("oferta");
  const [forma, setForma] = useState<EntradaEbd["forma"]>("envelope");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [descricao, setDescricao] = useState("");
  const [usarSimbolico, setUsarSimbolico] = useState(true);
  const [busy, setBusy] = useState(false);

  // Comprovante
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [comprovanteAtual, setComprovanteAtual] = useState<string | null>(null); // path no storage
  const [removerAtual, setRemoverAtual] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (entrada) {
      setValor(entrada.valor);
      setTipo(entrada.tipo);
      setForma(entrada.forma);
      setData(entrada.data);
      setDescricao(entrada.descricao ?? "");
      setUsarSimbolico(false); // em edição, valor já vem como tá
      setComprovanteAtual(entrada.comprovante_url ?? null);
    } else {
      setValor(0);
      setTipo("oferta");
      setForma("envelope");
      setData(new Date().toISOString().slice(0, 10));
      setDescricao("");
      setUsarSimbolico(true);
      setComprovanteAtual(null);
    }
    setArquivo(null);
    setPreviewUrl(null);
    setRemoverAtual(false);
  }, [open, entrada]);

  // Preview do arquivo novo (apenas para imagens)
  useEffect(() => {
    if (!arquivo) { setPreviewUrl(null); return; }
    if (!arquivo.type.startsWith("image/")) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(arquivo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  const valorFinal = isEdit ? valor : (usarSimbolico ? valor + CENTAVOS_SIMBOLICOS : valor);

  function escolheArquivo(file: File | null) {
    if (!file) return;
    if (file.size > COMPROVANTE_MAX_BYTES) {
      toast.error(`Arquivo grande demais — máximo ${COMPROVANTE_MAX_BYTES / 1024 / 1024} MB`);
      return;
    }
    setArquivo(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valor <= 0) { toast.error("Valor precisa ser maior que zero"); return; }

    if (isEdit && !confirm("Confirma a alteração desta entrada?\nO valor anterior será sobrescrito.")) return;

    setBusy(true);
    try {
      // 1) Resolver comprovante
      let comprovanteFinal: string | null = comprovanteAtual;
      if (removerAtual && comprovanteAtual) {
        await removerComprovante(comprovanteAtual);
        comprovanteFinal = null;
      }
      if (arquivo) {
        // se já existia e está sendo trocado, apaga o antigo
        if (comprovanteAtual && !removerAtual) {
          await removerComprovante(comprovanteAtual);
        }
        comprovanteFinal = await uploadComprovante(arquivo, campanhaId);
      }

      // 2) Persistir entrada
      if (isEdit && entrada) {
        await atualizarEntrada(entrada.id, {
          data, valor: valorFinal, tipo, forma,
          descricao: descricao.trim() || null,
          comprovante_url: comprovanteFinal,
        });
        toast.success("Entrada atualizada");
      } else {
        await registrarEntrada(campanhaId, {
          data, valor: valorFinal, tipo, forma,
          descricao: descricao.trim() || null,
          comprovante_url: comprovanteFinal,
        });
        toast.success(`Entrada registrada: R$ ${valorFinal.toFixed(2)}`);
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  const temComprovanteParaMostrar = (comprovanteAtual && !removerAtual) || arquivo;
  const arquivoEhPdf = arquivo?.type === "application/pdf" || (comprovanteAtual?.toLowerCase().endsWith(".pdf") && !arquivo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            {isEdit ? "Editar entrada" : "Registrar entrada"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "Altere os dados desta entrada." : "Quanto entrou para a campanha?"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Valor (R$) *</Label>
            <Input
              type="number" min={0.01} step="0.01" required
              value={valor || ""}
              onChange={(e) => setValor(Number(e.target.value))}
              placeholder="Ex: 50.00"
              autoFocus
            />
          </div>

          {!isEdit && (
            <label className={`flex items-start gap-2 text-sm cursor-pointer p-2 rounded border ${usarSimbolico ? "bg-gold/5 border-gold/30" : "bg-muted/30"}`}>
              <input
                type="checkbox"
                checked={usarSimbolico}
                onChange={(e) => setUsarSimbolico(e.target.checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className={`w-3.5 h-3.5 ${usarSimbolico ? "text-gold" : "text-muted-foreground"}`} />
                  <span className="font-medium">Adicionar R$ 0,10 simbólicos</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Identifica essa entrada como oferta de campanha (útil ao bater no extrato).
                  {usarSimbolico && valor > 0 && (
                    <> Valor final: <strong>R$ {valorFinal.toFixed(2)}</strong></>
                  )}
                </p>
              </div>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="oferta">Oferta direta</SelectItem>
                  <SelectItem value="evento">Evento</SelectItem>
                  <SelectItem value="produto">Produto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma *</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="envelope">Envelope</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Data *</Label>
            <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
          </div>

          <div>
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Maria do louvor, Almoço do mês, Artesanato Joana" />
          </div>

          {/* ── Comprovante ── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              📎 Comprovante (opcional)
            </Label>

            {!temComprovanteParaMostrar && (
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30 transition-colors text-center">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">Tirar foto</span>
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,application/pdf"
                    className="hidden"
                    onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)}
                  />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30 transition-colors text-center">
                    <FileUp className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">Escolher arquivo</span>
                  </div>
                </label>
              </div>
            )}

            {temComprovanteParaMostrar && (
              <div className="border rounded-md p-2 flex items-center gap-3 bg-muted/30">
                {previewUrl ? (
                  <img src={previewUrl} alt="preview" className="w-14 h-14 object-cover rounded" />
                ) : arquivoEhPdf ? (
                  <div className="w-14 h-14 flex items-center justify-center bg-rose-50 rounded">
                    <FileText className="w-6 h-6 text-rose-500" />
                  </div>
                ) : (
                  <div className="w-14 h-14 flex items-center justify-center bg-muted rounded">
                    <ImageIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">
                    {arquivo
                      ? arquivo.name
                      : "Comprovante atual"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {arquivo
                      ? `${(arquivo.size / 1024).toFixed(0)} KB`
                      : "Substitua escolhendo outro arquivo"}
                  </p>
                </div>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (arquivo) {
                      setArquivo(null);
                    } else {
                      setRemoverAtual(true);
                    }
                  }}
                  title="Remover"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              JPG, PNG ou PDF. Máx 5 MB.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline"
              onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "..." : (isEdit ? "Salvar alterações" : "Registrar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
