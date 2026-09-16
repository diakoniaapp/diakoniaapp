import { useState, useEffect, lazy, Suspense } from "react";
import { hojeLocal } from "@/lib/data";
import { paraNumero } from "@/lib/dinheiro";
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
import {
  TrendingUp, TrendingDown, Camera, FileUp, X, Paperclip, Sparkles, Loader2,
  SplitSquareHorizontal, Plus, Trash2, Lock, Unlock,
} from "lucide-react";
import {
  listarContas, listarCategorias, listarCentrosCusto, listarFornecedores,
  criarLancamento, atualizarLancamento, uploadComprovante, removerComprovante,
  buscarFornecedorPorCnpj, criarFornecedor, sugerirCentroPorCategoria, brl,
  listarRateio, salvarRateio,
  FORMA_LABEL, STATUS_LABEL,
  type FinConta, type FinCategoria, type FinCentroCusto, type FinFornecedor,
  type FinLancamento, type FinMovimentoTipo, type FinFormaPagamento, type FinStatus,
  type NfDadosExtraidos,
  FIN_COMPROVANTE_MAX,
} from "@/services/finService";
import { extrairDadosDoComprovante, type OcrResultado, type ItemNota } from "@/services/ocrService";
import { decodificarBoleto, type BoletoDecodificado } from "@/lib/boleto";
// Carregado sob demanda — ZXing (leitor de câmera) pesa ~460kB no pacote
// principal, e a maioria das aberturas deste formulário nunca clica em
// "Ler com câmera". Mesma mitigação que o CLAUDE.md já registra (Risco
// 10) pra libs usadas em poucas telas: `pdfjs-dist`/`tesseract.js` do OCR
// de comprovante (`ocrService.ts`) já são carregados sob demanda lá
// dentro; aqui é o mesmo raciocínio pro componente inteiro.
const LeitorCodigoBarras = lazy(() =>
  import("./LeitorCodigoBarras").then(m => ({ default: m.LeitorCodigoBarras })));

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Conta pré-selecionada (vinda da tela de movimentação) */
  contaIdPadrao?: string;
  /** Quando true, o campo Conta vira texto fixo (não dá pra trocar) —
      usado quando a conta já é inequívoca, como lançar a partir do
      extrato de UMA conta (`ConciliacaoOFXDialog`). Precisa vir com
      `contaIdPadrao` e `contaNomeTravado` preenchidos. */
  contaTravada?: boolean;
  contaNomeTravado?: string;
  /** Tipo padrão (entrada/saida) */
  tipoPadrao?: FinMovimentoTipo;
  /** Lançamento em edição */
  lancamento?: FinLancamento | null;
  /** Pré-preenchimento vindo de fora (ex: linha de extrato OFX sem
      lançamento correspondente) — só se aplica criando (`!lancamento`);
      a pessoa ainda escolhe categoria/centro de custo, nunca adivinhados
      a partir do texto do banco. */
  rascunho?: { data?: string; valor?: number; descricao?: string; forma?: FinFormaPagamento };
  onSaved: () => void;
}

