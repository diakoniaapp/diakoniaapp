// ─── EbdClasseRelatorioMensal.tsx — o mês inteiro de uma classe, com indicadores ─
//
// Pedido dela, na sequência do relatório por aula: "gere também a opção de
// relatório mensal, com indicadores". Soma todas as aulas do mês — quantas
// aconteceram, presença média, frequência de cada matriculado.
//
// Mesma regra do painel geral de acompanhamento (ebdPainelService.ts):
// "aula sem nenhuma presença registrada é chamada não feita, não 'todos
// faltaram'" — só aulas com chamada de verdade entram na taxa. E o mesmo
// cuidado do relatório por aula: professor não conta como matriculado na
// frequência (ver migration 20260904240000).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, MessageCircle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  carregarClasse, relatorioMensalResumo, relatorioMensalFrequencia, versiculoPorFaixaEtaria,
  aulasDoMes, chamadaView,
  type EbdClasse, type RelatorioMensalResumo, type FrequenciaAluno, type EbdAula, type EbdChamadaRow,
} from "@/services/ebdService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Verde ≥75%, âmbar 50–74%, vermelho <50%. Nulo (sem chamada no mês) fica neutro. */
function corDaTaxa(taxa: number | null): string {
  if (taxa === null) return "text-muted-foreground";
  if (taxa >= 75) return "text-success-text";
  if (taxa >= 50) return "text-warning-text";
  return "text-destructive-text";
}

