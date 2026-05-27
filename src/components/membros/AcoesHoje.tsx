import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ListSkeleton } from "@/components/ListState";
import ContatoResultadoDialog from "@/components/membros/ContatoResultadoDialog";
import {
  MessageCircle,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Clock,
  Heart,
  RefreshCw,
  TrendingUp,
  Pencil,
  RotateCcw as Restore,
} from "lucide-react";
import { toast } from "sonner";
import {
  calcularEtapa,
  calcularPrioridade,
  precisaAcao,
  getMensagem,
  buildWhatsAppLink,
  getStatusPorEtapa,
  ETAPA_LABEL,
  PRIORIDADE_STYLE,
  type VisitanteFluxo,
} from "@/lib/visitantesFluxo";
import { avaliarEvolucao } from "@/lib/evolucaoFluxo";
import type { Membro } from "@/pages/Membros";

// ── Interfaces ───────────────────────────────────────────────────────────────

interface RawMembro extends Membro {
  numero_visitas?:             number | null;
  ultimo_contato_em?:          string | null;
  ultimo_contato_tipo?:        string | null;
  ultimo_contato_observacao?:  string | null;
  created_at:                  string;
}

interface VisitanteFluxoExt extends VisitanteFluxo {
  ultimo_contato_tipo:        string | null;
  ultimo_contato_observacao:  string | null;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const PRIO_ICON: Record<string, React.ReactNode> = {
  alta:  <AlertTriangle className="w-3 h-3" />,
  media: <Clock         className="w-3 h-3" />,
  baixa: <Heart         className="w-3 h-3" />,
};

interface AcoesHojeProps {
  limit?: number;
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function AcoesHoje({ limit }: AcoesHojeProps = {}) {
  const [membros, setMembros]                       = useState<RawMembro[]>([]);
  const [loading, setLoading]                       = useState(true);
  const [busyId, setBusyId]                         = useState<string | null>(null);
  const [contatoAlvo, setContatoAlvo]               = useState<VisitanteFluxoExt | null>(null);
  // ─ Edição de mensagem ────────────────────────────────────────────────────
  const [editandoId, setEditandoId]                 = useState<string | null>(null);
  const [mensagensEditadas, setMensagensEditadas]   = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("membros")
      .select("*")
      .eq("tipo_pessoa", "visitante")
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setMembros((data ?? []) as RawMembro[]);
    setMensagensEditadas({});   // limpa edições ao recarregar
    setEditandoId(null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visitantes = useMemo<VisitanteFluxoExt[]>(() => {
    return membros
      .map((m): VisitanteFluxoExt => {
        const nv   = m.numero_visitas ?? 1;
        const dias = Math.floor(
          (Date.now() - new Date(m.created_at).getTime()) / 86_400_000
        );
        return {
          id:                         m.id,
          nome_completo:              m.nome_completo,
          telefone:                   m.telefone_celular ?? null,
          numero_visitas:             nv,
          status_acolhimento:         m.status_acolhimento ?? null,
          ultimo_contato_em:          m.ultimo_contato_em ?? null,
          ultimo_contato_tipo:        m.ultimo_contato_tipo ?? null,
          ultimo_contato_observacao:  m.ultimo_contato_observacao ?? null,
          created_at:                 m.created_at,
          dias_desde_cadastro:        dias,
          etapa_fluxo:                calcularEtapa(nv, m.created_at),
          prioridade:                 calcularPrioridade(nv, m.created_at),
          precisa_acao:               precisaAcao(m.ultimo_contato_em ?? null),
        };
      })
      .filter((v) => v.precisa_acao)
      .sort((a, b) => {
        const ord: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
        const diff = ord[a.prioridade] - ord[b.prioridade];
        if (diff !== 0) return diff;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      })
      .slice(0, limit ?? undefined);
  }, [membros, limit]);

  // ── Helpers de edição ─────────────────────────────────────────────────────

  const getMsgFinal = (v: VisitanteFluxoExt) =>
    mensagensEditadas[v.id] ?? getMensagem(v.etapa_fluxo, v.nome_completo);

  const abrirEdicao = (v: VisitanteFluxoExt) => {
    if (!mensagensEditadas[v.id]) {
      setMensagensEditadas((prev) => ({
        ...prev,
        [v.id]: getMensagem(v.etapa_fluxo, v.nome_completo),
      }));
    }
    setEditandoId(v.id);
  };

  const restaurarMensagem = (v: VisitanteFluxoExt) => {
    setMensagensEditadas((prev) => ({
      ...prev,
      [v.id]: getMensagem(v.etapa_fluxo, v.nome_completo),
    }));
  };

  // ── Ações ─────────────────────────────────────────────────────────────────

  const marcarEnviado = async (
    v:          VisitanteFluxoExt,
    tipo:       string,
    observacao: string
  ) => {
    setBusyId(v.id);
    const { error } = await supabase
      .from("membros")
      .update({
        ultimo_contato_em:          new Date().toISOString(),
        status_acolhimento:         getStatusPorEtapa(v.etapa_fluxo),
        ultimo_contato_tipo:        tipo,
        ultimo_contato_observacao:  observacao || null,
      } as any)
      .eq("id", v.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Contato registrado para ${v.nome_completo.split(" ")[0]}! ✅`);
      load();
    }
    setBusyId(null);
    setContatoAlvo(null);
  };

  const abrirWhatsApp = (v: VisitanteFluxoExt) => {
    const link = buildWhatsAppLink(v.telefone, getMsgFinal(v));
    if (!link) return toast.error("Telefone não cadastrado para este visitante");
    window.open(link, "_blank", "noopener,noreferrer");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold font-serif" translate="no">
            Quem precisa de cuidado hoje
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5" translate="no">
            {loading
              ? "Carregando..."
              : `${visitantes.length} visitante${visitantes.length !== 1 ? "s" : ""} aguardando contato`}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={load}
          disabled={loading}
          className="shrink-0 gap-1.5 text-xs text-muted-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Legenda */}
      <div className="flex gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-destructive inline-block" />Alta — mais de 15 dias
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning inline-block" />Média — mais de 7 dias
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success inline-block" />Baixa — recém chegou
        </span>
      </div>

      {/* Lista */}
      {loading ? (
        <ListSkeleton count={3} />
      ) : visitantes.length === 0 ? (
        <EmptyState message="Nenhuma ação pendente hoje! Todos os visitantes foram contactados. 🎉" />
      ) : (
        <div className="grid gap-3">
          {visitantes.map((v) => {
            const prio      = PRIORIDADE_STYLE[v.prioridade];
            const busy      = busyId === v.id;
            const msgFinal  = getMsgFinal(v);
            const link      = buildWhatsAppLink(v.telefone, msgFinal);
            const editando  = editandoId === v.id;
            const editada   = !!mensagensEditadas[v.id] &&
                              mensagensEditadas[v.id] !== getMensagem(v.etapa_fluxo, v.nome_completo);
            const evolucao  = avaliarEvolucao({
              tipo_pessoa:         "visitante",
              numero_visitas:      v.numero_visitas,
              ultimo_contato_tipo: v.ultimo_contato_tipo,
              created_at:          v.created_at,
            });

            const ultimoContato = v.ultimo_contato_em
              ? `${new Date(v.ultimo_contato_em).toLocaleDateString("pt-BR")}${v.ultimo_contato_tipo ? ` — ${v.ultimo_contato_tipo}` : ""}`
              : null;

            return (
              <Card
                key={v.id}
                className={`shadow-card-soft border-l-4 ${prio.border} transition-opacity ${busy ? "opacity-60" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="w-4 h-4 text-muted-foreground" />
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">

                      {/* Nome + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium leading-tight">{v.nome_completo}</span>
                        <Badge variant="outline" className={`text-[10px] h-4 px-1.5 gap-1 ${prio.badge}`}>
                          {PRIO_ICON[v.prioridade]}{prio.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                          {ETAPA_LABEL[v.etapa_fluxo]}
                        </Badge>
                        {evolucao.sugestao && (
                          <Badge className="text-[10px] h-4 px-1.5 gap-1 bg-success/15 text-success border border-success/30 hover:bg-success/15">
                            <Sparkles className="w-2.5 h-2.5" />
                            Próximo passo ✨
                          </Badge>
                        )}
                      </div>

                      {/* Meta */}
                      <p className="text-xs text-muted-foreground" translate="no">
                        Dia {v.dias_desde_cadastro} · {v.numero_visitas}{" "}
                        {v.numero_visitas === 1 ? "visita" : "visitas"}
                        {v.telefone ? ` · ${v.telefone}` : " · Sem telefone"}
                      </p>

                      {/* Último contato */}
                      <p className={`text-xs ${ultimoContato ? "text-muted-foreground" : "text-muted-foreground/60 italic"}`} translate="no">
                        {ultimoContato ? `Último contato: ${ultimoContato}` : "Sem contato ainda"}
                      </p>

                      {/* ─ Mensagem — preview ou editor ─────────────────── */}
                      {editando ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">Editar mensagem</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[10px] gap-1 text-muted-foreground"
                              onClick={() => restaurarMensagem(v)}
                              title="Restaurar mensagem original"
                            >
                              <Restore className="w-3 h-3" /> Restaurar
                            </Button>
                          </div>
                          <Textarea
                            className="text-xs resize-none min-h-[120px] leading-relaxed"
                            value={mensagensEditadas[v.id] ?? ""}
                            onChange={(e) =>
                              setMensagensEditadas((prev) => ({ ...prev, [v.id]: e.target.value }))
                            }
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs h-6"
                            onClick={() => setEditandoId(null)}
                          >
                            OK — confirmar edição
                          </Button>
                        </div>
                      ) : (
                        <div className="relative group">
                          <blockquote
                            className="text-xs text-muted-foreground border-l-2 border-muted pl-2 pr-6 whitespace-pre-line leading-relaxed"
                            translate="no"
                          >
                            {msgFinal}
                          </blockquote>
                          <button
                            className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground/60 hover:text-muted-foreground"
                            onClick={() => abrirEdicao(v)}
                            title="Editar mensagem"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          {editada && (
                            <span className="text-[10px] text-warning mt-0.5 block">✏️ Mensagem editada</span>
                          )}
                        </div>
                      )}

                      {/* Ações */}
                      <div className="flex gap-2 flex-wrap pt-0.5">
                        <Button
                          size="sm"
                          className="gap-1.5 text-xs h-7 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                          disabled={!link || busy}
                          onClick={() => abrirWhatsApp(v)}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span translate="no">Enviar WhatsApp</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7"
                          disabled={busy}
                          onClick={() => setContatoAlvo(v)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                          <span translate="no">Registrar contato</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ContatoResultadoDialog
        open={!!contatoAlvo}
        onOpenChange={(open) => { if (!open) setContatoAlvo(null); }}
        nomeVisitante={contatoAlvo?.nome_completo ?? ""}
        saving={busyId === contatoAlvo?.id}
        onConfirm={async (tipo, obs) => {
          if (contatoAlvo) await marcarEnviado(contatoAlvo, tipo, obs);
        }}
      />
    </div>
  );
}