export function LancamentoForm({
  open, onOpenChange, contaIdPadrao, tipoPadrao = "entrada",
  lancamento, rascunho, contaTravada, contaNomeTravado, onSaved,
}: Props) {
  const isEdit = !!lancamento;

  const [tipo, setTipo] = useState<FinMovimentoTipo>(tipoPadrao);
  const [data, setData] = useState(hojeLocal());
  const [valor, setValor] = useState<number>(0);
  // Campo em si é texto livre (não `type="number"`) — achado numa revisão
  // em 13/09/2026: o mesmo bug já corrigido em `ContaForm.tsx` (número
  // nativo rejeita a vírgula que qualquer brasileiro digita) continuava
  // vivo aqui, no campo de dinheiro mais usado do sistema. `valor`
  // (number) continua sendo o que o resto do formulário usa (rateio,
  // payload); `valorTexto` só espelha o que aparece no campo.
  const [valorTexto, setValorTexto] = useState("");
  function atualizarValor(v: number) {
    setValor(v);
    setValorTexto(v ? String(v) : "");
  }
  const [contaId, setContaId] = useState<string>("");
  // A conta não depende só do state (que só é setado dentro de um
  // `useEffect`, um passo depois do primeiro render) — cai pra
  // `contaIdPadrao` direto quando o state ainda não pegou, o que é
  // sempre disponível de cara. Achado ao vivo em 12/09/2026: o botão
  // "Novo lançamento" de dentro de uma conta abria o campo "Conta"
  // mostrando "Selecione" em vez da conta certa, mesmo com
  // `contaIdPadrao` correto — o mesmo bug que motivou `contaTravada`,
  // só que sem trava nenhuma. `||` nunca sobrepõe uma escolha real: uma
  // vez que a pessoa seleciona algo, `contaId` deixa de ser "" e passa a
  // valer sozinho.
  const contaIdEfetivo = (contaTravada && contaIdPadrao) ? contaIdPadrao : (contaId || contaIdPadrao || "");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [centroCustoId, setCentroCustoId] = useState<string>("");
  const [fornecedorBusca, setFornecedorBusca] = useState("");
  const [fornecedorId, setFornecedorId] = useState<string>("");
  const [forma, setForma] = useState<FinFormaPagamento | "">("");
  const [status, setStatus] = useState<FinStatus>("realizado");
  const [descricao, setDescricao] = useState("");
  // Fase 3 (15/09/2026), pedido da Telma: "quero que exista um campo de
  // descrição, com os itens da nota... não permitir edição, para ser
  // fiel ao documento". Só trava quando a leitura vem de texto EXATO do
  // PDF (nunca OCR aproximado — ver `NfDadosExtraidos` em finService.ts)
  // e o formato foi reconhecido (itens não vazios). `descricaoTravada`
  // controla só a EDIÇÃO do campo; `nfItens` é o que aparece na lista
  // read-only logo abaixo, e o que persiste em `nf_dados_extraidos`.
  const [nfItens, setNfItens] = useState<ItemNota[]>([]);
  const [descricaoTravada, setDescricaoTravada] = useState(false);
  const [nfFornecedorLido, setNfFornecedorLido] = useState<{ nome: string | null; cnpj: string | null } | null>(null);
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  // ── Rateio entre centros de custo ────────────────────────────────────
  // `fin_lancamento_rateio` existia desde sempre, zero linhas, nenhuma
  // tela — item 3 do roadmap do ERP financeiro. `rateando` troca o campo
  // "Centro de custo" (um só) por uma lista de linhas centro+percentual.
  // O centro de MAIOR percentual continua indo pro `centro_custo_id` do
  // lançamento — os relatórios por centro já existentes (Prestação de
  // Contas, Top 5, Visão Executiva) somam por essa coluna, não pelo
  // rateio; refazer isso é trabalho à parte, registrado no roadmap.
  const [rateando, setRateando] = useState(false);
  const [rateio, setRateio] = useState<{ chave: string; centroCustoId: string; percentual: number }[]>([]);

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

  // Leitor de boleto (Fase 4.2 do roadmap Financeiro) — decodificação
  // determinística da linha digitável, sem OCR. Só faz sentido pra saída
  // nova (pagar um boleto); editando ou numa entrada, o campo nem aparece.
  const [boletoTexto, setBoletoTexto] = useState("");
  const [boletoErro, setBoletoErro] = useState<string | null>(null);
  const [boletoOk, setBoletoOk] = useState<BoletoDecodificado | null>(null);
  // Ler com câmera (15/09/2026) — `LeitorCodigoBarras` devolve o boleto já
  // decodificado; grava a linha digitável NORMALIZADA (47 dígitos) no
  // mesmo campo de texto que o colar manual usa, pra reaproveitar o
  // `useEffect` de decodificação/preenchimento abaixo sem duplicar lógica.
  const [leitorCameraOpen, setLeitorCameraOpen] = useState(false);

  // Aceita 44 dígitos (código de barras) OU 47 (linha digitável) — não só
  // o segundo. Achado ao vivo pela Telma (15/09/2026), perguntando pelo
  // leitor FÍSICO de código de barras (o leitor de mesa USB/Bluetooth,
  // diferente da câmera adicionada antes nesta sessão): esse tipo de
  // leitor funciona como teclado — "digita" os 44 números do código de
  // barras direto neste campo, sem passar pela câmera nem por
  // `LeitorCodigoBarras.tsx`. Com o corte fixo em 47, esses 44 caíam no
  // `< 47` e a tela ficava muda (sem erro, sem sucesso) — parecia que o
  // leitor físico não fazia nada. `decodificarBoleto` (lib/boleto.ts) já
  // aceita os dois tamanhos e decide sozinho qual conversão aplicar.
  useEffect(() => {
    const digitos = boletoTexto.replace(/\D/g, "");
    // Só tenta decodificar em 44 (código de barras completo) ou 47+
    // (linha digitável completa/mais que isso, pra manter a mensagem de
    // erro amigável que `decodificarLinhaDigitavel` já dá pros 48 dígitos
    // de conta de consumo). 45-46 fica em silêncio — provavelmente é
    // alguém digitando a linha digitável à mão, ainda no meio do caminho,
    // não um erro pra mostrar a cada tecla.
    const completo = digitos.length === 44 || digitos.length >= 47;
    if (!completo) { setBoletoErro(null); setBoletoOk(null); return; }
    try {
      const r = decodificarBoleto(digitos);
      setBoletoOk(r);
      setBoletoErro(null);
      if (r.valor) atualizarValor(r.valor);
      if (r.vencimento) setData(r.vencimento);
    } catch (e: any) {
      setBoletoOk(null);
      setBoletoErro(e?.message ?? "Não consegui ler esses números.");
    }
  }, [boletoTexto]);

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
      atualizarValor(Number(lancamento.valor));
      setContaId(lancamento.conta_id);
      setCategoriaId(lancamento.categoria_id ?? "");
      setCentroCustoId(lancamento.centro_custo_id ?? "");
      setFornecedorId(lancamento.fornecedor_id ?? "");
      setForma(lancamento.forma_pagamento ?? "");
      setStatus(lancamento.status);
      setDescricao(lancamento.descricao ?? "");
      setDocumentoNumero(lancamento.documento_numero ?? "");
      setObservacoes(lancamento.observacoes ?? "");
      // Reabrir um lançamento que nasceu de uma nota lida mantém a trava e
      // a lista de itens — é o registro fiel ao documento, não algo que
      // se perde ao só abrir pra olhar.
      if (lancamento.nf_dados_extraidos) {
        setNfItens(lancamento.nf_dados_extraidos.itens ?? []);
        setNfFornecedorLido({
          nome: lancamento.nf_dados_extraidos.fornecedorNome,
          cnpj: lancamento.nf_dados_extraidos.fornecedorCnpj,
        });
        setDescricaoTravada((lancamento.nf_dados_extraidos.itens ?? []).length > 0);
      } else {
        setNfItens([]); setNfFornecedorLido(null); setDescricaoTravada(false);
      }
      // Carrega o rateio existente, se houver — um lançamento editado que
      // já foi rateado antes precisa abrir mostrando a divisão, não um
      // centro só (perderia a informação ao salvar de novo sem querer).
      listarRateio(lancamento.id).then(itens => {
        if (itens.length > 0) {
          setRateando(true);
          setRateio(itens.map(i => ({ chave: i.id, centroCustoId: i.centro_custo_id, percentual: Number(i.percentual) })));
        } else {
          setRateando(false);
          setRateio([]);
        }
      }).catch(() => { setRateando(false); setRateio([]); });
    } else {
      setTipo(tipoPadrao);
      setData(rascunho?.data ?? hojeLocal());
      atualizarValor(rascunho?.valor ?? 0);
      setContaId(contaIdPadrao ?? "");
      setCategoriaId(""); setCentroCustoId(""); setFornecedorId("");
      setForma(rascunho?.forma ?? ""); setStatus("realizado");
      setDescricao(rascunho?.descricao ?? ""); setDocumentoNumero(""); setObservacoes("");
      setRateando(false); setRateio([]);
      setNfItens([]); setNfFornecedorLido(null); setDescricaoTravada(false);
    }
    setArquivo(null);
    setPreviewUrl(null);
    setBoletoTexto(""); setBoletoErro(null); setBoletoOk(null);
    // Faltava zerar a leitura de OCR/PDF aqui — sem isso, ao editar um
    // lançamento diferente (ou passar pro próximo, na tela de importação),
    // a caixa "Lemos do texto do PDF" continuava mostrando o resultado do
    // ARQUIVO ANTERIOR, porque nenhum arquivo novo tinha sido escolhido
    // ainda pra `escolheArquivo` (a única outra função que zera `ocr`)
    // rodar. Achado pela Telma (16/09/2026) com print mostrando dados de
    // uma nota da Supermercado Mundial na caixa, editando um lançamento
    // da Agata.
    setOcr(null);
    setOcrLoading(false);
    setFornecedorOcrSugerido(null);
  }, [open, lancamento, contaIdPadrao, tipoPadrao, rascunho]);

  function addLinhaRateio() {
    setRateio(prev => [...prev, { chave: crypto.randomUUID(), centroCustoId: "", percentual: 0 }]);
  }
  function removeLinhaRateio(chave: string) {
    setRateio(prev => prev.filter(r => r.chave !== chave));
  }
  function mudarLinhaRateio(chave: string, patch: Partial<{ centroCustoId: string; percentual: number }>) {
    setRateio(prev => prev.map(r => r.chave === chave ? { ...r, ...patch } : r));
  }
  const totalPercentualRateio = rateio.reduce((s, r) => s + (Number(r.percentual) || 0), 0);
  const rateioValido = rateio.length >= 2
    && rateio.every(r => r.centroCustoId && r.percentual > 0)
    && Math.abs(totalPercentualRateio - 100) < 0.01;

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
    setNfItens([]); setNfFornecedorLido(null); setDescricaoTravada(false);

    // Lê imagens e PDFs. PDF tenta texto exato primeiro (sem OCR nenhum —
    // ver `textoDoPdf` em ocrService.ts); só rasteriza e roda Tesseract
    // quando não há camada de texto aproveitável (documento escaneado).
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
    if (ocr.valor && ocr.valor > 0) atualizarValor(ocr.valor);
    if (ocr.data) setData(ocr.data);
    if (ocr.numeroDoc) setDocumentoNumero(ocr.numeroDoc);

    if (fornecedorOcrSugerido) {
      setFornecedorId(fornecedorOcrSugerido.id);
      setFornecedorBusca(fornecedorOcrSugerido.nome);
      if (fornecedorOcrSugerido.categoria_padrao_id && !categoriaId) {
        setCategoriaId(fornecedorOcrSugerido.categoria_padrao_id);
      }
      // Direto do fornecedor, não pelo encadeamento categoria → centro mais
      // comum (`sugerirCentroPorCategoria`, disparado no useEffect abaixo só
      // quando este campo ainda estiver vazio) — com poucos fornecedores
      // fixos, o centro certo é o DESTE fornecedor, não a média da
      // categoria inteira. Setado aqui, antes do useEffect rodar, ganha a
      // corrida contra a sugestão genérica.
      if (fornecedorOcrSugerido.centro_custo_padrao_id && !centroCustoId) {
        setCentroCustoId(fornecedorOcrSugerido.centro_custo_padrao_id);
      }
    } else if (ocr.razaoSocial) {
      setFornecedorBusca(ocr.razaoSocial);
    }

    // Itens da nota (Fase 3, 15/09/2026) — só quando a leitura veio de
    // texto exato do PDF (nunca OCR de foto/escaneado, que erra dígito) E
    // o formato foi reconhecido (itens não vazio — ver `extrairItensDaNota`
    // em ocrService.ts). A descrição vira a lista de itens, travada: pedido
    // explícito da Telma era "não permitir edição, pra ser fiel ao
    // documento". `descartarLeituraDeItens` (botão logo abaixo do campo)
    // destrava se o arquivo errado foi anexado.
    if (ocr.fonte === "pdf_texto" && ocr.itens.length > 0) {
      setDescricao(ocr.itens.map(i => `${i.descricao} (${i.quantidade} ${i.unidade})`).join("; "));
      setNfItens(ocr.itens);
      setNfFornecedorLido({ nome: ocr.razaoSocial, cnpj: ocr.cnpjFormatado });
      setDescricaoTravada(true);
    } else if (!descricao && ocr.razaoSocial) {
      setDescricao(ocr.razaoSocial);
    }

    toast.success("Dados aplicados ao formulário");
  }

  /** "Não é essa nota" / arquivo errado anexado — destrava a descrição pra
      edição livre e descarta a lista de itens (não faz sentido mostrar
      "lido da nota" de um documento que a pessoa acabou de dizer que não
      é o certo). O texto que já estava no campo continua lá, só editável. */
  function descartarLeituraDeItens() {
    setDescricaoTravada(false);
    setNfItens([]);
    setNfFornecedorLido(null);
  }

  async function salvarFornecedorDoOcr() {
    if (!ocr?.razaoSocial || !ocr.cnpj) return;
    try {
      const f = await criarFornecedor({
        nome: ocr.razaoSocial,
        cnpj_cpf: ocr.cnpj,
        tipo: "juridica",
        // Se a categoria/centro já foram escolhidos nesta mesma tela (por
        // você ou por uma sugestão anterior), o fornecedor NOVO já nasce
        // lembrando os dois — sem isso, só a segunda nota do mesmo
        // fornecedor ganhava o preenchimento automático; a primeira vez
        // sempre exigia escolher os dois à mão de novo.
        categoria_padrao_id: categoriaId || null,
        centro_custo_padrao_id: centroCustoId || null,
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
    if (!contaIdEfetivo) { toast.error("Selecione a conta"); return; }
    if (rateando && !rateioValido) {
      toast.error("O rateio precisa somar 100% entre pelo menos 2 centros.");
      return;
    }

    setBusy(true);
    try {
      let comprovantePath: string | null = lancamento?.comprovante_url ?? null;
      if (arquivo) {
        if (comprovantePath) await removerComprovante(comprovantePath);
        // upload acontece depois de termos o ID; pra simplificar, usamos um ID temporário
        const tempId = lancamento?.id ?? "tmp";
        comprovantePath = await uploadComprovante(arquivo, tempId);
      }

      // Rateado: o centro de MAIOR percentual vira o "principal" do
      // lançamento — ver o comentário de `FinLancamentoRateio` em
      // finService.ts para o porquê (relatórios por centro ainda somam
      // por essa coluna, não pelo rateio).
      const centroPrincipal = rateando
        ? rateio.slice().sort((a, b) => b.percentual - a.percentual)[0]?.centroCustoId ?? null
        : (centroCustoId || null);

      // Só grava a leitura estruturada da nota quando ainda está travada
      // (confirmada como fiel ao documento) — se a pessoa clicou "não é
      // essa nota", `nfItens` já foi limpo por `descartarLeituraDeItens`
      // e isto vira `null` sozinho, sem precisar de um caso especial aqui.
      const nfDadosExtraidos: NfDadosExtraidos | null = descricaoTravada && nfItens.length > 0
        ? {
            fonte: "pdf_texto",
            fornecedorNome: nfFornecedorLido?.nome ?? null,
            fornecedorCnpj: nfFornecedorLido?.cnpj ?? null,
            numeroDocumento: documentoNumero.trim() || null,
            itens: nfItens,
          }
        : null;

      const payload: any = {
        tipo, data, valor, conta_id: contaIdEfetivo,
        categoria_id: categoriaId || null,
        centro_custo_id: centroPrincipal,
        fornecedor_id: fornecedorId || null,
        forma_pagamento: forma || null,
        status,
        descricao: descricao.trim() || null,
        documento_numero: documentoNumero.trim() || null,
        observacoes: observacoes.trim() || null,
        comprovante_url: comprovantePath,
        nf_dados_extraidos: nfDadosExtraidos,
      };

      let lancamentoId: string;
      if (isEdit && lancamento) {
        await atualizarLancamento(lancamento.id, payload);
        lancamentoId = lancamento.id;
        toast.success("Lançamento atualizado");
      } else {
        const criado = await criarLancamento(payload);
        lancamentoId = criado.id;
        toast.success(`${tipo === "entrada" ? "Entrada" : "Saída"} registrada`);
      }

      // Grava o rateio (ou limpa, se ela desmarcou "ratear" num lançamento
      // que antes tinha). `isEdit` porque um lançamento novo sem rateio
      // nunca teve nada pra apagar — chamar salvarRateio([]) à toa é uma
      // viagem ao banco sem efeito nenhum.
      if (rateando) {
        await salvarRateio(lancamentoId, rateio.map(r => ({
          centroCustoId: r.centroCustoId,
          percentual: r.percentual,
          valor: Math.round(valor * (r.percentual / 100) * 100) / 100,
        })));
      } else if (isEdit) {
        await salvarRateio(lancamentoId, []);
      }

      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setBusy(false); }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            {tipo === "entrada"
              ? <TrendingUp className="w-5 h-5 text-success-text" />
              : <TrendingDown className="w-5 h-5 text-destructive-text" />}
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
              className={tipo === "entrada" ? "bg-success hover:bg-success text-white gap-1.5" : "gap-1.5"}>
              <TrendingUp className="w-3.5 h-3.5" /> Entrada
            </Button>
            <Button type="button" size="sm"
              variant={tipo === "saida" ? "default" : "outline"}
              onClick={() => setTipo("saida")}
              className={tipo === "saida" ? "bg-destructive hover:bg-destructive text-white gap-1.5" : "gap-1.5"}>
              <TrendingDown className="w-3.5 h-3.5" /> Saída
            </Button>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          {!isEdit && tipo === "saida" && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label>Ler boleto (linha digitável) — opcional</Label>
                <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs shrink-0"
                  onClick={() => setLeitorCameraOpen(true)}>
                  <Camera className="w-3 h-3" /> Ler com câmera
                </Button>
              </div>
              <Input value={boletoTexto} onChange={(e) => setBoletoTexto(e.target.value)}
                // Leitor físico de código de barras (USB/Bluetooth) manda
                // um Enter depois dos dígitos, por padrão — sem isto, esse
                // Enter submeteria o formulário inteiro antes da Telma
                // escolher conta/categoria. Só neste campo: nos outros, o
                // padrão do navegador (Enter = submit) continua igual.
                onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
                placeholder="Cole os 47 números, use a câmera ou o leitor de código de barras..." />
              {boletoErro && <p className="text-xs text-destructive-text mt-0.5">{boletoErro}</p>}
              {boletoOk && (
                <p className="text-xs text-success-text mt-0.5">
                  ✓ Valor{boletoOk.valor ? ` (${brl(boletoOk.valor)})` : ""} e vencimento
                  {boletoOk.vencimento ? ` (${new Date(boletoOk.vencimento + "T00:00").toLocaleDateString("pt-BR")})` : ""} preenchidos abaixo
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* min-w-0 — sem isso o `<input type="date">` nativo (dd/mm/aaaa
                + ícone do navegador) não encolhe abaixo da própria largura
                mínima e estoura a coluna do grid em tela estreita. Mesmo
                transbordo documentado no CLAUDE.md (§6.2) — achado pela
                Telma (15/09/2026) neste formulário.
                min/max — sem isso o segmento de ANO aceita dígitos sem
                limite ao corrigir (ex.: "26666"), estourando a caixa por
                dentro. Achado pela Telma (16/09/2026). */}
            <div className="min-w-0">
              <Label>Data *</Label>
              <Input type="date" required value={data} onChange={(e) => setData(e.target.value)} min="2000-01-01" max="2099-12-31" className="w-full" />
            </div>
            <div>
              <Label>Valor (R$) *</Label>
              <Input type="text" inputMode="decimal" required
                value={valorTexto}
                onChange={(e) => { setValorTexto(e.target.value); setValor(paraNumero(e.target.value)); }}
                autoFocus={!isEdit} />
            </div>
          </div>

          <div>
            <Label>Conta *</Label>
            {contaTravada ? (
              <div className="h-9 flex items-center px-3 rounded-md border bg-muted/40 text-sm text-muted-foreground">
                {contaNomeTravado ?? "—"}
              </div>
            ) : (
              <Select value={contaIdEfetivo} onValueChange={setContaId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {contas.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
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
              {rateando ? (
                <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-1.5 text-xs text-muted-foreground font-normal"
                  onClick={() => { setRateando(false); setRateio([]); }}>
                  <SplitSquareHorizontal className="w-3.5 h-3.5 text-gold shrink-0" />
                  Rateado — desfazer
                </Button>
              ) : (
                <Select value={centroCustoId} onValueChange={setCentroCustoId}>
                  <SelectTrigger><SelectValue placeholder="(opcional)" /></SelectTrigger>
                  <SelectContent>
                    {centros.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {!rateando && (
            <button type="button"
              onClick={() => { setRateando(true); setRateio([{ chave: crypto.randomUUID(), centroCustoId: centroCustoId || "", percentual: 100 }]); }}
              className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2 -mt-2 flex items-center gap-1">
              <SplitSquareHorizontal className="w-3 h-3" /> Dividir este valor entre vários centros de custo
            </button>
          )}

          {/* ── Rateio ─────────────────────────────────────────────────────
              Item 3 do roadmap do ERP financeiro: uma conta que serve mais
              de um ministério (a luz do prédio, por exemplo) dividida por
              percentual. `fin_lancamento_rateio` existia desde sempre, zero
              linhas, nenhuma tela — até aqui. */}
          {rateando && (
            <div className="space-y-2 rounded-md border border-gold/30 bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <SplitSquareHorizontal className="w-3.5 h-3.5 text-gold" /> Ratear entre centros
                </Label>
                <span className={`text-xs tabular-nums font-medium ${Math.abs(totalPercentualRateio - 100) < 0.01 ? "text-success-text" : "text-warning-text"}`}>
                  {totalPercentualRateio.toFixed(1)}% de 100%
                </span>
              </div>
              <div className="space-y-1.5">
                {rateio.map(r => (
                  <div key={r.chave} className="flex items-center gap-1.5">
                    <Select value={r.centroCustoId} onValueChange={(v) => mudarLinhaRateio(r.chave, { centroCustoId: v })}>
                      <SelectTrigger className="flex-1 h-8 text-xs"><SelectValue placeholder="Centro" /></SelectTrigger>
                      <SelectContent>
                        {centros.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} max={100} step="0.1" value={r.percentual || ""}
                      onChange={(e) => mudarLinhaRateio(r.chave, { percentual: Number(e.target.value) })}
                      className="w-16 h-8 text-xs" placeholder="%" />
                    <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0 text-right">
                      {valor > 0 ? brl(valor * ((r.percentual || 0) / 100)) : "—"}
                    </span>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeLinhaRateio(r.chave)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs h-7" onClick={addLinhaRateio}>
                <Plus className="w-3 h-3" /> Adicionar centro
              </Button>
            </div>
          )}

          <div>
            {/* Rótulo trocado com "Fornecedor/recebedor" abaixo (16/09/2026,
                pedido da Telma): este campo (`descricao`) é onde, na
                prática, sempre se digita o nome de quem recebeu/vendeu —
                "Descrição" descrevia mal um campo que nunca fica vazio de
                verdade. O outro campo (`fornecedorBusca`, com busca e
                vínculo a `fin_fornecedores`) é o que de fato é opcional. */}
            <Label className="flex items-center gap-1.5">
              Fornecedor/recebedor
              {descricaoTravada && (
                <span className="inline-flex items-center gap-1 text-xs font-normal text-info-text">
                  <Lock className="w-3 h-3" /> lido da nota — fiel ao documento
                </span>
              )}
            </Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Aluguel do mês de junho"
              readOnly={descricaoTravada}
              className={descricaoTravada ? "bg-muted/40 cursor-default" : undefined} />
            {descricaoTravada && (
              <button type="button" onClick={descartarLeituraDeItens}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline decoration-dotted">
                <Unlock className="w-3 h-3" /> Não é essa nota / anexei o arquivo errado — destravar
              </button>
            )}
            {nfItens.length > 0 && (
              <div className="mt-1.5 rounded-md border bg-muted/20 p-2 text-xs space-y-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Itens da nota{nfFornecedorLido?.nome ? ` — ${nfFornecedorLido.nome}` : ""}
                </p>
                {nfItens.map((it, i) => (
                  <div key={i} className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {it.descricao} <span className="text-muted-foreground">× {it.quantidade} {it.unidade}</span>
                    </span>
                    <span className="tabular-nums shrink-0">{brl(it.valorTotal)}</span>
                  </div>
                ))}
              </div>
            )}
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
              <Label className="flex items-center gap-1.5">
                Nº documento (NF/recibo)
                {descricaoTravada && <Lock className="w-3 h-3 text-info-text" />}
              </Label>
              <Input value={documentoNumero} onChange={(e) => setDocumentoNumero(e.target.value)}
                placeholder="Opcional"
                readOnly={descricaoTravada}
                className={descricaoTravada ? "bg-muted/40 cursor-default" : undefined} />
            </div>
            <div>
              {/* Rótulo trocado com "Fornecedor/recebedor" acima — ver
                  comentário lá. Este campo (`fornecedorBusca`) é o que
                  realmente fica em branco na maioria das vezes. */}
              <Label>Descrição</Label>
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
                      onClick={() => {
                        setFornecedorId(f.id);
                        setFornecedorBusca(f.nome);
                        // Mesmo aprendizado da leitura por OCR/CNPJ, agora
                        // também ao ESCOLHER o fornecedor direto da lista —
                        // antes só o caminho do OCR preenchia a categoria, e
                        // nem esse preenchia o centro de custo. Achado ao
                        // implementar o pedido "aprenda... e preencha
                        // automaticamente" (15/09/2026): não fazia sentido a
                        // memória do fornecedor só valer quando veio de uma
                        // foto/PDF.
                        if (f.categoria_padrao_id && !categoriaId) setCategoriaId(f.categoria_padrao_id);
                        if (f.centro_custo_padrao_id && !centroCustoId) setCentroCustoId(f.centro_custo_padrao_id);
                      }}
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
                    <span className="text-xs font-medium">Tirar foto</span>
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input type="file" accept="image/jpeg,image/png,image/jpg,application/pdf"
                    className="hidden" onChange={(e) => escolheArquivo(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-col items-center gap-1 border-2 border-dashed rounded-md p-3 hover:border-gold/40 hover:bg-muted/30">
                    <FileUp className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs font-medium">Escolher</span>
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
                  <p className="text-xs text-muted-foreground">{(arquivo.size / 1024).toFixed(0)} KB</p>
                </div>
                <Button type="button" variant="ghost" size="icon"
                  className="h-8 w-8 text-destructive" onClick={() => setArquivo(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">JPG, PNG ou PDF — máx 5 MB</p>
          </div>

          {/* Resultado do OCR */}
          {(ocrLoading || ocr) && (
            <div className="rounded-md p-3 border border-info-line bg-info-soft/30 text-xs space-y-2">
              {ocrLoading && (
                <p className="flex items-center gap-1.5 text-info-text">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Lendo comprovante...
                </p>
              )}
              {ocr && (
                <>
                  <p className="flex items-center gap-1.5 text-info-text font-medium">
                    <Sparkles className="w-3.5 h-3.5" />
                    {ocr.fonte === "pdf_texto" ? "Lemos do texto do PDF (exato, sem OCR):" : "Detectamos (OCR — confira antes de aplicar):"}
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
                    <p className="text-success-text text-xs">
                      ✓ Fornecedor reconhecido: <strong>{fornecedorOcrSugerido.nome}</strong>
                    </p>
                  )}
                  <div className="flex gap-1.5 pt-1">
                    <Button type="button" size="sm" onClick={aplicarSugestoesOcr}
                      className="h-7 text-xs bg-info hover:bg-info text-white gap-1">
                      <Sparkles className="w-3 h-3" /> Aplicar sugestões
                    </Button>
                    {ocr.razaoSocial && ocr.cnpj && !fornecedorOcrSugerido && (
                      <Button type="button" size="sm" variant="outline" onClick={salvarFornecedorDoOcr}
                        className="h-7 text-xs">
                        Salvar como fornecedor
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setOcr(null)}
                      className="h-7 text-xs ml-auto">
                      Ignorar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {ocr.fonte === "pdf_texto"
                      ? `Lido em ${(ocr.duracaoMs / 1000).toFixed(1)}s · texto exato do arquivo`
                      : `OCR em ${(ocr.duracaoMs / 1000).toFixed(1)}s · confiança ${ocr.confianca}% — aproximado, confira os números`}
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
            <Button type="submit" disabled={busy || (rateando && !rateioValido)}
              className={tipo === "entrada" ? "bg-success hover:bg-success text-white" : "bg-destructive hover:bg-destructive text-white"}>
              {busy ? "..." : (isEdit ? "Salvar" : "Registrar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {/* Só monta (e só então baixa o chunk do ZXing) quando a Telma
        realmente clicar em "Ler com câmera" — ver comentário do import
        `lazy` no topo do arquivo. */}
    {leitorCameraOpen && (
      <Suspense fallback={null}>
        <LeitorCodigoBarras
          open={leitorCameraOpen}
          onOpenChange={setLeitorCameraOpen}
          onLido={(boleto) => {
            setBoletoTexto(boleto.linhaDigitavel);
            setLeitorCameraOpen(false);
            toast.success("Código lido!");
          }}
        />
      </Suspense>
    )}
    </>
  );
}
