// ─── ConciliacaoOFXDialog.tsx — a Mesa de Conciliação (importar o extrato OFX e decidir) ───────────────────────
//
// Item 7 do roadmap do ERP financeiro, evoluído em 06/10/2026 para a IMPORTAÇÃO INTELIGENTE e, em 08/10/2026, para a MESA
// DE CONCILIAÇÃO (comparação com o Omie: docs/ANALISE_CONCILIACAO_OMIE_VS_DIAKONIA.md).
//
// O extrato vira uma FILA DE DECISÕES em três pilhas — ✓ identificadas · ⚠ precisam de revisão · ❌ não identificadas — e cada
// linha nova é um CARTÃO: o que o banco disse, quem o sistema identificou (trocável ali mesmo), o histórico da pessoa, a
// categoria sugerida com as alternativas a um clique e o botão Confirmar. O formulário completo só abre em "Editar".
//   · `conciliar`     — casa com um lançamento já registrado como "Realizado": um clique concilia;
//   · `ja_registrada` — já existe (mesmo FITID, ou lançamento conciliado de mesmo valor/data): NÃO é criada de novo;
//   · `ignorada`      — a tesouraria mandou ignorar (migration 20261008140000): fica recolhida, com opção de reativar;
//   · `nova`          — o cartão de decisão. Linhas do mesmo padrão sem favorecido viram UM cartão de grupo.
//
// Nada é gravado sem um clique. "Confirmar" grava a linha na hora (com "Desfazer"); os lotes ("Confirmar identificadas",
// "Lançar marcadas") pedem confirmação e podem ser desfeitos. As correções viram o histórico que ensina a próxima importação.
// O painel de MEDIÇÃO conta quantas linhas o sistema acertou sozinho, quantas pediram uma olhada e quantas foram à mão.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pedidosDeConfirmacao, type PedidoDeConfirmacao } from "@/lib/ofxCandidatas";
import type { DocumentoDoExtrato } from "@/lib/documentoDoExtrato";
import { toast } from "sonner";
import { useIrAoTopoDaLista } from "@/hooks/useIrAoTopoDaLista";
import { descartarRascunho, guardarRascunho, lerRascunho } from "@/lib/rascunhoDaConciliacao";
import {
  FileUp, Scale, CheckCircle2, HelpCircle, Undo2, Loader2, AlertTriangle, XCircle, ChevronLeft, ChevronRight, Layers, RotateCcw, BanIcon, Search, Pencil,
} from "lucide-react";
import { conciliarEmLote, excluirLancamentosEmLote, listarContas, brl, type FinMovimentoTipo } from "@/services/finService";
import { parseOFX, encodingDoOFX, inferirFormaPagamento, type OFXTransacao } from "@/services/ofxService";
import { sincronizarOrdemComOfx } from "@/services/auditoriaExtratoService";
import {
  analisar, carregarContexto, conciliarDebitos, conciliarPagamentos, desfazerLote, desvincularMovimento, ignorarLinha, listarIgnoradas, reativarIgnorada, registrarLote, registrarTransferenciaDoExtrato,
  vincularMovimentos, ROTULO_DO_MOTIVO,
  type CandidatoManual, type ContextoOfx, type LinhaAnalisada, type MotivoDeIgnorar, type OutraPonta, type ParaRegistrar,
} from "@/services/importacaoOfxService";
import {
  MOTIVOS_DE_DESPESA_NOVA, ORDEM_DOS_FILTROS, ROTULO_DO_FILTRO, contarPorFiltro, favorecidoEfetivo, foiCorrigida, identificadasParaConfirmar, marcadasIniciais,
  marcadasParaGravar, paginar, pertenceAoFiltro, podeGravar, valoresEfetivos,
  type Edicao, type Filtro, type LinhaDaGrade,
} from "@/lib/gradeOfx";
import { alvoDaTransferencia } from "@/lib/transferenciaOfx";
import { agruparPorClasse, resumirAgrupamentos, resumirMedicao, type Desfecho, type Grupo, type Medicao, type RegistroDaMedicao, type ResumoDosAgrupamentos } from "@/lib/mesaOfx";
import { LancamentoForm } from "./LancamentoForm";
import { LiquidarPeloExtratoDialog } from "./LiquidarPeloExtratoDialog";
import { TransferenciaForm } from "./TransferenciaForm";
import { BuscarEAssociarDialog } from "./mesa/BuscarEAssociarDialog";
import { gerarUmaOcorrencia } from "@/services/recorrenciaService";
import { CartaoDaLinha, ROTULO_BUSCAR, nomeCurtoDaCategoria } from "./mesa/CartaoDaLinha";
import { ListaDeMovimentos } from "./mesa/ListaDeMovimentos";
import { moverSelecao, proximaPorDecidir, selecaoAposSumir } from "@/lib/selecaoDaLista";
import { resolverMovimento } from "@/lib/resolverMovimento";
import { AcaoDoPainel, CabecalhoDoPainel, CaixaDeResposta, ListaDeAcoes } from "./mesa/PainelDeDecisao";
import { useIsMobile } from "@/hooks/use-mobile";
import { AvisoDosGrupos } from "./mesa/AvisoDosGrupos";
import { CartaoDoGrupo } from "./mesa/CartaoDoGrupo";
import { IgnorarLinhaDialog } from "./mesa/IgnorarLinhaDialog";
import { PainelDeMedicao } from "./mesa/PainelDeMedicao";
import { PainelInvestFacil } from "./mesa/PainelInvestFacil";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contaId: string;
  contaNome: string;
  onSaved: () => void;
}

const POR_PAGINA = 50;
/** a barra de filtros da Central de decisões: o total e as hipóteses */
const CHIPS_DA_CENTRAL: Filtro[] = ["todas", "h0", "h1", "h2", "h3", "h4", "resolvidos"];

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** A linha como a grade a vê. As que foram lançadas AGORA (sem reanalisar o arquivo) contam como já registradas. */
const daGradeBase = (l: LinhaAnalisada): LinhaDaGrade => ({ fitid: l.tx.fitid, situacao: l.situacao, sugestao: l.sugestao, hipotese: resolverMovimento(l).h, recorrencia: !!l.recorrenciaCompativel && !l.documentos?.length, candidata: !!l.documentos?.length || !!l.recorrenciaCompativel });

