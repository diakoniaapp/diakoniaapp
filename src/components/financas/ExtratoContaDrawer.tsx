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
//   Persistência na URL   fazia sentido pra sobreviver um F5 na PRÓPRIA
//                        rota da conta. Dentro do drawer, a rota é
//                        `/painel-tesouraria` — gravar o filtro de UMA
//                        conta na URL do Painel misturaria os dois estados.
//                        Os filtros vivem só em memória enquanto o drawer
//                        está aberto; fechar e reabrir volta ao padrão (mês
//                        atual), igual abrir a página pela primeira vez.
//
// O resto — sticky header, seleção em lote, conciliar/excluir em lote,
// todos os 7 diálogos (lançamento, transferência, anexos, OFX, Omie,
// fatura, exclusão) — é o MESMO serviço e o MESMO comportamento, só que
// o sticky do cabeçalho da tabela ficou mais simples aqui: o Sheet já tem
// scroll próprio, sem precisar medir a "faixa fixa" com ResizeObserver
// pra brigar com o scroll do `<main>` (só existia na página porque lá o
// cabeçalho competia com o scroll da JANELA inteira).

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  ArrowRightLeft, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentosSemTeto, excluirLancamento, excluirLancamentosEmLote, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL,
  conciliarEmLote, listarCategorias, listarCentrosCusto,
  type FinConta, type FinLancamentoExtenso, type FinMovimentoTipo, type FinStatus,
  type FinCategoria, type FinCentroCusto,
  STATUS_LABEL,
} from "@/services/finService";
import { saldoAcumuladoAntesDe } from "@/services/prestacaoContasService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { AnexosLancamentoDialog } from "@/components/financas/AnexosLancamentoDialog";
import { EditarTransferenciaForm } from "@/components/financas/EditarTransferenciaForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { ImportacaoOmieDialog } from "@/components/financas/ImportacaoOmieDialog";
import { ImportacaoFaturaDialog } from "@/components/financas/ImportacaoFaturaDialog";
import { toYmd } from "@/lib/data";

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
  contaId: string;
  onChange?: () => void;
}

