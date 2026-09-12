// ─── FinancasDoadorDetalhe.tsx ───────────────────────────────────────────
//
// Histórico de contribuição de UMA pessoa. Mesmo padrão de impressão/PDF
// dos outros relatórios do sistema — mas SEM assinatura: isto não é um
// recibo de doação (dedutibilidade, Lei 9.532) nem uma prestação de
// contas formal, os dois ficam fora do escopo desta entrega (ver
// ROADMAP_FINANCEIRO_ERP.md). É só o extrato de contribuições de uma
// pessoa, do jeito que a tesouraria já vê espalhado hoje, só que junto.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Printer, Download, Heart } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import { listarContribuicoesPessoa } from "@/services/doadorService";
import { gerarCSV, downloadCSV, brl, FORMA_LABEL, type FinLancamentoExtenso } from "@/services/finService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function FinancasDoadorDetalhe() {
  const { pessoaId = "" } = useParams();
  const { user } = useAuth();

  const [nome, setNome] = useState("");
  const [todasContribuicoes, setTodasContribuicoes] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");
  const [periodo, setPeriodo] = useState<string>("__todos__");

  useEffect(() => { carregar(); }, [pessoaId]);

  async function carregar() {
    if (!pessoaId) return;
    setLoading(true);
    try {
      const [{ data: p }, contribs] = await Promise.all([
        supabase.from("membros").select("nome_completo").eq("id", pessoaId).maybeSingle(),
        listarContribuicoesPessoa(pessoaId),
      ]);
      setNome(p?.nome_completo ?? "—");
      setTodasContribuicoes(contribs);

      if (user) {
        const { data: prof } = await supabase.from("profiles").select("nome").eq("id", user.id).maybeSingle();
        setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
      }
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  const anosDisponiveis = useMemo(() => {
    const anos = new Set(todasContribuicoes.map(l => l.data.slice(0, 4)));
    return Array.from(anos).sort((a, b) => b.localeCompare(a));
  }, [todasContribuicoes]);

  const contribuicoes = useMemo(() => {
    if (periodo === "__todos__") return todasContribuicoes;
    return todasContribuicoes.filter(l => l.data.slice(0, 4) === periodo);
  }, [todasContribuicoes, periodo]);

  const total = contribuicoes.reduce((s, l) => s + Number(l.valor), 0);
  const media = contribuicoes.length > 0 ? total / contribuicoes.length : 0;

  function exportarCSV() {
    const csv = gerarCSV(contribuicoes);
    const rotulo = periodo === "__todos__" ? "todos-os-periodos" : periodo;
    downloadCSV(`QIBRJ_Doador_${nome.replace(/\s+/g, "-")}_${rotulo}.csv`, csv);
    toast.success("CSV exportado");
  }

  if (loading) return <PaginaSkeleton />;

  const hojeBr = new Date().toLocaleDateString("pt-BR");
  const horaBr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const rotuloPeriodo = periodo === "__todos__" ? "Todo o período" : periodo;

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

      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/financas/doadores"><ArrowLeft className="w-3.5 h-3.5" /> Voltar</Link>
          </Button>
          {anosDisponiveis.length > 0 && (
            <Select value={periodo} onValueChange={setPeriodo}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__todos__">Todo o período</SelectItem>
                {anosDisponiveis.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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

      <div className="relatorio-page max-w-4xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex flex-col items-center gap-1">
            <img src={logoDiakonia} alt="DIAKONIA" className="h-14 w-auto object-contain"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }} draggable={false} />
            <div className="text-center">
              <h2 className="font-serif text-lg leading-tight">DiakoniaApp</h2>
              <p className="text-xs text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">Gestão Ministerial</p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hojeBr}</strong> às {horaBr}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold flex items-center justify-center gap-1.5">
            <Heart className="w-3.5 h-3.5" /> Histórico de contribuições
          </p>
          <h1 className="font-serif text-3xl mt-2">{nome}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {rotuloPeriodo} · {contribuicoes.length} {contribuicoes.length === 1 ? "contribuição" : "contribuições"}
          </p>
        </div>

        <section className="avoid-break mb-6 p-5 rounded-md bg-gradient-verse border border-gold/30">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase text-success-text">Total</p>
              <p className="text-xl font-semibold text-success-text tabular-nums">{brl(total)}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-gold">Contribuições</p>
              <p className="text-xl font-semibold tabular-nums">{contribuicoes.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">Média</p>
              <p className="text-xl font-semibold tabular-nums">{brl(media)}</p>
            </div>
          </div>
        </section>

        {contribuicoes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center italic py-8">
            Nenhuma contribuição {periodo === "__todos__" ? "" : `em ${periodo}`} registrada para esta pessoa.
          </p>
        ) : (
          <section className="mb-6">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-gold/40 text-left">
                  <th className="py-1 pr-1 w-16">Data</th>
                  <th className="py-1 pr-1">Categoria</th>
                  <th className="py-1 pr-1">Forma</th>
                  <th className="py-1 pr-1 w-24 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {contribuicoes.slice().sort((a, b) => a.data.localeCompare(b.data)).map(l => (
                  <tr key={l.id} className="border-b border-border/40">
                    <td className="py-1 pr-1 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1 pr-1 text-muted-foreground truncate">{l.categoria_nome ?? "—"}</td>
                    <td className="py-1 pr-1 text-muted-foreground truncate">{l.forma_pagamento ? FORMA_LABEL[l.forma_pagamento] : "—"}</td>
                    <td className="py-1 text-right tabular-nums font-medium text-success-text">{brl(Number(l.valor))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gold/40 font-semibold">
                  <td colSpan={3} className="py-2 text-right uppercase text-xs tracking-wide pr-2">Total</td>
                  <td className="py-2 text-right tabular-nums text-success-text">{brl(total)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Cada um dê conforme determinou em seu coração, não com pesar ou por obrigação, pois Deus ama quem dá com alegria."
          </p>
          <p className="text-xs text-gold tracking-wide mt-1">2 Coríntios 9:7</p>
        </footer>
      </div>
    </div>
  );
}
