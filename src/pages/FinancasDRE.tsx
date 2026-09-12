// ─── FinancasDRE.tsx ─────────────────────────────────────────────────────
//
// Item 5 do roadmap do ERP financeiro: a DRE Eclesiástica no FORMATO de
// demonstração contábil (Receitas por grupo → Total → Despesas por grupo
// → Total → Resultado do Período), distinta do malote mensal
// (`/financas/relatorio`) e da prestação de contas por centro, que já
// mostram "por categoria" em lista solta. Mesmo padrão de impressão/PDF
// que os outros relatórios do sistema usam — cabeçalho institucional,
// assinaturas, rodapé com o mesmo versículo. Ver o comentário no topo de
// `dreService.ts` sobre de onde vem o agrupamento por grupo (não é um
// plano de contas oficial — não havia um pra reaproveitar).
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Printer, Download, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, DollarSign, ScrollText,
} from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { brl, downloadCSV } from "@/services/finService";
import { gerarDRE, gerarCSVDRE, type DREResultado } from "@/services/dreService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

export default function FinancasDRE() {
  const { ano: anoUrl } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const ano = Number(anoUrl) || new Date().getFullYear();

  const [dre, setDre] = useState<DREResultado | null>(null);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await gerarDRE(ano);
        setDre(r);
        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao gerar a DRE");
      } finally { setLoading(false); }
    })();
  }, [ano, user]);

  function exportarCSV() {
    if (!dre) return;
    const csv = gerarCSVDRE(dre);
    downloadCSV(`QIBRJ_DRE_${ano}.csv`, csv);
    toast.success("CSV exportado");
  }

  if (loading) return <PaginaSkeleton />;
  if (!dre) return <div className="p-8 text-center text-muted-foreground">Erro ao carregar</div>;

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
            <Link to="/financas/executivo"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Link>
          </Button>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => navigate(`/financas/dre/${ano - 1}`)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <span className="text-sm font-medium px-2">{ano}</span>
            <Button size="sm" variant="outline" onClick={() => navigate(`/financas/dre/${ano + 1}`)}>
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
          <p className="text-xs tracking-[0.25em] uppercase text-gold flex items-center justify-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" /> Demonstração do Resultado do Exercício
          </p>
          <h1 className="font-serif text-3xl mt-2">DRE Eclesiástica — {ano}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {dre.qtdLancamentos} lançamento{dre.qtdLancamentos !== 1 ? "s" : ""} · realizados/conciliados
          </p>
        </div>

        <section className="avoid-break mb-6 p-5 rounded-md bg-gradient-verse border border-gold/30">
          <h3 className="text-xs uppercase tracking-wide text-gold mb-2 text-center">Demonstrativo</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase text-success-text flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3" /> Receitas
              </p>
              <p className="text-xl font-semibold text-success-text tabular-nums">{brl(dre.totalReceitas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-destructive-text flex items-center justify-center gap-1">
                <TrendingDown className="w-3 h-3" /> Despesas
              </p>
              <p className="text-xl font-semibold text-destructive-text tabular-nums">{brl(dre.totalDespesas)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gold flex items-center justify-center gap-1">
                <DollarSign className="w-3 h-3" /> {dre.resultado >= 0 ? "Superávit" : "Déficit"}
              </p>
              <p className={`text-xl font-semibold tabular-nums ${dre.resultado >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                {dre.resultado >= 0 ? "+" : ""}{brl(dre.resultado)}
              </p>
            </div>
          </div>
        </section>

        {/* Demonstração formal — Receitas → Despesas → Resultado */}
        <section className="mb-6">
          <table className="w-full text-xs border-collapse">
            <tbody>
              <tr>
                <td colSpan={2} className="pt-1 pb-2">
                  <h3 className="font-serif text-base text-gold uppercase tracking-wide">Receitas</h3>
                </td>
              </tr>
              {dre.gruposReceita.length === 0 ? (
                <tr><td colSpan={2} className="py-2 text-muted-foreground italic">Sem receitas no período.</td></tr>
              ) : dre.gruposReceita.map(g => (
                <GrupoLinhas key={g.nome} grupo={g} cor="text-success-text" />
              ))}
              <tr className="border-t-2 border-gold/50 font-semibold">
                <td className="py-2 uppercase tracking-wide">Total de Receitas</td>
                <td className="py-2 text-right tabular-nums text-success-text">{brl(dre.totalReceitas)}</td>
              </tr>

              <tr><td colSpan={2} className="pt-6 pb-2">
                <h3 className="font-serif text-base text-gold uppercase tracking-wide">Despesas</h3>
              </td></tr>
              {dre.gruposDespesa.length === 0 ? (
                <tr><td colSpan={2} className="py-2 text-muted-foreground italic">Sem despesas no período.</td></tr>
              ) : dre.gruposDespesa.map(g => (
                <GrupoLinhas key={g.nome} grupo={g} cor="text-destructive-text" />
              ))}
              <tr className="border-t-2 border-gold/50 font-semibold">
                <td className="py-2 uppercase tracking-wide">Total de Despesas</td>
                <td className="py-2 text-right tabular-nums text-destructive-text">{brl(dre.totalDespesas)}</td>
              </tr>

              <tr className={`border-t-2 font-bold text-sm ${dre.resultado >= 0 ? "border-success-line" : "border-destructive-line"}`}>
                <td className="pt-3 uppercase tracking-wide">
                  Resultado do Período ({dre.resultado >= 0 ? "Superávit" : "Déficit"})
                </td>
                <td className={`pt-3 text-right tabular-nums ${dre.resultado >= 0 ? "text-success-text" : "text-destructive-text"}`}>
                  {dre.resultado >= 0 ? "+" : ""}{brl(dre.resultado)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Assinaturas */}
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
                <p className="font-medium">Conselho Fiscal</p>
                <p className="text-muted-foreground text-xs">Confere e aprova</p>
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
    </div>
  );
}

function GrupoLinhas({ grupo, cor }: { grupo: { nome: string; linhas: { nome: string; total: number }[]; total: number }; cor: string }) {
  return (
    <>
      <tr className="border-b border-border/40">
        <td className="py-1 font-medium">{grupo.nome}</td>
        <td className={`py-1 text-right tabular-nums font-medium ${cor}`}>{brl(grupo.total)}</td>
      </tr>
      {grupo.linhas.map((l, i) => (
        <tr key={i} className="border-b border-border/20 text-muted-foreground">
          <td className="py-0.5 pl-4">{l.nome}</td>
          <td className="py-0.5 text-right tabular-nums">{brl(l.total)}</td>
        </tr>
      ))}
    </>
  );
}
