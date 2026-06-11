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
import { TrendingUp, TrendingDown, Camera, FileUp, X, Paperclip, Sparkles, Loader2 } from "lucide-react";
import {
  listarContas, listarCategorias, listarCentrosCusto, listarFornecedores,
  criarLancamento, atualizarLancamento, uploadComprovante, removerComprovante,
  buscarFornecedorPorCnpj, criarFornecedor, sugerirCentroPorCategoria, brl,
  FORMA_LABEL, STATUS_LABEL,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinFornecedor,
  type FinLancamento, type FinMovimentoTipo, type FinFormaPagamento, type FinStatus,
  FIN_COMPROVANTE_MAX,
} from "@/services/finService";
import { extrairDadosDoComprovante, type OcrResultado } from "@/services/ocrService";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Conta pré-selecionada (vinda da tela de movimentação) */
  contaIdPadrao?: string;
  /** Tipo padrão (entrada/saida) */
  tipoPadrao?: FinMovimentoTipo;
  /** Lançamento em edição */
  lancamento?: FinLancamento | null;
  onSaved: () => void;
}

export function LancamentoForm({
  open, onOpenChange, contaIdPadrao, tipoPadrao = "entrada",
  lancamento, onSaved,
}: Props) {
  const isEdit = !!lancamento;

  const [tipo, setTipo] = useState<FinMovimentoTipo>(tipoPadrao);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [valor, setValor] = useState<number>(0);
  const [contaId, setContaId] = useState<string>("");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [centroCustoId, setCentroCustoId] = useState<string>("");
  const [fornecedorBusca, setFornecedorBusca] = useState("");
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [forma, setForma] = useState<FinFormaPagamento | "">("");
  const [status, setStatus] = useState<FinStatus>("realizado");
  const [descricao, setDescricao] = useState("");
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  // Listas
  const [contas, setContas] = useState<FinConta[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);

  // Comprovante
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocr, setOcr] = useState<OcrResultado | null>(null);
  const [fornecedorOcrSugerido, setFornecedorOcrSugerido] = useState<FinFornecedor | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      listarContas(),
      listarCategorias(tipo),
      listarCentrosCusto(),
      listarFornecedores(),
    ]).then(([cs, ks, ccs, fs]) => {
      setContas(cs); setCategorias(ks); setCentros(ccs); setFornecedores(fs);
    });
  }, [open, tipo]);

  // Auto-sugestão: quando muda categoria e centro está vazio, sugere baseado no histórico
  useEffect(() => {
    if (!categoriaId || centroCustoId || !open) return;
    (async () => {
      const sugerido = await sugerirCentroPorCategoria(categoriaId);
      if (sugerido) setCentroCustoId(sugerido);
    })();
  }, [categoriaId, open]);

  useEffect(() => {
    if (!open) return;
    if (lancamento) {
      setTipo(lancamento.tipo);
      setData(lancamento.data);
      setValor(Number(lancamento.valor));
      setContaId(lancamento.conta_id);
      setCategoriaId(lancamento.categoria_id ?? "");
      setCentroCustoId(lancamento.centro_custo_id ?? "");
      setFornecedorId(lancamento.fornecedor_id ?? "");
      setForma(lancamento.forma_pagamento ?? "");
      setStatus(lancamento.status);
      setDescricao(lancamento.descricao ?? "");
      setDocumentoNumero(lancamento.documento_numero ?? "");
      setObservacoes(lancamento.observacoes ?? "");
    } else {
      setTipo(tipoPadrao);
      setData(new Date().toISOString().slice(0, 10));
      setValor(0);
      setContaId(contaIdPadrao ?? "");
      setCategoriaId(""); setCentroCustoId(""); setFornecedorId("");
      setForma(""); setStatus("realizado");
      setDescricao(""); setDocumentoNumero(""); setObservacoes("");
    }
    setArquivo(null);
    setPreviewUrl(null);
  }, [open, lancamento, contaIdPadrao, tipoPadrao]);

  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith("image/")) { setPreviewUrl(null); return; }
    const u = URL.createObjectURL(arquivo);
    setPreviewUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  async function escolheArquivo(file: File | null) {
    if (!file) return;
    if (file.size > FIN_COMPROVANTE_MAX) { toast.error("Arquivo > 5MB"); return; }
    setArquivo(file);
    setOcr(null);
    setFornecedorOcrSugerido(null);

    // Roda OCR em imagens e PDFs (PDFs são convertidos pra imagem internamente)
    const ehPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (file.type.startsWith("image/") || ehPdf) {
      setOcrLoading(true);
      try {
        const res = await extrairDadosDoComprovante(file);
        setOcr(res);
        // Procura fornecedor por CNPJ
        if (res.cnpj) {
          const f = await buscarFornecedorPorCnpj(res.cnpj).catch(() => null);
          if (f) setFornecedorOcrSugerido(f);
        }
      } catch (e: any) {
        toast.error("OCR falhou: " + (e?.message ?? ""));
      } finally { setOcrLoading(false); }
    }
  }

  async function aplicarSugestoesOcr() {
    if (!ocr) return;
    if (ocr.valor && ocr.valor > 0) setValor(ocr.valor);
    if (ocr.data) setData(ocr.data);
    if (ocr.numeroDoc) setDocumentoNumero(ocr.numeroDoc);

    if (fornecedorOcrSugerido) {
      setFornecedorId(fornecedorOcrSugerido.id);
      setFornecedorBusca(fornecedorOcrSugerido.nome);
      if (fornecedorOcrSugerido.categoria_padrao_id && !categoriaId) {
        setCategoriaId(fornecedorOcrSugerido.categoria_padrao_id);
      }
    } else if (ocr.razaoSocial) {
      setFornecedorBusca(ocr.razaoSocial);
    }

    if (!descricao && ocr.razaoSocial) {
      setDescricao(ocr.razaoSocial);
    }

    toast.success("Dados aplicados ao formulário");
  }

  async function salvarFornecedorDoOcr() {
    if (!ocr?.razaoSocial || !ocr.cnpj) return;
    try {
      const f = await criarFornecedor({
        nome: ocr.razaoSocial,
        cnpj_cpf: ocr.cnpj,
        tipo: "juridica",
      });
      setFornecedorOcrSugerido(f);
      setFornecedorId(f.id);
      setFornecedorBusca(f.nome);
      toast.success("Fornecedor salvo para usar de novo");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valor <= 0) { toast.error("Valor inválido"); return; }
    if (!contaId) { toast.error("Selecione a conta"); return; }

    setBusy(true);
    try {
      let comprovantePath: string | null = lancamento?.comprovante_url ?? null;
      if (arquivo) {
        if (comprovantePath) await removerComprovante(comprovantePath);
        // upload acontece depois de termos o ID; pra simplificar, usamos um ID temporário
        const tempId = lancamento?.id ?? "tmp";
        comprovantePath = await uploadComprovante(arquivo, tempId);
      }

      const payload: any = {
        tipo, data, valor, conta_id: contaId,
        categoria_id: categoriaId || null,
        centro_custo_id: centroCustoId || null,
        fornecedor_id: fornecedorId || null,
        forma_pagamento: forma || null,
        status,
        descricao: descricao.trim() || null,
        documento_numero: documentoNumero.trim() || null,
        observacoes: observacoes.trim() || null,
        comprovante_url: comprovantePath,
      };

      if (isEdit && lancamento) {
        await atualizarLancamento(lancamento.id, payload);
        toast.success("Lançamento atualizado");
      } else {
        await criarLancamento(payload);
        toast.success(`${tipo === "entrada" ? "Entrada" : "Saída"} registrada`);
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            {tipo === "entrada"
              ? <TrendingUp className="w-5 h-5 text-emerald-600" />
              : <TrendingDown className="w-5 h-5 text-rose-600" />}
            {isEdit ? "Editar lançamento" : (tipo === "entrada" ? "Nova entrada" : "Nova saída")}
          </DialogTitle>
          <DialogDescription>
            Lance qualquer movimento da igreja em segundos.
          </DialogDescription>
        </DialogHeader>

        {!isEdit && (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm"
              variant={tipo === "entrada" ? "default" : "outline"}
              onClick={() => setTipo("entrada")}
              className={tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" : "gap-1.5"}>
              <TrendingUp className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => setTipo("saida")}
              className={tipo === "saida" ? "bg-rose-600 hover:bg-rose-700 text-white gap-1.5" : "gap-1.5"}>
              <TrendingDown className="w-3.5 h-3.5" /> Saída
            </Button>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data *</Label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="number" min={0.01} step="0.01" required
                value={valor || ""} onChange={(e) => setValor(Number(e.target.value))}
                autoFocus={!isEdit} />
            </div>
          </div>

          <div>
            <Label>Conta *</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {contas.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {categorias.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Centro de custo</Label>
              <Select value={centroCustoId} onValueChange={setCentroCustoId}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {centros.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Aluguel do mês de junho" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pagamento</Label>
              <Select value={forma} onValueChange={(v) => setForma(v as FinFormaPagamento)}>
                <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(FORMA_LABEL) as [FinFormaPagamento, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as FinStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_LABEL) as [FinStatus, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nº documento (NF/recibo)</Label>
              <Input value={documentoNumero} onChange={(e) => setDocumentoNumero(e.target.value)}
                placeholder="Opcional" />
            </div>
            <div>
              <Label>Fornecedor/recebedor</Label>
              <Input value={fornecedorBusca}
                onChange={(e) => {
                  setFornecedorBusca(e.target.value);
                  setFornecedorId("");
                  if (e.target.value.length >= 2) {
                    listarFornecedores(e.target.value).then(setFornecedores);
                  }
                }}
                placeholder="(opcional)" />
              {fornecedores.length > 0 && fornecedorBusca && !fornecedorId && (
                <div className="border rounded-md mt-1 max-h-32 overflow-y-auto bg-popover shadow">
                  {fornecedores.slice(0, 5).map(f => (
                    <button key={f.id} type="button"
                      onClick={() => { setFornecedorId(f.id); setFornecedorBusca(f.nome); }}
                      className="w-full text-left px-2 py-1 text-sm hover:bg-muted/40">
                      {f.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comprovante */}
          <div className="space-y-2">
            <Label>📎 Comprovante (opcional)</Label>
            {!arquivo ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" capture="environment"
                    className="hidden" onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30">
                    <Camera className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">Tirar foto</span>
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input type="file" accept="image/jpeg,image/png,image/jpg,application/pdf"
                    className="hidden" onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30">
                    <FileUp className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[11px] font-medium">Escolher</span>
                  </div>
                </label>
              </div>
            ) : (
              <div className="border rounded-md p-2 flex items-center gap-3 bg-muted/30">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="w-12 h-12 object-cover rounded" />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center bg-muted rounded">
                    <Paperclip className="w-4 h-4" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{arquivo.name}</p>
                  <p className="text-[11px] text-muted-foreground">{(arquivo.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button type="button" variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive" onClick={() => setArquivo(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">JPG, PNG ou PDF — máx 5 MB</p>
          </div>

          {/* Resultado do OCR */}
          {(ocrLoading || ocr) && (
            <div className="rounded-md p-3 border border-blue-300 bg-blue-50/30 text-xs space-y-2">
              {ocrLoading && (
                <p className="flex items-center gap-1.5 text-blue-900">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo comprovante...
                </p>
              )}
              {ocr && (
                <>
                  <p className="flex items-center gap-1.5 text-blue-900 font-medium">
                    <Sparkles className="w-3.5 h-3.5" /> Detectamos:
                  </p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {ocr.valor && (
                      <p><span className="text-muted-foreground">Valor:</span> <strong>{brl(ocr.valor)}</strong></p>
                    )}
                    {ocr.data && (
                      <p><span className="text-muted-foreground">Data:</span> <strong>{new Date(ocr.data + "T00:00").toLocaleDateString("pt-BR")}</strong></p>
                    )}
                    {ocr.cnpjFormatado && (
                      <p className="col-span-2"><span className="text-muted-foreground">CNPJ:</span> <strong>{ocr.cnpjFormatado}</strong></p>
                    )}
                    {ocr.razaoSocial && (
                      <p className="col-span-2"><span className="text-muted-foreground">Fornecedor:</span> <strong>{ocr.razaoSocial}</strong></p>
                    )}
                    {ocr.numeroDoc && (
                      <p><span className="text-muted-foreground">Nº NF:</span> <strong>{ocr.numeroDoc}</strong></p>
                    )}
                  </div>
                  {fornecedorOcrSugerido && (
                    <p className="text-emerald-700 text-[11px]">
                      ✓ Fornecedor reconhecido: <strong>{fornecedorOcrSugerido.nome}</strong>
                    </p>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <Button type="button" size="sm" onClick={aplicarSugestoesOcr}
                      className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white gap-1">
                      <Sparkles className="w-3 h-3" /> Aplicar sugestões
                    </Button>
                    {ocr.razaoSocial && ocr.cnpj && !fornecedorOcrSugerido && (
                      <Button type="button" size="sm" variant="outline" onClick={salvarFornecedorDoOcr}
                        className="h-7 text-[11px]">
                        Salvar como fornecedor
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setOcr(null)}
                      className="h-7 text-[11px] ml-auto">
                      Ignorar
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    OCR em {(ocr.duracaoMs / 1000).toFixed(1)}s · confiança {ocr.confianca}%
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}
              className={tipo === "entrada" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"}>
              {busy ? "..." : (isEdit ? "Salvar" : "Registrar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
