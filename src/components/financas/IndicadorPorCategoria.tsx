// ─── Indicador por Categoria ───────────────────────────────────────────────
//
// Pedido dela (01/10/2026), logo depois do Indicador por Centro de Custo:
// "quanto gastamos com Energia?" não é pergunta de ONDE (centro de custo),
// é de COM O QUÊ (categoria) — os dois coexistem (a spec dizia "substituir"
// no título mas "devem coexistir" no fechamento; seguido o fechamento).
//
// Escopo v1 (combinado na conversa, depois de medir): sem drill-down
// interativo em 4 níveis com breadcrumb (achatado em listas, mesmo padrão
// do card de Centro); sem exportar PDF/Excel; sem "Auditoria" no detalhe
// (nenhuma tela lê `audit_user_id`/`audit_em` hoje); "Anexos" no detalhe
// fica de fora também — ela mesma pediu pra tirar o comprovante do
// `LancamentoForm` há poucas mensagens, não reabrir isso aqui. O
// "Indicadores especiais" só-pra-utilidades da spec dela virou Média
// Mensal/Maior mês/Menor mês GENÉRICO pra qualquer categoria, em vez de um
// bloco com nome de categoria fixo no código.
//
// "Participação" é sobre o TOTAL CLASSIFICADO por categoria (50,1% dos
// lançamentos de saída têm categoria — medido antes de escrever, melhor
// que os 19,4% de centro de custo, mas ainda metade), não o total de
// despesas da igreja — mesmo cuidado de rótulo do card de Centro.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Tag, Loader2, TrendingUp, TrendingDown, ChevronRight, Trophy } from "lucide-react";
import {
  listarCategorias, listarLancamentosCategoriaPeriodo, nomeExtrato,
  type FinCategoria, type FinLancamentoExtenso,
} from "@/services/finService";
import {
  buscarResumoCategoria, buscarRankingCategorias,
  type ResumoCentro, type RankingCategoria,
} from "@/services/dashboardExecutivoService";
import { LancamentoForm } from "@/components/financas/LancamentoForm";
import { parseLocalDate } from "@/lib/data";

const fmtBR = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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

