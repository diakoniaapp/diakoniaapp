import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, DollarSign, Loader2, Plus, Search, Filter,
  TrendingUp, TrendingDown, Pencil, Trash2, Paperclip,
  CheckCircle2, Clock, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  carregarConta, listarLancamentos, excluirLancamento, brl,
  comprovanteSignedUrl, CONTA_TIPO_LABEL,
  type FinConta, type FinLancamentoExtenso, type FinMovimentoTipo, type FinStatus,
  STATUS_LABEL,
} from "@/services/finService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { TransferenciaForm } from "@/components/financas/TransferenciaForm";
import { ArrowRightLeft } from "lucide-react";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const STATUS_COR: Record<FinStatus, string> = {
  realizado:  "text-foreground",
  conciliado: "text-emerald-700",
  previsto:   "text-amber-700",
  cancelado:  "text-muted-foreground line-through",
  aguardando_aprovacao: "text-blue-700",
};

const STATUS_ICONE: Record<FinStatus, JSX.Element> = {
  realizado:  <CheckCircle2 className="w-3 h-3" />,
  conciliado: <CheckCircle2 className="w-3 h-3 text-emerald-600" />,
  previsto:   <Clock className="w-3 h-3 text-amber-600" />,
  cancelado:  <XCircle className="w-3 h-3 text-muted-foreground" />,
  aguardando_aprovacao: <Clock className="w-3 h-3 text-blue-600" />,
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

  async function deletar(id: string) {
    if (!confirm("Excluir este lançamento? Não dá pra desfazer.")) return;
    try {
      await excluirLancamento(id);
      toast.success("Excluído");
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  if (loading && !conta) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
    </div>;
  }
  if (!conta) {
    return <div className="p-8 text-center text-muted-foreground">
      Conta não encontrada. <Link to="/financas" className="text-primary underline">Voltar</Link>
    </div>;
  }

  // Compute saldo anterior (do período)
  const totalEntradasPeriodo = lancamentos.filter(l => l.tipo === "entrada" && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);
  const totalSaidasPeriodo  = lancamentos.filter(l => l.tipo === "saida"   && (l.status === "realizado" || l.status === "conciliado")).reduce((s, l) => s + Number(l.valor), 0);

  return (
    <div className="p-3 md:p-5 max-w-7xl mx-auto space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-lg flex items-center gap-2 truncate">
            <DollarSign className="w-5 h-5 text-gold" />
            {conta.nome}
            <Badge variant="outline" className="text-[10px]">{CONTA_TIPO_LABEL[conta.tipo]}</Badge>
          </h1>
          <p className="text-xs text-muted-foreground">
            Saldo atual: <strong style={{ color: conta.cor ?? undefined }}>{brl(Number(conta.saldo_atual))}</strong>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTransfOpen(true)} className="gap-1.5 text-blue-600 hover:text-blue-700">
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
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data inicial</label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Data final</label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo</label>
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
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Buscar descrição</label>
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
        <Card className="bg-emerald-50/40 border-emerald-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-emerald-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
            <p className="text-sm font-semibold text-emerald-700 tabular-nums">{brl(totalEntradasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card className="bg-rose-50/40 border-rose-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-rose-700 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
            <p className="text-sm font-semibold text-rose-700 tabular-nums">{brl(totalSaidasPeriodo)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-muted-foreground">Saldo do período</p>
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
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
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
                {lancamentos.map(l => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="py-1.5 px-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] ${STATUS_COR[l.status]}`}>
                        {STATUS_ICONE[l.status]} {STATUS_LABEL[l.status]}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 px-2 min-w-[200px]">
                      <p className="font-medium truncate">{l.descricao ?? "—"}</p>
                      {l.fornecedor_nome && (
                        <p className="text-[10px] text-muted-foreground truncate">{l.fornecedor_nome}</p>
                      )}
                      {l.pessoa_nome && (
                        <p className="text-[10px] text-muted-foreground truncate">de {l.pessoa_nome}</p>
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {l.categoria_nome && (
                        <Badge variant="outline" className="text-[9px]"
                          style={l.categoria_cor ? { borderColor: l.categoria_cor, color: l.categoria_cor } : undefined}>
                          {l.categoria_nome}
                        </Badge>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-[10px] text-muted-foreground truncate">
                      {l.centro_nome ?? "—"}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${l.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                      {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                    </td>
                    <td className="py-1.5 px-1">
                      {l.comprovante_url && (
                        <button type="button" onClick={() => abrirComprovante(l.comprovante_url!)} title="Ver comprovante"
                          className="text-blue-700 hover:text-blue-900">
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
                          onClick={() => deletar(l.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-right">
        {lancamentos.length} lançamento{lancamentos.length === 1 ? "" : "s"} no período · até 300 mais recentes
      </p>

      {/* Dialogs */}
      <TransferenciaForm
        open={transfOpen}
        onOpenChange={setTransfOpen}
        contaOrigemPadrao={contaId}
        onSaved={carregar}
      />
      <LancamentoForm
        open={novoOpen}
        onOpenChange={(v) => { setNovoOpen(v); if (!v) setEditando(null); }}
        contaIdPadrao={contaId}
        lancamento={editando}
        onSaved={carregar}
      />
    </div>
  );
}
