import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import VisitanteDialog from "@/components/membros/VisitanteDialog";
import AcoesHoje from "@/components/membros/AcoesHoje";
import type { Membro } from "@/pages/Membros";
import {
  TrendingUp, AlertTriangle, Phone,
  ArrowRight, Sparkles, RotateCcw, List, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  calcularEtapa, calcularPrioridade, getMensagem,
  buildWhatsAppLink, getStatusPorEtapa, ETAPA_LABEL, PRIORIDADE_STYLE, precisaAcao,
} from "@/lib/visitantesFluxo";
import {
  avaliarEvolucao,
  ETAPAS_JORNADA,
} from "@/lib/evolucaoFluxo";
import { logHistorico } from "@/lib/historicoFluxo";
import { normalizarTelefone, formatarTelefoneSemDDI } from "@/lib/telefone";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface VisitanteMembro extends Membro {
  numero_visitas?:        number | null;
  ultimo_contato_em?:     string | null;
  ultimo_contato_tipo?:   string | null;
  data_congregado?:       string | null;
  data_membro?:           string | null;
  created_at:             string;
}

const DIAS_RETORNO = 15;

// ── Componente principal ──────────────────────────────────────────────────────

export default function Visitantes() {
  const [visitantes, setVisitantes]   = useState<VisitanteMembro[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [selected, setSelected]       = useState<VisitanteMembro | null>(null);
  const [busyId, setBusyId]           = useState<string | null>(null);
  const [busyPromote, setBusyPromote] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("membros")
      .select("*")
      .eq("tipo_pessoa", "visitante")
      .order("created_at", { ascending: true });
    if (e) setError(e.message);
    setVisitantes((data ?? []) as VisitanteMembro[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ── Estatísticas ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const corte15 = new Date(Date.now() - DIAS_RETORNO * 86_400_000);
    const corte3  = new Date(Date.now() - 3 * 86_400_000);
    const retornaram      = visitantes.filter(v => (v.numero_visitas ?? 1) >= 2 && new Date(v.created_at) > corte15).length;
    const naoVoltaram     = visitantes.filter(v => (v.numero_visitas ?? 1) === 1 && new Date(v.created_at) < corte15).length;
    const precisamContato = visitantes.filter(v => precisaAcao(v.ultimo_contato_em ?? null)).length;
    const pendentesHoje   = visitantes.filter(v => precisaAcao(v.ultimo_contato_em ?? null) && new Date(v.created_at) < corte3).length;
    const prontosCrescer  = visitantes.filter(v =>
      avaliarEvolucao({
        tipo_pessoa:         v.tipo_pessoa,
        numero_visitas:      v.numero_visitas ?? 1,
        ultimo_contato_tipo: v.ultimo_contato_tipo ?? null,
        created_at:          v.created_at,
      }).sugestao !== null
    ).length;
    const emRisco = visitantes.filter(v => {
      const dias = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
      return (v.numero_visitas ?? 1) === 1 && dias > 15 && !v.ultimo_contato_em;
    }).length;
    return { total: visitantes.length, retornaram, naoVoltaram, precisamContato, pendentesHoje, prontosCrescer, emRisco };
  }, [visitantes]);

  const listaNaoVoltou = useMemo(
    () => visitantes.filter(v => (v.numero_visitas ?? 1) === 1 && new Date(v.created_at) < new Date(Date.now() - DIAS_RETORNO * 86_400_000)),
    [visitantes]
  );

  const listaRetorno = useMemo(
    () => visitantes.filter(v => (v.numero_visitas ?? 1) >= 2 && new Date(v.created_at) > new Date(Date.now() - DIAS_RETORNO * 86_400_000)),
    [visitantes]
  );

  // ── Ações ───────────────────────────────────────────────────────────────────

  const registrarRetorno = async (v: VisitanteMembro) => {
    setBusyId(v.id);
    const novaContagem = (v.numero_visitas ?? 1) + 1;
    const { error } = await supabase.from("membros")
      .update({ numero_visitas: novaContagem, ...(novaContagem >= 2 ? { status_acolhimento: "retornou" } : {}) })
      .eq("id", v.id);
    if (error) toast.error(error.message);
    else { toast.success("Retorno registrado!"); load(); }
    setBusyId(null);
  };

  const marcarContato = async (v: VisitanteMembro) => {
    setBusyId(v.id);
    const etapa = calcularEtapa(v.numero_visitas ?? 1, v.created_at);
    const { data: alterados, error } = await supabase.from("membros")
      .update({ ultimo_contato_em: new Date().toISOString(), status_acolhimento: getStatusPorEtapa(etapa) })
      .eq("id", v.id)
      .select("id");
    if (error) {
      toast.error(error.message);
    } else if ((alterados?.length ?? 0) === 0) {
      toast.error("Sem permissão para registrar o contato desta pessoa.");
    } else {
      toast.success("Contato registrado!");
      await logHistorico(v.id, "observacao", "Contato registrado");
      load();
    }
    setBusyId(null);
  };

  const abrirWhatsApp = (v: VisitanteMembro) => {
    const etapa = calcularEtapa(v.numero_visitas ?? 1, v.created_at);
    const link  = buildWhatsAppLink(v.telefone_celular, getMensagem(etapa, v.nome_completo));
    if (!link) return toast.error("Telefone nao cadastrado");
    window.open(link, "_blank", "noopener,noreferrer");
  };

  // M3.5 — preenche data_congregado / data_membro ao promover
  const promoverPessoa = async (v: VisitanteMembro, para: "congregado" | "membro") => {
    setBusyPromote(v.id);
    const agora = new Date().toISOString();
    const dataField = para === "congregado"
      ? { data_congregado: agora }
      : { data_membro: agora };
    const { error } = await supabase
      .from("membros")
      .update({ tipo_pessoa: para, ...dataField } as any)
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
    } else {
      const label = para === "congregado" ? "Congregado" : "Membro";
      toast.success(`${v.nome_completo.split(" ")[0]} deu o próximo passo — agora é ${label}! 🎉`);
      const tipoLog = para === "congregado" ? "promocao_congregado" as const : "promocao_membro" as const;
      await logHistorico(v.id, tipoLog, `Promovido a ${label}`);
      load();
    }
    setBusyPromote(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="Painel de Visitantes"
        description="Acompanhamento e fluxo de cuidado pastoral"
        actions={
          <Button asChild variant="outline" className="gap-2">
            <Link to="/membros">
              <ArrowRight className="w-4 h-4" />
              <span translate="no">Ver em Pessoas</span>
            </Link>
          </Button>
        }
      />
      <div className="p-4 md:p-8 space-y-6">

        {/* Os quatro cartoes de numero viraram uma linha.
            Ocupavam 180px no celular — quase um quarto da tela — antes do
            primeiro nome, e dois deles ja apareciam logo abaixo como contador
            das abas: "Precisam contato" e "Ação do dia" sao o mesmo numero, e
            "Não voltaram" tambem se repetia. O total ja esta no subtitulo da
            lista. Sobra aqui o que nao estava em lugar nenhum. */}
        <p className="text-sm text-muted-foreground" translate="no">
          <span className="font-medium text-foreground">{stats.total}</span>{" "}
          {stats.total === 1 ? "visitante" : "visitantes"}
          {" · "}
          <span className={stats.retornaram > 0 ? "font-medium text-success" : ""}>
            {stats.retornaram}
          </span>{" "}
          {stats.retornaram === 1 ? "retornou" : "retornaram"} em {DIAS_RETORNO} dias
        </p>

        {/* M3.3 — Pessoas prontas para crescer */}
        {stats.prontosCrescer > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-success shrink-0" />
              <p className="text-sm font-medium text-success" translate="no">
                <span className="font-bold">{stats.prontosCrescer}</span>{" "}
                {stats.prontosCrescer === 1
                  ? "pessoa está pronta para dar o próximo passo na jornada"
                  : "pessoas estão prontas para dar o próximo passo na jornada"}
              </p>
            </div>
            <Badge className="shrink-0 bg-success/15 text-success border border-success/30 text-xs hover:bg-success/15" translate="no">
              Ver abaixo
            </Badge>
          </div>
        )}

        {/* M3.4 — Visitantes em risco */}
        {stats.emRisco > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-warning-text shrink-0" />
            <p className="text-sm font-medium text-warning-text" translate="no">
              <span className="font-bold">{stats.emRisco}</span>{" "}
              {stats.emRisco === 1
                ? "visitante pode estar se perdendo"
                : "visitantes podem estar se perdendo"}{" "}
              — apenas 1 visita, sem contato há mais de 15 dias
            </p>
          </div>
        )}

        {/* Abas */}
        <Tabs defaultValue="acao">
          {/* As abas transbordavam: 113px de conteudo numa caixa de 110px, e o
              contador invadia a aba vizinha — lia-se "Ação do dia 2Não voltaram".
              Tres correcoes: h-11 (eram 32px, abaixo do alvo de toque de 44px que
              o resto do sistema ja adota), icone so a partir de md (no celular
              custava 16px mais o espacamento para repetir o que o rotulo diz), e
              o rotulo com min-w-0 + truncate, para que falta de espaco vire corte
              limpo em vez de sobreposicao. */}
          <TabsList className="grid w-full grid-cols-3 h-auto">
            {/* Sem icone nas abas. Tres rotulos claros — "Ação do dia",
                "Não voltaram", "Todos" — nao precisam de simbolo, e o icone
                aparecia so no desktop, o que ja dizia que ele nao era
                necessario para entender. */}
            <TabsTrigger value="acao" className="gap-1 h-11 px-1.5 min-w-0 text-xs sm:text-sm" translate="no">
              <span className="truncate">Ação do dia</span>
              {stats.pendentesHoje > 0 && (
                <Badge className="h-4 px-1.5 text-xs shrink-0" variant="destructive">{stats.pendentesHoje}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="nao_voltou" className="gap-1 h-11 px-1.5 min-w-0 text-xs sm:text-sm" translate="no">
              <span className="truncate">Não voltaram</span>
              {listaNaoVoltou.length > 0 && (
                <Badge className="h-4 px-1.5 text-xs shrink-0" variant="outline">{listaNaoVoltou.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="todos" className="gap-1 h-11 px-1.5 min-w-0 text-xs sm:text-sm" translate="no">
              <span className="truncate">Todos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="acao" className="mt-4">
            <AcoesHoje />
          </TabsContent>

          <TabsContent value="nao_voltou" className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground" translate="no">
              Visitantes com 1 visita e mais de {DIAS_RETORNO} dias desde o cadastro.
            </p>
            {loading ? (
              <ListSkeleton count={4} />
            ) : error ? (
              <ErrorState onRetry={load} />
            ) : listaNaoVoltou.length === 0 ? (
              <EmptyState
                message="Ninguém esperando retorno"
                descricao="Todos os visitantes registrados já receberam contato. Quando alguém novo chegar, o nome aparece aqui."
              />
            ) : (
              <div className="grid gap-3">
                {listaNaoVoltou.map(v => (
                  <VisitanteCard key={v.id} v={v}
                    busy={busyId === v.id} busyPromote={busyPromote === v.id}
                    onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                    onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)}
                    onPromover={(para) => promoverPessoa(v, para)} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="todos" className="mt-4 space-y-6">
            {loading ? (
              <ListSkeleton count={4} />
            ) : error ? (
              <ErrorState onRetry={load} />
            ) : visitantes.length === 0 ? (
              <EmptyState
                message="Nenhum visitante cadastrado"
                descricao="Quem chegou pela primeira vez entra aqui. É a única lista do sistema com régua de acompanhamento: o Diakonia lembra quem ainda não foi procurado e há quantos dias."
              />
            ) : (
              <>
                {listaRetorno.length > 0 && (
                  <section>
                    <h3 className="text-sm font-semibold text-success mb-3 flex items-center gap-2" translate="no">
                      <TrendingUp className="w-4 h-4" />
                      Retorno rapido dentro de {DIAS_RETORNO} dias ({listaRetorno.length})
                    </h3>
                    <div className="grid gap-3">
                      {listaRetorno.map(v => (
                        <VisitanteCard key={v.id} v={v} variant="success"
                          busy={busyId === v.id} busyPromote={busyPromote === v.id}
                          onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                          onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)}
                          onPromover={(para) => promoverPessoa(v, para)} />
                      ))}
                    </div>
                  </section>
                )}
                <section>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2" translate="no">
                    <List className="w-4 h-4" />
                    Todos os visitantes ({visitantes.length})
                  </h3>
                  <div className="grid gap-3">
                    {visitantes.map(v => (
                      <VisitanteCard key={v.id} v={v}
                        busy={busyId === v.id} busyPromote={busyPromote === v.id}
                        onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                        onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)}
                        onPromover={(para) => promoverPessoa(v, para)} />
                    ))}
                  </div>
                </section>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <VisitanteDialog
        open={!!selected}
        onOpenChange={open => { if (!open) setSelected(null); }}
        pessoa={selected}
        onSaved={load}
      />
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

// ── JornadaBar — barra de progresso Visitante → Congregado → Membro ────────────

function JornadaBar({ tipoPessoa, pronto }: { tipoPessoa: string; pronto: boolean }) {
  const currentIdx = ETAPAS_JORNADA.findIndex((s) => s.key === tipoPessoa);
  return (
    // flex-wrap: a trilha "Visitante -> Congregado -> Membro" nao quebrava e
    // media 394px, esticando o cartao para 431px numa tela de 375px.
    <div className="flex items-center gap-0.5 mt-1 flex-wrap">
      {ETAPAS_JORNADA.map((s, i) => {
        const isCurrent = i === currentIdx;
        const isDone    = i < currentIdx;
        const isNext    = i === currentIdx + 1 && pronto;
        return (
          <span key={s.key} className="flex items-center gap-0.5">
            {i > 0 && (
              <span className={`text-xs mx-0.5 ${isDone || isNext ? "text-muted-foreground" : "text-muted-foreground/30"}`}>→</span>
            )}
            <span className={[
              "text-xs font-medium px-1.5 py-0.5 rounded-full border transition-colors",
              isCurrent ? "bg-primary/10 text-primary border-primary/30" : "",
              isDone    ? "bg-success/10 text-success border-success/30" : "",
              isNext    ? "bg-success/15 text-success border-success/40 ring-1 ring-success/30" : "",
              !isCurrent && !isDone && !isNext ? "text-muted-foreground/40 border-transparent" : "",
            ].join(" ")}>
              {isNext && "✨ "}{s.label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ── VisitanteCard ─────────────────────────────────────────────────────────────

function VisitanteCard({ v, busy, busyPromote, variant, onOpen, onRetorno, onContato, onWhatsApp, onPromover }: {
  v:           VisitanteMembro;
  busy:        boolean;
  busyPromote: boolean;
  variant?:    "success";
  onOpen:      () => void;
  onRetorno:   () => void;
  onContato:   () => void;
  onWhatsApp:  () => void;
  onPromover:  (para: "congregado" | "membro") => void;
}) {
  const nv        = v.numero_visitas ?? 1;
  const etapa     = calcularEtapa(nv, v.created_at);
  const prio      = calcularPrioridade(nv, v.created_at);
  const prioStyle = PRIORIDADE_STYLE[prio];
  const dias      = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
  const iconBg    = variant === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning-text";
  const nome      = v.nome_completo.split(" ")[0];

  const evolucao = avaliarEvolucao({
    tipo_pessoa:         v.tipo_pessoa,
    numero_visitas:      nv,
    ultimo_contato_tipo: v.ultimo_contato_tipo ?? null,
    created_at:          v.created_at,
  });

  // M3.2 — abre WhatsApp com mensagem de sugestão pastoral
  const abrirWhatsAppSugestao = (msg: string) => {
    const cel = v.telefone_celular?.replace(/\D/g, "");
    if (!cel) return toast.error("Telefone nao cadastrado");
    window.open(`https://wa.me/${normalizarTelefone(cel)}?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Card className={`min-w-0 shadow-card-soft hover:shadow-elevated transition-shadow border-l-4 ${prioStyle.border}`}>
      <CardContent className="p-4">

        {/* Barra de jornada */}
        <JornadaBar tipoPessoa={v.tipo_pessoa} pronto={!!evolucao.sugestao} />

        <div className="flex items-start gap-3 mt-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}>
            <Sparkles className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">

            {/* Nome + badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link
                to={`/visitantes/${v.id}`}
                className="font-medium truncate hover:underline"
              >
                {v.nome_completo}
              </Link>
              <Badge variant="outline" className={`text-xs h-4 px-1.5 ${prioStyle.badge}`}>
                {prioStyle.label}
              </Badge>
              <Badge variant="outline" className="text-xs h-4 px-1.5">
                {ETAPA_LABEL[etapa]}
              </Badge>
            </div>

            {/* Meta */}
            <p className="text-xs text-muted-foreground" translate="no">
              {[formatarTelefoneSemDDI(v.telefone_celular), v.bairro].filter(Boolean).join(" - ") || "sem contato"}
              {" — "}Dia {dias} · {nv} {nv === 1 ? "visita" : "visitas"}
            </p>

            {/* M3.1 + M3.2 — Banner de evolução humanizado + ações sugeridas */}
            {evolucao.sugestao && (
              <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-1.5 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-success leading-snug" translate="no">
                        Este visitante pode estar pronto para dar o próximo passo
                      </p>
                      <p className="text-xs text-success/70 truncate" translate="no">
                        {evolucao.descricao}
                      </p>
                    </div>
                  </div>
                  <Button
                    className="shrink-0 text-xs h-11 px-3 gap-1 bg-success hover:bg-success/90 text-white border-0"
                    disabled={busyPromote}
                    onClick={() => onPromover(evolucao.sugestao!)}
                  >
                    <TrendingUp className="w-3 h-3" />
                    Promover
                  </Button>
                </div>
                {/* M3.2 — Ações pastorais sugeridas */}
                <div className="flex gap-1.5 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-11 px-3 gap-1 border-success/40 text-success hover:bg-success/10"
                    disabled={!v.telefone_celular}
                    onClick={() => abrirWhatsAppSugestao(
                      `Olá, ${nome}! 😊 Gostaríamos de te convidar para nossa célula de comunhão — um espaço para se conectar com mais irmãos e crescer juntos na fé. Você toparia participar? 💙`
                    )}
                  >
                    <MessageCircle className="w-3 h-3" />
                    Convidar para célula
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-11 px-3 gap-1 border-success/40 text-success hover:bg-success/10"
                    disabled={!v.telefone_celular}
                    onClick={() => abrirWhatsAppSugestao(
                      `Olá, ${nome}! 😊 Gostaríamos de marcar uma conversa para te conhecer melhor e acompanhar sua caminhada. Quando seria um bom momento? 💙`
                    )}
                  >
                    <Phone className="w-3 h-3" />
                    Agendar conversa
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Botões de ação — h-11 = 44px.
              Estavam em 24px: pouco mais do que o minimo absoluto da WCAG 2.2
              (SC 2.5.8) e bem abaixo dos 44px que Pessoas, Familias e
              Ministerios ja adotaram. Sao acoes de registro pastoral, usadas
              com o celular na mao. */}
          <div className="flex flex-col gap-1 shrink-0">
            <Button variant="outline" className="gap-1 text-xs h-11 px-3" disabled={busy} onClick={onRetorno}>
              <RotateCcw className="w-3.5 h-3.5" /> Retorno
            </Button>
            <Button variant="outline" className="gap-1 text-xs h-11 px-3" disabled={busy} onClick={onContato}>
              <Phone className="w-3.5 h-3.5" /> Contato
            </Button>
            <Button className="gap-1 text-xs h-11 px-3 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
              disabled={busy || !v.telefone_celular} onClick={onWhatsApp}>
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
