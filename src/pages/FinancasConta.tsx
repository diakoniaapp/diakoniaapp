import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  ArrowLeft, DollarSign, Loader2, Plus, Search, Filter,
  TrendingUp, TrendingDown, Pencil, Trash2, Paperclip,
  CheckCircle2, Clock, XCircle, Scale, FileUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentos, excluirLancamento, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL,
  conciliarLancamento, desconciliarLancamento, conciliarEmLote,
  type FinConta, type FinLancamentoExtenso, type FinMovimentoTipo, type FinStatus,
  STATUS_LABEL,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { ConciliacaoOFXDialog } from "@/components/financas/ConciliacaoOFXDialog";
import { ImportacaoOmieDialog } from "@/components/financas/ImportacaoOmieDialog";
import { ArrowRightLeft } from "lucide-react";
import { PaginaSkeleton } from "@/components/ListState";

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

const STATUS_ICONE: Record<FinStatus, JSX.Element> = {
  realizado:  <CheckCircle2 className="w-3 h-3" />,
  conciliado: <CheckCircle2 className="w-3 h-3 text-success-text" />,
  previsto:   <Clock className="w-3 h-3 text-warning-text" />,
  cancelado:  <XCircle className="w-3 h-3 text-muted-foreground" />,
  aguardando_aprovacao: <Clock className="w-3 h-3 text-info-text" />,
};

