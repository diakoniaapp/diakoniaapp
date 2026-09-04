// ─── EbdAulaRelatorio.tsx — o relatório que a chamada da EBD não tinha ─────
//
// Mesmo molde de PgmReuniaoRelatorio.tsx: impressão + WhatsApp, gerado a
// qualquer momento (não exige "finalizar" — finalizar é só um carimbo, ver
// EbdChamada.tsx). Pedido dela, verificando os três módulos de chamada:
// "é preciso finalizar a chamada e gerar relatório" — PGM já tinha isto,
// EBD não tinha nada.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, MessageCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  obterOuCriarAula, carregarAula, carregarClasse, chamadaView, listarProfessores,
  versiculoPorFaixaEtaria,
  type EbdAula, type EbdClasse, type EbdChamadaRow, type EbdProfessor,
} from "@/services/ebdService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

function dataLongaBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default function EbdAulaRelatorio() {
  const { classeId = "" } = useParams();
  const [params] = useSearchParams();
  const data = params.get("data") || new Date().toISOString().slice(0, 10);
  const { user } = useAuth();

  const [classe, setClasse] = useState<EbdClasse | null>(null);
  const [aula, setAula] = useState<EbdAula | null>(null);
  const [linhas, setLinhas] = useState<EbdChamadaRow[]>([]);
  const [professores, setProfessores] = useState<EbdProfessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const c = await carregarClasse(classeId);
        setClasse(c);
        const aulaId = await obterOuCriarAula(classeId, data);
        const [a, view, profs] = await Promise.all([
          carregarAula(aulaId),
          chamadaView(aulaId),
          listarProfessores(classeId),
        ]);
        setAula(a);
        setLinhas(view);
        setProfessores(profs);

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [classeId, data, user]);

  const matriculados = useMemo(() => linhas.filter(l => l.tipo === "matriculado"), [linhas]);
  const visitantes = useMemo(() => linhas.filter(l => l.tipo === "visitante"), [linhas]);
  // Presença própria, à parte dos alunos — mesmo quando um professor também
  // está matriculado na própria classe (ver ebd_chamada_view, 20260904240000).
  const professoresPresenca = useMemo(() => linhas.filter(l => l.tipo === "professor"), [linhas]);
  const presentes = useMemo(() => matriculados.filter(l => l.presente), [matriculados]);
  const ausentes = useMemo(() => matriculados.filter(l => !l.presente), [matriculados]);
  const visitantesPresentes = useMemo(() => visitantes.filter(l => l.presente), [visitantes]);
  const professoresPresentes = useMemo(() => professoresPresenca.filter(l => l.presente), [professoresPresenca]);
  const totalPresentes = presentes.length + visitantesPresentes.length;
  const taxaPresenca = matriculados.length > 0 ? Math.round((presentes.length / matriculados.length) * 100) : 0;
  const professorPrincipal = professores.find(p => p.tipo === "principal") ?? professores[0];
  const versiculo = classe ? versiculoPorFaixaEtaria(classe) : null;

  function montarMensagemWhatsApp(): string {
    if (!classe || !aula) return "";
    const linhasMsg: string[] = [];
    linhasMsg.push(`📖 *${classe.nome}* — EBD`);
    linhasMsg.push(`📅 ${dataLongaBr(data)}`);
    linhasMsg.push("");
    if (aula.tema) { linhasMsg.push(`✨ *Tema:* ${aula.tema}`); linhasMsg.push(""); }
    if (professoresPresenca.length > 0) {
      linhasMsg.push(`👩‍🏫 *Professor(es):* ${professoresPresentes.map(p => p.nome_completo).join(", ") || "nenhum presente"}`);
    }
    linhasMsg.push(`👥 *Presença:* ${presentes.length} de ${matriculados.length} (${taxaPresenca}%)`);
    if (visitantesPresentes.length > 0) linhasMsg.push(`🌱 *Visitantes:* ${visitantesPresentes.length}`);
    linhasMsg.push("");
    if (presentes.length > 0) {
      linhasMsg.push("*Presentes:*");
      presentes.forEach(p => linhasMsg.push(`✅ ${p.nome_completo}`));
      linhasMsg.push("");
    }
    if (visitantesPresentes.length > 0) {
      linhasMsg.push(`*Visitantes (${visitantesPresentes.length}):*`);
      visitantesPresentes.forEach(v => linhasMsg.push(`🌱 ${v.nome_completo}`));
      linhasMsg.push("");
    }
    if (aula.observacoes) { linhasMsg.push(`📝 *Observações:* ${aula.observacoes}`); linhasMsg.push(""); }
    if (versiculo) linhasMsg.push(`${versiculo.texto} — ${versiculo.referencia}`);
    linhasMsg.push("");
    linhasMsg.push(`_Enviado pelo DiakoniaApp — Gestão Ministerial_`);
    return linhasMsg.join("\n");
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

  if (!classe || !aula) {
    return <div className="p-8 text-center text-muted-foreground">
      Aula não encontrada. <Link to={`/ebd/${classeId}`} className="text-primary underline">Voltar</Link>
    </div>;
  }

  const hoje = new Date().toLocaleDateString("pt-BR");
  const horaHoje = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

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

      {/* Barra de controles (não imprime) */}
      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to={`/ebd/${classeId}/chamada?data=${data}`}>
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Link>
          </Button>
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
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Relatório de Chamada — EBD</p>
          <h1 className="font-serif text-3xl mt-2">{classe.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dataLongaBr(data)}</p>
        </div>

        {/* Foto da turma — pedido dela: "para impressão, traga a foto da
            turma". Só existe quando alguém subiu uma na chamada
            (EbdChamada.tsx); sem foto, a seção nem aparece. */}
        {aula.foto_url && (
          <section className="avoid-break mb-6 text-center">
            <img
              src={aula.foto_url}
              alt={`Foto da turma — ${classe.nome}`}
              className="max-h-80 w-auto mx-auto rounded-md border border-border/40 object-cover"
              style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
            />
          </section>
        )}

        {aula.tema && (
          <section className="avoid-break mb-6 p-4 rounded-md bg-gradient-verse border border-gold/30 text-center">
            <p className="text-xs uppercase tracking-wide text-gold">Tema da aula</p>
            <p className="font-serif text-xl mt-1">{aula.tema}</p>
          </section>
        )}

        {professoresPresenca.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">
              Professor{professoresPresenca.length > 1 ? "es" : ""} ({professoresPresentes.length}/{professoresPresenca.length})
            </h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {professoresPresenca.map(p => (
                <div key={p.pessoa_id} className={`flex items-center gap-1.5 border-b border-border/40 py-1 ${p.presente ? "" : "text-muted-foreground"}`}>
                  {p.presente ? <Check className="w-3 h-3 text-gold shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
                  <span className="truncate">{p.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="avoid-break grid grid-cols-4 gap-2 mb-6 text-center">
          <Stat label="Presentes" valor={presentes.length} highlight />
          <Stat label="Ausentes" valor={ausentes.length} />
          <Stat label="Visitantes" valor={visitantesPresentes.length} />
          <Stat label="Total" valor={totalPresentes} />
        </section>

        {presentes.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Presentes ({presentes.length})</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {presentes.map(p => (
                <div key={p.pessoa_id} className="flex items-center gap-1.5 border-b border-border/40 py-1">
                  <Check className="w-3 h-3 text-success-text shrink-0" />
                  <span className="truncate">{p.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {ausentes.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-muted-foreground">Ausentes ({ausentes.length})</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {ausentes.map(p => (
                <div key={p.pessoa_id} className="flex items-center gap-1.5 border-b border-border/40 py-1 text-muted-foreground">
                  <X className="w-3 h-3 shrink-0" />
                  <span className="truncate">{p.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {visitantesPresentes.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Visitantes ({visitantesPresentes.length})</h3>
            <div className="space-y-1 text-sm">
              {visitantesPresentes.map(v => (
                <div key={v.pessoa_id} className="border-b border-border/40 py-1 flex items-center gap-1.5">
                  <span className="text-warning-text shrink-0">🌱</span>
                  <span className="font-medium">{v.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {aula.observacoes && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Observações da aula</h3>
            <p className="text-sm whitespace-pre-wrap italic text-muted-foreground border-l-2 border-border pl-3">
              "{aula.observacoes}"
            </p>
          </section>
        )}

        <section className="avoid-break mt-12 pt-4">
          <div className="grid grid-cols-1 gap-12 text-center text-xs max-w-xs mx-auto">
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Professor(a) responsável</p>
                <p className="text-muted-foreground text-xs">{professorPrincipal?.membros?.nome_completo ?? "—"}</p>
              </div>
            </div>
          </div>
        </section>

        {versiculo && (
          <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
            <p className="text-xs italic text-muted-foreground font-serif">{versiculo.texto}</p>
            <p className="text-xs text-gold tracking-wide mt-1">{versiculo.referencia}</p>
          </footer>
        )}
      </div>
    </div>
  );
}

function Stat({ label, valor, highlight }: { label: string; valor: number; highlight?: boolean }) {
  return (
    <div className={`border rounded-md py-2 px-2 ${highlight ? "border-gold bg-gold/5" : ""}`}>
      <p className={`font-semibold tabular-nums ${highlight ? "text-2xl text-gold" : "text-xl"}`}>{valor}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
