// ─── Indicador por Centro de Custo ────────────────────────────────────────
//
// Pedido dela (01/10/2026): escolher QUALQUER Centro de Custo e ver quanto
// foi gasto nele no período, com Subcentro, evolução mensal, Top
// Fornecedores/Despesas, e clicar num lançamento pra corrigir direto.
//
// Escopo v1, combinado depois de medir (ver conversa): sem Ranking entre
// centros (80,6% dos lançamentos de saída não têm `centro_custo_id` — um
// "3º maior centro" seria calculado sobre 1/5 dos dados reais, mais ruído
// que informação), sem exportar PDF/Excel, sem filtro de Conta/Projeto
// dentro do componente (nenhum existe hoje em lugar nenhum do dashboard).
// Reusa o período do Fluxo de Caixa acima (único filtro de período que já
// existe na tela) em vez de abrir um segundo seletor de data redundante.
//
// "Participação" é sobre o TOTAL CLASSIFICADO (soma de todo lançamento que
// TEM centro, não o total de despesas da igreja) — rotulado assim de
// propósito, pra não sugerir uma fatia de um bolo que não é esse.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Building2, Loader2, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import {
  listarCentrosCusto, listarLancamentosCentroPeriodo, nomeExtrato,
  type FinCentroCusto, type FinLancamentoExtenso,
} from "@/services/finService";
import { buscarResumoCentro, type ResumoCentro } from "@/services/dashboardExecutivoService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { parseLocalDate } from "@/lib/data";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Mesma abreviação fixa em português usada nas funções SQL (`v_meses_pt`
// em `fin_exec_fluxo_12m`) — `toLocaleDateString` depende do locale do
// NAVEGADOR aqui (ao contrário do servidor), mas manter os dois iguais
// evita rótulo em inglês se algum dia isto rodar num ambiente sem pt-BR.
const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function rotuloMes(anoMes: string): string {
  const d = parseLocalDate(`${anoMes}-01`);
  return `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

interface Props {
  periodoDe: string;
  periodoAte: string;
  periodoLabel: string;
}

export function IndicadorCentroCusto({ periodoDe, periodoAte, periodoLabel }: Props) {
  const [centros, setCentros] = useState<FinCentroCusto[]>([]);
  const [centroId, setCentroId] = useState<string>("");
  const [resumo, setResumo] = useState<ResumoCentro | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);

  const raizes = useMemo(
    () => centros.filter(c => !c.centro_pai_id).slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [centros],
  );
  const temSubcentros = useMemo(
    () => centros.some(c => c.centro_pai_id === centroId),
    [centros, centroId],
  );

  useEffect(() => {
    listarCentrosCusto().then(lista => {
      setCentros(lista);
      const primeiro = lista.filter(c => !c.centro_pai_id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))[0];
      if (primeiro) setCentroId(primeiro.id);
    }).catch(e => {
      console.error("Indicador por Centro de Custo — falha ao listar centros:", e);
      toast.error("Não foi possível carregar os centros de custo.");
    });
  }, []);

  function recarregar() {
    if (!centroId) return;
    setLoading(true);
    Promise.all([
      buscarResumoCentro(centroId, periodoDe, periodoAte),
      listarLancamentosCentroPeriodo(centroId, periodoDe, periodoAte),
    ]).then(([r, l]) => { setResumo(r); setLancamentos(l); })
      .catch(e => {
        console.error("Indicador por Centro de Custo — falha ao carregar:", e);
        toast.error("Não foi possível carregar o indicador do centro de custo.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { recarregar(); }, [centroId, periodoDe, periodoAte]);

  const subcentros = useMemo(() => {
    const mapa = new Map<string, number>();
    let direto = 0;
    lancamentos.forEach(l => {
      if (l.centro_custo_id === centroId) { direto += l.valor; return; }
      const nome = l.centro_nome ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + l.valor);
    });
    const linhas = Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor }));
    if (direto > 0 && temSubcentros) linhas.push({ nome: "(Direto no centro, sem subcentro)", valor: direto });
    return linhas.sort((a, b) => b.valor - a.valor);
  }, [lancamentos, centroId, temSubcentros]);

  const evolucao = useMemo(() => {
    const mapa = new Map<string, number>();
    lancamentos.forEach(l => {
      const chave = l.data.slice(0, 7);
      mapa.set(chave, (mapa.get(chave) ?? 0) + l.valor);
    });
    return Array.from(mapa.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, valor]) => ({ mes, rotulo: rotuloMes(mes), valor }));
  }, [lancamentos]);

  const topFornecedores = useMemo(() => {
    const mapa = new Map<string, number>();
    lancamentos.forEach(l => {
      const nome = l.fornecedor_nome ?? l.pessoa_nome;
      if (!nome) return;
      mapa.set(nome, (mapa.get(nome) ?? 0) + l.valor);
    });
    return Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [lancamentos]);

  const topDespesas = useMemo(() => lancamentos.slice(0, 10), [lancamentos]);

  const participacao = resumo && resumo.totalClassificado > 0
    ? (resumo.executado / resumo.totalClassificado) * 100 : null;
  const variacao = resumo && resumo.periodoAnterior > 0
    ? ((resumo.executado - resumo.periodoAnterior) / resumo.periodoAnterior) * 100 : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gold" /> Indicador por Centro de Custo
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{periodoLabel}</p>
        </div>
        <Select value={centroId} onValueChange={setCentroId}>
          <SelectTrigger className="h-8 w-[220px] text-sm print:hidden">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {raizes.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Carregando...
          </div>
        ) : !resumo || resumo.executado === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sem despesas classificadas neste centro, no período selecionado.
          </p>
        ) : (
          <>
            {/* Resumo executivo */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Valor executado</div>
                <div className="text-lg font-serif font-medium">{fmtBR(resumo.executado)}</div>
              </div>
              {participacao != null && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Participação</div>
                  <div className="text-sm font-medium mt-0.5">{participacao.toFixed(1)}% do classificado</div>
                </div>
              )}
              {variacao != null && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Variação</div>
                  <div className={"text-sm font-medium mt-0.5 flex items-center gap-1 " +
                    (variacao >= 0 ? "text-destructive-text" : "text-success-text")}>
                    {variacao >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {Math.abs(variacao).toFixed(1)}% vs. período anterior
                  </div>
                </div>
              )}
            </div>

            {/* Composição por subcentro */}
            {subcentros.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Composição por subcentro</div>
                <div className="space-y-1">
                  {subcentros.map(s => (
                    <div key={s.nome} className="flex items-center gap-2 text-sm border-b pb-1 last:border-0">
                      <span className="flex-1 truncate min-w-0">{s.nome}</span>
                      <span className="tabular-nums font-medium">{fmtBR(s.valor)}</span>
                      <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
                        {((s.valor / resumo.executado) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evolução mensal */}
            {evolucao.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Evolução mensal</div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evolucao} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} interval={evolucao.length > 24 ? 2 : 0} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmtBR(v)} contentStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="valor" fill="#b89348" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top favorecidos + Top despesas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topFornecedores.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Top favorecidos</div>
                  <div className="space-y-1">
                    {topFornecedores.map(f => (
                      <div key={f.nome} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate min-w-0">{f.nome}</span>
                        <span className="tabular-nums">{fmtBR(f.valor)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Top despesas <span className="normal-case text-muted-foreground/70">· clique para corrigir</span>
                </div>
                <div className="space-y-1">
                  {topDespesas.map(l => {
                    const nome = nomeExtrato(l, "Lançamento");
                    return (
                      <button key={l.id} type="button" onClick={() => setEditando(l)}
                        className="flex items-center gap-2 text-sm w-full text-left hover:bg-muted/50 rounded px-1 -mx-1 py-0.5 print:hidden">
                        <span className="flex-1 truncate min-w-0">{nome.principal}</span>
                        <span className="tabular-nums">{fmtBR(l.valor)}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <LancamentoForm
        open={!!editando}
        onOpenChange={(v) => { if (!v) setEditando(null); }}
        lancamento={editando}
        onSaved={() => { setEditando(null); recarregar(); }}
      />
    </Card>
  );
}
