// ─── EbdRelatorioMensalGeral.tsx — todas as classes, período livre ─────────
//
// Segunda peça do pedido dela: "crie relatório mensal para todas as
// classes, que conversa com o painel pastoral". O relatório mensal por
// classe (EbdClasseRelatorioMensal.tsx) já existia; este soma o ministério
// inteiro. Alcançável de dentro do Painel Pastoral, em
// PainelAcompanhamentoEbd.tsx — a EBD já mora lá, este relatório só dá a
// ela uma versão imprimível/compartilhável do período.
//
// Ampliado depois: "transforme a que já existe num seletor de período
// (semana/mês/ano) no lugar do campo de mês que já tem lá e traga todos os
// indicadores pensados". Como EBD só acontece aos domingos, "semana" aqui
// sempre cai numa faixa de 7 dias que contém no máximo UM domingo — o
// intervalo é semana ISO (segunda a domingo), calculado a partir de
// `<input type="week">`.
//
// Mesmas regras de sempre: aula sem chamada não conta como "todos
// faltaram"; professor não conta como aluno matriculado na frequência.
//
// Ganhou depois um gráfico por faixa etária: "QURO NO RELATÓRIO, UM
// GRAFICO MEDINDO A FAICA ETÁRIA MAIS PRESENTE E MAIS AUSENTE". Diferente
// de "por classe": uma faixa etária às vezes tem mais de uma classe (ex.:
// duas classes de 40+) — o gráfico soma isso, a lista por classe não.

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Printer, MessageCircle, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  relatorioGeralResumo, relatorioGeralPorClasse, relatorioGeralPorFaixa,
  type RelatorioMensalGeralResumo, type FrequenciaClasse, type FrequenciaFaixa,
} from "@/services/ebdPainelService";
import { novasMatriculasDoMes } from "@/services/ebdService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

type Periodo = "semana" | "mes" | "ano";

function mesAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** `YYYY-Www` da semana ISO (segunda a domingo) que contém `data`. */
function semanaIsoDe(data: Date): string {
  const d = new Date(Date.UTC(data.getFullYear(), data.getMonth(), data.getDate()));
  const diaDaSemana = d.getUTCDay() || 7; // Segunda=1 ... Domingo=7
  d.setUTCDate(d.getUTCDate() + 4 - diaDaSemana); // quinta-feira desta semana
  const anoIso = d.getUTCFullYear();
  const inicioDoAno = new Date(Date.UTC(anoIso, 0, 1));
  const semana = Math.ceil(((d.getTime() - inicioDoAno.getTime()) / 86400000 + 1) / 7);
  return `${anoIso}-W${String(semana).padStart(2, "0")}`;
}

