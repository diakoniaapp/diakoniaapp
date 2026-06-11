import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Loader2, MessageCircle, Check } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  carregarReuniao, listarPresencas, listarVisitas,
  carregarGrupo, listarPedidosOracao,
  diaSemanaTexto, horarioTexto, PAPEL_LABEL, VISIBILIDADE_LABEL,
  type PgmReuniao, type PgmPresencaComPessoa, type PgmVisita,
  type PgmGrupoResumo, type PgmPedidoComPessoa,
} from "@/services/pgmService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR");
}
function dataLongaBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default function PgmReuniaoRelatorio() {
  const { grupoId = "", reuniaoId = "" } = useParams();
  const { user } = useAuth();

  const [grupo, setGrupo] = useState<PgmGrupoResumo | null>(null);
  const [reuniao, setReuniao] = useState<PgmReuniao | null>(null);
  const [presencas, setPresencas] = useState<PgmPresencaComPessoa[]>([]);
  const [visitas, setVisitas] = useState<PgmVisita[]>([]);
  const [oracoes, setOracoes] = useState<PgmPedidoComPessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [r, g, ps, vs, os] = await Promise.all([
          carregarReuniao(reuniaoId),
          carregarGrupo(grupoId),
          listarPresencas(reuniaoId),
          listarVisitas(reuniaoId),
          listarPedidosOracao(grupoId, "ativo"),
        ]);
        setReuniao(r);
        setGrupo(g);
        setPresencas(ps);
        setVisitas(vs);
        // Apenas pedidos com visibilidade "grupo" entram no relatório
        setOracoes(os.filter(o => o.visibilidade === "grupo"));

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [grupoId, reuniaoId, user]);

  const presentes = useMemo(() => presencas.filter(p => p.presente), [presencas]);
  const ausentes  = useMemo(() => presencas.filter(p => !p.presente), [presencas]);
  const totalPessoas = presentes.length + visitas.length;
  const taxaPresenca = presencas.length > 0
    ? Math.round((presentes.length / presencas.length) * 100)
    : 0;

  function montarMensagemWhatsApp(): string {
    if (!grupo || !reuniao) return "";
    const linhas: string[] = [];
    linhas.push(`🙏 *${grupo.nome}*`);
    linhas.push(`📅 ${dataLongaBr(reuniao.data)}`);
    linhas.push("");

    if (reuniao.tema) {
      linhas.push(`📖 *Tema:* ${reuniao.tema}`);
    }
    if (reuniao.texto_base) {
      linhas.push(`✨ ${reuniao.texto_base}`);
    }
    if (reuniao.tema || reuniao.texto_base) linhas.push("");

    linhas.push(`👥 *Presença:* ${presentes.length} de ${presencas.length} (${taxaPresenca}%)`);
    if (visitas.length > 0) {
      linhas.push(`🌱 *Visitantes:* ${visitas.length}`);
    }
    linhas.push("");

    if (presentes.length > 0) {
      linhas.push("*Presentes:*");
      presentes.forEach(p => linhas.push(`✅ ${p.nome_completo ?? "—"}`));
      linhas.push("");
    }

    if (visitas.length > 0) {
      linhas.push(`*Visitantes (${visitas.length}):*`);
      visitas.forEach(v => {
        const extra = [v.bairro, v.telefone].filter(Boolean).join(" · ");
        linhas.push(`• ${v.nome}${extra ? ` — ${extra}` : ""}`);
      });
      linhas.push("");
    }

    if (oracoes.length > 0) {
      linhas.push(`🙏 *Pedidos de oração:*`);
      oracoes.forEach(o => {
        const por = o.pessoa_nome ? ` (${o.pessoa_nome})` : "";
        linhas.push(`• ${o.texto}${por}`);
      });
      linhas.push("");
    }

    if (reuniao.observacoes) {
      linhas.push(`📝 *Observações:* ${reuniao.observacoes}`);
      linhas.push("");
    }

    linhas.push(`"Onde estiverem dois ou três reunidos em meu nome, ali estou no meio deles." — Mt 18:20`);
    linhas.push("");
    linhas.push(`_Enviado pelo Diakonia APP — Sistema de Igrejas_`);

    return linhas.join("\n");
  }

  function compartilharWhatsApp() {
    const msg = montarMensagemWhatsApp();
    if (!msg) { toast.error("Carregando dados..."); return; }
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copiarTexto() {
    try {
      await navigator.clipboard.writeText(montarMensagemWhatsApp());
      toast.success("Resumo copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  if (loading) {
    return <div className="p-8 flex items-center justify-center text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando relatório...
    </div>;
  }

  if (!reuniao || !grupo) {
    return <div className="p-8 text-center text-muted-foreground">
      Encontro não encontrado. <Link to={`/pgm/${grupoId}`} className="text-primary underline">Voltar</Link>
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
          <Link to={`/pgm/${grupoId}/reuniao/${reuniaoId}`}>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar
            </Button>
          </Link>
          <div className="flex items-center gap-1 ml-auto flex-wrap">
            <Button onClick={copiarTexto} size="sm" variant="outline" className="gap-1.5">
              📋 Copiar
            </Button>
            <Button onClick={compartilharWhatsApp} size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
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
        {/* Cabeçalho institucional */}
        <header className="avoid-break flex items-start justify-between gap-4 pb-4 border-b-2 border-gold/30">
          <div className="flex items-center gap-4">
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
            <div>
              <h2 className="font-serif text-lg leading-tight">Diakonia APP — Sistema de Igrejas</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Conectando pessoas, organizando o propósito
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hoje}</strong> às {horaHoje}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        {/* Título */}
        <div className="text-center my-6 avoid-break">
          <p className="text-[10px] tracking-[0.25em] uppercase text-gold">Relatório de Encontro — PGM</p>
          <h1 className="font-serif text-3xl mt-2">{grupo.nome}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dataLongaBr(reuniao.data)}</p>
          {(grupo.dia_semana != null || grupo.horario) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Encontro regular: {diaSemanaTexto(grupo.dia_semana)} {grupo.horario && `às ${horarioTexto(grupo.horario)}`}
            </p>
          )}
        </div>

        {/* Tema + Texto base */}
        {(reuniao.tema || reuniao.texto_base) && (
          <section className="avoid-break mb-6 p-4 rounded-md bg-gradient-verse border border-gold/30 text-center">
            {reuniao.tema && (
              <>
                <p className="text-[10px] uppercase tracking-wide text-gold">Tema da semana</p>
                <p className="font-serif text-xl mt-1">{reuniao.tema}</p>
              </>
            )}
            {reuniao.texto_base && (
              <p className="text-sm italic text-muted-foreground mt-2">{reuniao.texto_base}</p>
            )}
          </section>
        )}

        {/* Stats */}
        <section className="avoid-break grid grid-cols-4 gap-2 mb-6 text-center">
          <Stat label="Presentes" valor={presentes.length} highlight />
          <Stat label="Ausentes"  valor={ausentes.length} />
          <Stat label="Visitantes" valor={visitas.length} />
          <Stat label="Total"     valor={totalPessoas} />
        </section>

        {/* Presentes */}
        {presentes.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Presentes ({presentes.length})</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {presentes.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 border-b border-border/40 py-1">
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">{p.nome_completo ?? "—"}</span>
                  {p.papel && p.papel !== "participante" && (
                    <span className="text-[10px] text-gold ml-auto shrink-0">{PAPEL_LABEL[p.papel]}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Visitantes */}
        {visitas.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Visitantes ({visitas.length})</h3>
            <div className="space-y-1 text-sm">
              {visitas.map(v => (
                <div key={v.id} className="border-b border-border/40 py-1 flex items-start gap-1.5">
                  <span className="text-amber-600 shrink-0">🌱</span>
                  <div className="min-w-0">
                    <p className="font-medium">{v.nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[v.telefone, v.bairro].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pedidos de oração (apenas visibilidade=grupo) */}
        {oracoes.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Pedidos de oração ({oracoes.length})</h3>
            <p className="text-[10px] text-muted-foreground mb-2">
              Apenas pedidos compartilhados com o grupo todo. Pedidos privados não aparecem aqui.
            </p>
            <div className="space-y-2 text-sm">
              {oracoes.map(o => (
                <div key={o.id} className="border-l-2 border-gold/40 pl-3 py-0.5">
                  <p className="leading-snug">{o.texto}</p>
                  {o.pessoa_nome && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Por: <strong>{o.pessoa_nome}</strong>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Observações do encontro */}
        {reuniao.observacoes && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Observações do encontro</h3>
            <p className="text-sm whitespace-pre-wrap italic text-muted-foreground border-l-2 border-border pl-3">
              "{reuniao.observacoes}"
            </p>
          </section>
        )}

        {/* Assinaturas */}
        <section className="avoid-break mt-12 pt-4">
          <div className="grid grid-cols-2 gap-12 text-center text-xs">
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Líder</p>
                <p className="text-muted-foreground text-[10px]">{grupo.lider_nome ?? "—"}</p>
              </div>
            </div>
            <div>
              <div className="border-t border-foreground/60 pt-1 mx-4">
                <p className="font-medium">Co-líder</p>
                <p className="text-muted-foreground text-[10px]">{grupo.co_lider_nome ?? "—"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Rodapé com versículo */}
        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Onde estiverem dois ou três reunidos em meu nome, ali estou no meio deles."
          </p>
          <p className="text-[10px] text-gold tracking-wide mt-1">Mateus 18:20</p>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, valor, highlight }: { label: string; valor: number; highlight?: boolean }) {
  return (
    <div className={`border rounded-md py-2 px-2 ${highlight ? "border-gold bg-gold/5" : ""}`}>
      <p className={`font-semibold tabular-nums ${highlight ? "text-2xl text-gold" : "text-xl"}`}>{valor}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
