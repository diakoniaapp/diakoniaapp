// ─── ExtratoContaDrawer.tsx — o extrato de uma conta sem sair do workspace ──
//
// Fase 11c do Workspace Financeiro (23/09/2026, mapa em
// https://claude.ai/artifact/45q7ziY7o3bsJrh9Zap1Rx) — o maior dos drawers,
// e por isso o único que NÃO é uma cópia 1:1 de `FinancasConta.tsx`
// (1311 linhas). Três coisas ficam de fora de propósito, não por
// esquecimento:
//
//   Impressão/PDF        a técnica (`.relatorio-page` escapando o layout
//                        via `position: absolute`, CSS de @media print
//                        calculado pro papel A4) é amarrada à PÁGINA. Dentro
//                        de um Sheet — outro portal, outra árvore DOM — não
//                        há garantia de que `body * { visibility: hidden }`
//                        ainda esconde o que devia. Em vez de arriscar um
//                        PDF quebrado, "Imprimir / PDF" abre a página
//                        completa (que já resolve isso) numa aba nova.
//
//   Filtro por coluna     estilo Excel (Data específica, Valor mín/máx via
//   (popover no cabeçalho) popover no cabeçalho, com CabecalhoFiltro) — é
//                        refinamento de quem já está fundo numa auditoria
//                        de extrato. O drawer é pra revisão rápida durante
//                        o trabalho do dia; a barra de filtro comum (tipo,
//                        categoria, centro, busca, período) já cobre o que
//                        se usa martelando o dia inteiro. Quem precisar do
//                        filtro fino abre a página — ela continua existindo,
//                        inalterada.
//
//   Persistência na URL   (MUDOU em 06/10/2026) a URL deste painel continua sendo a do Painel
//                        da Tesouraria, então os filtros NÃO vão para ela. Em vez disso, vivem
//                        no contexto de trabalho compartilhado (`lib/contextoExtrato.ts`,
//                        sessionStorage), o mesmo que a página "Extrato completo" lê e grava:
//                        período, tipo, categoria, centro, fornecedor, busca, faixa de valor e
//                        tela cheia. Fechar e reabrir o painel — ou ir ao extrato completo e
//                        voltar — retoma exatamente dali, inclusive a rolagem da lista.
//
// TELA CHEIA: o MESMO painel ocupando a janela, com os filtros numa coluna à esquerda e Saldo
// inicial/final, Centro e Subcentro à vista. Nada é recarregado: só o layout muda (a tabela
// continua sendo o mesmo elemento), por isso filtros, busca e rolagem sobrevivem ao alternar.
//// O resto — sticky header, seleção em lote, conciliar/excluir em lote,
// todos os 7 diálogos (lançamento, transferência, anexos, OFX, Omie,
// fatura, exclusão) — é o MESMO serviço e o MESMO comportamento, só que
// o sticky do cabeçalho da tabela ficou mais simples aqui: o Sheet já tem
// scroll próprio, sem precisar medir a "faixa fixa" com ResizeObserver
// pra brigar com o scroll do `<main>` (só existia na página porque lá o
// cabeçalho competia com o scroll da JANELA inteira).

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CampoData } from "@/components/CampoData";
import { paraNumero } from "@/lib/dinheiro";
import {
  DollarSign, Loader2, Plus, Search, TrendingUp, TrendingDown,
  Pencil, Trash2, Paperclip, Files, Scale, FileUp, ExternalLink,
  ArrowRightLeft, RefreshCw, Layers, FolderKanban, Maximize2, Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentosSemTeto, excluirLancamento, excluirLancamentosEmLote, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL, nomeExtrato,
  conciliarEmLote, listarCategorias, listarCentrosCusto, listarFornecedores,
  type FinFornecedor, type FinConta, type FinLancamentoExtenso, type FinMovimentoTipo, type FinStatus,
  type FinCategoria, type FinCentroCusto,
  STATUS_LABEL,
} from "@/services/finService";
import { calcularExtrato, saldoAntesDe } from "@/services/saldoService";
import { iconeConta } from "@/pages/Financas";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { EditarTransferenciaForm } from "@/components/financas/EditarTransferenciaForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { ImportacaoOmieDialog } from "@/components/financas/ImportacaoOmieDialog";
import { ImportacaoFaturaDialog } from "@/components/financas/ImportacaoFaturaDialog";
import { toYmd } from "@/lib/data";
import { resolverPeriodo, type PeriodoPreset } from "@/components/financas/SeletorPeriodo";
import { centroESubcentro } from "@/lib/centroSubcentro";
import {
  contextoParaQuery, lerContextoExtrato, prometerRetorno, salvarContextoExtrato,
} from "@/lib/contextoExtrato";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const STATUS_COR: Record<FinStatus, string> = {
  realizado:  "text-foreground",
  conciliado: "text-success-text",
  previsto:   "text-warning-text",
  cancelado:  "text-muted-foreground line-through",
  aguardando_aprovacao: "text-info-text",
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // `null` = modo consolidado "Todas as Contas" (pedido dela, 30/09/2026,
  // vendo o seletor de conta do Omie: uma opção no topo pra ver o extrato
  // de todas as contas junto, sem escolher uma de cada vez). Nesse modo:
  // sem `carregarConta` (não existe UMA conta pra mostrar saldo/tipo no
  // cabeçalho — a soma já aparece no card "Todas as Contas" do Painel),
  // a coluna "Conta" aparece na tabela pra identificar de onde veio cada
  // linha, e os botões que exigem uma conta-alvo única (OFX, Omie,
  // Fatura, Transferir, "Extrato completo") somem — importar/transferir
  // pede uma conta específica, e continuam disponíveis abrindo o drawer
  // de uma conta só.
  contaId: string | null;
  // Lista de contas pro seletor do cabeçalho (pedido dela, 30/09/2026,
  // vendo a tela "Movimentação de Contas" do Omie: lá a conta se troca
  // por uma lista suspensa, sem fechar a tela e escolher outro card).
  // O Painel já carrega essa lista pro grid de cards — reaproveitada
  // aqui, não buscada de novo.
  contas: FinConta[];
  onTrocarConta: (id: string | null) => void;
  onChange?: () => void;
  /** Voltando do "Extrato completo": quanto a lista estava rolada quando a pessoa saiu. */
  rolagemInicial?: number;
}