function formatarISO(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** A segunda-feira (00:00 UTC) da semana ISO `YYYY-Www`. */
function segundaDaSemanaIso(semanaIso: string): Date {
  const [anoStr, wStr] = semanaIso.split("-W");
  const anoIso = Number(anoStr);
  const semana = Number(wStr);
  const jan4 = new Date(Date.UTC(anoIso, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const segundaDaSemana1 = new Date(jan4);
  segundaDaSemana1.setUTCDate(jan4.getUTCDate() - jan4Dow + 1);
  const segunda = new Date(segundaDaSemana1);
  segunda.setUTCDate(segundaDaSemana1.getUTCDate() + (semana - 1) * 7);
  return segunda;
}

function formatarDiaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

interface Intervalo { inicio: string; fim: string }

function calcularIntervalo(periodo: Periodo, semanaIso: string, mesIso: string, anoNum: number): Intervalo {
  if (periodo === "semana") {
    const segunda = segundaDaSemanaIso(semanaIso);
    const domingoSeguinte = new Date(segunda);
    domingoSeguinte.setUTCDate(segunda.getUTCDate() + 7);
    return { inicio: formatarISO(segunda), fim: formatarISO(domingoSeguinte) };
  }
  if (periodo === "ano") {
    return { inicio: `${anoNum}-01-01`, fim: `${anoNum + 1}-01-01` };
  }
  const [ano, mes] = mesIso.split("-").map(Number);
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  return { inicio: `${ano}-${String(mes).padStart(2, "0")}-01`, fim };
}

/** Mesmo tipo de período, imediatamente anterior — para o comparativo de presença. */
function calcularIntervaloAnterior(periodo: Periodo, semanaIso: string, mesIso: string, anoNum: number): Intervalo {
  if (periodo === "semana") {
    const segunda = segundaDaSemanaIso(semanaIso);
    const segundaAnterior = new Date(segunda);
    segundaAnterior.setUTCDate(segunda.getUTCDate() - 7);
    return { inicio: formatarISO(segundaAnterior), fim: formatarISO(segunda) };
  }
  if (periodo === "ano") {
    return { inicio: `${anoNum - 1}-01-01`, fim: `${anoNum}-01-01` };
  }
  const [ano, mes] = mesIso.split("-").map(Number);
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const anoDoMesAnterior = mes === 1 ? ano - 1 : ano;
  return {
    inicio: `${anoDoMesAnterior}-${String(mesAnterior).padStart(2, "0")}-01`,
    fim: `${ano}-${String(mes).padStart(2, "0")}-01`,
  };
}

function rotuloDoPeriodo(periodo: Periodo, intervalo: Intervalo, anoNum: number): string {
  if (periodo === "semana") {
    const domingo = new Date(intervalo.fim + "T00:00:00Z");
    domingo.setUTCDate(domingo.getUTCDate() - 1);
    return `Semana de ${formatarDiaMes(intervalo.inicio)} a ${formatarDiaMes(formatarISO(domingo))}/${domingo.getUTCFullYear()}`;
  }
  if (periodo === "ano") return `Ano de ${anoNum}`;
  const [ano, mes] = intervalo.inicio.split("-").map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

/** Verde ≥75%, âmbar 50–74%, vermelho <50%. Nulo (sem chamada no período) fica neutro. */
function corDaTaxa(taxa: number | null): string {
  if (taxa === null) return "text-muted-foreground";
  if (taxa >= 75) return "text-success-text";
  if (taxa >= 50) return "text-warning-text";
  return "text-destructive-text";
}

/** Mesmos limites de `corDaTaxa`, em cor de preenchimento pro gráfico de barras. */
function corDaBarra(taxa: number): string {
  if (taxa >= 75) return "bg-success";
  if (taxa >= 50) return "bg-warning";
  return "bg-destructive";
}

function textoDelta(atual: number | null, anterior: number | null): string | undefined {
  if (atual === null || anterior === null) return undefined;
  const delta = Math.round((atual - anterior) * 10) / 10;
  if (delta === 0) return "= que o período anterior";
  return delta > 0 ? `↑ ${delta} pts vs. período anterior` : `↓ ${Math.abs(delta)} pts vs. período anterior`;
}

export default function EbdRelatorioMensalGeral() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [semanaIso, setSemanaIso] = useState(semanaIsoDe(new Date()));
  const [mesIso, setMesIso] = useState(params.get("mes") || mesAtualISO());
  const [anoNum, setAnoNum] = useState(new Date().getFullYear());
  const [resumo, setResumo] = useState<RelatorioMensalGeralResumo | null>(null);
  const [porClasse, setPorClasse] = useState<FrequenciaClasse[]>([]);
  const [porFaixa, setPorFaixa] = useState<FrequenciaFaixa[]>([]);
  const [taxaAnterior, setTaxaAnterior] = useState<number | null>(null);
  const [novosNoPeriodo, setNovosNoPeriodo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");

  const intervalo = useMemo(
    () => calcularIntervalo(periodo, semanaIso, mesIso, anoNum),
    [periodo, semanaIso, mesIso, anoNum],
  );
  const rotulo = useMemo(() => rotuloDoPeriodo(periodo, intervalo, anoNum), [periodo, intervalo, anoNum]);

  // Ordenado da faixa mais presente pra mais ausente — o gráfico é um
  // ranking, não a ordem cronológica de idade que a RPC devolve. Faixas
  // sem chamada no período (`taxa` nulo) vão pro fim, sem competir.
  const porFaixaOrdenada = useMemo(() => {
    const comTaxa = porFaixa.filter(f => f.taxa !== null).sort((a, b) => (b.taxa ?? 0) - (a.taxa ?? 0));
    const semTaxa = porFaixa.filter(f => f.taxa === null);
    return [...comTaxa, ...semTaxa];
  }, [porFaixa]);
  const faixaMaisPresente = porFaixaOrdenada.find(f => f.taxa !== null) ?? null;
  const faixaMaisAusente = [...porFaixaOrdenada].reverse().find(f => f.taxa !== null) ?? null;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const anterior = calcularIntervaloAnterior(periodo, semanaIso, mesIso, anoNum);
        const [r, c, faixas, resumoAnterior, novos] = await Promise.all([
          relatorioGeralResumo(intervalo.inicio, intervalo.fim),
          relatorioGeralPorClasse(intervalo.inicio, intervalo.fim),
          relatorioGeralPorFaixa(intervalo.inicio, intervalo.fim).catch((): FrequenciaFaixa[] => []),
          relatorioGeralResumo(anterior.inicio, anterior.fim).catch(() => null),
          novasMatriculasDoMes(intervalo.inicio, intervalo.fim).catch(() => []),
        ]);
        setResumo(r);
        setPorClasse(c);
        setPorFaixa(faixas);
        setTaxaAnterior(resumoAnterior?.taxa_presenca ?? null);
        setNovosNoPeriodo(novos.length);

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [intervalo.inicio, intervalo.fim, periodo, semanaIso, mesIso, anoNum, user]);

  function montarMensagemWhatsApp(): string {
    if (!resumo) return "";
    const l: string[] = [];
    l.push(`📖 *EBD — todas as classes*`);
    l.push(`📅 ${rotulo}`);
    l.push("");
    l.push(`🏫 *Classes ativas:* ${resumo.classes_ativas}`);
    l.push(`👥 *Matriculados:* ${resumo.matriculados}`);
    l.push(`📋 *Aulas com chamada:* ${resumo.aulas_com_chamada} de ${resumo.aulas_total}`);
    if (resumo.taxa_presenca !== null) {
      const delta = textoDelta(resumo.taxa_presenca, taxaAnterior);
      l.push(`📊 *Presença média:* ${resumo.taxa_presenca}%${delta ? ` (${delta})` : ""}`);
    }
    l.push(`🙋 *Ausentes:* ${resumo.ausentes}`);
    if (resumo.visitantes > 0) l.push(`🌱 *Visitantes:* ${resumo.visitantes}`);
    if (novosNoPeriodo > 0) l.push(`✨ *Novos alunos:* ${novosNoPeriodo}`);
    // O matriculado vai junto do % — sem isso, "100%" de 1 pessoa só lê-se
    // como número forte, e não é (mesma lição de `f8e89be`, no painel).
    if (faixaMaisPresente) {
      l.push(`🔝 *Faixa mais presente:* ${faixaMaisPresente.faixa} (${faixaMaisPresente.taxa}%, ${faixaMaisPresente.matriculados} matriculado${faixaMaisPresente.matriculados === 1 ? "" : "s"})`);
    }
    if (faixaMaisAusente && faixaMaisAusente.faixa !== faixaMaisPresente?.faixa) {
      l.push(`⚠️ *Faixa mais ausente:* ${faixaMaisAusente.faixa} (${faixaMaisAusente.taxa}%, ${faixaMaisAusente.matriculados} matriculado${faixaMaisAusente.matriculados === 1 ? "" : "s"})`);
    }
    l.push("");
    const comChamada = porClasse.filter(c => c.taxa !== null);
    if (comChamada.length > 0) {
      l.push("*Por classe:*");
      comChamada.forEach(c => l.push(`• ${c.classe_nome}: ${c.presentes}/${c.matriculados * c.aulas_com_chamada} (${c.taxa}%)`));
      l.push("");
    }
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

  const hoje = new Date().toLocaleDateString("pt-BR");
  const horaHoje = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const semAulaNoPeriodo = !resumo || resumo.aulas_total === 0;
  const deltaPresenca = resumo ? textoDelta(resumo.taxa_presenca, taxaAnterior) : undefined;

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

      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/painel-pastoral">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Link>
          </Button>

          <div className="flex items-center gap-1 ml-2 border rounded-md p-0.5">
            {(["semana", "mes", "ano"] as const).map(p => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={periodo === p ? "default" : "ghost"}
                className={`h-7 px-2.5 text-xs ${periodo === p ? "" : "text-muted-foreground"}`}
                onClick={() => setPeriodo(p)}
              >
                {p === "semana" ? "Semana" : p === "mes" ? "Mês" : "Ano"}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {periodo === "semana" && (
              <Input type="week" value={semanaIso} onChange={(e) => setSemanaIso(e.target.value)} className="h-8 w-auto" />
            )}
            {periodo === "mes" && (
              <Input type="month" value={mesIso} onChange={(e) => setMesIso(e.target.value)} className="h-8 w-auto" />
            )}
            {periodo === "ano" && (
              <Input
                type="number"
                value={anoNum}
                onChange={(e) => setAnoNum(Number(e.target.value) || anoNum)}
                className="h-8 w-20"
                min={2020}
                max={new Date().getFullYear() + 1}
              />
            )}
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
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Relatório Geral — Escola Bíblica Dominical</p>
          <h1 className="font-serif text-3xl mt-2 flex items-center justify-center gap-2">
            <GraduationCap className="w-7 h-7 text-gold" /> Todas as classes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{rotulo}</p>
        </div>

        {semAulaNoPeriodo ? (
          <p className="text-sm text-muted-foreground text-center py-10 avoid-break">
            Nenhuma aula registrada neste período, em nenhuma classe.
          </p>
        ) : (
          <>
            <section className="avoid-break grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 text-center">
              <Stat label="Classes ativas" valor={resumo!.classes_ativas} />
              <Stat label="Matriculados" valor={resumo!.matriculados} />
              <Stat
                label="Aulas c/ chamada"
                valor={`${resumo!.aulas_com_chamada}/${resumo!.aulas_total}`}
              />
              <Stat
                label="Presença média"
                valor={resumo!.taxa_presenca !== null ? `${resumo!.taxa_presenca}%` : "—"}
                sub={deltaPresenca}
                highlight
              />
              <Stat label="Ausentes" valor={resumo!.ausentes} />
              <Stat label="Visitantes" valor={resumo!.visitantes} />
              <Stat label="Novos alunos" valor={novosNoPeriodo} />
            </section>

            {resumo!.aulas_com_chamada < resumo!.aulas_total && (
              <p className="text-xs text-muted-foreground text-center mb-6 avoid-break">
                {resumo!.aulas_total - resumo!.aulas_com_chamada} aula(s) do período ainda sem chamada
                registrada, em uma ou mais classes — não entram no cálculo da presença média.
              </p>
            )}

            {porFaixaOrdenada.length > 0 && (
              <section className="avoid-break mb-6">
                <h3 className="font-serif text-base mb-2 text-gold">Por faixa etária</h3>
                <div className="space-y-2.5">
                  {porFaixaOrdenada.map(f => (
                    <div key={f.faixa}>
                      <div className="flex items-baseline justify-between gap-2 text-xs mb-1">
                        <span className="font-medium text-foreground">{f.faixa}</span>
                        <span className="text-muted-foreground shrink-0">
                          {f.matriculados} matriculado{f.matriculados === 1 ? "" : "s"}
                          {f.taxa !== null ? ` · ${f.taxa}%` : " · sem chamada no período"}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        {f.taxa !== null && (
                          <div
                            className={`h-full rounded-full ${corDaBarra(f.taxa)}`}
                            style={{ width: `${Math.min(f.taxa, 100)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="avoid-break mb-6">
              <h3 className="font-serif text-base mb-2 text-gold">Por classe</h3>
              <div className="space-y-1 text-sm">
                {porClasse.map(c => (
                  <div key={c.classe_id} className="flex items-center justify-between gap-2 border-b border-border/40 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.classe_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.matriculados} matriculado{c.matriculados === 1 ? "" : "s"} ·{" "}
                        {c.aulas_com_chamada}/{c.aulas_total} aula(s) com chamada
                      </p>
                    </div>
                    <span className={`tabular-nums text-sm font-medium shrink-0 ${corDaTaxa(c.taxa)}`}>
                      {c.taxa !== null ? `${c.taxa}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Ensinai as verdades e os mandamentos do Senhor... para que os conheça a geração vindoura."
          </p>
          <p className="text-xs text-gold tracking-wide mt-1">Salmos 78:5-6</p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, valor, sub, highlight }: { label: string; valor: number | string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-md py-2 px-2 ${highlight ? "border-gold bg-gold/5" : ""}`}>
      <p className={`font-semibold tabular-nums ${highlight ? "text-2xl text-gold" : "text-xl"}`}>{valor}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
