// ─── FinancasProjetoDetalhe.tsx ──────────────────────────────────────────
//
// Fase 6 do ERP financeiro (17/09/2026). Ficha + prestação de contas de UM
// projeto — cópia deliberada do padrão de
// `FinancasCentroPrestacaoContas.tsx` (mesmo cabeçalho institucional,
// mesmo escape de impressão `.relatorio-page`, mesma tabela de
// lançamentos por categoria), com a dimensão nova que centro de custo não
// tem: meta de arrecadação, déficit/superávit contra ela, e ticket médio
// de entrada. Ver docs/ROADMAP_FINANCEIRO_ERP.md Fase 6.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Printer, Download, Pencil, TrendingUp, TrendingDown, DollarSign, Target,
} from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  carregarProjeto, listarLancamentosSemTeto, gerarCSV, downloadCSV, brl,
  type FinProjeto, type FinLancamentoExtenso,
} from "@/services/finService";
import { ProjetoForm } from "@/components/financas/ProjetoForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function FinancasProjetoDetalhe() {
  const { id = "" } = useParams();
  const { user } = useAuth();

  const [projeto, setProjeto] = useState<FinProjeto | null>(null);
  const [lancamentos, setLancamentos] = useState<FinLancamentoExtenso[]>([]);
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
      // Igual à prestação de contas de centro de custo: só o que já
      // aconteceu de verdade entra na demonstração.
      setLancamentos(lancs.filter(l => l.status === "realizado" || l.status === "conciliado"));

      if (user) {
        const { data: prof } = await supabase
          .from("profiles").select("nome").eq("id", user.id).maybeSingle();
        setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  const totais = useMemo(() => {
    const entradas = lancamentos.filter(l => l.tipo === "entrada");
    const totalEntradas = entradas.reduce((s, l) => s + Number(l.valor), 0);
    const totalSaidas = lancamentos.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0);
    return {
      totalEntradas, totalSaidas, resultado: totalEntradas - totalSaidas,
      qtdEntradas: entradas.length,
      // Ticket médio: só faz sentido sobre entradas (arrecadação) — uma
      // despesa não tem "ticket", é o valor que foi gasto.
      ticketMedio: entradas.length > 0 ? totalEntradas / entradas.length : 0,
    };
  }, [lancamentos]);

  const porCategoria = useMemo(() => {
    const map = new Map<string, { nome: string; tipo: "entrada" | "saida"; total: number; cor: string | null }>();
    lancamentos.forEach(l => {
      const key = `${l.tipo}:${l.categoria_id ?? "_sem"}`;
      const ex = map.get(key);
      if (ex) ex.total += Number(l.valor);
      else map.set(key, {
        nome: l.categoria_nome ?? "Sem categoria", tipo: l.tipo,
        total: Number(l.valor), cor: l.categoria_cor ?? null,
      });
    });
    const todas = Array.from(map.values()).sort((a, b) => b.total - a.total);
    return {
      entradas: todas.filter(c => c.tipo === "entrada"),
      // Top despesas — só as 5 maiores, é o que a tesouraria pergunta
      // primeiro ("no que mais gastamos?"), não a lista inteira de novo
      // (a tabela detalhada abaixo já cobre isso).
      topSaidas: todas.filter(c => c.tipo === "saida").slice(0, 5),
    };
  }, [lancamentos]);

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
  // Déficit/superávit só existe quando há meta — sem meta, "resultado"
  // (entradas − saídas) já é a informação completa, comparar contra nada
  // seria inventar um número.
  const percentualMeta = projeto.meta_valor ? (totais.totalEntradas / projeto.meta_valor) * 100 : null;
  const deficitSuperavit = projeto.meta_valor != null ? totais.totalEntradas - projeto.meta_valor : null;

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

      {/* PÁGINA DO RELATÓRIO */}
      <div className="relatorio-page max-w-5xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex flex-col items-center gap-1">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-14 w-auto object-contain"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }} draggable={false} />
            <div className="text-center">
              <h2 className="font-serif text-lg leading-tight">DiakoniaApp</h2>
              <p className="text-xs text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Gestão Ministerial
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hojeBr}</strong> às {horaBr}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Prestação de contas — Projeto</p>
          <h1 className="font-serif text-3xl mt-2">{projeto.nome}</h1>
          {projeto.descricao && <p className="text-sm text-muted-foreground mt-0.5">{projeto.descricao}</p>}
          <p className="text-xs text-muted-foreground mt-1">
            {projeto.data_inicio ? dataBr(projeto.data_inicio) : "sem início definido"}
            {" → "}
            {projeto.data_fim ? dataBr(projeto.data_fim) : "em andamento"}
            {" · "}{lancamentos.length} lançamento{lancamentos.length !== 1 ? "s" : ""} realizados/conciliados
          </p>
        </div>

        <section className="avoid-break mb-6 p-5 rounded-md bg-gradient-verse border border-gold/30">
          <h3 className="text-xs uppercase tracking-wide text-gold mb-2 text-center">Demonstrativo</h3>
          <div className={`grid gap-3 text-center ${projeto.meta_valor != null ? "grid-cols-3 md:grid-cols-5" : "grid-cols-3"}`}>
            <div>
              <p className="text-xs uppercase text-success-text flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Arrecadado
              </p>
              <p className="text-xl font-semibold text-success-text tabular-nums">{brl(totais.totalEntradas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-destructive-text flex items-center justify-center gap-1">
                <TrendingDown className="w-3 h-3" /> Despesas
              </p>
              <p className="text-xl font-semibold text-destructive-text tabular-nums">{brl(totais.totalSaidas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gold flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" /> Resultado
              </p>
              <p className={`text-xl font-semibold tabular-nums ${totais.resultado >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                {totais.resultado >= 0 ? "+" : ""}{brl(totais.resultado)}
              </p>
            </div>
            {projeto.meta_valor != null && (
              <>
                <div>
                  <p className="text-xs uppercase text-info-text flex items-center justify-center gap-1">
                    <Target className="w-3 h-3" /> Meta ({percentualMeta!.toFixed(0)}%)
                  </p>
                  <p className="text-xl font-semibold text-info-text tabular-nums">{brl(projeto.meta_valor)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">
                    {deficitSuperavit! >= 0 ? "Superávit" : "Déficit"} vs. meta
                  </p>
                  <p className={`text-xl font-semibold tabular-nums ${deficitSuperavit! >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                    {deficitSuperavit! >= 0 ? "+" : ""}{brl(deficitSuperavit!)}
                  </p>
                </div>
              </>
            )}
          </div>
          {totais.qtdEntradas > 0 && (
            <p className="text-center text-xs text-muted-foreground mt-3">
              Ticket médio de arrecadação: <strong className="text-foreground">{brl(totais.ticketMedio)}</strong>
              {" "}({totais.qtdEntradas} entrada{totais.qtdEntradas !== 1 ? "s" : ""})
            </p>
          )}
        </section>

        {lancamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center italic py-8">
            Nenhum lançamento realizado ou conciliado ainda para este projeto.
          </p>
        ) : (
          <>
            <section className="avoid-break grid grid-cols-2 gap-6 mb-6">
              <CategoriasBox titulo="Arrecadação por categoria" itens={porCategoria.entradas} cor="emerald" total={totais.totalEntradas} />
              <CategoriasBox titulo="Top despesas por categoria" itens={porCategoria.topSaidas} cor="rose" total={totais.totalSaidas} />
            </section>

            <section className="mb-6">
              <h3 className="font-serif text-base mb-2 text-gold">Lançamentos detalhados</h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gold/40 text-left">
                    <th className="py-1 pr-1 w-12">Data</th>
                    <th className="py-1 pr-1 w-12">Tipo</th>
                    <th className="py-1 pr-1">Descrição</th>
                    <th className="py-1 pr-1">Categoria</th>
                    <th className="py-1 pr-1">Centro de custo</th>
                    <th className="py-1 pr-1 w-24 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).map(l => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="py-1 pr-1 whitespace-nowrap">{dataBr(l.data)}</td>
                      <td className={`py-1 pr-1 ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                        {l.tipo === "entrada" ? "▲" : "▼"}
                      </td>
                      <td className="py-1 pr-1 truncate">{l.descricao ?? "—"}</td>
                      <td className="py-1 pr-1 text-muted-foreground truncate">{l.categoria_nome ?? "—"}</td>
                      <td className="py-1 pr-1 text-muted-foreground truncate">{l.centro_nome ?? "—"}</td>
                      <td className={`py-1 text-right tabular-nums font-medium ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                        {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gold/40 font-semibold">
                    <td colSpan={5} className="py-2 text-right uppercase text-xs tracking-wide pr-2">Resultado</td>
                    <td className={`py-2 text-right tabular-nums ${totais.resultado >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                      {totais.resultado >= 0 ? "+" : ""}{brl(totais.resultado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>
          </>
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
        </footer>
      </div>

      <ProjetoForm open={editOpen} onOpenChange={setEditOpen} projeto={projeto} onSaved={carregar} />
    </div>
  );
}

function CategoriasBox({ titulo, itens, cor, total }: {
  titulo: string;
  itens: { nome: string; total: number; cor: string | null }[];
  cor: "emerald" | "rose";
  total: number;
}) {
  const corClass = cor === "emerald" ? "text-success-text" : "text-destructive-text";
  return (
    <div>
      <h4 className={`text-xs uppercase tracking-wider mb-2 font-medium ${corClass}`}>{titulo}</h4>
      <table className="w-full text-xs">
        <tbody>
          {itens.length === 0 ? (
            <tr><td className="py-1 text-muted-foreground italic">Sem registros</td></tr>
          ) : itens.map((c, i) => (
            <tr key={i} className="border-b border-border/40">
              <td className="py-1 flex items-center gap-1.5">
                {c.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.cor }} />}
                <span className="truncate">{c.nome}</span>
              </td>
              <td className={`py-1 text-right tabular-nums font-medium ${corClass}`}>{brl(c.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gold/40 font-semibold">
            <td className="pt-1.5 text-xs uppercase tracking-wide">Total</td>
            <td className={`pt-1.5 text-right tabular-nums ${corClass}`}>{brl(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