export function ExtratoContaDrawer({ open, onOpenChange, contaId, contas, onTrocarConta, onChange, rolagemInicial }: Props) {
  // O contêiner rolável da lista. Guardamos a rolagem ao sair para o extrato completo e a
  // devolvemos quando os dados voltam — "exatamente de onde estava".
  const listaRef = useRef<HTMLDivElement | null>(null);
  const rolagemPendente = useRef<number | null>(rolagemInicial ?? null);
  const [conta, setConta] = useState<FinConta | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  // O contexto de trabalho (período, filtros, tela cheia) é COMPARTILHADO com a página
  // "Extrato completo" — ver lib/contextoExtrato.ts. Lido uma vez, ao montar: este painel só existe
  // montado enquanto aberto (o Painel da Tesouraria o desmonta ao fechar), então cada abertura
  // retoma de onde a pessoa parou, em vez de recomeçar em "hoje, sem filtro".
  const [ctxInicial] = useState(() => lerContextoExtrato() ?? {});
  const [filtroTipo, setFiltroTipo] = useState<FinMovimentoTipo | "transferencia" | "todos">(ctxInicial.tipo ?? "todos");
  const [busca, setBusca] = useState(ctxInicial.busca ?? "");
  const [buscaDebounced, setBuscaDebounced] = useState(ctxInicial.busca ?? "");
  /** Tela cheia: o mesmo painel, ocupando a janela inteira, com os filtros ao lado. */
  const [telaCheia, setTelaCheia] = useState(ctxInicial.telaCheia ?? false);
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);
  const [filtroCategoriaId, setFiltroCategoriaId] = useState(ctxInicial.categoriaId ?? "");
  const [filtroCentroCustoId, setFiltroCentroCustoId] = useState(ctxInicial.centroId ?? "");
  const [filtroFornecedorId, setFiltroFornecedorId] = useState(ctxInicial.fornecedorId ?? "");
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [fornecedores, setFornecedores] = useState<FinFornecedor[]>([]);
  const [filtroValorMinTexto, setFiltroValorMinTexto] = useState(ctxInicial.valorMin ?? "");
  const [filtroValorMaxTexto, setFiltroValorMaxTexto] = useState(ctxInicial.valorMax ?? "");

  const POR_PAGINA = 50;
  const [pagina, setPagina] = useState(1);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const [editandoTransf, setEditandoTransf] = useState<FinLancamentoExtenso | null>(null);
  const [anexosPara, setAnexosPara] = useState<FinLancamentoExtenso | null>(null);
  const [transfOpen, setTransfOpen] = useState(false);
  const [ofxOpen, setOfxOpen] = useState(false);
  const [omieOpen, setOmieOpen] = useState(false);
  const [faturaOpen, setFaturaOpen] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conciliando, setConciliando] = useState(false);
  const [apagando, setApagando] = useState<FinLancamentoExtenso | null>(null);
  const [excluindoBusy, setExcluindoBusy] = useState(false);
  const [apagandoLote, setApagandoLote] = useState(false);
  const [excluindoLoteBusy, setExcluindoLoteBusy] = useState(false);
  const [saldoAntesDoPeriodo, setSaldoAntesDoPeriodo] = useState(0);

  // Bug de produtividade (23/09/2026), pedido dela: "o sistema deve abrir
  // com a data atual, não com o primeiro dia do mês — a tesouraria
  // trabalha com 'o que aconteceu hoje', não 'desde o início do mês'".
  // Continua reabrindo em HOJE toda vez que o drawer é montado de novo
  // (troca de conta, fecha e abre) — só não muda enquanto ele permanece
  // aberto e ela mexe no filtro à mão, que é exatamente o comportamento
  // que ela pediu para preservar.
  //
  // 06/10/2026: "reabre em hoje" vale só quando não há contexto guardado. Com contexto (vindo
  // do extrato completo, ou deste mesmo painel há pouco), o período é o dele — relativo
  // ("este mês") recalculado para hoje, personalizado com as datas gravadas.
  const hoje = new Date();
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>(
    () => (ctxInicial.periodo as PeriodoPreset | undefined) ?? "personalizado",
  );
  const [dataInicio, setDataInicio] = useState(() => {
    if (ctxInicial.periodo && ctxInicial.periodo !== "personalizado") {
      try { return resolverPeriodo(ctxInicial.periodo as PeriodoPreset).dataInicio; } catch { /* preset desconhecido */ }
    }
    return ctxInicial.de ?? toYmd(hoje);
  });
  const [dataFim, setDataFim] = useState(() => {
    if (ctxInicial.periodo && ctxInicial.periodo !== "personalizado") {
      try { return resolverPeriodo(ctxInicial.periodo as PeriodoPreset).dataFim; } catch { /* idem */ }
    }
    return ctxInicial.ate ?? toYmd(hoje);
  });
  const inicioEfetivo = dataInicio <= dataFim ? dataInicio : dataFim;
  const fimEfetivo = dataInicio <= dataFim ? dataFim : dataInicio;

  async function carregar() {
    setLoading(true);
    try {
      const [c, ls, saldoAntes] = await Promise.all([
        contaId ? carregarConta(contaId) : Promise.resolve(null),
        listarLancamentosSemTeto({
          contaId: contaId ?? undefined,
          tipo: filtroTipo !== "todos" && filtroTipo !== "transferencia" ? filtroTipo : undefined,
          apenasTransferencia: filtroTipo === "transferencia" ? true : undefined,
          dataInicio: inicioEfetivo, dataFim: fimEfetivo,
          busca: buscaDebounced.length >= 2 ? buscaDebounced : undefined,
          categoriaId: filtroCategoriaId || undefined,
          centroCustoId: filtroCentroCustoId || undefined,
          fornecedorId: filtroFornecedorId || undefined,
        }),
        saldoAntesDe(inicioEfetivo, contaId ?? undefined),
      ]);
      setConta(c);
      setLancamentos(ls);
      setSaldoAntesDoPeriodo(saldoAntes);
    } finally { setLoading(false); }
  }

  // Reabrir o drawer (mesma conta ou outra) sempre volta ao padrão — mês
  // atual, sem filtro — mesmo comportamento de abrir a página pela
  // primeira vez, já que não há URL aqui pra lembrar o filtro anterior
  // (ver comentário do topo do arquivo).
  useEffect(() => {
    if (!open) return;
    setSelecionados(new Set());
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contaId, filtroTipo, inicioEfetivo, fimEfetivo, buscaDebounced, filtroCategoriaId, filtroCentroCustoId, filtroFornecedorId]);
  useEffect(() => { setPagina(1); }, [contaId, filtroTipo, inicioEfetivo, fimEfetivo, buscaDebounced, filtroCategoriaId, filtroCentroCustoId, filtroFornecedorId, filtroValorMinTexto, filtroValorMaxTexto]);
  useEffect(() => {
    if (!open) return;
    listarCategorias().then(setCategorias);
    listarCentrosCusto().then(setCentros);
    listarFornecedores().then(setFornecedores).catch(() => setFornecedores([]));
  }, [open]);

  // Grava o contexto a cada mudança: é isso que faz o extrato completo (e a próxima abertura
  // deste painel) continuarem exatamente daqui.
  const contextoAtual = {
    periodo: periodoPreset, de: dataInicio, ate: dataFim, tipo: filtroTipo,
    categoriaId: filtroCategoriaId, centroId: filtroCentroCustoId, fornecedorId: filtroFornecedorId,
    busca, valorMin: filtroValorMinTexto, valorMax: filtroValorMaxTexto, telaCheia,
  };
  useEffect(() => {
    salvarContextoExtrato(contextoAtual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoPreset, dataInicio, dataFim, filtroTipo, filtroCategoriaId, filtroCentroCustoId, filtroFornecedorId, busca, filtroValorMinTexto, filtroValorMaxTexto, telaCheia]);

  // "Extrato completo": a MESMA aba (antes era `target="_blank"`: aba nova nasce sem a marca da
  // LGPD no sessionStorage e a Home era a única parada — ver lib/destinoPosEntrada.ts), levando
  // conta, período e todos os filtros. O retorno é prometido: "Voltar para movimentações" reabre
  // este painel, na mesma conta, com o que a pessoa tiver mudado lá.
  const navigate = useNavigate();
  const location = useLocation();
  function abrirExtratoCompleto() {
    if (!contaId) return;
    salvarContextoExtrato(contextoAtual);
    const origem = `${location.pathname}${location.search}${location.hash}`;
    prometerRetorno(origem, contaId, Date.now(), listaRef.current?.scrollTop);
    navigate(`/financas/conta/${contaId}?${contextoParaQuery(contextoAtual).toString()}`, { state: { origem, contaId } });
  }

  function fecharEAvisar() {
    onChange?.();
  }

  async function abrirComprovante(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Não foi possível abrir o comprovante");
  }

  async function confirmarExcluir(e: React.MouseEvent) {
    e.preventDefault();
    if (!apagando) return;
    setExcluindoBusy(true);
    try {
      await excluirLancamento(apagando.id);
      toast.success("Excluído");
      setApagando(null);
      await carregar();
      fecharEAvisar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setExcluindoBusy(false); }
  }

  // devolve a rolagem de antes de ir ao extrato completo, uma vez, quando a lista aparece
  useEffect(() => {
    if (rolagemPendente.current == null || loading || lancamentos.length === 0 || !listaRef.current) return;
    listaRef.current.scrollTop = rolagemPendente.current;
    rolagemPendente.current = null;
  }, [loading, lancamentos.length]);

  function limparFiltros() {
    setFiltroTipo("todos"); setFiltroCategoriaId(""); setFiltroCentroCustoId(""); setFiltroFornecedorId("");
    setBusca(""); setBuscaDebounced(""); setFiltroValorMinTexto(""); setFiltroValorMaxTexto("");
  }

  function alternarSelecao(id: string) {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  const selecionadosConciliaveis = lancamentos
    .filter(l => selecionados.has(l.id) && l.status === "realizado")
    .map(l => l.id);

  async function conciliarSelecionados() {
    if (selecionadosConciliaveis.length === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(selecionadosConciliaveis);
      const n = selecionadosConciliaveis.length;
      toast.success(`${n} lançamento${n > 1 ? "s" : ""} conciliado${n > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      await carregar();
      fecharEAvisar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setConciliando(false); }
  }

  async function confirmarExcluirSelecionados(e: React.MouseEvent) {
    e.preventDefault();
    if (selecionados.size === 0) return;
    setExcluindoLoteBusy(true);
    try {
      const ids = Array.from(selecionados);
      await excluirLancamentosEmLote(ids);
      toast.success(`${ids.length} lançamento${ids.length > 1 ? "s" : ""} excluído${ids.length > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      setApagandoLote(false);
      await carregar();
      fecharEAvisar();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
      setSelecionados(new Set());
      await carregar();
    }
    finally { setExcluindoLoteBusy(false); }
  }

  function alternarSelecionarTodos() {
    setSelecionados(prev => {
      const todosIds = lancamentosPagina.map(l => l.id);
      const todosMarcados = todosIds.length > 0 && todosIds.every(id => prev.has(id));
      return todosMarcados ? new Set() : new Set(todosIds);
    });
  }

  function selecionarPeriodoInteiro() {
    setSelecionados(new Set(lancamentosOrdenados.map(l => l.id)));
  }

  const valorMin = filtroValorMinTexto.trim() ? paraNumero(filtroValorMinTexto) : null;
  const valorMax = filtroValorMaxTexto.trim() ? paraNumero(filtroValorMaxTexto) : null;
  const lancamentosFiltrados = lancamentos.filter(l => {
    const v = Number(l.valor);
    if (valorMin != null && v < valorMin) return false;
    if (valorMax != null && v > valorMax) return false;
    return true;
  });
  // Mesmo cálculo da Movimentação da Conta — serviço único, sem cópia local
  // (ver cabeçalho de `saldoService.ts`).
  const {
    ordenados: lancamentosOrdenados,
    saldoPorLancamento,
    totalEntradas: totalEntradasPeriodo,
    totalSaidas: totalSaidasPeriodo,
    saldoFinal: saldoFinalPeriodo,
  } = calcularExtrato(lancamentosFiltrados, saldoAntesDoPeriodo);

  const totalPaginas = Math.max(1, Math.ceil(lancamentosOrdenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaAtual - 1) * POR_PAGINA;
  const lancamentosPagina = lancamentosOrdenados.slice(inicioPagina, inicioPagina + POR_PAGINA);

  function renderLinha(l: FinLancamentoExtenso) {
    // Bug de usabilidade (23/09/2026), pedido dela: "a primeira coisa
    // que a tesouraria precisa ver é o favorecido, não a descrição
    // digitada" — `nomeExtrato` (finService.ts) prioriza fornecedor/
    // pessoa; descrição vira a linha secundária, não some.
    const { principal, secundario } = nomeExtrato(l);
    return (
      <tr key={l.id} className="border-t hover:bg-muted/30 group">
        <td className="py-1.5 px-2">
          <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
            aria-label={`Selecionar ${principal}`} />
        </td>
        <td className="py-1.5 px-2 whitespace-nowrap">
          <span className={STATUS_COR[l.status]} title={STATUS_LABEL[l.status]}>{dataBr(l.data)}</span>
        </td>
        <td className="py-1.5 px-2 min-w-[160px]">
          <p className="font-medium truncate flex items-center gap-1">
            {/* Ícone de projeto (pedido dela, 30/09/2026): identificar de
                relance quais lançamentos estão vinculados a um projeto
                (120 Anos, Reforma do Templo...), sem precisar abrir cada
                um. Mesmo ícone que `PainelTesouraria` já usa pra
                "Projetos" (`FolderKanban`) — não inventa um novo. */}
            {l.projeto_nome && (
              <span title={`Projeto: ${l.projeto_nome}`} className="shrink-0">
                <FolderKanban className="w-3 h-3 text-violeta" />
              </span>
            )}
            <span className="truncate">{principal}</span>
          </p>
          {secundario && <p className="text-xs text-muted-foreground truncate">{secundario}</p>}
        </td>
        {!contaId && (
          <td className="py-1.5 px-2 overflow-hidden hidden sm:table-cell">
            <span className="text-xs text-muted-foreground truncate">{l.conta_nome ?? "—"}</span>
          </td>
        )}
        <td className="py-1.5 px-2 overflow-hidden hidden md:table-cell">
          {l.categoria_nome && (
            <Badge variant="outline" className="text-xs max-w-full truncate"
              style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
              {l.categoria_nome}
            </Badge>
          )}
        </td>
        {telaCheia && (() => {
          const cs = centroESubcentro(l.centro_nome);
          return (<>
            <td className="py-1.5 px-2 overflow-hidden"><span className="text-xs truncate block">{cs?.centro ?? ""}</span></td>
            <td className="py-1.5 px-2 overflow-hidden"><span className="text-xs text-muted-foreground truncate block">{cs?.subcentro ?? ""}</span></td>
          </>);
        })()}
        <td className={`py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
          {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground whitespace-nowrap hidden sm:table-cell">
          {brl(saldoPorLancamento.get(l.id) ?? 0)}
        </td>
        <td className="py-1.5 px-1 sticky right-0 bg-background group-hover:bg-muted/30 border-l">
          <div className="flex items-center gap-0.5 justify-end">
            {l.comprovante_url && (
              <button type="button" onClick={() => abrirComprovante(l.comprovante_url!)} title="Ver comprovante"
                className="text-info-text hover:text-info-text">
                <Paperclip className="w-3.5 h-3.5" />
              </button>
            )}
            {l.origem !== "transferencia" && (
              <button type="button" onClick={() => setAnexosPara(l)} title="Anexos"
                className="text-muted-foreground hover:text-gold">
                <Files className="w-3.5 h-3.5" />
              </button>
            )}
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => {
                if (l.origem === "transferencia") setEditandoTransf(l);
                else { setEditando(l); setNovoOpen(true); }
              }}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button type="button" variant="ghost" size="icon"
              className="h-7 w-7 text-destructive hover:bg-destructive/10"
              onClick={() => setApagando(l)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right"
          className={`flex flex-col gap-0 p-0 ${telaCheia ? "w-screen max-w-none sm:max-w-none" : "w-full sm:max-w-4xl"}`}
          // Esc primeiro sai da tela cheia; só o segundo fecha o painel
          onEscapeKeyDown={(e) => { if (telaCheia) { e.preventDefault(); setTelaCheia(false); } }}>
          <SheetHeader className="p-3 md:p-4 border-b space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap pr-8">
              <SheetTitle className="flex items-center gap-1.5 min-w-0">
                <DollarSign className="w-4 h-4 text-gold shrink-0" />
                {/* Seletor de conta no próprio cabeçalho (pedido dela,
                    30/09/2026, vendo a "Movimentação de Contas" do Omie):
                    trocar de conta sem fechar o drawer e voltar pro grid
                    de cards. `iconeConta` é o mesmo usado nos cards do
                    Painel — mesmo ícone em todo lugar que mostra conta. */}
                <Select value={contaId ?? "__todas__"}
                  onValueChange={(v) => onTrocarConta(v === "__todas__" ? null : v)}>
                  <SelectTrigger
                    className="h-8 w-auto min-w-0 max-w-[220px] border-none shadow-none px-1.5 gap-1.5
                               font-sans text-base font-semibold truncate [&>span]:truncate [&>span]:flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">
                      <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Todas as Contas</span>
                    </SelectItem>
                    {contas.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">{iconeConta(c, "w-3.5 h-3.5")} {c.nome}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {conta && <Badge variant="outline" className="text-xs font-sans font-normal shrink-0">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>}
              </SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* OFX, Omie, Fatura, Transferir e "Extrato completo" pedem
                    UMA conta-alvo certa — no modo "Todas as Contas"
                    (`contaId === null`) somem; continuam disponíveis
                    abrindo o drawer de uma conta específica. */}
                {contaId && conta?.tipo === "banco" && (
                  <Button variant="outline" size="sm" onClick={() => setOfxOpen(true)} className="gap-1.5 h-8 text-xs">
                    <FileUp className="w-3.5 h-3.5" /> OFX
                  </Button>
                )}
                {contaId && (
                  <Button variant="outline" size="sm" onClick={() => setOmieOpen(true)} className="gap-1.5 h-8 text-xs">
                    <FileUp className="w-3.5 h-3.5" /> Omie
                  </Button>
                )}
                {contaId && conta?.tipo === "cartao" && (
                  <Button variant="outline" size="sm" onClick={() => setFaturaOpen(true)} className="gap-1.5 h-8 text-xs">
                    <FileUp className="w-3.5 h-3.5" /> Fatura
                  </Button>
                )}
                {contaId && (
                  <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 h-8 text-xs text-info-text hover:text-info-text">
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
                  </Button>
                )}
                {/* Imprimir/PDF fica só na página — ver comentário do topo
                    do arquivo pro porquê. */}
                {/* Tela cheia: o MESMO painel (mesmos filtros, busca e rolagem), com a janela inteira. */}
                <Button type="button" variant="outline" size="sm" onClick={() => setTelaCheia(v => !v)}
                  className="gap-1.5 h-8 text-xs" aria-pressed={telaCheia}
                  title={telaCheia ? "Sair da tela cheia (Esc)" : "Ocupar a tela inteira com este extrato"}>
                  {telaCheia ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  {telaCheia ? "Sair da tela cheia" : "Tela cheia"}
                </Button>
                {/* Extrato completo: a página da conta (impressão/PDF, filtro por coluna), na MESMA
                    aba e com o contexto de trabalho — não uma consulta nova. */}
                {contaId && (
                  <Button type="button" variant="outline" size="sm" onClick={abrirExtratoCompleto} className="gap-1.5 h-8 text-xs">
                    <ExternalLink className="w-3.5 h-3.5" /> Extrato completo
                  </Button>
                )}
                <Button variant="gold" size="sm" onClick={() => { setEditando(null); setNovoOpen(true); }} className="gap-1.5 h-8 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Novo
                </Button>
              </div>
            </div>
            {conta && (
              <p className="text-xs text-muted-foreground">
                Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
              </p>
            )}

            {/* Filtros — versão enxuta da página: sem popover por coluna,
                sem Data específica/Valor mín-máx (ver comentário do topo). Em tela cheia
                eles passam para a coluna da esquerda. */}
            {!telaCheia && (<>
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <div className="min-w-[130px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">De</label>
                {/* Mudar "De" já leva "Até" junto pra mesma data — mesmo
                    ajuste de FinancasConta.tsx (29/09/2026, achado ao vivo
                    dela: "De" mudava e "Até" ficava pra trás, visível e
                    confuso, mesmo a consulta corrigindo sozinha por baixo
                    via inicioEfetivo/fimEfetivo). */}
                <CampoData value={dataInicio} onChange={(v) => { setDataInicio(v); setDataFim(v); setPeriodoPreset("personalizado"); }} className="h-8 text-xs" />
              </div>
              <div className="min-w-[130px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Até</label>
                <CampoData value={dataFim} onChange={(v) => { setDataFim(v); setPeriodoPreset("personalizado"); }} className="h-8 text-xs" />
              </div>
              <div className="w-28">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</label>
                <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saídas</SelectItem>
                    <SelectItem value="transferencia">Transferências</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Categoria</label>
                <Select value={filtroCategoriaId || "__todas__"} onValueChange={(v) => setFiltroCategoriaId(v === "__todas__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas</SelectItem>
                    {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-36">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Centro</label>
                <Select value={filtroCentroCustoId || "__todos__"} onValueChange={(v) => setFiltroCentroCustoId(v === "__todos__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__">Todos</SelectItem>
                    {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Buscar</label>
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 text-xs pl-6" placeholder="Descrição..." />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={carregar} disabled={loading} className="h-8 text-xs gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="rounded-md border bg-success-soft/40 border-success-line px-2.5 py-1.5">
                <p className="text-xs uppercase text-success-text">Entradas</p>
                <p className="text-sm font-semibold text-success-text tabular-nums">{brl(totalEntradasPeriodo)}</p>
              </div>
              <div className="rounded-md border bg-destructive-soft/40 border-destructive-line px-2.5 py-1.5">
                <p className="text-xs uppercase text-destructive-text">Saídas</p>
                <p className="text-sm font-semibold text-destructive-text tabular-nums">{brl(totalSaidasPeriodo)}</p>
              </div>
              <div className="rounded-md border px-2.5 py-1.5">
                <p className="text-xs uppercase text-muted-foreground">Movimento</p>
                <p className="text-sm font-semibold tabular-nums">{brl(totalEntradasPeriodo - totalSaidasPeriodo)}</p>
              </div>
            </div>
            </>)}

            {selecionados.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {selecionadosConciliaveis.length > 0 && (
                  <Button variant="success" size="sm" onClick={conciliarSelecionados} disabled={conciliando || excluindoLoteBusy} className="gap-1.5 h-8 text-xs">
                    <Scale className="w-3.5 h-3.5" />
                    {conciliando ? "..." : `Conciliar ${selecionadosConciliaveis.length}`}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setApagandoLote(true)} disabled={conciliando || excluindoLoteBusy}
                  className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10">
                  <Trash2 className="w-3.5 h-3.5" /> {`Excluir ${selecionados.size}`}
                </Button>
                {selecionados.size < lancamentosOrdenados.length && (
                  <button type="button" onClick={selecionarPeriodoInteiro} disabled={conciliando || excluindoLoteBusy}
                    className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted underline-offset-2">
                    Selecionar os {lancamentosOrdenados.length} do período
                  </button>
                )}
              </div>
            )}
          </SheetHeader>

          {/* Os dois wrappers viram `display: contents` fora da tela cheia: a tabela e o rodapé
              continuam filhos diretos do painel, e o MESMO elemento da tabela muda de layout em vez
              de ser recriado — por isso a rolagem e a seleção sobrevivem ao alternar. */}
          <div className={telaCheia ? "flex flex-1 min-h-0 flex-col md:flex-row" : "contents"}>
          {telaCheia && (
            <aside className="w-full md:w-64 md:shrink-0 border-b md:border-b-0 md:border-r max-h-[38vh] md:max-h-none overflow-y-auto p-3 space-y-3 bg-muted/20" aria-label="Filtros do extrato">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Filtros</p>
              <CampoLateral rotulo="Conta">
                <Select value={contaId ?? "__todas__"} onValueChange={(v) => onTrocarConta(v === "__todas__" ? null : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas as Contas</SelectItem>
                    {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CampoLateral>
              <div className="space-y-3">
                <CampoLateral rotulo="De">
                  <CampoData value={dataInicio} onChange={(v) => { setDataInicio(v); setDataFim(v); setPeriodoPreset("personalizado"); }} className="h-8 text-xs" />
                </CampoLateral>
                <CampoLateral rotulo="Até">
                  <CampoData value={dataFim} onChange={(v) => { setDataFim(v); setPeriodoPreset("personalizado"); }} className="h-8 text-xs" />
                </CampoLateral>
              </div>
              <CampoLateral rotulo="Tipo">
                <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="saida">Saídas</SelectItem>
                    <SelectItem value="transferencia">Transferências</SelectItem>
                  </SelectContent>
                </Select>
              </CampoLateral>
              <CampoLateral rotulo="Categoria">
                <Select value={filtroCategoriaId || "__todas__"} onValueChange={(v) => setFiltroCategoriaId(v === "__todas__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todas__">Todas</SelectItem>
                    {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CampoLateral>
              <CampoLateral rotulo="Centro de custo">
                <Select value={filtroCentroCustoId || "__todos__"} onValueChange={(v) => setFiltroCentroCustoId(v === "__todos__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__">Todos</SelectItem>
                    {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CampoLateral>
              <CampoLateral rotulo="Favorecido">
                <Select value={filtroFornecedorId || "__todos__"} onValueChange={(v) => setFiltroFornecedorId(v === "__todos__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__todos__">Todos</SelectItem>
                    {fornecedores.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CampoLateral>
              <div className="grid grid-cols-2 gap-2">
                <CampoLateral rotulo="Valor mín.">
                  <Input value={filtroValorMinTexto} onChange={(e) => setFiltroValorMinTexto(e.target.value)} inputMode="decimal" className="h-8 text-xs" placeholder="0,00" />
                </CampoLateral>
                <CampoLateral rotulo="Valor máx.">
                  <Input value={filtroValorMaxTexto} onChange={(e) => setFiltroValorMaxTexto(e.target.value)} inputMode="decimal" className="h-8 text-xs" placeholder="0,00" />
                </CampoLateral>
              </div>
              <CampoLateral rotulo="Buscar">
                <div className="relative">
                  <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} className="h-8 text-xs pl-6" placeholder="Descrição, favorecido..." />
                </div>
              </CampoLateral>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs flex-1" onClick={limparFiltros}>Limpar filtros</Button>
                <Button type="button" variant="outline" size="sm" onClick={carregar} disabled={loading} className="h-8 text-xs" title="Atualizar">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </aside>
          )}
          <div className={telaCheia ? "flex-1 min-w-0 min-h-0 flex flex-col" : "contents"}>
          {telaCheia && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border-b">
              <div className="rounded-md border px-2.5 py-1.5">
                <p className="text-xs uppercase text-muted-foreground">Saldo inicial</p>
                <p className="text-sm font-semibold tabular-nums">{brl(saldoAntesDoPeriodo)}</p>
              </div>
              <div className="rounded-md border bg-success-soft/40 border-success-line px-2.5 py-1.5">
                <p className="text-xs uppercase text-success-text">Entradas</p>
                <p className="text-sm font-semibold text-success-text tabular-nums">{brl(totalEntradasPeriodo)}</p>
              </div>
              <div className="rounded-md border bg-destructive-soft/40 border-destructive-line px-2.5 py-1.5">
                <p className="text-xs uppercase text-destructive-text">Saídas</p>
                <p className="text-sm font-semibold text-destructive-text tabular-nums">{brl(totalSaidasPeriodo)}</p>
              </div>
              <div className="rounded-md border px-2.5 py-1.5">
                <p className="text-xs uppercase text-muted-foreground">Movimento</p>
                <p className="text-sm font-semibold tabular-nums">{brl(totalEntradasPeriodo - totalSaidasPeriodo)}</p>
              </div>
              <div className="rounded-md border px-2.5 py-1.5 col-span-2 md:col-span-1">
                <p className="text-xs uppercase text-muted-foreground">Saldo final</p>
                <p className="text-sm font-semibold tabular-nums">{brl(saldoFinalPeriodo)}</p>
              </div>
            </div>
          )}
          <div ref={listaRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            {loading && lancamentos.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
              </div>
            ) : lancamentos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground italic">
                Nenhum lançamento no período. <button onClick={() => setNovoOpen(true)} className="text-primary underline">Criar o primeiro</button>
              </p>
            ) : lancamentosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground italic">Nenhum lançamento com o filtro de valor atual.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 py-2 px-2">
                      {lancamentosPagina.length > 0 && (
                        <Checkbox
                          checked={lancamentosPagina.every(l => selecionados.has(l.id))}
                          onCheckedChange={alternarSelecionarTodos}
                          aria-label="Selecionar todos os lançamentos desta página"
                        />
                      )}
                    </th>
                    <th className="text-left py-2 px-2 w-20">Data</th>
                    <th className="text-left py-2 px-2">Descrição</th>
                    {!contaId && <th className="text-left py-2 px-2 w-28 hidden sm:table-cell">Conta</th>}
                    <th className="text-left py-2 px-2 w-36 hidden md:table-cell">Categoria</th>
                    {telaCheia && (<>
                      <th className="text-left py-2 px-2 w-36">Centro de custo</th>
                      <th className="text-left py-2 px-2 w-36">Subcentro</th>
                    </>)}
                    <th className="text-right py-2 px-2 w-24">Valor</th>
                    <th className="text-right py-2 px-2 w-24 hidden sm:table-cell">Saldo</th>
                    <th className="w-24 sticky right-0 bg-muted/60"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginaAtual === 1 && filtroTipo === "todos" && buscaDebounced.length < 2 && (
                    <tr className="border-t bg-muted/20 text-muted-foreground italic">
                      <td className="py-1.5 px-2"></td>
                      <td className="py-1.5 px-2" colSpan={2}>Saldo inicial</td>
                      {!contaId && <td className="py-1.5 px-2 hidden sm:table-cell"></td>}
                      <td className="py-1.5 px-2 hidden md:table-cell"></td>
                      {telaCheia && (<><td className="py-1.5 px-2"></td><td className="py-1.5 px-2"></td></>)}
                      <td className="py-1.5 px-2 text-right tabular-nums"></td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-medium whitespace-nowrap hidden sm:table-cell">{brl(saldoAntesDoPeriodo)}</td>
                      <td className="py-1.5 px-1 sticky right-0 bg-muted/20"></td>
                    </tr>
                  )}
                  {lancamentosPagina.map(renderLinha)}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t">
            <p className="text-xs text-muted-foreground">
              {lancamentosFiltrados.length} lançamento{lancamentosFiltrados.length === 1 ? "" : "s"} no período
            </p>
            {totalPaginas > 1 && (
              <nav className="flex items-center gap-2" aria-label="Paginação do extrato">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={paginaAtual === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}>
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                  {inicioPagina + 1}–{Math.min(inicioPagina + POR_PAGINA, lancamentosOrdenados.length)} de {lancamentosOrdenados.length}
                </span>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={paginaAtual === totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}>
                  Próxima
                </Button>
              </nav>
            )}
          </div>
          </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Os quatro diálogos abaixo pedem uma conta-alvo certa — só montam
          quando `contaId` é real (botão de abrir já some no modo "Todas
          as Contas", ver cabeçalho acima). `LancamentoForm` é o único que
          funciona sem: sem `contaIdPadrao`, o próprio campo Conta do
          formulário vira seletor, em vez de vir travado. */}
      {contaId && (
        <>
          <TransferenciaForm open={transfOpen} onOpenChange={setTransfOpen} contaOrigemPadrao={contaId} onSaved={() => { carregar(); fecharEAvisar(); }} />
          <ConciliacaoOFXDialog open={ofxOpen} onOpenChange={setOfxOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
          <ImportacaoOmieDialog open={omieOpen} onOpenChange={setOmieOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
          <ImportacaoFaturaDialog open={faturaOpen} onOpenChange={setFaturaOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
        </>
      )}
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={contaId ?? undefined}
        lancamento={editando}
        onSaved={() => { carregar(); fecharEAvisar(); }}
      />
      <EditarTransferenciaForm
        open={!!editandoTransf}
        onOpenChange={(v) => !v && setEditandoTransf(null)}
        lancamento={editandoTransf}
        onSaved={() => { carregar(); fecharEAvisar(); }}
      />
      {anexosPara && (
        <AnexosLancamentoDialog
          open={!!anexosPara}
          onOpenChange={(v) => !v && setAnexosPara(null)}
          lancamentoId={anexosPara.id}
          descricaoLancamento={nomeExtrato(anexosPara).principal}
        />
      )}

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {apagando?.origem === "transferencia" ? "Excluir transferência?" : "Excluir lançamento?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.descricao ? `"${apagando.descricao}"` : "Este lançamento"} — {apagando && brl(Number(apagando.valor))}.
              {apagando?.origem === "transferencia" && " Isso também exclui a outra perna dessa transferência, na outra conta."}
              {" "}Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExcluir} disabled={excluindoBusy}>
              {excluindoBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={apagandoLote} onOpenChange={(v) => !v && setApagandoLote(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selecionados.size} lançamento{selecionados.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              {selecionados.size > POR_PAGINA &&
                `Isso inclui todo o período filtrado — de ${dataBr(inicioEfetivo)} a ${dataBr(fimEfetivo)}. `}
              {lancamentos.some(l => selecionados.has(l.id) && l.origem === "transferencia") &&
                "Alguma transferência selecionada — a outra perna dela, na outra conta, também será excluída. "}
              Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoLoteBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmarExcluirSelecionados} disabled={excluindoLoteBusy}>
              {excluindoLoteBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Um campo da coluna de filtros da tela cheia: rótulo em cima, controle embaixo. */
function CampoLateral({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="text-xs uppercase tracking-wide text-muted-foreground block mb-0.5">{rotulo}</label>
      {children}
    </div>
  );
}