export default function EbdClasseRelatorioMensal() {
  const { classeId = "" } = useParams();
  const { user } = useAuth();

  const [mesIso, setMesIso] = useState(mesAtualISO());
  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [resumo, setResumo] = useState<RelatorioMensalResumo | null>(null);
  const [frequencia, setFrequencia] = useState<FrequenciaAluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");
  // "Este relatório não deve ficar na aula e sim nos relatórios das
  // classes" — cada aula do mês, com link direto pro relatório dela.
  // Antes só dava pra chegar lá trocando a data na tela de chamada.
  const [aulas, setAulas] = useState<EbdAula[]>([]);
  const [aulaStats, setAulaStats] = useState<Map<string, { matriculados: number; presentes: number; taxa: number | null }>>(new Map());

  const [ano, mes] = useMemo(() => mesIso.split("-").map(Number), [mesIso]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, r, f, aulasMes] = await Promise.all([
          carregarClasse(classeId),
          relatorioMensalResumo(classeId, ano, mes),
          relatorioMensalFrequencia(classeId, ano, mes),
          aulasDoMes(classeId, ano, mes),
        ]);
        setClasse(c);
        setResumo(r);
        setFrequencia(f);
        setAulas(aulasMes);

        // Poucas aulas por mês (tipicamente 4-5 domingos) — paralelo direto,
        // sem virar N+1 de verdade.
        const aulaIds = aulasMes.map(a => a.id);
        const [statsPorAula, presRows] = await Promise.all([
          Promise.all(aulasMes.map(a => chamadaView(a.id).catch((): EbdChamadaRow[] => []))),
          aulaIds.length > 0
            ? supabase.from("ebd_presencas").select("aula_id").in("aula_id", aulaIds).then(r => r.data ?? [])
            : Promise.resolve([] as { aula_id: string }[]),
        ]);
        // Aula sem nenhuma presença registrada é chamada não feita, não
        // "todos faltaram" — mesma regra de sempre.
        const aulasComChamada = new Set(presRows.map(p => p.aula_id));
        const mapa = new Map<string, { matriculados: number; presentes: number; taxa: number | null }>();
        aulasMes.forEach((a, i) => {
          const linhas = statsPorAula[i];
          const mat = linhas.filter(l => l.tipo === "matriculado");
          const pres = mat.filter(l => l.presente);
          const temChamada = aulasComChamada.has(a.id);
          mapa.set(a.id, {
            matriculados: mat.length,
            presentes: pres.length,
            taxa: temChamada && mat.length > 0 ? Math.round((pres.length / mat.length) * 100) : null,
          });
        });
        setAulaStats(mapa);

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [classeId, ano, mes, user]);

  function montarMensagemWhatsApp(): string {
    if (!classe || !resumo) return "";
    const l: string[] = [];
    l.push(`📖 *${classe.nome}* — EBD`);
    l.push(`📅 ${MESES[mes - 1]} de ${ano}`);
    l.push("");
    l.push(`👥 *Matriculados:* ${resumo.matriculados}`);
    l.push(`📋 *Aulas com chamada:* ${resumo.aulas_com_chamada} de ${resumo.aulas_total}`);
    if (resumo.taxa_presenca !== null) l.push(`📊 *Presença média:* ${resumo.taxa_presenca}%`);
    if (resumo.visitantes > 0) l.push(`🌱 *Visitantes no mês:* ${resumo.visitantes}`);
    l.push("");
    const versiculoMsg = versiculoPorFaixaEtaria(classe);
    l.push(`${versiculoMsg.texto} — ${versiculoMsg.referencia}`);
    l.push("");
    l.push(`_Enviado pelo DiakoniaApp — Gestão Ministerial_`);
    return l.join("\n");
  }

  function compartilharWhatsApp() {
    const msg = montarMensagemWhatsApp();
    if (!msg) { toast.error("Carregando dados..."); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  }

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(montarMensagemWhatsApp());
      toast.success("Resumo copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (loading) return <PaginaSkeleton />;

  if (!classe) {
    return <div className="p-8 text-center text-muted-foreground">
      Classe não encontrada. <Link to="/ebd" className="text-primary underline">Voltar</Link>
    </div>;
  }

  const hoje = new Date().toLocaleDateString("pt-BR");
  const horaHoje = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const semAulaNoMes = !resumo || resumo.aulas_total === 0;
  const versiculo = versiculoPorFaixaEtaria(classe);

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
          /* Sem isso, o navegador some com toda cor de fundo ao imprimir/
             exportar PDF (economia de tinta por padrão). */
          .relatorio-page * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .avoid-break { page-break-inside: avoid; }
        }
      `}</style>

      {/* Barra de controles (não imprime) */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to={`/ebd/${classeId}`}>
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Link>
          </Button>
          <div className="flex items-center gap-1.5 ml-2">
            <Label className="text-xs text-muted-foreground shrink-0">Mês</Label>
            <Input type="month" value={mesIso} onChange={(e) => setMesIso(e.target.value)} className="h-8 w-auto" />
          </div>
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <Button onClick={copiarTexto} size="sm" variant="outline" className="gap-1.5">
              📋 Copiar
            </Button>
            <Button onClick={compartilharWhatsApp} size="sm" className="gap-1.5 bg-success hover:bg-success text-white">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </Button>
            <Button onClick={() => window.print()} size="sm" className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
              <Printer className="w-3.5 h-3.5" /> Imprimir
            </Button>
          </div>
        </div>
      </div>

      {/* Página do relatório */}
      <div className="relatorio-page max-w-4xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex flex-col items-center gap-1">
            <img
              src={logoDiakonia}
              alt="DIAKONIA"
              className="h-14 w-auto object-contain"
              style={{
                filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.35)) drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
                printColorAdjust: "exact", WebkitPrintColorAdjust: "exact",
              }}
              draggable={false}
            />
            <div className="text-center">
              <h2 className="font-serif text-lg leading-tight">DiakoniaApp</h2>
              <p className="text-xs text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Gestão Ministerial
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hoje}</strong> às {horaHoje}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Relatório Mensal — EBD</p>
          <h1 className="font-serif text-3xl mt-2 flex items-center justify-center gap-2">
            <GraduationCap className="w-7 h-7 text-gold" /> {classe.nome}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{MESES[mes - 1]} de {ano}</p>
        </div>

        {semAulaNoMes ? (
          <p className="text-sm text-muted-foreground text-center py-10 avoid-break">
            Nenhuma aula registrada neste mês.
          </p>
        ) : (
          <>
            <section className="avoid-break grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 text-center">
              <Stat label="Matriculados" valor={resumo!.matriculados} />
              <Stat
                label="Aulas c/ chamada"
                valor={`${resumo!.aulas_com_chamada}/${resumo!.aulas_total}`}
              />
              <Stat
                label="Presença média"
                valor={resumo!.taxa_presenca !== null ? `${resumo!.taxa_presenca}%` : "—"}
                highlight
              />
              <Stat label="Visitantes" valor={resumo!.visitantes} />
            </section>

            {resumo!.aulas_com_chamada < resumo!.aulas_total && (
              <p className="text-xs text-muted-foreground text-center mb-6 avoid-break">
                {resumo!.aulas_total - resumo!.aulas_com_chamada} aula(s) do mês ainda sem chamada
                registrada — não entra no cálculo da presença média.
              </p>
            )}

            {aulas.length > 0 && (
              <section className="avoid-break mb-6">
                <h3 className="font-serif text-base mb-2 text-gold">Aulas do mês ({aulas.length})</h3>
                <div className="space-y-1 text-sm">
                  {aulas.map(a => {
                    const st = aulaStats.get(a.id);
                    return (
                      <Link
                        key={a.id}
                        to={`/ebd/${classeId}/chamada/relatorio?data=${a.data}`}
                        className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5 px-1 -mx-1 rounded hover:bg-muted/40 transition-colors"
                      >
                        <span className="min-w-0">
                          <span className="block truncate capitalize">
                            {new Date(a.data + "T00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}
                          </span>
                          {a.tema && <span className="block text-xs text-muted-foreground truncate">{a.tema}</span>}
                        </span>
                        <span className={`tabular-nums text-xs shrink-0 ${corDaTaxa(st?.taxa ?? null)}`}>
                          {st && st.taxa !== null ? `${st.presentes}/${st.matriculados} (${st.taxa}%)` : "sem chamada"}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {frequencia.length > 0 && (
              <section className="avoid-break mb-6">
                <h3 className="font-serif text-base mb-2 text-gold">
                  Frequência por aluno ({frequencia.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                  {frequencia.map(f => (
                    <div key={f.pessoa_id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1">
                      <span className="truncate">{f.nome_completo}</span>
                      <span className={`tabular-nums text-xs shrink-0 ${corDaTaxa(f.taxa)}`}>
                        {f.taxa !== null ? `${f.presencas}/${f.oportunidades} (${f.taxa}%)` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">{versiculo.texto}</p>
          <p className="text-xs text-gold tracking-wide mt-1">{versiculo.referencia}</p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, valor, highlight }: { label: string; valor: number | string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md py-2 px-2 ${highlight ? "border-gold bg-gold/5" : ""}`}>
      <p className={`font-semibold tabular-nums ${highlight ? "text-2xl text-gold" : "text-xl"}`}>{valor}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
