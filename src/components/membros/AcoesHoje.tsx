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
  RefreshCw,
  ChevronDown,
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
import { logHistorico } from "@/lib/historicoFluxo";
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
  // A mensagem pronta ocupava 215px dos 413px do cartao — mais da metade,
  // repetindo texto quase igual em cada visitante. Fica recolhida em duas
  // linhas; quem quiser conferir antes de enviar abre uma de cada vez.
  const [msgAbertas, setMsgAbertas]                 = useState<Set<string>>(new Set());
  const alternarMsg = (id: string) =>
    setMsgAbertas(prev => {
      const p = new Set(prev);
      if (p.has(id)) p.delete(id); else p.add(id);
      return p;
    });

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
    // Nao usa a funcao registrar_contato porque aqui tambem se grava
    // status_acolhimento, que ela nao toca. O .select() garante que um UPDATE
    // barrado pela politica apareca como erro, e nao como falso sucesso.
    const { data: alterados, error } = await supabase
      .from("membros")
      .update({
        ultimo_contato_em:          new Date().toISOString(),
        status_acolhimento:         getStatusPorEtapa(v.etapa_fluxo),
        ultimo_contato_tipo:        tipo,
        ultimo_contato_observacao:  observacao || null,
      } as any)
      .eq("id", v.id)
      .select("id");

    if (error) {
      toast.error(error.message);
    } else if ((alterados?.length ?? 0) === 0) {
      toast.error("Sem permissão para registrar o contato desta pessoa.");
    } else {
      toast.success(`Contato registrado para ${v.nome_completo.split(" ")[0]}! ✅`);
      await logHistorico(v.id, "whatsapp", tipo + (observacao ? ` — ${observacao}` : ""));
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
          variant="ghost"
          onClick={load}
          disabled={loading}
          className="shrink-0 h-11 text-xs text-muted-foreground"
        >
          {/* A seta so aparece girando. Parada ela e enfeite ao lado de uma
              palavra que ja se explica; girando ela e o unico retorno de que
              a lista esta sendo recarregada. */}
          {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />}
          Atualizar
        </Button>
      </div>

      {/* A legenda de cores saiu. Ela existia para traduzir tres bolinhas,
          mas a etiqueta de cada cartao ja escreve "Alta", "Média" ou "Baixa"
          por extenso — a legenda decodificava algo que nao estava cifrado, e
          custava tres linhas antes da primeira pessoa da lista. */}
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
                  {/* O circulo com a estrelinha saiu: era identico nos dois
                      cartoes e em todos os que virao. A prioridade ja esta na
                      borda colorida a esquerda e na etiqueta ao lado do nome. */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-2">

                      {/* Nome + badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium leading-tight">{v.nome_completo}</span>
                        {/* Etiquetas sem icone dentro. "Baixa" ja diz baixa, e
                            a prioridade tambem esta na barra colorida da borda
                            esquerda do cartao — o simbolo era o terceiro sinal
                            do mesmo dado. */}
                        <Badge variant="outline" className={`text-xs h-4 px-1.5 ${prio.badge}`}>
                          {prio.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs h-4 px-1.5">
                          {ETAPA_LABEL[v.etapa_fluxo]}
                        </Badge>
                        {evolucao.sugestao && (
                          <Badge className="text-xs h-4 px-1.5 bg-success/15 text-success border border-success/30 hover:bg-success/15">
                            Próximo passo
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
                            <span className="text-xs text-muted-foreground">Editar mensagem</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-11 px-2 text-xs gap-1 text-muted-foreground"
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
                            variant="outline"
                            className="w-full text-xs h-11"
                            onClick={() => setEditandoId(null)}
                          >
                            OK — confirmar edição
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <blockquote
                            className={`text-xs text-muted-foreground border-l-2 border-muted pl-2 whitespace-pre-line leading-relaxed ${
                              msgAbertas.has(v.id) ? "" : "line-clamp-2"
                            }`}
                            id={`msg-${v.id}`}
                            translate="no"
                          >
                            {msgFinal}
                          </blockquote>
                          <div className="flex items-center gap-1 mt-0.5">
                            {/* Rotulo em texto, nao seta muda: diz o que faz e
                                informa se esta aberta (aria-expanded). */}
                            <Button
                              size="sm" variant="ghost"
                              className="h-11 px-2 text-xs gap-1 text-muted-foreground"
                              onClick={() => alternarMsg(v.id)}
                              aria-expanded={msgAbertas.has(v.id)}
                              aria-controls={`msg-${v.id}`}
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${msgAbertas.has(v.id) ? "rotate-180" : ""}`}
                              />
                              {msgAbertas.has(v.id) ? "Ocultar mensagem" : "Ver mensagem"}
                            </Button>
                            {/* Sem lapis: a palavra "Editar" ja e o rotulo. */}
                            <Button
                              size="sm" variant="ghost"
                              className="h-11 px-2 text-xs text-muted-foreground"
                              onClick={() => abrirEdicao(v)}
                            >
                              Editar
                            </Button>
                            {editada && (
                              <span className="text-xs text-warning">✏️ editada</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Ações */}
                      <div className="flex gap-2 flex-wrap pt-0.5">
                        {/* h-11 = 44px. As duas acoes principais da tela estavam
                            em 28px, abaixo dos 44px que Pessoas, Familias e
                            Ministerios ja adotaram — e sao justamente as que se
                            usa com o celular na mao, no meio do culto. */}
                        <Button
                          className="gap-1.5 text-sm h-11 px-3 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
                          disabled={!link || busy}
                          onClick={() => abrirWhatsApp(v)}
                        >
                          <MessageCircle className="w-4 h-4" />
                          {/* "Enviar WhatsApp" nao cabia ao lado de "Registrar
                              contato" depois que os botoes subiram para 44px, e
                              os dois quebravam em duas linhas. O icone mais a
                              marca ja dizem a acao inteira. */}
                          <span translate="no">WhatsApp</span>
                        </Button>
                        {/* O visto verde saiu: "Registrar contato" ja se explica,
                            e a cor puxava o olho para a acao secundaria em vez
                            da principal, que e enviar a mensagem. */}
                        <Button
                          variant="outline"
                          className="text-sm h-11 px-3"
                          disabled={busy}
                          onClick={() => setContatoAlvo(v)}
                        >
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
