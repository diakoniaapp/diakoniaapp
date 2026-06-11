import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft, Printer, Download, Loader2, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  resumoMensal, gerarCSV, downloadCSV, brl,
  type ResumoMensal,
} from "@/services/finService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const MESES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function FinancasRelatorio() {
  const { ano: anoUrl, mes: mesUrl } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const hoje = new Date();
  const ano = Number(anoUrl) || hoje.getFullYear();
  const mes = Number(mesUrl) || hoje.getMonth() + 1;

  const [resumo, setResumo] = useState<ResumoMensal | null>(null);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await resumoMensal(ano, mes);
        setResumo(r);
        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [ano, mes, user]);

  function navegarMes(delta: number) {
    let m = mes + delta;
    let a = ano;
    if (m < 1) { m = 12; a -= 1; }
    if (m > 12) { m = 1; a += 1; }
    navigate(`/financas/relatorio/${a}/${m}`);
  }

  function exportarCSV() {
    if (!resumo) return;
    const csv = gerarCSV(resumo.lancamentos);
    downloadCSV(`QIBRJ_Movimento_${ano}-${String(mes).padStart(2, "0")}.csv`, csv);
    toast.success("CSV exportado");
  }

  const entradas = useMemo(() => resumo?.porCategoria.filter(c => c.tipo === "entrada") ?? [], [resumo]);
  const saidas   = useMemo(() => resumo?.porCategoria.filter(c => c.tipo === "saida") ?? [], [resumo]);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando relatório...
  </div>;
  if (!resumo) return <div className="p-8 text-center text-muted-foreground">Erro ao carregar</div>;

  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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
            left: 0 !important; top: 0 !important;
            width: 100% !important; max-width: 100% !important;
            margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; border: none !important;
            background: white !important;
          }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      {/* Barra de controles */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Link to="/financas">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => navegarMes(-1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-medium px-2">
              {MESES[mes - 1]} {ano}
            </span>
            <Button size="sm" variant="outline" onClick={() => navegarMes(1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
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
        {/* Cabeçalho institucional */}
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex items-center gap-4">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-14 w-auto object-contain"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }} draggable={false} />
            <div>
              <h2 className="font-serif text-lg leading-tight">Diakonia APP — Sistema de Igrejas</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Conectando pessoas, organizando o propósito
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hojeBr}</strong> às {horaBr}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        {/* Título */}
        <div className="text-center my-6 avoid-break">
          <p className="text-[10px] tracking-[0.25em] uppercase text-gold">Movimento contábil — Malote</p>
          <h1 className="font-serif text-3xl mt-2">{MESES[mes - 1]} {ano}</h1>
          <p className="text-xs text-muted-foreground mt-1">{resumo.qtdLancamentos} lançamentos · realizados/conciliados</p>
        </div>

        {/* DRE Simplificada */}
        <section className="avoid-break mb-6 p-5 rounded-md bg-gradient-verse border border-gold/30">
          <h3 className="text-[10px] uppercase tracking-wide text-gold mb-2 text-center">Demonstrativo</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase text-emerald-700 flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" /> Entradas</p>
              <p className="text-xl font-semibold text-emerald-700 tabular-nums">{brl(resumo.totalEntradas)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-rose-700 flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> Saídas</p>
              <p className="text-xl font-semibold text-rose-700 tabular-nums">{brl(resumo.totalSaidas)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-gold flex items-center justify-center gap-1"><DollarSign className="w-3 h-3" /> Resultado</p>
              <p className={`text-xl font-semibold tabular-nums ${resumo.resultado >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {resumo.resultado >= 0 ? "+" : ""}{brl(resumo.resultado)}
              </p>
            </div>
          </div>
        </section>

        {/* Resumo por conta */}
        {resumo.porConta.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Movimentação por conta</h3>
            <table className="w-full text-xs">
              <thead className="border-b-2 border-gold/40">
                <tr>
                  <th className="text-left py-1.5">Conta</th>
                  <th className="text-right py-1.5">Entradas</th>
                  <th className="text-right py-1.5">Saídas</th>
                  <th className="text-right py-1.5">Movimento líquido</th>
                </tr>
              </thead>
              <tbody>
                {resumo.porConta.map(c => (
                  <tr key={c.id} className="border-b border-border/40">
                    <td className="py-1.5 font-medium">{c.nome}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700">{brl(c.entradas)}</td>
                    <td className="py-1.5 text-right tabular-nums text-rose-700">{brl(c.saidas)}</td>
                    <td className={`py-1.5 text-right tabular-nums font-semibold ${c.saldo >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                      {c.saldo >= 0 ? "+" : ""}{brl(c.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Por categoria - 2 colunas */}
        <section className="avoid-break grid grid-cols-2 gap-6 mb-6">
          <CategoriasBox titulo="Entradas por categoria" itens={entradas} cor="emerald" total={resumo.totalEntradas} />
          <CategoriasBox titulo="Saídas por categoria" itens={saidas} cor="rose" total={resumo.totalSaidas} />
        </section>

        {/* Detalhamento dos lançamentos */}
        {resumo.lancamentos.length > 0 && (
          <section className="mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Lançamentos detalhados</h3>
            <table className="w-full text-[10px] border-collapse">
              <thead>
                <tr className="border-b-2 border-gold/40 text-left">
                  <th className="py-1 pr-1 w-12">Data</th>
                  <th className="py-1 pr-1 w-12">Tipo</th>
                  <th className="py-1 pr-1">Descrição</th>
                  <th className="py-1 pr-1">Categoria</th>
                  <th className="py-1 pr-1">Conta</th>
                  <th className="py-1 pr-1 w-16">Doc.</th>
                  <th className="py-1 pr-1 w-24 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {resumo.lancamentos.slice().sort((a, b) => a.data.localeCompare(b.data)).map((l, idx) => (
                  <tr key={l.id} className="border-b border-border/40">
                    <td className="py-1 pr-1 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1 pr-1">{l.tipo === "entrada" ? "▲" : "▼"}</td>
                    <td className="py-1 pr-1 truncate">{l.descricao ?? "—"}</td>
                    <td className="py-1 pr-1 text-muted-foreground truncate">{l.categoria_nome ?? "—"}</td>
                    <td className="py-1 pr-1 text-muted-foreground truncate">{l.conta_nome ?? "—"}</td>
                    <td className="py-1 pr-1 text-muted-foreground truncate">{l.documento_numero ?? ""}</td>
                    <td className={`py-1 text-right tabular-nums font-medium ${l.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                      {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gold/40 font-semibold">
                  <td colSpan={6} className="py-2 text-right uppercase text-[10px] tracking-wide pr-2">Movimento líquido</td>
                  <td className={`py-2 text-right tabular-nums ${resumo.resultado >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {resumo.resultado >= 0 ? "+" : ""}{brl(resumo.resultado)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {/* Assinaturas */}
        <section className="avoid-break mt-12 pt-4">
          <div className="grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Tesouraria</p>
                <p className="text-muted-foreground text-[10px]">Responsável pela conta</p>
              </div>
            </div>
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Conselho Fiscal</p>
                <p className="text-muted-foreground text-[10px]">Confere e aprova</p>
              </div>
            </div>
          </div>
        </section>

        {/* Rodapé */}
        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Tudo, porém, deve ser feito com decência e ordem."
          </p>
          <p className="text-[10px] text-gold tracking-wide mt-1">1 Coríntios 14:40</p>
        </footer>
      </div>
    </div>
  );
}

function CategoriasBox({ titulo, itens, cor, total }: {
  titulo: string;
  itens: { nome: string; total: number; cor: string | null }[];
  cor: "emerald" | "rose";
  total: number;
}) {
  const corClass = cor === "emerald" ? "text-emerald-700" : "text-rose-700";
  return (
    <div>
      <h4 className={`text-[11px] uppercase tracking-wider mb-2 font-medium ${corClass}`}>{titulo}</h4>
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
            <td className="pt-1.5 text-[10px] uppercase tracking-wide">Total</td>
            <td className={`pt-1.5 text-right tabular-nums ${corClass}`}>{brl(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