export default function FinancasConta() {
  const { contaId = "" } = useParams();
  const [conta, setConta] = useState<FinConta | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<FinMovimentoTipo | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);
  const [transfOpen, setTransfOpen] = useState(false);
  const [ofxOpen, setOfxOpen] = useState(false);
  const [omieOpen, setOmieOpen] = useState(false);
  // Conciliação manual (item 6 do roadmap do ERP): seleção só de
  // `realizado` — não faz sentido conciliar algo que ainda não aconteceu
  // (previsto), que foi cancelado, ou que ainda espera aprovação.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [conciliando, setConciliando] = useState(false);
  // `confirm()` nativo não funciona em WebView (Risco 3 do CLAUDE.md) —
  // devolve falso sem perguntar, então o código lia "cancelou" e a
  // lixeira parecia simplesmente não fazer nada. Achado ao vivo pela
  // Telma ("a lixeira não funciona") em 13/09/2026.
  const [apagando, setApagando] = useState<FinLancamentoExtenso | null>(null);
  const [excluindoBusy, setExcluindoBusy] = useState(false);

  // Período do filtro — mês atual por default
  const hoje = new Date();
  const [dataInicio, setDataInicio] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [dataFim, setDataFim] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10)
  );

  useEffect(() => { carregar(); }, [contaId, filtroTipo, dataInicio, dataFim, busca]);

  async function carregar() {
    if (!contaId) return;
    setLoading(true);
    try {
      const [c, ls] = await Promise.all([
        carregarConta(contaId),
        listarLancamentos({
          contaId,
          tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
          dataInicio, dataFim,
          busca: busca.length >= 2 ? busca : undefined,
        }),
      ]);
      setConta(c);
      setLancamentos(ls);
    } finally { setLoading(false); }
  }

  async function abrirComprovante(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else toast.error("Não foi possível abrir o comprovante");
  }

  async function confirmarExcluir() {
    if (!apagando) return;
    setExcluindoBusy(true);
    try {
      await excluirLancamento(apagando.id);
      toast.success("Excluído");
      setApagando(null);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setExcluindoBusy(false); }
  }

  /** Alterna um lançamento entre realizado e conciliado — clique direto
      no selo de situação. Reversível: bater errado tem volta. */
  async function alternarConciliacao(l: FinLancamentoExtenso) {
    try {
      if (l.status === "conciliado") await desconciliarLancamento(l.id);
      else await conciliarLancamento(l.id);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  function alternarSelecao(id: string) {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  }

  async function conciliarSelecionados() {
    if (selecionados.size === 0) return;
    setConciliando(true);
    try {
      await conciliarEmLote(Array.from(selecionados));
      toast.success(`${selecionados.size} lançamento${selecionados.size > 1 ? "s" : ""} conciliado${selecionados.size > 1 ? "s" : ""}`);
      setSelecionados(new Set());
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setConciliando(false); }
  }

  if (loading && !conta) {
    return <PaginaSkeleton />;
  }
  if (!conta) {
    return <div className="p-8 text-center text-muted-foreground">
      Conta não encontrada. <Link to="/financas" className="text-primary underline">Voltar</Link>
    </div>;
  }

  // Compute saldo anterior (do período)
  const totalEntradasPeriodo = lancamentos.filter(l => l.tipo === "entrada" && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidasPeriodo  = lancamentos.filter(l => l.tipo === "saida"   && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);

  // `listarLancamentos` busca do mais recente pro mais antigo (padrão do
  // serviço, usado por várias telas) — aqui na tela do extrato, a Telma
  // pediu ordem cronológica (mais antigo primeiro), igual o extrato do
  // Omie/banco de verdade lê. Reordenado só pra EXIBIÇÃO, sem mudar
  // `listarLancamentos` (que outras telas usam esperando a ordem atual).
  const lancamentosOrdenados = [...lancamentos].sort((a, b) =>
    a.data === b.data
      ? (a.created_at ?? "").localeCompare(b.created_at ?? "")
      : a.data.localeCompare(b.data));

  return (
    <div className="p-3 md:p-5 max-w-7xl mx-auto space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 text-gold" />
            {conta.nome}
            <Badge variant="outline" className="text-xs">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>
          </h1>
          <p className="text-xs text-muted-foreground">
            Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
          </p>
        </div>
        {selecionados.size > 0 && (
          <Button size="sm" onClick={conciliarSelecionados} disabled={conciliando}
            className="gap-1.5 bg-success hover:bg-success text-white">
            <Scale className="w-3.5 h-3.5" />
            {conciliando ? "..." : `Conciliar ${selecionados.size}`}
          </Button>
        )}
        {conta.tipo === "banco" && (
          <Button variant="outline" size="sm" onClick={() => setOfxOpen(true)} className="gap-1.5">
            <FileUp className="w-3.5 h-3.5" /> Importar OFX
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setOmieOpen(true)} className="gap-1.5">
          <FileUp className="w-3.5 h-3.5" /> Importar Omie
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 text-info-text hover:text-info-text">
          <ArrowRightLeft className="w-3.5 h-3.5" /> Transferir
        </Button>
        <Button onClick={() => { setEditando(null); setNovoOpen(true); }}
          className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Novo lançamento
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Data final</label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</label>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saídas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">Buscar descrição</label>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                className="h-8 text-xs pl-6" placeholder="Digite..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo do período */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="bg-success-soft/40 border-success-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-success-text flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
            <p className="text-sm font-semibold text-success-text tabular-nums">{brl(totalEntradasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive-soft/40 border-destructive-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-destructive-text flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
            <p className="text-sm font-semibold text-destructive-text tabular-nums">{brl(totalSaidasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-muted-foreground">Saldo do período</p>
            <p className="text-sm font-semibold tabular-nums">{brl(totalEntradasPeriodo - totalSaidasPeriodo)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de lançamentos */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin inline mr-1.5" /> Carregando...
            </div>
          ) : lancamentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground italic">
              Nenhum lançamento no período. <button onClick={() => setNovoOpen(true)} className="text-primary underline">Criar o primeiro</button>
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8"></th>
                  <th className="text-left py-2 px-2 w-20">Situação</th>
                  <th className="text-left py-2 px-2 w-16">Data</th>
                  <th className="text-left py-2 px-2">Descrição / Fornecedor</th>
                  <th className="text-left py-2 px-2 w-32">Categoria</th>
                  <th className="text-left py-2 px-2 w-28">Centro custo</th>
                  <th className="text-right py-2 px-2 w-28">Valor</th>
                  <th className="w-8"></th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {lancamentosOrdenados.map(l => {
                  const conciliavel = l.status === "realizado" || l.status === "conciliado";
                  return (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="py-1.5 px-2">
                      {l.status === "realizado" && (
                        <Checkbox checked={selecionados.has(l.id)} onCheckedChange={() => alternarSelecao(l.id)}
                          aria-label={`Selecionar ${l.descricao ?? "lançamento"} para conciliar`} />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {conciliavel ? (
                        <button type="button" onClick={() => alternarConciliacao(l)}
                          title={l.status === "conciliado" ? "Bateu com o extrato — clique para desfazer" : "Marcar como conciliado (bateu com o extrato)"}
                          className={`inline-flex items-center gap-1 text-xs hover:underline decoration-dotted ${STATUS_COR[l.status]}`}>
                          {STATUS_ICONE[l.status]} {STATUS_LABEL[l.status]}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs ${STATUS_COR[l.status]}`}>
                          {STATUS_ICONE[l.status]} {STATUS_LABEL[l.status]}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 px-2 min-w-[200px]">
                      <p className="font-medium truncate">{l.descricao ?? "—"}</p>
                      {l.fornecedor_nome && (
                        <p className="text-xs text-muted-foreground truncate">{l.fornecedor_nome}</p>
                      )}
                      {l.pessoa_nome && (
                        <p className="text-xs text-muted-foreground truncate">de {l.pessoa_nome}</p>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {l.categoria_nome && (
                        <Badge variant="outline" className="text-xs"
                          style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
                          {l.categoria_nome}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-xs text-muted-foreground truncate">
                      {l.centro_nome ?? "—"}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                      {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                    </td>
                    <td className="py-1.5 px-1">
                      {l.comprovante_url && (
                        <button type="button" onClick={() => abrirComprovante(l.comprovante_url!)} title="Ver comprovante"
                          className="text-info-text hover:text-info-text">
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                    <td className="py-1.5 px-1">
                      <div className="flex items-center gap-0.5">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditando(l); setNovoOpen(true); }}>
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
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">
        {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"} no período · até 300 mais recentes
      </p>

      {/* Dialogs */}
      <TransferenciaForm
        open={transfOpen}
        onOpenChange={setTransfOpen}
        contaOrigemPadrao={contaId}
        onSaved={carregar}
      />
      <ConciliacaoOFXDialog
        open={ofxOpen}
        onOpenChange={setOfxOpen}
        contaId={contaId}
        contaNome={conta.nome}
        onSaved={carregar}
      />
      <ImportacaoOmieDialog
        open={omieOpen}
        onOpenChange={setOmieOpen}
        contaId={contaId}
        contaNome={conta.nome}
        onSaved={carregar}
      />
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={contaId}
        lancamento={editando}
        onSaved={carregar}
      />

      <AlertDialog open={!!apagando} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando?.descricao ? `"${apagando.descricao}"` : "Este lançamento"} — {apagando && brl(Number(apagando.valor))}.
              Não dá pra desfazer.
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
    </div>
  );
}
