// ─── FinancasProjetoDetalhe.tsx ──────────────────────────────────────────
//
// Fase 6 do ERP financeiro. Relatório executivo de UM projeto — visual
// redesenhado em 17/09/2026 a partir de um modelo que a Telma trouxe de
// outra conversa (PDF "Relatório Financeiro Executivo — Campanha 120
// Anos"): 3 cartões de KPI, termômetro da meta, despesas por categoria
// (barra) e origem das receitas (rosca), top 5 maiores despesas, alertas
// gerados a partir do dado real (nunca inventados), e um anexo de 2ª
// página com a listagem cronológica completa + balanço consolidado.
//
// "Meta", aqui, é o TOTAL DE DESPESAS do projeto — não um valor de
// arrecadação definido de antemão. Faz sentido pro tipo de projeto que
// motivou o pedido (reforma/campanha): a pergunta é "quanto já gastamos,
// e quanto disso já foi coberto por doação". Se a tesouraria também
// definiu uma meta de arrecadação (`fin_projetos.meta_valor`), ela
// aparece como nota complementar, sem substituir os 3 cartões principais
// — as duas coisas respondem perguntas diferentes.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LabelList,
} from "recharts";
import {
  ArrowLeft, Printer, Download, Pencil, TrendingUp, TrendingDown, DollarSign,
  Target, AlertTriangle, Info, BarChart3, PieChart as PieChartIcon,
} from "lucide-react";
import { toast } from "sonner";
import { hojeLocal } from "@/lib/data";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  carregarProjeto, listarLancamentosSemTeto, gerarCSV, downloadCSV, brl,
  type FinProjeto, type FinLancamentoExtenso,
} from "@/services/finService";
import { ProjetoForm } from "@/components/financas/ProjetoForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