export function ExtratoContaDrawer({ open, onOpenChange, contaId, onChange }: Props) {
  const [conta, setConta] = useState<FinConta | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<FinMovimentoTipo | "transferencia" | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 400);
    return () => clearTimeout(t);
  }, [busca]);
  const [filtroCategoriaId, setFiltroCategoriaId] = useState("");
  const [filtroCentroCustoId, setFiltroCentroCustoId] = useState("");
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [filtroValorMinTexto, setFiltroValorMinTexto] = useState("");
  const [filtroValorMaxTexto, setFiltroValorMaxTexto] = useState("");

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

  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(() => toYmd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [dataFim, setDataFim] = useState(() => toYmd(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)));
  const inicioEfetivo = dataInicio <= dataFim ? dataInicio : dataFim;
  const fimEfetivo = dataInicio <= dataFim ? dataFim : dataInicio;

  async function carregar() {
    if (!contaId) return;
    setLoading(true);
    try {
      const [c, ls, saldoAntes] = await Promise.all([
        carregarConta(contaId),
        listarLancamentosSemTeto({
          contaId,
          tipo: filtroTipo !== "todos" && filtroTipo !== "transferencia" ? filtroTipo : undefined,
          apenasTransferencia: filtroTipo === "transferencia" ? true : undefined,
          dataInicio: inicioEfetivo, dataFim: fimEfetivo,
          busca: buscaDebounced.length >= 2 ? buscaDebounced : undefined,
          categoriaId: filtroCategoriaId || undefined,
          centroCustoId: filtroCentroCustoId || undefined,
        }),
        saldoAcumuladoAntesDe(inicioEfetivo, contaId),
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
  }, [open, contaId, filtroTipo, inicioEfetivo, fimEfetivo, buscaDebounced, filtroCategoriaId, filtroCentroCustoId]);
  useEffect(() => { setPagina(1); }, [contaId, filtroTipo, inicioEfetivo, fimEfetivo, buscaDebounced, filtroCategoriaId, filtroCentroCustoId, filtroValorMinTexto, filtroValorMaxTexto]);
  useEffect(() => {
    if (!open) return;
    listarCategorias().then(setCategorias);
    listarCentrosCusto().then(setCentros);
  }, [open]);

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
  const totalEntradasPeriodo = lancamentosFiltrados.filter(l => l.tipo === "entrada" && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidasPeriodo  = lancamentosFiltrados.filter(l => l.tipo === "saida"   && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);

  const lancamentosOrdenados = [...lancamentosFiltrados].sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data);
    if (a.tipo !== b.tipo) return a.tipo === "entrada" ? -1 : 1;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  let acumulado = saldoAntesDoPeriodo;
  const saldoPorLancamento = new Map<string, number>();
  for (const l of lancamentosOrdenados) {
    if (l.status === "realizado" || l.status === "conciliado") {
      acumulado += l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor);
    }
    saldoPorLancamento.set(l.id, acumulado);
  }

  const totalPaginas = Math.max(1, Math.ceil(lancamentosOrdenados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const inicioPagina = (paginaAtual - 1) * POR_PAGINA;
  const lancamentosPagina = lancamentosOrdenados.slice(inicioPagina, inicioPagina + POR_PAGINA);

  function renderLinha(l: FinLancamentoExtenso) {
    return (
      <tr key={l.id} className="border-t hover:bg-muted/30 group">
        <td className="py-1.5 px-2">
          <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
            aria-label={`Selecionar ${l.descricao ?? "lançamento"}`} />
        </td>
        <td className="py-1.5 px-2 whitespace-nowrap">
          <span className={STATUS_COR[l.status]} title={STATUS_LABEL[l.status]}>{dataBr(l.data)}</span>
        </td>
        <td className="py-1.5 px-2 min-w-[160px]">
          <p className="font-medium truncate">{l.descricao ?? "—"}</p>
          {l.fornecedor_nome && l.fornecedor_nome !== l.descricao && (
            <p className="text-xs text-muted-foreground truncate">{l.fornecedor_nome}</p>
          )}
        </td>
        <td className="py-1.5 px-2 overflow-hidden hidden md:table-cell">
          {l.categoria_nome && (
            <Badge variant="outline" className="text-xs max-w-full truncate"
              style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
              {l.categoria_nome}
            </Badge>
          )}
        </td>
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
        <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col gap-0 p-0">
          <SheetHeader className="p-3 md:p-4 border-b space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SheetTitle className="flex items-center gap-2 min-w-0">
                <DollarSign className="w-4 h-4 text-gold shrink-0" />
                <span className="truncate">{conta?.nome ?? "Extrato"}</span>
                {conta && <Badge variant="outline" className="text-xs font-sans font-normal shrink-0">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>}
              </SheetTitle>
              <div className="flex items-center gap-1.5 flex-wrap">
                {conta?.tipo === "banco" && (
                  <Button variant="outline" size="sm" onClick={() => setOfxOpen(true)} className="gap-1.5 h-8 text-xs">
                    <FileUp className="w-3.5 h-3.5" /> OFX
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setOmieOpen(true)} className="gap-1.5 h-8 text-xs">
                  <FileUp className="w-3.5 h-3.5" /> Omie
                </Button>
                {conta?.tipo === "cartao" && (
                  <Button variant="outline" size="sm" onClick={() => setFaturaOpen(true)} className="gap-1.5 h-8 text-xs">
                    <FileUp className="w-3.5 h-3.5" /> Fatura
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 h-8 text-xs text-info-text hover:text-info-text">
                  <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
                </Button>
                {/* Imprimir/PDF fica só na página — ver comentário do topo
                    do arquivo pro porquê. */}
                <Button asChild variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                  <Link to={`/financas/conta/${contaId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" /> Extrato completo
                  </Link>
                </Button>
                <Button size="sm" onClick={() => { setEditando(null); setNovoOpen(true); }}
                  className="gap-1.5 h-8 text-xs bg-gold hover:bg-gold/90 text-white">
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
                sem Data específica/Valor mín-máx (ver comentário do topo). */}
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <div className="min-w-[130px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">De</label>
                <CampoData value={dataInicio} onChange={setDataInicio} className="h-8 text-xs" />
              </div>
              <div className="min-w-[130px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Até</label>
                <CampoData value={dataFim} onChange={setDataFim} className="h-8 text-xs" />
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

            {selecionados.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {selecionadosConciliaveis.length > 0 && (
                  <Button size="sm" onClick={conciliarSelecionados} disabled={conciliando || excluindoLoteBusy}
                    className="gap-1.5 h-8 text-xs bg-success hover:bg-success text-white">
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

          <div className="flex-1 overflow-y-auto overflow-x-auto">
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
                    <th className="text-left py-2 px-2 w-36 hidden md:table-cell">Categoria</th>
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
                      <td className="py-1.5 px-2 hidden md:table-cell"></td>
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
        </SheetContent>
      </Sheet>

      <TransferenciaForm open={transfOpen} onOpenChange={setTransfOpen} contaOrigemPadrao={contaId} onSaved={() => { carregar(); fecharEAvisar(); }} />
      <ConciliacaoOFXDialog open={ofxOpen} onOpenChange={setOfxOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
      <ImportacaoOmieDialog open={omieOpen} onOpenChange={setOmieOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
      <ImportacaoFaturaDialog open={faturaOpen} onOpenChange={setFaturaOpen} contaId={contaId} contaNome={conta?.nome ?? ""} onSaved={() => { carregar(); fecharEAvisar(); }} />
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={contaId}
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
          descricaoLancamento={anexosPara.descricao ?? anexosPara.categoria_nome ?? "Lançamento"}
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
            <AlertDialogAction onClick={confirmarExcluir} disabled={excluindoBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
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
            <AlertDialogAction onClick={confirmarExcluirSelecionados} disabled={excluindoLoteBusy}
              className="bg-destructive hover:bg-destructive/90 text-white">
              {excluindoLoteBusy ? "..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
