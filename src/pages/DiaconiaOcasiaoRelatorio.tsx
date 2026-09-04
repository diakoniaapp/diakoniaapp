// ─── DiaconiaOcasiaoRelatorio.tsx — o relatório que a chamada da Diaconia não tinha ─
//
// Mesmo molde de PgmReuniaoRelatorio.tsx/EbdAulaRelatorio.tsx: impressão +
// WhatsApp, gerado a qualquer momento — finalizar é só um carimbo (ver
// DiaconiaChamada.tsx), não trava nada. Pedido dela, verificando os três
// módulos de chamada: "é preciso finalizar a chamada e gerar relatório".

import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, MessageCircle, Check, X } from "lucide-react";
import { toast } from "sonner";
import logoDiakonia from "@/assets/logo-diakonia.png";
import {
  obterOuCriarOcasiao, chamadaView, type LinhaDaChamada,
} from "@/services/diaconiaService";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

function dataLongaBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default function DiaconiaOcasiaoRelatorio() {
  const { ministerioId = "", areaId = "" } = useParams();
  const [params] = useSearchParams();
  const data = params.get("data") || new Date().toISOString().slice(0, 10);
  const { user } = useAuth();

  const [areaNome, setAreaNome] = useState("");
  const [linhas, setLinhas] = useState<LinhaDaChamada[]>([]);
  const [loading, setLoading] = useState(true);
  const [emitidoPor, setEmitidoPor] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data: area } = await supabase.from("areas").select("nome").eq("id", areaId).maybeSingle();
        setAreaNome((area as any)?.nome ?? "");
        const ocasiaoId = await obterOuCriarOcasiao(areaId, data);
        setLinhas(await chamadaView(ocasiaoId));

        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("nome").eq("id", user.id).maybeSingle();
          setEmitidoPor(prof?.nome ?? user.email ?? "Sistema");
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro");
      } finally { setLoading(false); }
    })();
  }, [areaId, data, user]);

  const confirmados = useMemo(() => linhas.filter(l => l.confirmado), [linhas]);
  const naoConfirmados = useMemo(() => linhas.filter(l => !l.confirmado), [linhas]);
  const taxa = linhas.length > 0 ? Math.round((confirmados.length / linhas.length) * 100) : 0;

  function montarMensagemWhatsApp(): string {
    const linhasMsg: string[] = [];
    linhasMsg.push(`❤️ *${areaNome}* — Diaconia`);
    linhasMsg.push(`📅 ${dataLongaBr(data)}`);
    linhasMsg.push("");
    linhasMsg.push(`👥 *Confirmados:* ${confirmados.length} de ${linhas.length} (${taxa}%)`);
    linhasMsg.push("");
    if (confirmados.length > 0) {
      linhasMsg.push("*Confirmados:*");
      confirmados.forEach(p => linhasMsg.push(`✅ ${p.nome_completo}`));
      linhasMsg.push("");
    }
    linhasMsg.push(`"Servi ao Senhor com alegria." — Salmos 100:2`);
    linhasMsg.push("");
    linhasMsg.push(`_Enviado pelo Diakonia APP — Sistema de Igrejas_`);
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

      <div className="no-print sticky top-0 z-10 bg-card border-b">
        <div className="max-w-4xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to={`/ministerios/${ministerioId}/diaconia/${areaId}/chamada?data=${data}`}>
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

      <div className="relatorio-page max-w-4xl mx-auto bg-white text-foreground p-8 md:p-10 my-4 md:my-6 shadow-elevated border border-border/40 rounded-md print:my-0">
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
              <p className="text-xs text-muted-foreground mt-0.5 tracking-[0.12em] uppercase">
                Conectando pessoas, organizando o propósito
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground space-y-0.5">
            <p>Emitido em <strong className="text-foreground">{hoje}</strong> às {horaHoje}</p>
            <p>Por <strong className="text-foreground">{emitidoPor}</strong></p>
          </div>
        </header>

        <div className="text-center my-6 avoid-break">
          <p className="text-xs tracking-[0.25em] uppercase text-gold">Relatório de Atendimento — Diaconia</p>
          <h1 className="font-serif text-3xl mt-2">{areaNome || "—"}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dataLongaBr(data)}</p>
        </div>

        <section className="avoid-break grid grid-cols-3 gap-2 mb-6 text-center">
          <Stat label="Confirmados" valor={confirmados.length} highlight />
          <Stat label="Não confirmados" valor={naoConfirmados.length} />
          <Stat label="Cadastrados" valor={linhas.length} />
        </section>

        {confirmados.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-gold">Confirmados ({confirmados.length})</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {confirmados.map(p => (
                <div key={p.pessoa_assistida_id} className="flex items-center gap-1.5 border-b border-border/40 py-1">
                  <Check className="w-3 h-3 text-success-text shrink-0" />
                  <span className="truncate">{p.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {naoConfirmados.length > 0 && (
          <section className="avoid-break mb-6">
            <h3 className="font-serif text-base mb-2 text-muted-foreground">Não confirmados ({naoConfirmados.length})</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              {naoConfirmados.map(p => (
                <div key={p.pessoa_assistida_id} className="flex items-center gap-1.5 border-b border-border/40 py-1 text-muted-foreground">
                  <X className="w-3 h-3 shrink-0" />
                  <span className="truncate">{p.nome_completo}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {linhas.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Ninguém cadastrado nesta área ainda.</p>
        )}

        <footer className="avoid-break mt-10 pt-4 border-t border-gold/30 text-center">
          <p className="text-xs italic text-muted-foreground font-serif">
            "Servi ao Senhor com alegria; apresentai-vos a ele com cânticos."
          </p>
          <p className="text-xs text-gold tracking-wide mt-1">Salmos 100:2</p>
        </footer>
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