const VERMELHO = "#dc2626";
const VERDE = "#059669";
const CINZA = "#9ca3af";
const PALETA_ORIGEM = ["#059669", "#2563eb", "#b89348", "#9333ea", "#0891b2", "#ea580c"];

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function FinancasProjetoDetalhe() {
  const { id = "" } = useParams();
  const { user } = useAuth();

  const [projeto, setProjeto] = useState<FinProjeto | null>(null);
  const [todosLancs, setTodosLancs] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    if (!id) return;
    setLoading(true);
    try {
      const [p, lancs] = await Promise.all([
        carregarProjeto(id),
        listarLancamentosSemTeto({ projetoId: id }),
      ]);
      setProjeto(p);
      setTodosLancs(lancs);

      if (user) {
        const { data: prof } = await supabase
          .from("profiles").select("nome").eq("id", user.id).maybeSingle();
        setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  // Igual à prestação de contas de centro de custo: só o que já
  // aconteceu de verdade entra na demonstração.
  const lancamentos = useMemo(
    () => todosLancs.filter(l => l.status === "realizado" || l.status === "conciliado"),
    [todosLancs],
  );
  // Só pro alerta de "receita parada" — despesas que ainda vão vencer,
  // pra não alarmar sobre um projeto que só ainda não teve despesa
  // nenhuma prevista.
  const despesasFuturasPendentes = useMemo(
    () => todosLancs.filter(l => l.tipo === "saida" && l.status === "previsto" && l.data > hojeLocal()),
    [todosLancs],
  );

  const entradas = useMemo(() => lancamentos.filter(l => l.tipo === "entrada"), [lancamentos]);
  const saidas = useMemo(() => lancamentos.filter(l => l.tipo === "saida"), [lancamentos]);

  const totais = useMemo(() => {
    const totalEntradas = entradas.reduce((s, l) => s + Number(l.valor), 0);
    const totalSaidas = saidas.reduce((s, l) => s + Number(l.valor), 0);
    return {
      totalEntradas, totalSaidas, resultado: totalEntradas - totalSaidas,
      qtdEntradas: entradas.length, qtdSaidas: saidas.length,
      // Ticket médio: só faz sentido sobre entradas — uma despesa não
      // tem "ticket", é o valor que foi gasto.
      ticketMedio: entradas.length > 0 ? totalEntradas / entradas.length : 0,
    };
  }, [entradas, saidas]);

  // "Meta" = total de despesas do projeto (ver comentário no topo do
  // arquivo) — cada linha aqui é uma DESPESA, agrupada por categoria.
  const despesasPorCategoria = useMemo(() => {
    const map = new Map<string, number>();
    saidas.forEach(l => {
      const nome = l.categoria_nome ?? "A categorizar";
      map.set(nome, (map.get(nome) ?? 0) + Number(l.valor));
    });
    const total = totais.totalSaidas || 1;
    return Array.from(map.entries())
      .map(([nome, valor]) => ({ nome, valor, pct: (valor / total) * 100 }))
      .sort((a, b) => b.valor - a.valor)
      .map(c => ({ ...c, rotulo: `${brl(c.valor)} (${c.pct.toFixed(0)}%)` }));
  }, [saidas, totais.totalSaidas]);

  // Origem da receita: pessoa física (qualquer entrada ligada a
  // pessoa_id) vira um balde só — o que importa pra tesouraria é "quanto
  // veio de doador individual" vs. de cada fonte institucional
  // (gateway de cartão, etc.), não o nome de cada doador (isso já está
  // na listagem detalhada). Sem fornecedor_id nem pessoa_id (achado ao
  // vivo: é o caso de "CIELO S.A" — vem só como texto em `descricao`,
  // nunca ligada a um fornecedor cadastrado), o balde nasce da própria
  // descrição.
  const origemReceitas = useMemo(() => {
    const map = new Map<string, { label: string; valor: number }>();
    entradas.forEach(l => {
      let key: string; let label: string;
      if (l.pessoa_id) { key = "pessoa"; label = "Pessoa Física"; }
      else if (l.fornecedor_id) { key = `f:${l.fornecedor_id}`; label = l.fornecedor_nome ?? "Fornecedor"; }
      else { const d = (l.descricao ?? "Outros").trim() || "Outros"; key = `d:${d.toLowerCase()}`; label = d; }
      const ex = map.get(key);
      if (ex) ex.valor += Number(l.valor);
      else map.set(key, { label, valor: Number(l.valor) });
    });
    const total = totais.totalEntradas || 1;
    return Array.from(map.values())
      .map(o => ({ ...o, pct: (o.valor / total) * 100 }))
      .sort((a, b) => b.valor - a.valor);
  }, [entradas, totais.totalEntradas]);

  const topDespesas = useMemo(
    () => saidas.slice().sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 5),
    [saidas],
  );

  // Alertas — cada um só entra se a condição por trás dele for
  // verdadeira nos dados DESTE projeto. Nada aqui é texto fixo do
  // modelo original; são heurísticas gerais (déficit, concentração de
  // categoria, concentração de origem, receita parada) que valem pra
  // qualquer projeto, calculadas em cima do que realmente está lançado.
  const alertas = useMemo(() => {
    const lista: { tom: "destructive" | "info"; texto: string }[] = [];

    if (totais.totalSaidas > 0) {
      if (totais.resultado < 0) {
        const pctExcesso = (Math.abs(totais.resultado) / (totais.totalEntradas || 1)) * 100;
        const pctMeta = (totais.totalEntradas / totais.totalSaidas) * 100;
        lista.push({
          tom: "destructive",
          texto: `Déficit de ${brl(Math.abs(totais.resultado))} — despesas superam receitas em ${pctExcesso.toFixed(0)}%; apenas ${pctMeta.toFixed(1)}% do total de despesas foi arrecadado.`,
        });
      } else if (totais.resultado > 0) {
        const pctSuperavit = (totais.resultado / totais.totalSaidas) * 100;
        lista.push({
          tom: "info",
          texto: `Superávit de ${brl(totais.resultado)} — a arrecadação superou as despesas em ${pctSuperavit.toFixed(0)}%.`,
        });
      }
    }

    if (despesasPorCategoria.length >= 2) {
      const top = despesasPorCategoria.slice(0, Math.min(3, despesasPorCategoria.length));
      const pctTop = top.reduce((s, c) => s + c.pct, 0);
      if (pctTop >= 70) {
        lista.push({
          tom: "info",
          texto: `${top.length} categoria${top.length > 1 ? "s" : ""} (${top.map(c => c.nome).join(", ")}) concentram ${pctTop.toFixed(1)}% de todo o gasto.`,
        });
      }
    }

    if (origemReceitas.length >= 2) {
      const maior = origemReceitas[0];
      lista.push({
        tom: "info",
        texto: `${maior.pct.toFixed(0)}% da receita vem de ${maior.label}; ${(100 - maior.pct).toFixed(0)}% vem de outras fontes.`,
      });
    }

    if (entradas.length > 0) {
      const ultima = entradas.slice().sort((a, b) => b.data.localeCompare(a.data))[0].data;
      const dias = Math.floor((new Date(hojeLocal() + "T00:00").getTime() - new Date(ultima + "T00:00").getTime()) / 86400000);
      if (dias >= 14 && despesasFuturasPendentes.length > 0) {
        const maisTarde = despesasFuturasPendentes.slice().sort((a, b) => b.data.localeCompare(a.data))[0].data;
        lista.push({
          tom: "destructive",
          texto: `Nenhuma nova receita registrada desde ${dataBr(ultima)}, enquanto despesas previstas seguem vencendo até ${dataBr(maisTarde)}.`,
        });
      }
    }

    return lista;
  }, [totais, despesasPorCategoria, origemReceitas, entradas, despesasFuturasPendentes]);

  function exportarCSV() {
    if (!projeto) return;
    const csv = gerarCSV(lancamentos);
    downloadCSV(`QIBRJ_Projeto_${projeto.nome.replace(/\s+/g, "-")}.csv`, csv);
    toast.success("CSV exportado");
  }

  if (loading) return <PaginaSkeleton />;
  if (!projeto) return (
    <div className="p-8 text-center text-muted-foreground">
      Projeto não encontrado. <Link to="/financas/projetos" className="text-primary underline">Voltar</Link>
    </div>
  );

  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const temDespesas = totais.totalSaidas > 0;
  const pctArrecadadoMeta = temDespesas ? Math.min(100, (totais.totalEntradas / totais.totalSaidas) * 100) : 0;
  const pctDeficitMeta = 100 - pctArrecadadoMeta;
  // Meta de arrecadação definida manualmente (separada da "meta" =
  // despesas totais usada nos 3 cartões) — só aparece se a tesouraria
  // preencheu esse campo ao cadastrar o projeto.
  const pctMetaArrecadacao = projeto.meta_valor ? (totais.totalEntradas / projeto.meta_valor) * 100 : null;

  return (
    <div className="bg-background min-h-screen">
      <style>{`
        @media print {
          @page { size: A4; margin: 1.2cm 1.5cm; }
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          body * { visibility: hidden !important; }
          .relatorio-page, .relatorio-page * { visibility: visible !important; }
          .relatorio-page {
            position: absolute !important;
            left: 0 !important; top: 0 !important; right: 0 !important;
            width: 100% !important; max-width: 100% !important;
            margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; border: none !important;
            background: white !important;
          }
          .relatorio-page * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .avoid-break { page-break-inside: avoid; }
          .pagina-anexo { page-break-before: always; }
          .relatorio-page tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Barra de controles */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/financas/projetos"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Link>
          </Button>
          <Button onClick={() => setEditOpen(true)} variant="outline" size="sm" className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
          <div className="flex items-center gap-1 ml-auto">
            <Button onClick={exportarCSV} size="sm" variant="outline" className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
            <Button onClick={() => window.print()} size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Printer className="w-3.5 h-3.5" /> Imprimir / PDF
            </Button>
          </div>
        </div>
      </div>

      {/* PÁGINA 1 — RESUMO EXECUTIVO */}
      <div className="relatorio-page max-w-5xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        {/* Sempre em coluna na TELA, só em linha na IMPRESSÃO — achado ao
            vivo (17/09/2026) testando com um nome de projeto longo. A
            causa real: o bloco de data à direita tem `shrink-0` (nunca
            encolhe), então TODO o aperto de largura cai sobre o bloco do
            título; com `min-w-0` (that permite encolher abaixo do
            max-content), ele encolhia a ponto de quebrar palavra por
            palavra. `sm:flex-row` não resolve — a barra lateral do
            AppLayout come ~240-280px, então mesmo telas de laptop comuns
            (testado em 857px de janela) ficam abaixo do necessário pras
            duas colunas caberem sem aperto. Impressão em A4 tem espaço de
            sobra (a margem de 1.2cm já garante isso), por isso só lá vale
            a pena arriscar a linha única. */}
        <header className="avoid-break flex flex-col print:flex-row print:items-start print:justify-between gap-3 pb-4 border-b-2 border-gold/30">
          <div className="flex items-center gap-3 min-w-0">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-12 w-auto object-contain shrink-0"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }} draggable={false} />
            <div className="min-w-0">
              <h1 className="font-serif text-2xl leading-tight">Relatório Financeiro Executivo</h1>
              <p className="text-sm text-muted-foreground">{projeto.nome}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-0.5 print:text-right print:shrink-0">
            <p>
              Período: {projeto.data_inicio ? dataBr(projeto.data_inicio) : "—"} a {projeto.data_fim ? dataBr(projeto.data_fim) : "em andamento"}
            </p>
            <p>Gerado em <strong className="text-foreground">{hojeBr}</strong> às {horaBr} · {emitidoPor}</p>
          </div>
        </header>

        {lancamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center italic py-12">
            Nenhum lançamento realizado ou conciliado ainda para este projeto.
          </p>
        ) : (
          <>
            {/* 3 CARTÕES DE KPI */}
            <section className={`avoid-break grid gap-3 my-6 ${temDespesas ? "grid-cols-3" : "grid-cols-2"}`}>
              {temDespesas && (
                <KpiCard cor={VERMELHO} titulo="Meta de despesas (total)" valor={brl(totais.totalSaidas)}
                  legenda={`${totais.qtdSaidas} lançamento${totais.qtdSaidas !== 1 ? "s" : ""} (100%)`} />
              )}
              <KpiCard cor={VERDE} titulo="Total arrecadado (doações)" valor={brl(totais.totalEntradas)}
                legenda={temDespesas
                  ? `${totais.qtdEntradas} lançamento${totais.qtdEntradas !== 1 ? "s" : ""} (${pctArrecadadoMeta.toFixed(1)}% da meta)`
                  : `${totais.qtdEntradas} lançamento${totais.qtdEntradas !== 1 ? "s" : ""}`} />
              {temDespesas && (
                <KpiCard cor={totais.resultado >= 0 ? VERDE : VERMELHO}
                  titulo={totais.resultado >= 0 ? "Superávit" : "Valor não alcançado (déficit)"}
                  valor={`${totais.resultado >= 0 ? "+" : "-"}${brl(Math.abs(totais.resultado))}`}
                  legenda={totais.resultado >= 0 ? "Meta de despesas cobrida" : `Faltam ${pctDeficitMeta.toFixed(1)}% da meta`} />
              )}
            </section>

            {pctMetaArrecadacao != null && (
              <p className="avoid-break text-xs text-info-text bg-info-soft/40 border border-info-line rounded-md px-3 py-2 mb-6 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 shrink-0" />
                Meta de arrecadação definida pela tesouraria: <strong>{brl(projeto.meta_valor!)}</strong>
                {" "}— {pctMetaArrecadacao.toFixed(1)}% atingido.
              </p>
            )}

            {/* TERMÔMETRO */}
            {temDespesas && (
              <section className="avoid-break mb-6 p-4 rounded-md border border-border/40">
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  Termômetro da meta — % arrecadado vs. % em aberto
                </h3>
                <div className="flex h-8 rounded-md overflow-hidden text-white text-xs font-semibold">
                  {pctArrecadadoMeta > 0 && (
                    <div className="flex items-center justify-center" style={{ width: `${pctArrecadadoMeta}%`, background: VERDE }}>
                      {pctArrecadadoMeta >= 12 && `${pctArrecadadoMeta.toFixed(1)}% Arrecadado`}
                    </div>
                  )}
                  {pctDeficitMeta > 0 && (
                    <div className="flex items-center justify-center" style={{ width: `${pctDeficitMeta}%`, background: VERMELHO }}>
                      {pctDeficitMeta >= 12 && `${pctDeficitMeta.toFixed(1)}% ${totais.resultado >= 0 ? "Excedente" : "Déficit"}`}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* DESPESAS POR CATEGORIA + ORIGEM DAS RECEITAS */}
            <section className="avoid-break grid grid-cols-2 gap-6 mb-6">
              <div className="border border-border/40 rounded-md p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-destructive-text" /> Despesas por categoria
                </h3>
                {despesasPorCategoria.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">Sem despesas ainda.</p>
                ) : (
                  <div style={{ height: Math.max(160, despesasPorCategoria.length * 34) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={despesasPorCategoria} layout="vertical" margin={{ top: 4, right: 60, left: 4, bottom: 4 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => brl(v)} />
                        <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
                          {despesasPorCategoria.map((c, i) => (
                            <Cell key={i} fill={c.nome === "A categorizar" ? CINZA : VERMELHO} />
                          ))}
                          <LabelList dataKey="rotulo" position="right" style={{ fontSize: 10, fill: "#374151" }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="border border-border/40 rounded-md p-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <PieChartIcon className="w-3.5 h-3.5 text-success-text" /> Origem das receitas
                </h3>
                {origemReceitas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">Sem receitas ainda.</p>
                ) : (
                  <>
                    <div className="relative" style={{ height: 180 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                          <Pie data={origemReceitas} dataKey="valor" nameKey="label"
                            innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                            {origemReceitas.map((_, i) => (
                              <Cell key={i} fill={PALETA_ORIGEM[i % PALETA_ORIGEM.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => brl(v)} />
                        </RePieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <p className="text-base font-semibold">{brl(totais.totalEntradas)}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">receitas</p>
                      </div>
                    </div>
                    <ul className="text-xs space-y-1 mt-2">
                      {origemReceitas.map((o, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PALETA_ORIGEM[i % PALETA_ORIGEM.length] }} />
                          <span className="truncate flex-1">{o.label}</span>
                          <span className="font-medium tabular-nums">{o.pct.toFixed(0)}%</span>
                        </li>
                      ))}
                    </ul>
                    {totais.qtdEntradas > 0 && (
                      <p className="text-xs text-muted-foreground text-center mt-2 pt-2 border-t border-border/40">
                        Ticket médio por doação: <strong className="text-foreground">{brl(totais.ticketMedio)}</strong>
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* TOP 5 DESPESAS + ALERTAS */}
            <section className="avoid-break grid grid-cols-2 gap-6 mb-6">
              <div className="border border-border/40 rounded-md p-4">
                <h3 className="text-sm font-medium mb-2">Top 5 maiores despesas</h3>
                {topDespesas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">Sem despesas ainda.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {topDespesas.map(l => (
                        <tr key={l.id} className="border-b border-border/40 last:border-0">
                          <td className="py-1.5 pr-2">
                            <p className="truncate max-w-[220px]">{l.descricao ?? "—"}</p>
                            <p className="text-muted-foreground text-[10px]">{l.categoria_nome ?? "Sem categoria"}</p>
                          </td>
                          <td className="py-1.5 text-right tabular-nums font-medium text-destructive-text whitespace-nowrap">
                            {brl(Number(l.valor))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="border border-info-line bg-info-soft/30 rounded-md p-4">
                <h3 className="text-sm font-medium mb-2">Principais alertas</h3>
                {alertas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">Nada fora do esperado no momento.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {alertas.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        {a.tom === "destructive"
                          ? <AlertTriangle className="w-3 h-3 text-destructive-text shrink-0 mt-0.5" />
                          : <Info className="w-3 h-3 text-info-text shrink-0 mt-0.5" />}
                        <span>{a.texto}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2 border-t border-border/40">
          Tesouraria · DiakoniaApp — página 1 de 2
        </p>
      </div>

      {/* PÁGINA 2 — ANEXO: LISTAGEM COMPLETA */}
      {lancamentos.length > 0 && (
        <div className="relatorio-page pagina-anexo max-w-5xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
          <header className="avoid-break flex flex-col print:flex-row print:items-start print:justify-between gap-2 pb-4 border-b-2 border-gold/30">
            <div className="min-w-0">
              <h2 className="font-serif text-xl">Listagem completa de lançamentos</h2>
              <p className="text-sm text-muted-foreground">{projeto.nome} — detalhamento cronológico (receitas e despesas)</p>
            </div>
            <p className="text-xs text-muted-foreground print:text-right print:shrink-0">Tesouraria — anexo ao relatório executivo</p>
          </header>

          <section className="grid grid-cols-2 gap-6 my-6">
            <ListagemColuna titulo="Receitas" itens={entradas} cor="success" totalLabel="Total arrecadado" totalValor={totais.totalEntradas} />
            <ListagemColuna titulo="Despesas" itens={saidas} cor="destructive" totalLabel="Total de despesas" totalValor={totais.totalSaidas} />
          </section>

          {temDespesas && (
            <section className="avoid-break border border-border/40 rounded-md p-4 mb-6 max-w-sm mx-auto">
              <h3 className="text-xs uppercase tracking-wide text-muted-foreground text-center mb-2">
                Balanço consolidado do projeto
              </h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr className="border-b border-border/40">
                    <td className="py-1">Despesas totais (meta)</td>
                    <td className="py-1 text-right font-medium tabular-nums">{brl(totais.totalSaidas)} (100,0%)</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-1">Arrecadação concluída</td>
                    <td className="py-1 text-right font-medium tabular-nums text-success-text">
                      {brl(totais.totalEntradas)} ({pctArrecadadoMeta.toFixed(1)}%)
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1">{totais.resultado >= 0 ? "Superávit" : "Não alcançado (déficit)"}</td>
                    <td className={`py-1 text-right font-medium tabular-nums ${totais.resultado >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                      {totais.resultado >= 0 ? "+" : "-"}{brl(Math.abs(totais.resultado))} ({pctDeficitMeta.toFixed(1)}%)
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          )}

          <section className="avoid-break mt-12 pt-4">
            <div className="grid grid-cols-2 gap-12 text-center text-xs">
              <div>
                <div className="border-t border-foreground/60 pt-1 mx-4">
                  <p className="font-medium">Tesouraria</p>
                  <p className="text-muted-foreground text-xs">Responsável pela conta</p>
                </div>
              </div>
              <div>
                <div className="border-t border-foreground/60 pt-1 mx-4">
                  <p className="font-medium">&nbsp;</p>
                  <p className="text-muted-foreground text-xs">Responsável pelo projeto</p>
                </div>
              </div>
            </div>
          </section>

          <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
            <p className="text-xs italic text-muted-foreground font-serif">
              "Tudo, porém, deve ser feito com decência e ordem."
            </p>
            <p className="text-xs text-gold tracking-wide mt-1">1 Coríntios 14:40</p>
            <p className="text-xs text-muted-foreground mt-2">Tesouraria · DiakoniaApp — página 2 de 2</p>
          </footer>
        </div>
      )}

      <ProjetoForm open={editOpen} onOpenChange={setEditOpen} projeto={projeto} onSaved={carregar} />
    </div>
  );
}

