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
  UserPlus, TrendingUp, AlertTriangle, Phone,
  ArrowRight, Sparkles, RotateCcw, Zap, List, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  calcularEtapa, calcularPrioridade, getMensagem,
  buildWhatsAppLink, getStatusPorEtapa, ETAPA_LABEL, PRIORIDADE_STYLE, precisaAcao,
} from "@/lib/visitantesFluxo";

interface VisitanteMembro extends Membro {
  numero_visitas?: number | null;
  ultimo_contato_em?: string | null;
  created_at: string;
}

const DIAS_RETORNO = 15;

export default function Visitantes() {
  const [visitantes, setVisitantes] = useState<VisitanteMembro[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selected, setSelected]     = useState<VisitanteMembro | null>(null);
  const [busyId, setBusyId]         = useState<string | null>(null);

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

  const stats = useMemo(() => {
    const corte15 = new Date(Date.now() - DIAS_RETORNO * 86_400_000);
    const corte3  = new Date(Date.now() - 3 * 86_400_000);
    const retornaram      = visitantes.filter(v => (v.numero_visitas ?? 1) >= 2 && new Date(v.created_at) > corte15).length;
    const naoVoltaram     = visitantes.filter(v => (v.numero_visitas ?? 1) === 1 && new Date(v.created_at) < corte15).length;
    const precisamContato = visitantes.filter(v => precisaAcao(v.ultimo_contato_em)).length;
    const pendentesHoje   = visitantes.filter(v => precisaAcao(v.ultimo_contato_em) && new Date(v.created_at) < corte3).length;
    return { total: visitantes.length, retornaram, naoVoltaram, precisamContato, pendentesHoje };
  }, [visitantes]);

  const listaNaoVoltou = useMemo(
    () => visitantes.filter(v => (v.numero_visitas ?? 1) === 1 && new Date(v.created_at) < new Date(Date.now() - DIAS_RETORNO * 86_400_000)),
    [visitantes]
  );

  const listaRetorno = useMemo(
    () => visitantes.filter(v => (v.numero_visitas ?? 1) >= 2 && new Date(v.created_at) > new Date(Date.now() - DIAS_RETORNO * 86_400_000)),
    [visitantes]
  );

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
    const { error } = await supabase.from("membros")
      .update({ ultimo_contato_em: new Date().toISOString(), status_acolhimento: getStatusPorEtapa(etapa) })
      .eq("id", v.id);
    if (error) toast.error(error.message);
    else { toast.success("Contato registrado!"); load(); }
    setBusyId(null);
  };

  const abrirWhatsApp = (v: VisitanteMembro) => {
    const etapa = calcularEtapa(v.numero_visitas ?? 1, v.created_at);
    const link  = buildWhatsAppLink(v.telefone_celular, getMensagem(etapa, v.nome_completo));
    if (!link) return toast.error("Telefone nao cadastrado");
    window.open(link, "_blank", "noopener,noreferrer");
  };

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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<UserPlus className="w-5 h-5" />} label="Total visitantes" value={stats.total} />
          <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Retornaram (15d)" value={stats.retornaram} color="success" />
          <StatCard icon={<AlertTriangle className="w-5 h-5" />} label="Nao voltaram" value={stats.naoVoltaram} color="warning" />
          <StatCard icon={<Phone className="w-5 h-5" />} label="Precisam contato" value={stats.precisamContato} color={stats.precisamContato > 0 ? "warning" : undefined} />
        </div>

        <Tabs defaultValue="acao">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="acao" className="gap-1.5" translate="no">
              <Zap className="w-4 h-4" />
              Acao do dia
              {stats.pendentesHoje > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[10px]" variant="destructive">
                  {stats.pendentesHoje}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="nao_voltou" className="gap-1.5" translate="no">
              <AlertTriangle className="w-4 h-4" />
              Nao voltaram
              {listaNaoVoltou.length > 0 && (
                <Badge className="ml-1 h-4 px-1.5 text-[10px]" variant="outline">
                  {listaNaoVoltou.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="todos" className="gap-1.5" translate="no">
              <List className="w-4 h-4" />
              Todos
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
              <EmptyState message="Nenhum visitante pendente de retorno." />
            ) : (
              <div className="grid gap-3">
                {listaNaoVoltou.map(v => (
                  <VisitanteCard key={v.id} v={v} busy={busyId === v.id}
                    onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                    onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)} />
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
              <EmptyState message="Nenhum visitante cadastrado ainda." />
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
                        <VisitanteCard key={v.id} v={v} busy={busyId === v.id} variant="success"
                          onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                          onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)} />
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
                      <VisitanteCard key={v.id} v={v} busy={busyId === v.id}
                        onOpen={() => setSelected(v)} onRetorno={() => registrarRetorno(v)}
                        onContato={() => marcarContato(v)} onWhatsApp={() => abrirWhatsApp(v)} />
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

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color?: "success" | "warning";
}) {
  const cls = color === "success" ? "text-success" : color === "warning" ? "text-warning" : "";
  return (
    <Card className="shadow-card-soft">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs" translate="no">{icon} {label}</div>
        <div className={`font-serif text-2xl mt-1 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function VisitanteCard({ v, busy, variant, onOpen, onRetorno, onContato, onWhatsApp }: {
  v: VisitanteMembro; busy: boolean; variant?: "success";
  onOpen: () => void; onRetorno: () => void; onContato: () => void; onWhatsApp: () => void;
}) {
  const nv        = v.numero_visitas ?? 1;
  const etapa     = calcularEtapa(nv, v.created_at);
  const prio      = calcularPrioridade(nv, v.created_at);
  const prioStyle = PRIORIDADE_STYLE[prio];
  const dias      = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000);
  const iconBg    = variant === "success" ? "bg-success/15 text-success" : "bg-warning/15 text-warning";
  return (
    <Card className={`shadow-card-soft hover:shadow-elevated transition-shadow border-l-4 ${prioStyle.border}`}>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${iconBg}`}>
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="font-medium truncate cursor-pointer hover:underline" onClick={onOpen}>{v.nome_completo}</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${prioStyle.badge}`}>{prioStyle.label}</Badge>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{ETAPA_LABEL[etapa]}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {[v.telefone_celular, v.bairro].filter(Boolean).join(" - ") || "sem contato"}
            {" - "}Dia {dias} - {nv} {nv === 1 ? "visita" : "visitas"}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="outline" className="gap-1 text-[11px] h-6 px-2" disabled={busy} onClick={onRetorno}>
            <RotateCcw className="w-3 h-3" /> Retorno
          </Button>
          <Button size="sm" variant="outline" className="gap-1 text-[11px] h-6 px-2" disabled={busy} onClick={onContato}>
            <Phone className="w-3 h-3" /> Contato
          </Button>
          <Button size="sm" className="gap-1 text-[11px] h-6 px-2 bg-[#25D366] hover:bg-[#128C7E] text-white border-0"
            disabled={busy || !v.telefone_celular} onClick={onWhatsApp}>
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
