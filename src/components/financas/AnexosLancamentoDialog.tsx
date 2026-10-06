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
//
// PAGAMENTOS INTELIGENTES (06/10/2026, pedido dela): ao ESCOLHER um boleto/guia/fatura o diálogo LÊ o arquivo
// (valor, vencimento, beneficiário, linha digitável, Pix), compara com o lançamento, sugere fornecedor/
// categoria/centro e, ao ENVIAR, guarda a leitura no anexo e APRENDE com o que o lançamento tem. Nada é
// alterado sem o clique dela; a leitura só ajuda (falhou? o envio continua igual a antes).

import { useEffect, useRef, useState } from "react";
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
import { Loader2, Upload, FileText, ExternalLink, Trash2, Files, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import {
  listarAnexos, adicionarAnexo, removerAnexo, anexoSignedUrl, listarCentrosCustoTodas,
  FIN_ANEXO_TIPO_LABEL as TIPO_LABEL, FIN_ANEXO_TIPO_DICA, FIN_ANEXO_TIPOS_OFERECIDOS,
  type FinLancamentoAnexo, type FinAnexoTipo,
} from "@/services/finService";
import {
  RECADO_MIGRATION_DE_DOCUMENTOS, aprenderComEscolha, buscarLancamentoParaLeitura, carregarBaseDeSugestao,
  corrigirLancamentoPeloDocumento, guardarLeituraNoAnexo, lancamentoJaPago, lerArquivoDePagamento,
  pareceDocumentoDePagamento, preencherClassificacaoVazia, sugerirParaDocumento, tipoDeAnexoSugerido,
  type LancamentoLido, type LeituraDoArquivo,
} from "@/services/documentoPagamentoService";
import type { Sugestao } from "@/lib/documentos/sugestaoPagamento";
import { LeituraDoDocumentoPainel } from "@/components/financas/LeituraDoDocumentoPainel";

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
  const [tipo, setTipo] = useState<FinAnexoTipo>("nota_fiscal");
  // `confirm()` nativo não dispara em WebView (CLAUDE.md Risco 3) — mesmo
  // AlertDialog de confirmação que `DocumentosFiscaisDialog` já usa.
  const [apagando, setApagando] = useState<FinLancamentoAnexo | null>(null);
  const [apagandoBusy, setApagandoBusy] = useState(false);

  // leitura inteligente do documento escolhido
  const [lendo, setLendo] = useState(false);
  const [leitura, setLeitura] = useState<LeituraDoArquivo | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [lancamento, setLancamento] = useState<LancamentoLido | null>(null);
  const [nomes, setNomes] = useState<{ forn: Map<string, string>; cat: Map<string, string>; centro: Map<string, string> }>(
    { forn: new Map(), cat: new Map(), centro: new Map() });
  const [aplicando, setAplicando] = useState(false);
  /** Descarta o resultado de uma leitura antiga quando outro arquivo foi escolhido no meio. */
  const leituraAtual = useRef(0);

  async function carregar() {
    setLoading(true);
    try { setAnexos(await listarAnexos(lancamentoId)); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (open) carregar(); }, [open, lancamentoId]);

  // o lançamento e os nomes (fornecedor/categoria/centro) para mostrar a comparação — só ao abrir
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    (async () => {
      try {
        const [l, base, centros] = await Promise.all([buscarLancamentoParaLeitura(lancamentoId), carregarBaseDeSugestao(), listarCentrosCustoTodas()]);
        if (!vivo) return;
        setLancamento(l);
        setNomes({
          forn: new Map(base.fornecedores.map(f => [f.id, f.nome])),
          cat: new Map(base.categorias.map(c => [c.id, c.nome])),
          centro: new Map(centros.map(c => [c.id, c.nome])),
        });
      } catch { /* sem a comparação o diálogo continua igual ao de antes */ }
    })();
    return () => { vivo = false; };
  }, [open, lancamentoId]);

  useEffect(() => { if (!open) { setArquivo(null); setLeitura(null); setSugestao(null); } }, [open]);

  async function escolherArquivo(file: File | null) {
    setArquivo(file);
    setLeitura(null); setSugestao(null);
    const minha = ++leituraAtual.current;
    if (!file) return;
    setLendo(true);
    try {
      const l = await lerArquivoDePagamento(file);
      if (minha !== leituraAtual.current) return;
      if (!l || !pareceDocumentoDePagamento(l.documento)) return;
      setLeitura(l);
      const sugerido = tipoDeAnexoSugerido(l.documento);
      if (sugerido) setTipo(sugerido);
      const s = await sugerirParaDocumento(l.documento);
      if (minha === leituraAtual.current) setSugestao(s);
    } catch (e: any) {
      if (minha === leituraAtual.current) toast.error(`Não consegui ler o documento (${e?.message ?? "erro"}). Dá para anexar assim mesmo.`);
    } finally {
      if (minha === leituraAtual.current) setLendo(false);
    }
  }

  async function recarregarLancamento() {
    try { setLancamento(await buscarLancamentoParaLeitura(lancamentoId)); } catch { /* mantém o que tinha */ }
  }

  async function aplicar(oQue: "valor" | "vencimento" | "classificacao") {
    if (!leitura || !lancamento) return;
    setAplicando(true);
    try {
      const d = leitura.documento;
      if (oQue === "valor" && d.valor !== null) { await corrigirLancamentoPeloDocumento(lancamento.id, { valor: d.valor }); toast.success("Valor do lançamento corrigido"); }
      if (oQue === "vencimento" && d.vencimento) { await corrigirLancamentoPeloDocumento(lancamento.id, { data: d.vencimento }); toast.success("Vencimento do lançamento corrigido"); }
      if (oQue === "classificacao" && sugestao) {
        const n = await preencherClassificacaoVazia(lancamento, sugestao);
        toast.success(n > 0 ? "Preenchi o que estava vazio" : "Nada a preencher");
      }
      await recarregarLancamento();
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível alterar o lançamento");
    } finally {
      setAplicando(false);
    }
  }

  async function copiar(texto: string, oQue: string) {
    try { await navigator.clipboard.writeText(texto); toast.success(`${oQue} copiado`); }
    catch { toast.error("Não consegui copiar — selecione o texto e copie à mão"); }
  }

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    try {
      const anexo = await adicionarAnexo(lancamentoId, arquivo, tipo);
      let aviso = "";
      // Guardar a leitura e aprender NUNCA impedem o envio: o arquivo já está salvo.
      if (leitura) {
        try {
          const guardou = await guardarLeituraNoAnexo(anexo.id, leitura.documento);
          const atual = (await buscarLancamentoParaLeitura(lancamentoId)) ?? lancamento;
          const ensinou = atual
            ? await aprenderComEscolha(leitura.documento, {
                fornecedorId: atual.fornecedor_id, categoriaId: atual.categoria_id, centroId: atual.centro_custo_id, projetoId: atual.projeto_id,
              })
            : { gravados: 0, indisponivel: false };
          if (!guardou || ensinou.indisponivel) aviso = RECADO_MIGRATION_DE_DOCUMENTOS;
          else if (ensinou.gravados > 0) aviso = "Aprendi a classificação deste documento para a próxima vez.";
        } catch (e: any) {
          aviso = `Anexo enviado, mas não consegui guardar a leitura: ${e?.message ?? "erro"}`;
        }
      }
      if (aviso && aviso !== "Aprendi a classificação deste documento para a próxima vez.") toast.warning(`Anexo enviado. ${aviso}`);
      else toast.success(aviso ? `Anexo enviado. ${aviso}` : "Anexo enviado");
      setArquivo(null); setLeitura(null); setSugestao(null);
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="w-4 h-4 text-gold" /> Anexos — {descricaoLancamento}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Nota fiscal, boleto, guia, comprovante, fatura, contrato, XML, RPA, RSP ou DPS deste lançamento — quantos precisar, cada um com o próprio tipo. Tudo vai pro Pacote Contábil do mês.
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
                onChange={e => escolherArquivo(e.target.files?.[0] ?? null)}
              />
            </div>
            <Select value={tipo} onValueChange={(v) => setTipo(v as FinAnexoTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* `documento` (antigo) não é oferecido — só lido. */}
                {FIN_ANEXO_TIPOS_OFERECIDOS.map(k => (
                  <SelectItem key={k} value={k}>
                    {TIPO_LABEL[k]}{FIN_ANEXO_TIPO_DICA[k] ? ` — ${FIN_ANEXO_TIPO_DICA[k]}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {lendo && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <ScanSearch className="w-3.5 h-3.5 animate-pulse" /> Lendo o documento…
            </p>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={enviar} disabled={!arquivo || enviando} className="gap-2">
              {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Enviar
            </Button>
          </div>
        </div>

        {/* O que foi lido do documento escolhido */}
        {leitura && (
          <LeituraDoDocumentoPainel
            leitura={leitura}
            sugestao={sugestao}
            lancamento={lancamento}
            nomeDoFornecedor={id => nomes.forn.get(id) ?? "(fornecedor)"}
            nomeDaCategoria={id => nomes.cat.get(id) ?? "(categoria)"}
            nomeDoCentro={id => nomes.centro.get(id) ?? "(centro)"}
            podeAlterar={!!lancamento && !lancamentoJaPago(lancamento)}
            ocupado={aplicando || enviando}
            onUsarValor={() => aplicar("valor")}
            onUsarVencimento={() => aplicar("vencimento")}
            onPreencherClassificacao={() => aplicar("classificacao")}
            onCopiar={copiar}
          />
        )}

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
            <AlertDialogAction variant="destructive" onClick={(e) => { e.preventDefault(); confirmarExcluir(); }} disabled={apagandoBusy}>
              {apagandoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