function KpiCard({ cor, titulo, valor, legenda }: { cor: string; titulo: string; valor: string; legenda: string }) {
  return (
    <div className="border border-border/40 rounded-md pl-3 py-2.5 relative overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: cor }} />
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums" style={{ color: cor }}>{valor}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{legenda}</p>
    </div>
  );
}

function ListagemColuna({ titulo, itens, cor, totalLabel, totalValor }: {
  titulo: string; itens: FinLancamentoExtenso[]; cor: "success" | "destructive";
  totalLabel: string; totalValor: number;
}) {
  const ordenados = itens.slice().sort((a, b) => a.data.localeCompare(b.data));
  const corClass = cor === "success" ? "text-success-text" : "text-destructive-text";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <h3 className="text-sm font-medium">{titulo}</h3>
        <span className="text-xs text-muted-foreground">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
      </div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gold/40 text-left text-muted-foreground">
            <th className="py-1 pr-1 w-10">Data</th>
            <th className="py-1 pr-1">Descrição</th>
            <th className="py-1 pr-1 text-right w-20">Valor</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.length === 0 ? (
            <tr><td colSpan={3} className="py-2 text-center text-muted-foreground italic">Nenhum lançamento</td></tr>
          ) : ordenados.map(l => (
            <tr key={l.id} className="border-b border-border/30">
              <td className="py-1 pr-1 whitespace-nowrap">{dataBr(l.data).slice(0, 5)}</td>
              <td className="py-1 pr-1 truncate max-w-[160px]">{l.descricao ?? "—"}</td>
              <td className={`py-1 pr-1 text-right tabular-nums ${corClass}`}>{brl(Number(l.valor))}</td>
            </tr>
          ))}
        </tbody>
        {ordenados.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-gold/40 font-semibold">
              <td colSpan={2} className="py-1.5 text-xs">{totalLabel}</td>
              <td className={`py-1.5 text-right tabular-nums text-xs ${corClass}`}>{brl(totalValor)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