export function IndicadorPorCategoria({ periodoDe, periodoAte, periodoLabel }: Props) {
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [resumo, setResumo] = useState<ResumoCentro | null>(null);
  const [ranking, setRanking] = useState<RankingCategoria[]>([]);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<FinLancamentoExtenso | null>(null);

  useEffect(() => {
    listarCategorias("saida").then(lista => {
      setCategorias(lista);
      const primeira = lista.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))[0];
      if (primeira) setCategoriaId(primeira.id);
    }).catch(e => {
      console.error("Indicador por Categoria — falha ao listar categorias:", e);
      toast.error("Não foi possível carregar as categorias.");
    });
  }, []);

  function recarregar() {
    if (!categoriaId) return;
    setLoading(true);
    Promise.all([
      buscarResumoCategoria(categoriaId, periodoDe, periodoAte),
      listarLancamentosCategoriaPeriodo(categoriaId, periodoDe, periodoAte),
      buscarRankingCategorias(periodoDe, periodoAte),
    ]).then(([r, l, rk]) => { setResumo(r); setLancamentos(l); setRanking(rk); })
      .catch(e => {
        console.error("Indicador por Categoria — falha ao carregar:", e);
        toast.error("Não foi possível carregar o indicador por categoria.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { recarregar(); }, [categoriaId, periodoDe, periodoAte]);

  const categoriasOrdenadas = useMemo(
    () => categorias.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [categorias],
  );

  const composicaoCentro = useMemo(() => {
    const mapa = new Map<string, number>();
    let semCentro = 0;
    lancamentos.forEach(l => {
      if (!l.centro_custo_id) { semCentro += l.valor; return; }
      const nome = l.centro_nome ?? "—";
      mapa.set(nome, (mapa.get(nome) ?? 0) + l.valor);
    });
    const linhas = Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor }));
    if (semCentro > 0) linhas.push({ nome: "(Sem centro de custo)", valor: semCentro });
    return linhas.sort((a, b) => b.valor - a.valor);
  }, [lancamentos]);

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

  const estatMensal = useMemo(() => {
    if (evolucao.length === 0) return null;
    const valores = evolucao.map(e => e.valor);
    const media = valores.reduce((s, v) => s + v, 0) / valores.length;
    const maior = evolucao.reduce((m, e) => (e.valor > m.valor ? e : m));
    const menor = evolucao.reduce((m, e) => (e.valor < m.valor ? e : m));
    return { media, maior, menor };
  }, [evolucao]);

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
  const top10Categorias = useMemo(() => ranking.slice(0, 10), [ranking]);
  const colocacaoAtual = useMemo(
    () => ranking.find(r => r.categoriaId === categoriaId)?.colocacao ?? null,
    [ranking, categoriaId],
  );

  const participacao = resumo && resumo.totalClassificado > 0
    ? (resumo.executado / resumo.totalClassificado) * 100 : null;
  const variacao = resumo && resumo.periodoAnterior > 0
    ? ((resumo.executado - resumo.periodoAnterior) / resumo.periodoAnterior) * 100 : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag className="w-4 h-4 text-gold" /> Indicador por Categoria
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{periodoLabel}</p>
        </div>
        <Select value={categoriaId} onValueChange={setCategoriaId}>
          <SelectTrigger className="h-8 w-[220px] text-sm print:hidden">
            <SelectValue placeholder="Selecione..." />
          </SelectTrigger>
          <SelectContent>
            {categoriasOrdenadas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
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
            Sem despesas classificadas nesta categoria, no período selecionado.
          </p>
        ) : (
          <>
            {/* Resumo executivo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              {colocacaoAtual != null && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Colocação</div>
                  <div className="text-sm font-medium mt-0.5">
                    {colocacaoAtual}ª categoria de despesa (classificadas)
                  </div>
                </div>
              )}
            </div>

            {/* Composição por Centro de Custo */}
            {composicaoCentro.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Composição por centro de custo</div>
                <div className="space-y-1">
                  {composicaoCentro.map(s => (
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
                <div className="flex items-baseline justify-between flex-wrap gap-x-4 gap-y-1 mb-1.5">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Evolução mensal</span>
                  {estatMensal && (
                    <span className="text-xs text-muted-foreground">
                      Média {fmtBR(estatMensal.media)}/mês · Maior {estatMensal.maior.rotulo} ({fmtBR(estatMensal.maior.valor)}) ·
                      {" "}Menor {estatMensal.menor.rotulo} ({fmtBR(estatMensal.menor.valor)})
                    </span>
                  )}
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={evolucao} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                      <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} interval={evolucao.length > 24 ? 2 : 0} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmtBR(v)} contentStyle={{ fontSize: "11px" }} />
                      <Bar dataKey="valor" fill="#7c9885" radius={[2, 2, 0, 0]} />
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

            {/* Top 10 Categorias de Despesas (ranking geral, não só a selecionada) */}
            {top10Categorias.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5" /> Top 10 categorias de despesas
                  <span className="normal-case text-muted-foreground/70">· entre as classificadas</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  {top10Categorias.map(c => (
                    <button key={c.categoriaId} type="button" onClick={() => setCategoriaId(c.categoriaId)}
                      className={"flex items-center gap-2 text-sm w-full text-left rounded px-1 -mx-1 py-0.5 print:hidden " +
                        (c.categoriaId === categoriaId ? "bg-muted font-medium" : "hover:bg-muted/50")}>
                      <span className="text-muted-foreground w-4 text-right shrink-0">{c.colocacao}.</span>
                      <span className="flex-1 truncate min-w-0">{c.nome}</span>
                      <span className="tabular-nums">{fmtBR(c.valor)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