export function ConciliacaoOFXDialog({ open, onOpenChange, contaId, contaNome, onSaved }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [conciliando, setConciliando] = useState(false);
  const [transacoes, setTransacoes] = useState<OFXTransacao[] | null>(null);
  const [contexto, setContexto] = useState<ContextoOfx | null>(null);
  const [linhas, setLinhas] = useState<LinhaAnalisada[] | null>(null);

  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>({});
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [pagina, setPagina] = useState(1);
  const [agrupar, setAgrupar] = useState(true);

  const [paraConfirmar, setParaConfirmar] = useState<LinhaAnalisada[] | null>(null);
  const [gravando, setGravando] = useState<{ feitos: number; total: number } | null>(null);
  const [lote, setLote] = useState<{ loteId: string; ids: string[] } | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  const [salvandoLinha, setSalvandoLinha] = useState(false);

  // o que foi lançado AGORA, linha a linha (fitid → ids dos lançamentos): sai da fila sem reanalisar o arquivo inteiro
  const [confirmadas, setConfirmadas] = useState<Map<string, string[]>>(new Map());
  // a medição da rodada
  const [registros, setRegistros] = useState<Map<string, RegistroDaMedicao>>(new Map());
  const [aoAbrir, setAoAbrir] = useState<Medicao["aoAbrir"] | null>(null);
  const [totalDoArquivo, setTotalDoArquivo] = useState(0);
  const [agrupamentosAoAbrir, setAgrupamentosAoAbrir] = useState<ResumoDosAgrupamentos | null>(null);
  const alterou = useRef(false);

  const [ignorarDisponivel, setIgnorarDisponivel] = useState(false);
  const [outrasContas, setOutrasContas] = useState<{ id: string; nome: string }[]>([]);
  // o que desfaz cada linha lançada como transferência ligada a um lançamento que já existia (não pode apagar o par inteiro)
  const desfazedores = useRef(new Map<string, () => Promise<void>>());
  const semDocumento = useRef(new Set<string>());   // linhas que a tesouraria disse "não é este documento"
  // D3 (13/10/2026): linha nova que tem uma conta em aberto candidata nunca vira lançamento sem o clique "é outro pagamento"
  // 20/10/2026: o "outro pagamento" agora traz o MOTIVO (fitid → motivo): vai gravado no lançamento e é o que libera a linha na guarda final de registrarLote
  const reconhecidas = useRef(new Map<string, string>());
  const [guarda, setGuarda] = useState<{ pedidos: PedidoDeConfirmacao[]; seguir: () => void } | null>(null);
  const [motivoDaGuarda, setMotivoDaGuarda] = useState("");
  // linhas em que a tesouraria disse "não é este movimento" (H0): seguem o fluxo de despesa nova, com o motivo
  const semJaRegistrado = useRef(new Set<string>());
  const [naoEJaRegistrada, setNaoEJaRegistrada] = useState<LinhaAnalisada | null>(null);
  const [motivoH0, setMotivoH0] = useState("");
  const [buscandoLinha, setBuscandoLinha] = useState<LinhaAnalisada | null>(null);
  const [confirmandoVinculo, setConfirmandoVinculo] = useState<LinhaAnalisada[] | null>(null);

  // Fechar (ou sair da tela) não joga fora o que a tesouraria já fez: o arquivo, o filtro, a página, as marcadas e as edições ficam por 15 minutos (22/10/2026) — ver `lib/rascunhoDaConciliacao`.
  const andamento = useRef<Parameters<typeof guardarRascunho>[1] | null>(null);
  andamento.current = arquivo && transacoes ? {
    arquivo, transacoes, filtro, pagina, agrupar, marcadas: [...marcadas], edicoes, registros: [...registros], confirmadas: [...confirmadas], lote, totalDoArquivo, aoAbrir, agrupamentosAoAbrir,
    decisoes: { reconhecidas: [...reconhecidas.current], semDocumento: [...semDocumento.current], semJaRegistrado: [...semJaRegistrado.current] },
  } : null;
  function guardarOQueEstaEmAndamento() { if (andamento.current) guardarRascunho(contaId, andamento.current); }
  useEffect(() => () => { if (andamento.current) guardarRascunho(contaId, andamento.current); }, [contaId]);
  // topo da lista ao mudar de página (o diálogo rola; o "Próxima" fica no fim da lista)
  const { topoRef, irAoTopo } = useIrAoTopoDaLista();
  const irParaPagina = (p: number) => { setPagina(p); irAoTopo(); };
  function comGuarda(alvo: LinhaAnalisada[], seguir: () => void): boolean {
    // quem já escolheu o motivo no próprio cartão não precisa responder de novo
    for (const l of alvo) { const m = edicoes[l.tx.fitid]?.motivoNovo?.trim(); if (m) reconhecidas.current.set(l.tx.fitid, m); }
    const pedidos = pedidosDeConfirmacao(alvo, reconhecidas.current);
    if (pedidos.length === 0) return false;
    setMotivoDaGuarda("");
    setGuarda({ pedidos, seguir });
    return true;
  }
  const [ignorando, setIgnorando] = useState<LinhaAnalisada | null>(null);

  const [editarLinha, setEditarLinha] = useState<LinhaAnalisada | null>(null);
  // Saída do extrato que quitou um documento a pagar (igual ou com diferença): a divergência abre sozinha ao importar.
  const [liquidarLinha, setLiquidarLinha] = useState<LinhaAnalisada | null>(null);
  // Pedido da Telma (22/09/2026): uma linha sem correspondência pode ser transferência de outra
  // conta (a `TransferenciaForm` cria as duas pernas atômico), não só um lançamento avulso.
  const [transferirTransacao, setTransferirTransacao] = useState<OFXTransacao | null>(null);

  const daGrade = (l: LinhaAnalisada): LinhaDaGrade =>
    confirmadas.has(l.tx.fitid) ? { fitid: l.tx.fitid, situacao: "ja_registrada" } : daGradeBase(l);

  const grade = useMemo(() => (linhas ?? []).map(daGrade), [linhas, confirmadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const contagem = useMemo(() => contarPorFiltro(grade), [grade]);
  const visiveis = useMemo(() => {
    const ok = new Set(grade.filter(g => pertenceAoFiltro(g, filtro)).map(g => g.fitid));
    return (linhas ?? []).filter(l => ok.has(l.tx.fitid));
  }, [linhas, grade, filtro]);

  // grupos: linhas parecidas das que estão na tela agora. SÓ o grupo seguro aceita decisão em lote (vira cartão e sai da
  // fila); os demais viram aviso e as linhas ficam na fila para decidir uma a uma.
  const agrupamento = useMemo(() => {
    if (!agrupar) return { grupos: [] as Grupo[], inseguros: [] as Grupo[], avulsas: new Set<string>(), noGrupo: new Set<string>() };
    const { grupos } = agruparPorClasse(visiveis.map(l => ({
      fitid: l.tx.fitid, tipo: l.tx.tipo, valor: l.tx.valor, memo: l.tx.memo,
      situacao: confirmadas.has(l.tx.fitid) ? "ja_registrada" : l.situacao, sugestao: l.sugestao,
    })));
    const seguros = grupos.filter(g => g.seguranca === "seguro");
    return { grupos: seguros, inseguros: grupos.filter(g => g.seguranca !== "seguro"), avulsas: new Set<string>(), noGrupo: new Set(seguros.flatMap(g => g.fitids)) };
  }, [visiveis, confirmadas, agrupar]);
  const naLista = useMemo(() => visiveis.filter(l => !agrupamento.noGrupo.has(l.tx.fitid)), [visiveis, agrupamento]);
  const pag = paginar(naLista, pagina, POR_PAGINA);

  useEffect(() => { setPagina(1); }, [filtro, agrupar]);

  const categoriasPorTipo = useMemo(() => ({
    entrada: (contexto?.categorias ?? []).filter(c => c.tipo === "entrada"),
    saida: (contexto?.categorias ?? []).filter(c => c.tipo === "saida"),
  }), [contexto]);
  const projetos = contexto?.projetos ?? [];
  const opcoesDeCentro = useMemo(() => {
    const cs = contexto?.centros ?? [];
    const porId = new Map(cs.map(c => [c.id, c]));
    return cs.map(c => ({ id: c.id, rotulo: c.centro_pai_id && porId.get(c.centro_pai_id) ? `${porId.get(c.centro_pai_id)!.nome} › ${c.nome}` : c.nome }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [contexto]);
  const nomeDaCategoria = (id?: string | null) => (id ? contexto?.categorias.find(c => c.id === id)?.nome ?? "" : "");
  const linhasPorFitid = useMemo(() => new Map((linhas ?? []).map(l => [l.tx.fitid, l])), [linhas]);

  function reiniciar() {
    setArquivo(null); setTransacoes(null); setLinhas(null); setContexto(null);
    setEdicoes({}); setMarcadas(new Set()); setFiltro("todas"); setPagina(1); setLote(null);
    setConfirmadas(new Map()); setRegistros(new Map()); setAoAbrir(null); setTotalDoArquivo(0); setAgrupamentosAoAbrir(null);
  }

  function fechar(v: boolean) {
    if (ocupado && !v) return;
    onOpenChange(v);
    if (!v) {
      guardarOQueEstaEmAndamento();
      if (alterou.current) { alterou.current = false; onSaved(); }
      // A ordem do OFX é a do extrato do banco: grava em cada lançamento da conta a posição dele no dia, para o extrato do sistema sair na mesma
      // sequência. Em segundo plano, sem travar o fechamento; se não puder (migration ainda não aplicada, permissão), o extrato segue na regra de sempre.
      const lidas = transacoes;
      reiniciar();
      if (lidas) {
        sincronizarOrdemComOfx(contaId, lidas)
          .then(r => { if (r && r.alterados > 0) onSaved(); })
          .catch(() => { /* a ordem é um refinamento visual: nunca atrapalha o fechamento da Mesa */ });
      }
      return;
    }
  }

  /** `recarregarContexto`: depois de gravar, o que foi gravado passa a fazer parte da memória. */
  async function analisarDeNovo(txs: OFXTransacao[], recarregarContexto: boolean, primeira = false) {
    const ctx = !contexto || recarregarContexto ? await carregarContexto(contaNome) : contexto;
    setContexto(ctx);
    listarContas().then(cs => setOutrasContas(cs.filter(c => c.id !== contaId).map(c => ({ id: c.id, nome: c.nome })))).catch(() => { /* sem a lista, só o formulário completo */ });
    const [res, ign] = await Promise.all([analisar(contaId, txs, ctx, { semJaRegistrado: semJaRegistrado.current }), listarIgnoradas(contaId)]);
    setIgnorarDisponivel(ign.disponivel);
    for (const x of res) if (x.situacao === "documento" && semDocumento.current.has(x.tx.fitid)) { x.situacao = "nova"; x.documentos = undefined; }
    setLinhas(res);
    setConfirmadas(new Map());   // a reanálise já enxerga o que foi gravado (FITID)
    const g = res.map(daGradeBase);
    if (primeira) {
      const c = contarPorFiltro(g);
      setAoAbrir({
        identificadas: c.identificadas, revisar: c.revisar, naoIdentificadas: c.nao_identificadas, jaRegistradas: c.ja_registradas,
        conciliar: c.conciliar, debitos: c.debitos, documentos: c.documentos, transferencias: c.transferencias,
      });
      setTotalDoArquivo(res.length);
      setAgrupamentosAoAbrir(resumirAgrupamentos(agruparPorClasse(res.map(l => ({
        fitid: l.tx.fitid, tipo: l.tx.tipo, valor: l.tx.valor, memo: l.tx.memo, situacao: l.situacao, sugestao: l.sugestao,
      }))).grupos));
      const divergente = res.find(l => l.documentos?.[0] && !l.documentos[0].exato && !l.documentos[0].ambiguo && (l.situacao === "documento" || l.documentos.length === 1));
      if (divergente) setLiquidarLinha(divergente);
    }
    // quem ainda está pendente não conta como resolvida
    const novas = new Set(res.filter(l => l.situacao === "nova").map(l => l.tx.fitid));
    setRegistros(prev => new Map([...prev].filter(([f]) => !novas.has(f))));
    setMarcadas(prev => primeira ? marcadasIniciais(g) : new Set([...prev].filter(f => g.some(x => x.fitid === f && x.situacao === "nova"))));
  }

  /** Reabre de onde a pessoa parou: o estado dela volta como estava e o arquivo é analisado de novo contra o banco de agora. */
  function retomar(r: ReturnType<typeof lerRascunho> & object) {
    const d = r.rascunho;
    reconhecidas.current = new Map(d.decisoes.reconhecidas);
    semDocumento.current = new Set(d.decisoes.semDocumento);
    semJaRegistrado.current = new Set(d.decisoes.semJaRegistrado);
    setArquivo(d.arquivo); setTransacoes(d.transacoes as OFXTransacao[]);
    setFiltro(d.filtro as Filtro); setAgrupar(d.agrupar); setMarcadas(new Set(d.marcadas));
    setEdicoes(d.edicoes as Record<string, Edicao>); setRegistros(new Map(d.registros as [string, RegistroDaMedicao][]));
    setLote(d.lote); setTotalDoArquivo(d.totalDoArquivo);
    setAoAbrir(d.aoAbrir as Medicao["aoAbrir"] | null); setAgrupamentosAoAbrir(d.agrupamentosAoAbrir as ResumoDosAgrupamentos | null);
    setProcessando(true);
    toast.info(`Retomei de onde você parou (${d.arquivo.name}, há ${r.minutos} min). \"Trocar arquivo\" começa do zero.`);
    analisarDeNovo(d.transacoes as OFXTransacao[], true)
      .then(() => setPagina(d.pagina))   // depois da análise: o efeito do filtro reinicia a página, e a pessoa estava nesta
      .catch((e: any) => { toast.error(e?.message ?? "Não consegui retomar a análise"); reiniciar(); })
      .finally(() => setProcessando(false));
  }
  useEffect(() => {
    if (!open || arquivo || transacoes) return;
    const r = lerRascunho(contaId);
    if (!r) return;
    descartarRascunho(contaId);   // o estado passa a viver no componente; volta a ser guardado ao fechar
    retomar(r);
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contaId]);

  async function processarArquivo(file: File) {
    setArquivo(file);
    setProcessando(true);
    setLinhas(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const texto = new TextDecoder(encodingDoOFX(bytes)).decode(bytes);
      const txs = parseOFX(texto);
      if (txs.length === 0) {
        toast.error("Nenhuma transação encontrada nesse arquivo — confira se é o extrato em OFX.");
        setArquivo(null);
        return;
      }
      setTransacoes(txs);
      await analisarDeNovo(txs, true, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ler o arquivo");
      setArquivo(null);
    } finally {
      setProcessando(false);
    }
  }

  const aConciliar = linhas?.filter(l => l.situacao === "conciliar") ?? [];
  const debitosEncontrados = linhas?.filter(l => l.situacao === "debito_encontrado") ?? [];
  const documentosEncontrados = linhas?.filter(l => l.situacao === "documento") ?? [];
  const divergentes = documentosEncontrados.filter(l => l.documentos?.[0] && !l.documentos[0].exato);
  const aVincular = linhas?.filter(l => l.situacao === "vincular" && !confirmadas.has(l.tx.fitid)) ?? [];

  const marcar = (fitid: string, r: RegistroDaMedicao) => setRegistros(prev => new Map(prev).set(fitid, r));
  const registroDe = (l: LinhaAnalisada, desfecho: Desfecho, extra: Partial<RegistroDaMedicao> = {}): RegistroDaMedicao =>
    ({ banda: l.sugestao?.banda ?? "sem_sugestao", desfecho, possivelMissoes: l.sugestao?.possivelMissoes, ...extra });

  /** "Não é este documento": a linha volta a ser um pagamento novo (decisão guardada para as próximas análises desta importação). */
  function naoEEsteDocumento(fitid: string) {
    semDocumento.current.add(fitid);
    setLinhas(prev => (prev ?? []).map(x => x.tx.fitid === fitid && x.situacao === "documento" ? { ...x, situacao: "nova" as const, documentos: undefined } : x));
  }

  async function aoLiquidar() {
    setLiquidarLinha(null);
    alterou.current = true;
    if (transacoes) await analisarDeNovo(transacoes, true);
  }

  async function conciliarOsDebitos(lista: LinhaAnalisada[]) {
    if (lista.length === 0 || !transacoes) return;
    setConciliando(true);
    try {
      const r = await conciliarDebitos(contaId, lista.map(l => ({ lancamentoId: l.lancamentoId!, tx: l.tx })));
      if (r.conciliados.length > 0) toast.success(`${r.conciliados.length} débito${r.conciliados.length > 1 ? "s" : ""} automático${r.conciliados.length > 1 ? "s" : ""} conciliado${r.conciliados.length > 1 ? "s" : ""}`);
      if (r.erros.length > 0) toast.error(r.erros[0]);
      alterou.current = true;
      await analisarDeNovo(transacoes, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao conciliar o débito");
    } finally {
      setConciliando(false);
    }
  }

  async function conciliar() {
    if (aConciliar.length === 0) return;
    setConciliando(true);
    try {
      // concilia GRAVANDO o vínculo: a marca do OFX e o dia em que o banco debitou ficam no lançamento da obrigação ("OFX vinculado")
      const r = await conciliarPagamentos(aConciliar.map(l => ({ lancamentoId: l.lancamentoId!, tx: l.tx })));
      if (r.conciliados.length > 0) { toast.success(`${r.conciliados.length} lançamento${r.conciliados.length > 1 ? "s" : ""} conciliado${r.conciliados.length > 1 ? "s" : ""}, com o vínculo do extrato`); alterou.current = true; }
      if (r.erros.length > 0) toast.error(r.erros[0] + (r.erros.length > 1 ? ` (+${r.erros.length - 1})` : ""));
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setConciliando(false);
    }
  }

  // ── H0: vincular ao que já existe ──

  async function vincular(lista: LinhaAnalisada[]) {
    const alvo = lista.filter(l => l.situacao === "vincular" && l.lancamentoId);
    setConfirmandoVinculo(null);
    if (alvo.length === 0 || !transacoes) return;
    setConciliando(true);
    try {
      const r = await vincularMovimentos(alvo.map(l => ({ lancamentoId: l.lancamentoId!, tx: l.tx })));
      if (r.conciliados.length > 0) {
        alterou.current = true;
        toast.success(`${r.conciliados.length} movimento${r.conciliados.length > 1 ? "s" : ""} vinculado${r.conciliados.length > 1 ? "s" : ""} ao que já existia — nada foi criado`, {
          action: { label: "Desfazer", onClick: async () => {
            try { for (const l of alvo) await desvincularMovimento(l.lancamentoId!, l.tx.fitid); toast.success("Vínculo desfeito"); await analisarDeNovo(transacoes, false); }
            catch (e: any) { toast.error(e?.message ?? "Não foi possível desfazer"); }
          } },
        });
      }
      if (r.erros.length > 0) toast.error(r.erros[0] + (r.erros.length > 1 ? ` (+${r.erros.length - 1})` : ""));
      await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao vincular");
    } finally {
      setConciliando(false);
    }
  }

  /** "Não é este movimento": a linha segue o fluxo de despesa nova — com o motivo, que fica gravado no lançamento. */
  async function confirmarNaoEJaRegistrada() {
    const l = naoEJaRegistrada; const m = motivoH0.trim();
    if (!l || !m) return;
    semJaRegistrado.current.add(l.tx.fitid);
    reconhecidas.current.set(l.tx.fitid, m);
    editar(l.tx.fitid, { motivoNovo: m });
    setNaoEJaRegistrada(null); setMotivoH0("");
    if (transacoes) await analisarDeNovo(transacoes, false);
  }

  // ── H2: gerar a ocorrência que falta do contrato e liquidá-la pelo extrato ──
  async function gerarELiquidarRecorrencia(l: LinhaAnalisada) {
    const rc = l.recorrenciaCompativel;
    if (!rc) return;
    setSalvandoLinha(true);
    try {
      const o = await gerarUmaOcorrencia(rc.recorrenciaId, rc.vencimento);
      alterou.current = true;
      const diferenca = Math.round((l.tx.valor - o.valor) * 100) / 100;
      const doc: DocumentoDoExtrato = {
        documento: { id: o.id, valor: o.valor, data: o.data, fornecedor_id: o.fornecedor_id, pessoa_id: o.pessoa_id, descricao: o.descricao, fornecedor_nome: o.fornecedor_nome, recorrencia_id: o.recorrencia_id },
        diferenca, exato: Math.abs(diferenca) < 0.005, incerto: false, confianca: 100, contrato: o.descricao, segundoContrato: false, ambiguo: false,
        outrosAbertos: [], contratoSemDocumento: null, motivo: "ocorrência do contrato gerada agora para esta liquidação",
      };
      toast.success(`Conta de ${dataBr(rc.vencimento)} gerada a partir da recorrência — confirme a liquidação`);
      setLiquidarLinha({ ...l, situacao: "documento", documentos: [doc] });
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível gerar a ocorrência");
      if (transacoes) await analisarDeNovo(transacoes, false);
    } finally {
      setSalvandoLinha(false);
    }
  }

  // ── busca e associação manual ──
  function liquidarEscolhida(l: LinhaAnalisada, c: CandidatoManual) {
    const diferenca = Math.round((l.tx.valor - c.valor) * 100) / 100;
    const doc: DocumentoDoExtrato = {
      documento: { id: c.id, valor: c.valor, data: c.data, fornecedor_id: c.fornecedor_id, pessoa_id: c.pessoa_id, descricao: c.rotulo, fornecedor_nome: c.rotulo, recorrencia_id: c.recorrencia_id },
      diferenca, exato: Math.abs(diferenca) < 0.005, incerto: false, confianca: 100, contrato: c.rotulo, segundoContrato: false, ambiguo: false,
      outrosAbertos: [], contratoSemDocumento: null, motivo: "conta escolhida à mão pela tesouraria",
    };
    setBuscandoLinha(null);
    setLiquidarLinha({ ...l, situacao: "documento", documentos: [doc] });
  }

  async function vincularEscolhido(l: LinhaAnalisada, c: CandidatoManual) {
    setBuscandoLinha(null);
    if (!transacoes) return;
    setConciliando(true);
    try {
      const r = await vincularMovimentos([{ lancamentoId: c.id, tx: l.tx }]);
      if (r.conciliados.length > 0) { alterou.current = true; toast.success("Vinculado ao lançamento escolhido — nada foi criado"); }
      if (r.erros.length > 0) toast.error(r.erros[0]);
      await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao vincular");
    } finally {
      setConciliando(false);
    }
  }

  // ── gravação ──

  /** O que será gravado para uma linha, com o que a pessoa escolheu por cima do que foi sugerido. */
  function itemDaLinha(l: LinhaAnalisada): ParaRegistrar {
    const g = daGradeBase(l);
    const ed = edicoes[l.tx.fitid];
    const v = valoresEfetivos(g, ed);
    const fav = favorecidoEfetivo(g, ed);
    const escolhido = ed?.favorecido ?? null;
    return {
      tx: l.tx, categoriaId: v.categoriaId!, centroId: v.centroId, projetoId: ed?.projetoId || undefined,
      pessoaId: fav.pessoa?.id ?? (escolhido?.tipo === "fornecedor" ? escolhido.pessoaId ?? undefined : undefined),
      fornecedorId: fav.fornecedor?.id,
      motivoNovo: reconhecidas.current.get(l.tx.fitid) ?? (ed?.motivoNovo?.trim() || undefined),
    };
  }

  /** A guarda final (registrarLote) recusou linhas que o banco já tem sob outro identificador: ficam na fila, como "já registradas (vincular)". */
  async function avisarRecusadas(r: { recusadas: string[] }) {
    if (r.recusadas.length === 0 || !transacoes) return;
    await analisarDeNovo(transacoes, false);
  }
  const fitidsDoArquivo = () => new Set((transacoes ?? []).map(t => t.fitid));

  /** "Confirmar" na própria linha: grava na hora e deixa o "Desfazer" à mão. */
  async function confirmarLinha(l: LinhaAnalisada) {
    const g = daGradeBase(l);
    if (!podeGravar(g, edicoes[l.tx.fitid])) return;
    if (comGuarda([l], () => void confirmarLinha(l))) return;
    setSalvandoLinha(true);
    try {
      const r = await registrarLote(contaId, [itemDaLinha(l)], undefined, { fitidsDoArquivo: fitidsDoArquivo() });
      if (r.erros.length > 0 || r.ids.length !== 1) { toast.error(r.erros[0] ?? "Não foi possível lançar esta linha"); await avisarRecusadas(r); return; }
      alterou.current = true;
      setConfirmadas(m => new Map(m).set(l.tx.fitid, r.ids));
      setMarcadas(m => { const n = new Set(m); n.delete(l.tx.fitid); return n; });
      marcar(l.tx.fitid, registroDe(l, foiCorrigida(g, edicoes[l.tx.fitid]) ? "corrigida" : "aceita"));
      toast.success(`Lançado: ${l.tx.memo.slice(0, 40)}`, { action: { label: "Desfazer", onClick: () => desfazerLinha(l.tx.fitid, r.ids) } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao lançar");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function desfazerLinha(fitid: string, ids: string[]) {
    try {
      const proprio = desfazedores.current.get(fitid);
      if (proprio) { await proprio(); desfazedores.current.delete(fitid); } else await excluirLancamentosEmLote(ids);
      setConfirmadas(m => { const n = new Map(m); n.delete(fitid); return n; });
      setRegistros(m => { const n = new Map(m); n.delete(fitid); return n; });
      toast.success("Lançamento desfeito — a linha voltou para a fila");
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    }
  }

  /** "Confirmar transferência": liga a linha ao lançamento da outra conta (ou cria as duas pernas) e deixa o "Desfazer" à mão. */
  async function confirmarTransferencia(l: LinhaAnalisada, alvo: OutraPonta) {
    setSalvandoLinha(true);
    try {
      const r = await registrarTransferenciaDoExtrato(contaId, contaNome, l.tx, alvo);
      desfazedores.current.set(l.tx.fitid, r.desfazer);
      alterou.current = true;
      setConfirmadas(m => new Map(m).set(l.tx.fitid, r.ids));
      setMarcadas(m => { const n = new Set(m); n.delete(l.tx.fitid); return n; });
      const sug = alvoDaTransferencia(!!l.sugestao?.transferencia, l.transferenciaProvavel).alvo;
      const aceitouASugestao = !!sug && sug.contaId === alvo.contaId && sug.lancamentoId === alvo.lancamentoId;
      marcar(l.tx.fitid, registroDe(l, aceitouASugestao ? "aceita" : "corrigida"));
      toast.success(`Transferência registrada: ${l.tx.tipo === "entrada" ? `${alvo.contaNome} → ${contaNome}` : `${contaNome} → ${alvo.contaNome}`}`,
        { action: { label: "Desfazer", onClick: () => desfazerLinha(l.tx.fitid, r.ids) } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao registrar a transferência");
    } finally {
      setSalvandoLinha(false);
    }
  }

  /** Um clique decide o grupo inteiro (mesma categoria e centro para todas as linhas). */
  async function confirmarGrupo(grupo: Grupo, escolha: { categoriaId: string; centroId?: string; projetoId?: string }) {
    const doGrupo = (linhas ?? []).filter(l => grupo.fitids.includes(l.tx.fitid) && l.situacao === "nova" && !confirmadas.has(l.tx.fitid));
    if (doGrupo.length === 0) return;
    if (comGuarda(doGrupo, () => void confirmarGrupo(grupo, escolha))) return;
    setSalvandoLinha(true);
    try {
      const itens: ParaRegistrar[] = doGrupo.map(l => ({ tx: l.tx, categoriaId: escolha.categoriaId, centroId: escolha.centroId, projetoId: escolha.projetoId, motivoNovo: reconhecidas.current.get(l.tx.fitid) }));
      const r = await registrarLote(contaId, itens, undefined, { fitidsDoArquivo: fitidsDoArquivo() });
      if (r.erros.length > 0 || r.ids.length !== itens.length) {
        toast.error(`Parte do grupo não foi gravada: ${r.erros[0] ?? "confira"}`);
        if (r.ids.length > 0) alterou.current = true;
        if ((r.ids.length > 0 || r.recusadas.length > 0) && transacoes) await analisarDeNovo(transacoes, true);
        return;
      }
      alterou.current = true;
      setConfirmadas(m => { const n = new Map(m); doGrupo.forEach((l, i) => n.set(l.tx.fitid, [r.ids[i]])); return n; });
      setRegistros(m => {
        const n = new Map(m);
        for (const l of doGrupo) {
          const s = l.sugestao;
          const mudou = escolha.categoriaId !== s?.categoriaId || (!!escolha.centroId && escolha.centroId !== s?.centroId);
          n.set(l.tx.fitid, registroDe(l, mudou ? "corrigida" : "aceita", { emGrupo: true }));
        }
        return n;
      });
      toast.success(`${doGrupo.length} linhas lançadas de uma vez`, { action: { label: "Desfazer", onClick: () => desfazerGrupo(doGrupo.map((l, i) => [l.tx.fitid, r.ids[i]] as [string, string])) } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao lançar o grupo");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function desfazerGrupo(pares: [string, string][]) {
    try {
      await excluirLancamentosEmLote(pares.map(p => p[1]));
      const fitids = new Set(pares.map(p => p[0]));
      setConfirmadas(m => new Map([...m].filter(([f]) => !fitids.has(f))));
      setRegistros(m => new Map([...m].filter(([f]) => !fitids.has(f))));
      toast.success(`${pares.length} lançamentos do grupo desfeitos`);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    }
  }

  async function ignorar(l: LinhaAnalisada, motivo: MotivoDeIgnorar, observacao: string) {
    setSalvandoLinha(true);
    try {
      await ignorarLinha(contaId, l.tx, motivo, observacao);
      setIgnorando(null);
      marcar(l.tx.fitid, registroDe(l, "ignorada"));
      setMarcadas(m => { const n = new Set(m); n.delete(l.tx.fitid); return n; });
      toast.success("Movimento ignorado — não volta nas próximas importações");
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível ignorar");
    } finally {
      setSalvandoLinha(false);
    }
  }

  async function reativar(l: LinhaAnalisada) {
    try {
      await reativarIgnorada(contaId, l.tx.fitid);
      setRegistros(m => { const n = new Map(m); n.delete(l.tx.fitid); return n; });
      toast.success("Movimento de volta à fila");
      if (transacoes) await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível reativar");
    }
  }

  // ── gravação em lote ──
  function pedirConfirmacao(candidatas: LinhaDaGrade[]) {
    if (candidatas.length === 0) { toast.info("Nenhuma linha pronta para lançar."); return; }
    const ids = new Set(candidatas.map(c => c.fitid));
    const alvo = (linhas ?? []).filter(l => ids.has(l.tx.fitid));
    if (comGuarda(alvo, () => pedirConfirmacao(candidatas))) return;
    setParaConfirmar(alvo);
  }

  async function gravar() {
    const alvo = paraConfirmar;
    setParaConfirmar(null);
    if (!alvo || !transacoes) return;
    const itens = alvo.map(itemDaLinha);
    setGravando({ feitos: 0, total: itens.length });
    try {
      const r = await registrarLote(contaId, itens, (feitos, total) => setGravando({ feitos, total }), { fitidsDoArquivo: fitidsDoArquivo() });
      if (r.erros.length > 0) toast.error(`Parte não foi gravada: ${r.erros[0]}`);
      if (r.ids.length > 0) {
        alterou.current = true;
        setLote({ loteId: r.loteId, ids: r.ids });
        toast.success(`${r.ids.length} lançamento${r.ids.length > 1 ? "s" : ""} criado${r.ids.length > 1 ? "s" : ""}.`);
        for (const l of alvo) marcar(l.tx.fitid, registroDe(l, foiCorrigida(daGradeBase(l), edicoes[l.tx.fitid]) ? "corrigida" : "aceita"));
      }
      await analisarDeNovo(transacoes, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gravar");
    } finally {
      setGravando(null);
    }
  }

  async function desfazer() {
    if (!lote || !transacoes) return;
    setDesfazendo(true);
    try {
      await desfazerLote(lote.ids);
      toast.success(`${lote.ids.length} lançamento${lote.ids.length > 1 ? "s" : ""} do lote desfeito${lote.ids.length > 1 ? "s" : ""}.`);
      setLote(null);
      alterou.current = true;
      await analisarDeNovo(transacoes, true);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível desfazer");
    } finally {
      setDesfazendo(false);
    }
  }

  async function aoSalvarForm() {
    const fitid = editarLinha?.tx.fitid ?? transferirTransacao?.fitid;
    const linha = editarLinha ?? (linhas ?? []).find(l => l.tx.fitid === fitid) ?? null;
    setEditarLinha(null);
    setTransferirTransacao(null);
    alterou.current = true;
    if (fitid && linha) marcar(fitid, registroDe(linha, "manual"));
    if (transacoes) await analisarDeNovo(transacoes, true);
  }

  function editar(fitid: string, patch: Edicao) {
    setEdicoes(prev => ({ ...prev, [fitid]: { ...prev[fitid], ...patch } }));
  }
  function alternarMarca(fitid: string, marcada: boolean) {
    setMarcadas(prev => { const n = new Set(prev); if (marcada) n.add(fitid); else n.delete(fitid); return n; });
  }

  // o lote nunca cria lançamento novo para um pagamento que tem OBRIGAÇÃO PREVISTA de valor igual: essa é liquidada, para baixar da Mesa de Operações
  const temObrigacaoExata = (fitid: string) => !!linhasPorFitid.get(fitid)?.documentos?.[0]?.exato;
  const identificadasProntas = identificadasParaConfirmar(grade, edicoes, marcadas).filter(g => !temObrigacaoExata(g.fitid));
  const marcadasProntas = marcadasParaGravar(grade, edicoes, marcadas).filter(g => !temObrigacaoExata(g.fitid));
  const resumoDoLote = useMemo(() => {
    const alvo = paraConfirmar ?? [];
    const soma = (t: string) => alvo.filter(l => l.tx.tipo === t).reduce((s, l) => s + l.tx.valor, 0);
    return { n: alvo.length, entradas: soma("entrada"), saidas: soma("saida") };
  }, [paraConfirmar]);

  const medicao = useMemo(() => {
    if (!aoAbrir) return null;
    return resumirMedicao(aoAbrir, totalDoArquivo, aoAbrir.identificadas + aoAbrir.revisar + aoAbrir.naoIdentificadas, [...registros.values()], agrupamentosAoAbrir ?? undefined);
  }, [aoAbrir, totalDoArquivo, registros, agrupamentosAoAbrir]);

  // o que o formulário "Editar" recebe — memoizado: o efeito do formulário reinicia a cada novo objeto
  const rascunho = useMemo(() => {
    if (!editarLinha) return undefined;
    const g = daGradeBase(editarLinha);
    const v = valoresEfetivos(g, edicoes[editarLinha.tx.fitid]);
    const f = favorecidoEfetivo(g, edicoes[editarLinha.tx.fitid]);
    return {
      data: editarLinha.tx.data, valor: editarLinha.tx.valor, descricao: editarLinha.tx.memo,
      forma: inferirFormaPagamento(editarLinha.tx.memo),
      categoriaId: v.categoriaId, centroId: v.centroId, projetoId: edicoes[editarLinha.tx.fitid]?.projetoId || undefined,
      pessoa: f.pessoa, fornecedor: f.fornecedor,
    };
  }, [editarLinha, edicoes]);

  const total = linhas?.length ?? 0;
  const ocupado = conciliando || !!gravando || desfazendo || salvandoLinha;
  const linhasDoGrupo = (g: Grupo) => (linhas ?? []).filter(l => g.fitids.includes(l.tx.fitid) && !confirmadas.has(l.tx.fitid));
  const pilha = (f: Filtro, n: number, classe: string, icone: React.ReactNode, texto: string) => (
    <button type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm ${classe} ${filtro === f ? "ring-2 ring-ring" : ""}`}>
      {icone} <b className="tabular-nums">{n}</b> {texto}
    </button>
  );


  // ── a Central: qual movimento está selecionado, e o painel dele ──
  const isMobile = useIsMobile();
  const [selFitid, setSelFitid] = useState<string | null>(null);
  const indiceDaSelecao = useRef(0);
  const resolvidaNaLista = (l: LinhaAnalisada) => confirmadas.has(l.tx.fitid) || l.situacao === "ja_registrada" || l.situacao === "ignorada";
  const itensDaLista = useMemo(() => pag.itens.map(l => ({ fitid: l.tx.fitid, resolvida: resolvidaNaLista(l) })), [pag.itens, confirmadas]); // eslint-disable-line react-hooks/exhaustive-deps
  const atual = pag.itens.find(l => l.tx.fitid === selFitid) ?? null;
  function selecionar(fitid: string) { setSelFitid(prev => (isMobile && prev === fitid ? null : fitid)); }
  useEffect(() => { const i = pag.itens.findIndex(l => l.tx.fitid === selFitid); if (i >= 0) indiceDaSelecao.current = i; }, [selFitid, pag.itens]);
  // a linha selecionada saiu da tela (resolvida e fora do filtro) ou ainda não há seleção: no computador, a seleção segue; no celular, fecha
  useEffect(() => {
    if (atual || pag.itens.length === 0) { if (!atual && selFitid) setSelFitid(null); return; }
    if (isMobile) { if (selFitid) setSelFitid(null); return; }
    setSelFitid(selecaoAposSumir(itensDaLista, selFitid ? indiceDaSelecao.current : 0));
  }, [atual, pag.itens.length, selFitid, isMobile, itensDaLista]);
  // resolveu a linha selecionada (continua na lista, como "lançado"): vai para a próxima por decidir
  const jaResolvida = useRef<string | null>(null);
  useEffect(() => {
    if (!atual || isMobile) { jaResolvida.current = null; return; }
    if (resolvidaNaLista(atual) && jaResolvida.current !== atual.tx.fitid) {
      jaResolvida.current = atual.tx.fitid;
      if (confirmadas.has(atual.tx.fitid)) setSelFitid(proximaPorDecidir(itensDaLista, atual.tx.fitid));
    }
  }, [atual, confirmadas, itensDaLista, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps
  // teclado: ↑ ↓ trocam de movimento; "/" abre Buscar e associar (nunca grava nada)
  useEffect(() => {
    if (!open || !linhas) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelectorAll('[role="dialog"],[role="alertdialog"]').length > 1) return;   // há outro diálogo por cima
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (alvo?.isContentEditable || alvo?.closest?.('[role="listbox"],[role="menu"]')) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setSelFitid(moverSelecao(itensDaLista, selFitid, e.key === "ArrowDown" ? 1 : -1)); }
      else if (e.key === "/" && atual && !ocupado) { e.preventDefault(); setBuscandoLinha(atual); }
      // Enter executa a ação PRINCIPAL da linha — só quando o foco NÃO está num botão/campo (corpo, o próprio diálogo) ou está na lista (noutro botão, Enter é o clique daquele botão). Despesa nova nunca é principal.
      else if (e.key === "Enter" && atual && !ocupado && (!alvo || !/^(BUTTON|A|INPUT|TEXTAREA|SELECT|SUMMARY)$/.test(alvo.tagName ?? "") || !!alvo.closest?.('ul[aria-label="Movimentos do extrato"]'))) {
        const principal = acaoPrincipalDa(atual);
        if (principal) { e.preventDefault(); principal(); }
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [open, linhas, itensDaLista, selFitid, atual, ocupado]);

  /** "Conciliar este lançamento" (H0, linha única): liga a linha do extrato ao lançamento que casou. */
  async function conciliarUma(l: LinhaAnalisada) {
    if (!l.lancamentoId || !transacoes) return;
    setConciliando(true);
    try {
      const r = await conciliarPagamentos([{ lancamentoId: l.lancamentoId, tx: l.tx }]);
      if (r.conciliados.length > 0) { toast.success("Conciliado, com o vínculo do extrato"); alterou.current = true; }
      if (r.erros.length > 0) toast.error(r.erros[0]);
      await analisarDeNovo(transacoes, false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao conciliar");
    } finally {
      setConciliando(false);
    }
  }

  /**
   * A ação PRINCIPAL de uma linha (a tecla Enter): vincular, liquidar a conta, gerar e liquidar a recorrência, conciliar, conciliar o débito. Despesa NOVA nunca é principal —
   * e nenhuma delas grava sem o clique/diálogo de confirmação que já tinha.
   */
  function acaoPrincipalDa(l: LinhaAnalisada): (() => void) | null {
    if (confirmadas.has(l.tx.fitid)) return null;
    const r = resolverMovimento(l);
    const revelada = !!edicoes[l.tx.fitid]?.revelarNova;
    if (r.h === "H0" && r.modo === "vincular") return () => setConfirmandoVinculo([l]);
    if (r.h === "H0" && r.modo === "conciliar") return () => void conciliarUma(l);
    if (r.h === "H1" && (l.situacao === "documento" || !revelada)) return () => setLiquidarLinha(l);
    if (r.h === "H2" && !revelada) return () => void gerarELiquidarRecorrencia(l);
    if (r.h === "H3" && r.modo === "debito") return () => void conciliarOsDebitos([l]);
    return null;
  }

  /** O painel de decisão de UMA linha: o que o sistema achou (H0–H4) e as ações, uma por linha (a principal destacada, "Buscar e associar" sempre presente). */
  function decisaoDaLinha(l: LinhaAnalisada) {
    const fitid = l.tx.fitid;
    const lancadaAgora = confirmadas.get(fitid);
    const r = resolverMovimento(l);
    const cabecalho = <CabecalhoDoPainel linha={l} contaNome={contaNome} />;
    const buscar = <AcaoDoPainel variante="fixa" icone={<Search className="h-4 w-4" />} atalho="/" disabled={ocupado} onClick={() => setBuscandoLinha(l)}>{ROTULO_BUSCAR}</AcaoDoPainel>;
    const ignorar = ignorarDisponivel ? <AcaoDoPainel icone={<BanIcon className="h-4 w-4" />} disabled={ocupado} onClick={() => setIgnorando(l)}>Ignorar este movimento</AcaoDoPainel> : null;
    const dataLanc = (iso: string) => dataBr(iso.slice(0, 10));

    if (lancadaAgora) {
      return (
        <div className="space-y-2.5">
          {cabecalho}
          <CaixaDeResposta tom="ok" titulo="✓ Lançado agora" porque="Gravado nesta rodada — dá para desfazer.">Este movimento já saiu da fila.</CaixaDeResposta>
          <ListaDeAcoes><AcaoDoPainel icone={<Undo2 className="h-4 w-4" />} disabled={ocupado} onClick={() => desfazerLinha(fitid, lancadaAgora)}>Desfazer o lançamento</AcaoDoPainel></ListaDeAcoes>
        </div>
      );
    }
    if (l.situacao === "nova" && l.sugestao) {
      return (
        <CartaoDaLinha linha={l} edicao={edicoes[fitid]} marcada={marcadas.has(fitid)} ocupado={ocupado}
          categorias={categoriasPorTipo[l.tx.tipo]} opcoesDeCentro={opcoesDeCentro} projetos={projetos} nomeDaCategoria={nomeDaCategoria}
          ignorarDisponivel={ignorarDisponivel}
          onEditar={patch => editar(fitid, patch)} onMarcar={c => alternarMarca(fitid, c)}
          onConfirmar={() => confirmarLinha(l)} onFormulario={() => setEditarLinha(l)}
          outrasContas={outrasContas} contaNome={contaNome} onConfirmarTransferencia={alvo => confirmarTransferencia(l, alvo)}
          onLiquidar={() => setLiquidarLinha(l)} onBuscar={() => setBuscandoLinha(l)} onGerarRecorrencia={() => void gerarELiquidarRecorrencia(l)}
          onTransferencia={() => setTransferirTransacao(l.tx)} onIgnorar={() => setIgnorando(l)} />
      );
    }

    let corpo: React.ReactNode = null;
    if (r.h === "H0" && r.modo === "vincular") {
      const lc = r.jaRegistrado.lancamento;
      corpo = (
        <>
          <CaixaDeResposta tom="h0" titulo="⚠ Este movimento já parece estar registrado" porque={r.jaRegistrado.motivo}>
            <b>{lc.rotulo ?? "lançamento existente"}</b> · <b className="tabular-nums">{brl(lc.valor)}</b> · {dataLanc(lc.data_pagamento ?? lc.data)}
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<CheckCircle2 className="h-4 w-4" />} atalho="Enter" disabled={ocupado} onClick={() => setConfirmandoVinculo([l])}>Vincular ao lançamento existente</AcaoDoPainel>
            {buscar}
            <AcaoDoPainel dica="pede o motivo" disabled={ocupado} onClick={() => { setMotivoH0(""); setNaoEJaRegistrada(l); }}>Não é este movimento — é outro pagamento</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </>
      );
    } else if (r.h === "H0" && r.modo === "conciliar") {
      corpo = (
        <>
          <CaixaDeResposta tom="h0" titulo="✅ Casa com um lançamento já registrado"
            porque={r.semVinculo ? "O lançamento está CONFERIDO, sem vínculo com o banco — conciliar liga a linha do extrato a ele (fica Conciliado)." : "O lançamento já registrado será conciliado com esta linha do extrato."}>
            Mesmo valor e data próxima: nada será criado.
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<CheckCircle2 className="h-4 w-4" />} atalho="Enter" disabled={ocupado} onClick={() => void conciliarUma(l)}>Conciliar este lançamento</AcaoDoPainel>
            {buscar}
            {ignorar}
          </ListaDeAcoes>
        </>
      );
    } else if (r.h === "H0") {
      corpo = (
        <>
          <CaixaDeResposta tom="h0" titulo="⚠ Há lançamentos parecidos já registrados">Confira à mão antes de criar outro.</CaixaDeResposta>
          <ListaDeAcoes>
            {buscar}
            <AcaoDoPainel icone={<Pencil className="h-4 w-4" />} disabled={ocupado} onClick={() => setEditarLinha(l)}>Lançar no formulário (se for mesmo outro pagamento)</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </>
      );
    } else if (r.h === "H1") {
      const d = r.documento;
      const todos = [d.documento, ...d.outrosAbertos].sort((a, b) => a.data.localeCompare(b.data));
      corpo = (
        <>
          <CaixaDeResposta tom="h1"
            titulo={d.ambiguo ? `⚠ ${todos.length} documentos em aberto do mesmo fornecedor — escolha o contrato` : d.segundoContrato ? "✅ Possível segundo contrato" : d.exato ? "✅ Documento a pagar encontrado" : "⚠ Diferença identificada"}
            porque={d.motivo}>
            {!d.ambiguo && <><b>{d.documento.fornecedor_nome ?? d.documento.descricao ?? "documento"}</b> · vence {dataBr(d.documento.data)} · <b className="tabular-nums">{brl(d.documento.valor)}</b> · confiança <b className="tabular-nums">{d.confianca}%</b></>}
            {!d.ambiguo && !d.exato && <> · diferença <b className="tabular-nums">{d.diferenca > 0 ? "+" : "−"}{brl(Math.abs(d.diferenca))}</b></>}
            {(d.ambiguo || d.segundoContrato) && (
              <span className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                {todos.map(x => (
                  <span key={x.id} className={x.id === d.documento.id && d.segundoContrato ? "font-medium text-foreground" : ""}>
                    {x.descricao ?? "Contrato"} · vence {dataBr(x.data)} · <span className="tabular-nums">{brl(x.valor)}</span>
                    {Math.abs(x.valor - l.tx.valor) < 0.005 && <span className="text-success-text"> ← valor igual</span>}
                  </span>
                ))}
              </span>
            )}
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<Scale className="h-4 w-4" />} atalho="Enter" disabled={ocupado} onClick={() => setLiquidarLinha(l)}>
              {d.ambiguo ? "Escolher o contrato" : d.exato ? "Liquidar obrigação prevista" : "Explicar a diferença e liquidar"}
            </AcaoDoPainel>
            {buscar}
            <AcaoDoPainel dica="vira pagamento novo" disabled={ocupado} onClick={() => naoEEsteDocumento(fitid)}>Não é este documento</AcaoDoPainel>
            {ignorar}
          </ListaDeAcoes>
        </>
      );
    } else if (r.h === "H3" && r.modo === "debito" && l.debito) {
      corpo = (
        <>
          <CaixaDeResposta tom="h3" titulo="↻ Débito automático encontrado" porque={`${l.debito.confianca}% · ${l.debito.motivos.join(" · ")}`}>
            <b>{l.debito.candidato.fornecedor || l.debito.candidato.descricao || "previsto"}</b> · vencimento {dataBr(l.debito.candidato.data)} · previsto <b className="tabular-nums">{brl(l.debito.candidato.valor)}</b>
          </CaixaDeResposta>
          <ListaDeAcoes>
            <AcaoDoPainel variante="principal" icone={<Scale className="h-4 w-4" />} atalho="Enter" disabled={ocupado} onClick={() => void conciliarOsDebitos([l])}>Conciliar o débito</AcaoDoPainel>
            {buscar}
            {ignorar}
          </ListaDeAcoes>
        </>
      );
    } else if (r.h === "resolvida" && r.motivo === "ignorada" && l.ignorada) {
      corpo = (
        <>
          <CaixaDeResposta tom="h4" titulo="⊘ Movimento ignorado" porque="Não volta nas próximas importações.">
            {ROTULO_DO_MOTIVO[l.ignorada.motivo]}{l.ignorada.observacao ? `: ${l.ignorada.observacao}` : ""}
          </CaixaDeResposta>
          <ListaDeAcoes><AcaoDoPainel icone={<RotateCcw className="h-4 w-4" />} disabled={ocupado} onClick={() => reativar(l)}>Reativar (volta para a fila)</AcaoDoPainel></ListaDeAcoes>
        </>
      );
    } else if (r.h === "resolvida") {
      corpo = <CaixaDeResposta tom="ok" titulo="✓ Já registrado" porque="Não será criado de novo.">{l.motivoJaRegistrada ?? "o mesmo identificador do banco já está no sistema"}</CaixaDeResposta>;
    } else {
      corpo = <ListaDeAcoes>{buscar}{ignorar}</ListaDeAcoes>;
    }
    return <div className="space-y-2.5">{cabecalho}{corpo}</div>;
  }

  return (
    <>
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-5xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl flex items-center gap-2">
            <Scale className="w-5 h-5 text-gold" /> Mesa de conciliação (extrato OFX)
          </DialogTitle>
          <DialogDescription>
            Lê o extrato de <strong>{contaNome}</strong>, identifica quem é cada movimento e sugere categoria e centro de custo.
            Você confirma o que veio certo, troca o que veio errado na própria linha e só abre o formulário nas exceções — nada é
            gravado antes do seu clique, e tudo pode ser desfeito.
          </DialogDescription>
        </DialogHeader>

        {!arquivo ? (
          <label className="cursor-pointer block">
            <input type="file" accept=".ofx,.OFX" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processarArquivo(f); }} />
            <div className="flex flex-col items-center gap-2 border-2 border-dashed rounded-md p-8 hover:border-gold/40">
              <FileUp className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm">Selecionar arquivo .OFX</span>
            </div>
          </label>
        ) : processando || !linhas ? (
          <p className="text-sm text-center text-muted-foreground py-8 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lendo o extrato e identificando os movimentos…
          </p>
        ) : (
          <div className="space-y-3">
            {/* a fila: três pilhas, cada uma é um filtro */}
            <div className="rounded-md border p-3 space-y-2.5">
              <p className="text-sm font-medium">{total} movimentações no extrato</p>
              <div className="flex flex-wrap gap-2">
                {pilha("identificadas", contagem.identificadas, "border-success-line bg-success-soft text-success-text", <CheckCircle2 className="w-4 h-4" />, "identificadas")}
                {pilha("revisar", contagem.revisar, "border-warning-line bg-warning-soft text-warning-text", <AlertTriangle className="w-4 h-4" />, "precisam de revisão")}
                {pilha("nao_identificadas", contagem.nao_identificadas, "border-destructive-line bg-destructive-soft text-destructive-text", <XCircle className="w-4 h-4" />, "não identificadas")}
              </div>
              {(contagem.transferencias + contagem.conciliar + contagem.ja_registradas + contagem.ignoradas) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Fora da fila: {contagem.conciliar} a conciliar com lançamentos já feitos · {contagem.ja_registradas} já registrada{contagem.ja_registradas !== 1 ? "s" : ""} (não serão criadas de novo) · {contagem.ignoradas} ignorada{contagem.ignoradas !== 1 ? "s" : ""} · {contagem.transferencias} parece{contagem.transferencias !== 1 ? "m" : ""} transferência entre contas.
                </p>
              )}
              {aVincular.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 p-2.5 flex flex-wrap items-center gap-2" role="status">
                  <p className="text-sm flex-1 min-w-0">
                    <b className="tabular-nums">{aVincular.length}</b> de {total} movimentos <b>já estão registrados</b> no sistema, vindos de outra importação (o banco numera cada exportação de um jeito).
                    Vincule-os ao que já existe — <b>nada será criado</b>. Se algum for outro pagamento, diga na própria linha.
                  </p>
                  <Button type="button" size="sm" className="gap-1.5" disabled={ocupado} onClick={() => setConfirmandoVinculo(aVincular)}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Vincular todos ({aVincular.length})
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => setFiltro("vincular")}>Ver a lista</Button>
                </div>
              )}
              {documentosEncontrados.length > 0 && (
                <div className="rounded-md border border-warning-line bg-warning-soft/40 p-2.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm flex-1 min-w-0">
                    <b className="tabular-nums">{documentosEncontrados.length}</b> pagamento{documentosEncontrados.length > 1 ? "s" : ""} do extrato quita{documentosEncontrados.length > 1 ? "m" : ""} documento{documentosEncontrados.length > 1 ? "s" : ""} a pagar
                    {divergentes.length > 0 && <> — <b className="tabular-nums text-warning-text">{divergentes.length} com diferença de valor</b></>}.
                    Revise cada um: nada é liquidado sem o seu clique.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={ocupado}
                    onClick={() => setLiquidarLinha(divergentes[0] ?? documentosEncontrados[0])}>
                    <Scale className="w-3.5 h-3.5" /> Revisar {divergentes.length > 0 ? "diferenças" : "documentos"}
                  </Button>
                </div>
              )}
              {debitosEncontrados.length > 0 && (
                <div className="rounded-md border border-info-line bg-info-soft/40 p-2.5 flex flex-wrap items-center gap-2">
                  <p className="text-sm flex-1 min-w-0">
                    <b className="tabular-nums">{debitosEncontrados.length}</b> débito{debitosEncontrados.length > 1 ? "s" : ""} automático{debitosEncontrados.length > 1 ? "s" : ""} encontrado{debitosEncontrados.length > 1 ? "s" : ""} no extrato — já estavam previstos.
                  </p>
                  <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={ocupado}
                    onClick={() => conciliarOsDebitos(debitosEncontrados)}>
                    <Scale className="w-3.5 h-3.5" /> Conciliar débitos ({debitosEncontrados.length})
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="gap-1.5" disabled={ocupado || identificadasProntas.length === 0}
                  onClick={() => pedirConfirmacao(identificadasProntas)}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar identificadas ({identificadasProntas.length})
                </Button>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={contagem.pendencias === 0}
                  onClick={() => setFiltro("pendencias")}>
                  <HelpCircle className="w-3.5 h-3.5" /> Revisar pendências ({contagem.pendencias})
                </Button>
                <Button type="button" size="sm" variant={agrupar ? "secondary" : "outline"} className="gap-1.5" aria-pressed={agrupar} onClick={() => setAgrupar(v => !v)}>
                  <Layers className="w-3.5 h-3.5" /> Agrupar por padrão
                </Button>
              </div>
              {gravando && (
                <p className="text-xs text-muted-foreground flex items-center gap-2" role="status">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gravando… {gravando.feitos} de {gravando.total}
                </p>
              )}
            </div>

            {medicao && <PainelDeMedicao medicao={medicao} rotulo={contaNome} />}

            {transacoes && <PainelInvestFacil contaId={contaId} contaNome={contaNome} transacoes={transacoes} aoGravar={() => { alterou.current = true; }} />}

            {lote && (
              <div className="rounded-md border border-success-line bg-success-soft/40 p-3 flex flex-wrap items-center gap-2">
                <p className="text-sm text-success-text flex-1 min-w-0">
                  <b>{lote.ids.length}</b> lançamento{lote.ids.length > 1 ? "s" : ""} criado{lote.ids.length > 1 ? "s" : ""} neste lote.
                </p>
                <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={desfazendo} onClick={desfazer}>
                  {desfazendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />} Desfazer este lote
                </Button>
              </div>
            )}

            {/* a barra da Central: o total e as 6 hipóteses (filtros antigos, como "Revisar pendências", aparecem como um chip a mais) */}
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar movimentações">
              {[...CHIPS_DA_CENTRAL, ...(CHIPS_DA_CENTRAL.includes(filtro) ? [] : [filtro])].map(f => (
                <button key={f} type="button" role="tab" aria-selected={filtro === f}
                  onClick={() => setFiltro(f)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro === f ? "bg-foreground text-background border-foreground" : "bg-card hover:bg-muted"}`}>
                  {f === "todas" ? <><b className="tabular-nums">{total}</b> movimentos</> : <>{ROTULO_DO_FILTRO[f]} <span className="tabular-nums opacity-80">{contagem[f]}</span></>}
                </button>
              ))}
            </div>

            <AvisoDosGrupos grupos={agrupamento.inseguros} linhas={linhasPorFitid} nomeDaCategoria={nomeDaCategoria} />

            {/* os grupos SEGUROS: uma decisão para várias linhas do mesmo padrão */}
            {agrupamento.grupos.length > 0 && (
              <div className="space-y-2" aria-label="Linhas do mesmo padrão">
                {agrupamento.grupos.map(g => (
                  <CartaoDoGrupo key={`${g.tipo}|${g.chave}|${g.fitids.length}`} grupo={g} linhas={linhasDoGrupo(g)}
                    categorias={categoriasPorTipo[g.tipo]} opcoesDeCentro={opcoesDeCentro} projetos={projetos} nomeDaCategoria={nomeDaCategoria}
                    ocupado={ocupado} onConfirmar={confirmarGrupo} />
                ))}
              </div>
            )}

            <div ref={topoRef} aria-hidden className="h-0" />
            {/* a central: lista à esquerda, painel de decisão à direita (no celular o painel abre sob a linha) */}
            {pag.itens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{agrupamento.grupos.length > 0 ? "O resto desta pilha está nos grupos acima." : "Nenhuma movimentação neste filtro."}</p>
            ) : (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-start" data-central>
                <ListaDeMovimentos itens={pag.itens} selecionada={atual?.tx.fitid ?? null} confirmadas={confirmadas}
                  categoriaSugerida={l => (l.sugestao?.categoriaId ? nomeCurtoDaCategoria(nomeDaCategoria(l.sugestao.categoriaId)) : null)}
                  ocupado={ocupado} onSelecionar={selecionar} onDesfazer={desfazerLinha}
                  rodape={`${(pag.pagina - 1) * POR_PAGINA + 1}–${Math.min(pag.pagina * POR_PAGINA, naLista.length)} de ${naLista.length}`}
                  painelInline={isMobile && atual ? <div data-painel className="space-y-1.5 text-sm">{decisaoDaLinha(atual)}</div> : undefined} />
                {!isMobile && (
                  <aside data-painel aria-label="Decisão do movimento" className="space-y-1.5 rounded-md border bg-card p-3 text-sm md:sticky md:top-0 md:max-h-[calc(90vh-3rem)] md:overflow-y-auto md:overscroll-contain">
                    {atual ? decisaoDaLinha(atual) : <p className="text-muted-foreground">Escolha um movimento na lista.</p>}
                  </aside>
                )}
              </div>
            )}

            {pag.paginas > 1 && (
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" disabled={pag.pagina <= 1} onClick={() => irParaPagina(pag.pagina - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                </Button>
                <span className="tabular-nums">Página {pag.pagina} de {pag.paginas} · {naLista.length} linhas</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1" disabled={pag.pagina >= pag.paginas} onClick={() => irParaPagina(pag.pagina + 1)}>
                  Próxima <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={() => { descartarRascunho(contaId); reiniciar(); }} disabled={ocupado}>Trocar arquivo</Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => fechar(false)} disabled={ocupado}>Fechar</Button>
          {linhas && aConciliar.length > 0 && (
            <Button variant="success" type="button" onClick={conciliar} disabled={ocupado} className="gap-1.5">
              <Scale className="w-3.5 h-3.5" /> {conciliando ? "..." : `Conciliar ${aConciliar.length}`}
            </Button>
          )}
          {linhas && marcadasProntas.length > 0 && (
            <Button type="button" onClick={() => pedirConfirmacao(marcadasProntas)} disabled={ocupado} className="gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> Lançar marcadas ({marcadasProntas.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* a última chance antes de gravar em massa */}
    <AlertDialog open={!!paraConfirmar} onOpenChange={(v) => { if (!v) setParaConfirmar(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Lançar {resumoDoLote.n} movimentação{resumoDoLote.n !== 1 ? "ões" : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            Serão criados {resumoDoLote.n} lançamentos em <strong>{contaNome}</strong>, já conciliados com o extrato:
            entradas de {brl(resumoDoLote.entradas)} e saídas de {brl(resumoDoLote.saidas)}. Logo depois você
            pode desfazer o lote inteiro.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={gravar}>Lançar {resumoDoLote.n}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* D3: este pagamento parece quitar uma conta em aberto. Nada é criado nem ligado até a tesouraria escolher. */}
    <AlertDialog open={!!guarda} onOpenChange={(v) => { if (!v) setGuarda(null); }}>
      <AlertDialogContent>
        {guarda && (() => {
          const um = guarda.pedidos.length === 1;
          const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
          return (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{um ? "Este pagamento parece quitar uma conta em aberto" : `${guarda.pedidos.length} pagamentos parecem quitar contas em aberto`}</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-sm">
                    <p>Se for isso, o certo é <b>liquidar a conta</b> — ela mesma passa a paga, sem criar um segundo registro. Criar como novo deixa a conta aberta na Mesa de Operações.</p>
                    <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                      {guarda.pedidos.map(p => (
                        <li key={p.fitid} className="rounded border px-2 py-1.5 text-xs">
                          <p className="truncate"><b className="tabular-nums">{brl(p.valor)}</b> em {dataBr(p.data)} — {p.memo}</p>
                          <p className="text-muted-foreground">{p.recorrencia ? "Recorrência sem conta gerada" : "Conta em aberto"}: <b>{p.conta}</b>, vence {dataBr(p.vencimento)}, {brl(p.valorDaConta)}{p.exato ? " (valor igual)" : " (valor diferente)"}</p>
                        </li>
                      ))}
                    </ul>
                    <div className="space-y-1.5" role="group" aria-label="Por que é uma despesa nova">
                      <p className="text-xs font-medium">Para criar como nova despesa, diga por quê <span className="text-destructive-text">(obrigatório)</span></p>
                      <div className="flex flex-wrap gap-1.5">
                        {MOTIVOS_DE_DESPESA_NOVA.map(m => (
                          <button key={m} type="button" aria-pressed={motivoDaGuarda === m} onClick={() => setMotivoDaGuarda(m)}
                            className={`h-8 rounded-md border px-2.5 text-xs ${motivoDaGuarda === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>{m}</button>
                        ))}
                        <input type="text" aria-label="Outro motivo" placeholder="Outro motivo…" maxLength={140}
                          value={(MOTIVOS_DE_DESPESA_NOVA as readonly string[]).includes(motivoDaGuarda) ? "" : motivoDaGuarda} onChange={e => setMotivoDaGuarda(e.target.value)}
                          className="h-8 w-52 min-w-0 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="gap-2 sm:gap-2">
                <AlertDialogCancel>Voltar</AlertDialogCancel>
                <Button type="button" variant="outline" disabled={!motivoDaGuarda.trim()} onClick={() => {
                  const g = guarda; setGuarda(null);
                  for (const p of g.pedidos) reconhecidas.current.set(p.fitid, motivoDaGuarda.trim());
                  g.seguir();
                }}>{um ? "É outro pagamento — criar mesmo assim" : "São outros pagamentos — criar mesmo assim"}</Button>
                <Button type="button" onClick={() => {
                  const primeiro = (linhas ?? []).find(l => l.tx.fitid === guarda.pedidos[0].fitid);
                  setGuarda(null);
                  if (primeiro?.recorrenciaCompativel && !primeiro.documentos?.length) void gerarELiquidarRecorrencia(primeiro);
                  else if (primeiro) setLiquidarLinha({ ...primeiro, situacao: "documento" });
                }}>{guarda.pedidos[0].recorrencia ? "Gerar e liquidar a recorrência" : "Liquidar a conta em aberto"}{um ? "" : " (a primeira)"}</Button>
              </AlertDialogFooter>
            </>
          );
        })()}
      </AlertDialogContent>
    </AlertDialog>

    {/* H0: vincular — nada é criado; só liga a linha do banco ao lançamento que já existe */}
    <AlertDialog open={!!confirmandoVinculo} onOpenChange={v => { if (!v) setConfirmandoVinculo(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Vincular {confirmandoVinculo?.length ?? 0} movimento{(confirmandoVinculo?.length ?? 0) !== 1 ? "s" : ""} ao que já existe?</AlertDialogTitle>
          <AlertDialogDescription>
            Cada linha do extrato será ligada ao lançamento que já a registra (mesmo valor e mesmo dia). <b>Nenhum lançamento é criado, apagado ou alterado</b> — só acrescenta-se o identificador
            desta exportação, para a próxima importação reconhecer. Logo depois dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={() => confirmandoVinculo && void vincular(confirmandoVinculo)}>Vincular</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* "Não é este movimento": o motivo é obrigatório e fica gravado no lançamento novo */}
    <AlertDialog open={!!naoEJaRegistrada} onOpenChange={v => { if (!v) { setNaoEJaRegistrada(null); setMotivoH0(""); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Por que este movimento é outro pagamento?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              {naoEJaRegistrada?.jaRegistrado && <p>O sistema acha que ele já está registrado como <b>{naoEJaRegistrada.jaRegistrado.lancamento.rotulo ?? "lançamento existente"}</b> ({brl(naoEJaRegistrada.jaRegistrado.lancamento.valor)}). Para criar uma despesa nova, diga por quê:</p>}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo">
                {["Dois pagamentos iguais no mesmo dia", "O lançamento existente é de outro pagamento"].map(m => (
                  <button key={m} type="button" aria-pressed={motivoH0 === m} onClick={() => setMotivoH0(m)}
                    className={`h-8 rounded-md border px-2.5 text-xs ${motivoH0 === m ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-background hover:bg-muted"}`}>{m}</button>
                ))}
              </div>
              <input type="text" aria-label="Outro motivo" placeholder="Ou escreva o motivo…" maxLength={140} value={motivoH0} onChange={e => setMotivoH0(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <Button type="button" disabled={!motivoH0.trim()} onClick={() => void confirmarNaoEJaRegistrada()}>Seguir como {naoEJaRegistrada?.tx.tipo === "entrada" ? "receita nova" : "despesa nova"}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <BuscarEAssociarDialog linha={buscandoLinha} contaId={contaId} ocupado={ocupado}
      onFechar={() => setBuscandoLinha(null)}
      onLiquidar={c => buscandoLinha && liquidarEscolhida(buscandoLinha, c)}
      onVincular={c => buscandoLinha && void vincularEscolhido(buscandoLinha, c)} />

    <IgnorarLinhaDialog linha={ignorando} ocupado={salvandoLinha} onFechar={() => setIgnorando(null)} onConfirmar={ignorar} />

    <LiquidarPeloExtratoDialog linha={liquidarLinha} contaId={contaId} onFechar={() => setLiquidarLinha(null)} onFeito={aoLiquidar} />

    {/* Editar uma linha — o MESMO formulário de sempre, já com o que foi sugerido. Dialog irmão,
        nunca aninhado (mesmo padrão de FinancasConta.tsx). */}
    <LancamentoForm
      open={!!editarLinha}
      onOpenChange={(v) => { if (!v) setEditarLinha(null); }}
      contaIdPadrao={contaId}
      contaTravada
      contaNomeTravado={contaNome}
      tipoPadrao={editarLinha?.tx.tipo as FinMovimentoTipo}
      rascunho={rascunho}
      onSaved={aoSalvarForm}
    />

    {/* Se a transação é SAÍDA desta conta, esta conta é a origem; se é ENTRADA, é o destino —
        a pessoa só escolhe o outro lado. */}
    <TransferenciaForm
      open={!!transferirTransacao}
      onOpenChange={(v) => { if (!v) setTransferirTransacao(null); }}
      contaOrigemPadrao={transferirTransacao?.tipo === "saida" ? contaId : undefined}
      contaDestinoPadrao={transferirTransacao?.tipo === "entrada" ? contaId : undefined}
      valorPadrao={transferirTransacao?.valor}
      dataPadrao={transferirTransacao?.data}
      descricaoPadrao={transferirTransacao?.memo}
      onSaved={aoSalvarForm}
    />
    </>
  );
}
