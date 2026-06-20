import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Printer, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  format,
  addDays,
  addMonths,
  addYears,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

import {
  AgendaFiltros,
  AgendaView,
  AreaOpt,
  DEFAULT_FILTROS,
  EventoOcorrencia,
  EventoRow,
  LocalOpt,
  MinisterioOpt,
  RecorrenciaRegra,
  Resp,
} from "@/lib/agenda/types";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import { eventosExternos } from "@/lib/agenda/externalEvents";
import {
  fetchReservasAgenda, reservasComoOcorrencias, mapEspacoCodigoParaLocalId,
} from "@/lib/agenda/arrecadacao";
import { aniversariosNoIntervalo, type PessoaAniv } from "@/lib/agenda/birthdays";
import { AgendaFilters } from "@/components/agenda/AgendaFilters";
import { EventDialog, EventFormPayload } from "@/components/agenda/EventDialog";
import { EditScopeDialog, EditScope } from "@/components/agenda/EditScopeDialog";
import { MonthView, WeekView, DayView, ListView, VIEW_LABELS } from "@/components/agenda/AgendaViews";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import { PrintAgendaDialog } from "@/components/agenda/PrintAgendaDialog";
import { DuplicatesDialog } from "@/components/agenda/DuplicatesDialog";

const FILTROS_KEY = "agenda:filtros:v1";
const VIEW_KEY = "agenda:view:v1";

interface EvMin {
  id: string;
  evento_id: string;
  ministerio_id: string;
  responsabilidade: Resp;
}
interface EvArea {
  id: string;
  evento_id: string;
  area_id: string;
}

export default function Eventos() {
  const { canEdit } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Loaded data
  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [ministerios, setMinisterios] = useState<MinisterioOpt[]>([]);
  const [areas, setAreas] = useState<AreaOpt[]>([]);
  const [locais, setLocais] = useState<LocalOpt[]>([]);
  const [evMin, setEvMin] = useState<EvMin[]>([]);
  const [evArea, setEvArea] = useState<EvArea[]>([]);
  const [pessoasAniv, setPessoasAniv] = useState<PessoaAniv[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [refDate, setRefDate] = useState<Date>(() => startOfDay(new Date()));
  // F13: reservas da arrecadação como camada
  const [reservasOcc, setReservasOcc] = useState<EventoOcorrencia[]>([]);
  const [view, setView] = useState<AgendaView>(() => {
    const saved = localStorage.getItem(VIEW_KEY);
    return (saved as AgendaView) || "mes";
  });
  const [filtros, setFiltros] = useState<AgendaFiltros>(() => {
    try {
      const raw = localStorage.getItem(FILTROS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // F13b: migração — se o usuário tem filtro antigo sem 'arrecadacao',
        // adiciona automaticamente pra essa camada nova aparecer
        if (Array.isArray(parsed.categorias) && !parsed.categorias.includes("arrecadacao")) {
          parsed.categorias = [...parsed.categorias, "arrecadacao"];
        }
        return { ...DEFAULT_FILTROS, ...parsed };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_FILTROS;
  });

  // F13: aplicar ?locais=<id> da URL como filtro inicial (vindo da página Locais)
  useEffect(() => {
    const localFromUrl = searchParams.get("locais");
    if (localFromUrl && !filtros.locais.includes(localFromUrl)) {
      setFiltros((f) => ({ ...f, locais: [localFromUrl] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Dialog state
  const [editing, setEditing] = useState<EventoOcorrencia | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [defaultHora, setDefaultHora] = useState<string | undefined>();
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopePending, setScopePending] = useState<EventoOcorrencia | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(FILTROS_KEY, JSON.stringify(filtros));
  }, [filtros]);
  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  const effectiveView: AgendaView = isMobile ? "lista" : view;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ev, mn, ar, em, ea, lc, pa] = await Promise.all([
      supabase.from("eventos").select("*").order("data", { ascending: true }),
      supabase.from("ministerios").select("id, nome, sigla, ativo").order("nome"),
      supabase.from("areas").select("id, nome, ministerio_id, ativo").order("nome"),
      supabase.from("evento_ministerios").select("*"),
      supabase.from("evento_areas").select("*"),
      supabase.from("locais").select("id, nome, nome_completo, status, permite_agendamento").order("nome_completo"),
      supabase
        .from("membros")
        .select("id, nome_completo, data_nascimento, data_casamento, tipo_pessoa")
        .in("tipo_pessoa", ["membro", "congregado"])
        .or("data_nascimento.not.is.null,data_casamento.not.is.null"),
    ]);
    const firstError = [ev, mn, ar, em, ea, lc, pa].find((r: any) => r.error)?.error;
    if (firstError) {
      toast.error(firstError.message);
      setError(firstError.message);
    }
    setEventos((ev.data ?? []) as unknown as EventoRow[]);
    setMinisterios((mn.data ?? []) as MinisterioOpt[]);
    setAreas((ar.data ?? []) as AreaOpt[]);
    setEvMin((em.data ?? []) as EvMin[]);
    setEvArea((ea.data ?? []) as EvArea[]);
    setLocais((lc.data ?? []) as unknown as LocalOpt[]);
    setPessoasAniv((pa.data ?? []) as unknown as PessoaAniv[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  // Auto-include any new ministerios not yet in the persisted filter (fix invisible events bug)
  useEffect(() => {
    if (ministerios.length === 0) return;
    setFiltros((prev) => {
      const newMin = ministerios.map((m) => m.id).filter((id) => !prev.ministerios.includes(id));
      if (newMin.length === 0) return prev;
      return { ...prev, ministerios: [...prev.ministerios, ...newMin] };
    });
  }, [ministerios, setFiltros]);

  // Auto-include any new locais not yet in the persisted filter
  useEffect(() => {
    if (locais.length === 0) return;
    setFiltros((prev) => {
      const newLoc = locais.map((l) => l.id).filter((id) => !prev.locais.includes(id));
      if (newLoc.length === 0) return prev;
      return { ...prev, locais: [...prev.locais, ...newLoc] };
    });
  }, [locais, setFiltros]);

  // Auto-include any new areas not yet in the persisted filter
  useEffect(() => {
    if (areas.length === 0) return;
    setFiltros((prev) => {
      const newAr = areas.map((a) => a.id).filter((id) => !prev.areas.includes(id));
      if (newAr.length === 0) return prev;
      return { ...prev, areas: [...prev.areas, ...newAr] };
    });
  }, [areas, setFiltros]);

  // Handle ?novo=1 deep link
  useEffect(() => {
    if (searchParams.get("novo") === "1" && canEdit) {
      setEditing(null);
      setDefaultDate(format(new Date(), "yyyy-MM-dd"));
      setDefaultHora(undefined);
      setDialogOpen(true);
      searchParams.delete("novo");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, canEdit, setSearchParams]);

  // Determine visible window per view
  const [from, to] = useMemo<[Date, Date]>(() => {
    if (effectiveView === "mes") {
      return [
        startOfWeek(startOfMonth(refDate), { weekStartsOn: 0 }),
        endOfWeek(endOfMonth(refDate), { weekStartsOn: 0 }),
      ];
    }
    if (effectiveView === "semana") {
      return [startOfWeek(refDate, { weekStartsOn: 0 }), endOfWeek(refDate, { weekStartsOn: 0 })];
    }
    if (effectiveView === "dia") return [refDate, refDate];
    // lista: 90 dias a partir do refDate
    return [startOfDay(refDate), addDays(refDate, 90)];
  }, [refDate, effectiveView]);

  // F13: busca reservas e mapeia pra ocorrências
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [reservas, map] = await Promise.all([
          fetchReservasAgenda(from, to),
          mapEspacoCodigoParaLocalId(),
        ]);
        if (!cancelado) setReservasOcc(reservasComoOcorrencias(reservas, map));
      } catch (err) {
        console.warn("[agenda] falha ao carregar reservas:", err);
      }
    })();
    return () => { cancelado = true; };
  }, [from, to]);

  // Expand and filter
  const ocorrencias = useMemo(() => {
    const internos = expandirOcorrencias(eventos, from, to).map((o) => ({
      ...o,
      categoria: "igreja" as const,
    }));
    const externos = eventosExternos(from, to);
    const aniversarios = aniversariosNoIntervalo(pessoasAniv, from, to);
    const cats = filtros.categorias ?? ["igreja", "batista", "feriado", "aniversario", "casamento", "arrecadacao"];
    const all = [...internos, ...externos, ...aniversarios, ...reservasOcc].filter((o) => {
      const cat = o.categoria ?? "igreja";
      return cats.includes(cat);
    });
    const filtrado = all
      .filter((o) => {
        if (o.externalReadOnly && o.categoria !== "arrecadacao") return true; // externos sem filtros
        if (filtros.tipos.length && !filtros.tipos.includes(o.evento.tipo)) return false;
        if (filtros.status.length && !filtros.status.includes(o.evento.status)) return false;
        if (filtros.locais.length && !filtros.locais.includes(o.evento.local_id || "")) return false;
        const ems = evMin.filter((x) => x.evento_id === o.baseId).map((x) => x.ministerio_id);
        if (filtros.ministerios.length && !ems.some((id) => filtros.ministerios.includes(id))) return false;
        const eas = evArea.filter((x) => x.evento_id === o.baseId).map((x) => x.area_id);
        if (filtros.areas.length && !eas.some((id) => filtros.areas.includes(id))) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.data !== b.data) return a.data < b.data ? -1 : 1;
        const ha = a.evento.hora_inicio || "";
        const hb = b.evento.hora_inicio || "";
        return ha < hb ? -1 : ha > hb ? 1 : 0;
      });

    // F13 D: detectar uso compartilhado (mesmo local, mesmo dia, períodos sobrepostos)
    // Agrupa por (data, local_id); se 2+ ocorrências e há overlap por hora, marca todas.
    const byKey = new Map<string, typeof filtrado>();
    for (const o of filtrado) {
      const lid = o.evento.local_id;
      if (!lid) continue;
      const k = `${o.data}|${lid}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(o);
    }
    for (const grupo of byKey.values()) {
      if (grupo.length < 2) continue;
      const hasOverlap = grupo.some((a, i) =>
        grupo.slice(i + 1).some((b) => {
          const aIni = a.evento.hora_inicio ?? "00:00";
          const aFim = a.evento.hora_fim ?? "23:59";
          const bIni = b.evento.hora_inicio ?? "00:00";
          const bFim = b.evento.hora_fim ?? "23:59";
          return aIni < bFim && bIni < aFim;
        })
      );
      if (hasOverlap) {
        for (const o of grupo) {
          (o as any).compartilhado = true;
          if (!o.evento.titulo.startsWith("🤝")) {
            o.evento = { ...o.evento, titulo: `🤝 ${o.evento.titulo}` };
          }
        }
      }
    }
    return filtrado;
  }, [eventos, from, to, filtros, evMin, evArea, pessoasAniv, reservasOcc]);

  // Navigation
  const nav = (dir: -1 | 0 | 1) => {
    if (dir === 0) return setRefDate(startOfDay(new Date()));
    if (effectiveView === "mes") return setRefDate(addMonths(refDate, dir));
    if (effectiveView === "semana") return setRefDate(addDays(refDate, dir * 7));
    if (effectiveView === "dia") return setRefDate(addDays(refDate, dir));
    return setRefDate(addDays(refDate, dir * 30));
  };

  const headerLabel = useMemo(() => {
    if (effectiveView === "mes") return format(refDate, "MMMM 'de' yyyy", { locale: ptBR });
    if (effectiveView === "semana") {
      const s = startOfWeek(refDate, { weekStartsOn: 0 });
      const e = endOfWeek(refDate, { weekStartsOn: 0 });
      return `${format(s, "d MMM", { locale: ptBR })} – ${format(e, "d MMM yyyy", { locale: ptBR })}`;
    }
    if (effectiveView === "dia") return format(refDate, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    return format(refDate, "MMMM 'de' yyyy", { locale: ptBR });
  }, [refDate, effectiveView]);

  // ───── Save flow ─────
  const insertLinks = async (
    eventoId: string,
    mins: { ministerio_id: string; responsabilidade: Resp }[],
    ars: string[],
  ) => {
    await supabase.from("evento_ministerios").delete().eq("evento_id", eventoId);
    await supabase.from("evento_areas").delete().eq("evento_id", eventoId);
    if (mins.length) {
      const { error } = await supabase
        .from("evento_ministerios")
        .insert(mins.map((x) => ({ ...x, evento_id: eventoId })));
      if (error) throw error;
    }
    if (ars.length) {
      const { error } = await supabase
        .from("evento_areas")
        .insert(ars.map((area_id) => ({ area_id, evento_id: eventoId })));
      if (error) throw error;
    }
  };

  const corePayload = (p: EventFormPayload) => ({
    titulo: p.titulo,
    tipo: p.tipo,
    data: p.data,
    hora_inicio: p.hora_inicio || null,
    hora_fim: p.hora_fim || null,
    local_id: p.local_id,
    descricao: p.descricao || null,
    status: p.status,
    cor: p.cor,
    ministerio_principal_id: p.ministerio_principal_id,
    local: p.local_id
      ? locais.find((l) => l.id === p.local_id)?.nome_completo || locais.find((l) => l.id === p.local_id)?.nome || null
      : null,
  });

  const handleSubmit = async (payload: EventFormPayload) => {
    try {
      // CREATE
      if (!editing) {
        const base = corePayload(payload);
        const insertBody = { ...base, recorrencia_regra: payload.recorrencia } as never;
        const { data, error } = await supabase.from("eventos").insert(insertBody).select("id").single();
        if (error) throw error;
        const newId = data!.id as string;
        // Para séries, setar recorrencia_id = id
        if (payload.recorrencia) {
          await supabase.from("eventos").update({ recorrencia_id: newId }).eq("id", newId);
        }
        await insertLinks(newId, payload.ministerios, payload.areas);
        toast.success("Evento criado");
        setDialogOpen(false);
        await load();
        return;
      }

      // EDIT — usar scope
      const occ = editing;
      const baseRow = occ.evento;
      const partOfSeries = !!occ.serieId;
      const scope: EditScope = (occ as unknown as { __scope?: EditScope }).__scope || "este";

      // Caso 1: evento simples (sem série) ou exceção
      if (!partOfSeries || occ.isExcecao) {
        const base = corePayload(payload);
        const updateBody = { ...base, recorrencia_regra: payload.recorrencia } as never;
        const { error } = await supabase.from("eventos").update(updateBody).eq("id", baseRow.id);
        if (error) throw error;
        await insertLinks(baseRow.id, payload.ministerios, payload.areas);
        toast.success("Evento atualizado");
        setDialogOpen(false);
        await load();
        return;
      }

      // Série recorrente
      const masterId = occ.serieId!;
      if (scope === "serie") {
        const base = corePayload(payload);
        const updateBody = { ...base, recorrencia_regra: payload.recorrencia } as never;
        const { error } = await supabase.from("eventos").update(updateBody).eq("id", masterId);
        if (error) throw error;
        await insertLinks(masterId, payload.ministerios, payload.areas);
        toast.success("Série atualizada");
      } else if (scope === "este") {
        // Criar/atualizar exceção
        const base = corePayload(payload);
        const exceptionBody = {
          ...base,
          recorrencia_id: masterId,
          recorrencia_regra: null,
          is_excecao: true,
          serie_origem_id: masterId,
          ocorrencia_original_data: occ.ocorrencia_original_data || occ.data,
        } as never;
        const { data, error } = await supabase.from("eventos").insert(exceptionBody).select("id").single();
        if (error) throw error;
        await insertLinks(data!.id, payload.ministerios, payload.areas);
        toast.success("Ocorrência atualizada");
      } else if (scope === "futuros") {
        // Encerrar série em (occ.data - 1) e criar nova série a partir de occ.data
        const cutoff = format(addDays(new Date(occ.data), -1), "yyyy-MM-dd");
        const currentMasterReg = eventos.find((e) => e.id === masterId)?.recorrencia_regra;
        if (currentMasterReg) {
          const novaRegra: RecorrenciaRegra = {
            ...currentMasterReg,
            fim: { tipo: "data", data: cutoff },
          };
          const { error: e1 } = await supabase
            .from("eventos")
            .update({ recorrencia_regra: novaRegra } as never)
            .eq("id", masterId);
          if (e1) throw e1;
        }
        // Criar novo master
        const base = corePayload(payload);
        const newMasterBody = { ...base, recorrencia_regra: payload.recorrencia } as never;
        const { data, error: e2 } = await supabase.from("eventos").insert(newMasterBody).select("id").single();
        if (e2) throw e2;
        const newId = data!.id as string;
        await supabase.from("eventos").update({ recorrencia_id: newId }).eq("id", newId);
        await insertLinks(newId, payload.ministerios, payload.areas);
        toast.success("Série atualizada a partir desta data");
      }
      setDialogOpen(false);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    }
  };

  // ───── Open dialogs ─────
  const openCreate = (date?: Date, hora?: string) => {
    if (!canEdit) return;
    setEditing(null);
    setDefaultDate(date ? format(date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"));
    setDefaultHora(hora);
    setDialogOpen(true);
  };

  const openEdit = (occ: EventoOcorrencia) => {
    if (occ.categoria === "arrecadacao") {
      // F13: link inteligente pra reserva (camada de arrecadação)
      window.location.href = `/arrecadacao/reserva/${occ.baseId}`;
      return;
    }
    if (occ.externalReadOnly) {
      toast.message(occ.evento.titulo, {
        description: occ.evento.descricao ?? undefined,
      });
      return;
    }
    if (!canEdit) return;
    const isRecurringSeries = !!occ.serieId && !occ.isExcecao;
    if (isRecurringSeries) {
      setScopePending(occ);
      setScopeOpen(true);
      return;
    }
    setEditing(occ);
    setDialogOpen(true);
  };

  const handleScope = (scope: EditScope) => {
    if (!scopePending) return;
    const occ = { ...scopePending, __scope: scope } as EventoOcorrencia;
    setEditing(occ);
    setScopeOpen(false);
    setScopePending(null);
    setDialogOpen(true);
  };

  // Initial dialog data
  const initialMins = editing
    ? evMin
        .filter((x) => x.evento_id === editing.baseId)
        .map((x) => ({ ministerio_id: x.ministerio_id, responsabilidade: x.responsabilidade }))
    : [];
  const initialAreas = editing ? evArea.filter((x) => x.evento_id === editing.baseId).map((x) => x.area_id) : [];

  return (
    <div>
      <PageHeader
        title="Agenda"
        description={loading ? "Carregando…" : `${ocorrencias.length} eventos no período`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setDupOpen(true)}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicados
            </Button>
            <Button variant="outline" onClick={() => setPrintOpen(true)}>
              <Printer className="w-4 h-4 mr-2" />
              Imprimir / PDF
            </Button>
            {canEdit && (
              <Button onClick={() => openCreate()}>
                <Plus className="w-4 h-4 mr-2" />
                Novo evento
              </Button>
            )}
          </div>
        }
      />

      <div className="p-4 md:p-8 space-y-4">
        {/* Toolbar */}
        <Card className="shadow-card-soft">
          <CardContent className="p-3 md:p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => nav(0)}>
                Hoje
              </Button>
              <div className="flex">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(-1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => nav(1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <h2 className="font-serif text-lg md:text-xl capitalize ml-1">{headerLabel}</h2>

              {!isMobile && (
                <div className="ml-auto">
                  <Tabs value={view} onValueChange={(v) => setView(v as AgendaView)}>
                    <TabsList>
                      <TabsTrigger value="dia">{VIEW_LABELS.dia}</TabsTrigger>
                      <TabsTrigger value="semana">{VIEW_LABELS.semana}</TabsTrigger>
                      <TabsTrigger value="mes">{VIEW_LABELS.mes}</TabsTrigger>
                      <TabsTrigger value="lista">{VIEW_LABELS.lista}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}
            </div>

            <AgendaFilters
              filtros={filtros}
              onChange={setFiltros}
              ministerios={ministerios.filter((m) => m.ativo)}
              areas={areas.filter((a) => a.ativo)}
              locais={locais}
            />

            {/* Ações sempre visíveis (especialmente no mobile) */}
            <div className="flex flex-wrap items-center gap-2 md:hidden">
              <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)} className="flex-1 min-w-[140px]">
                <Printer className="w-4 h-4 mr-2" /> Imprimir
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDupOpen(true)} className="flex-1 min-w-[140px]">
                <Copy className="w-4 h-4 mr-2" /> Duplicados
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Views */}
        <div className={cn("rounded-lg", effectiveView === "lista" && "max-w-3xl mx-auto")}>
          {loading ? (
            <ListSkeleton count={4} className="grid gap-3" />
          ) : error ? (
            <ErrorState onRetry={load} />
          ) : ocorrencias.length === 0 ? (
            <EmptyState message="Nenhum evento neste período" />
          ) : (
            <>
              {effectiveView === "mes" && (
                <MonthView
                  refDate={refDate}
                  ocorrencias={ocorrencias}
                  colorBy={filtros.colorBy}
                  ministerios={ministerios}
                  onEventClick={openEdit}
                  onSlotClick={(d) => {
                    setRefDate(d);
                    setView("dia");
                  }}
                />
              )}
              {effectiveView === "semana" && (
                <WeekView
                  refDate={refDate}
                  ocorrencias={ocorrencias}
                  colorBy={filtros.colorBy}
                  ministerios={ministerios}
                  onEventClick={openEdit}
                  onSlotClick={(d, h) => openCreate(d, h)}
                />
              )}
              {effectiveView === "dia" && (
                <DayView
                  refDate={refDate}
                  ocorrencias={ocorrencias}
                  colorBy={filtros.colorBy}
                  ministerios={ministerios}
                  onEventClick={openEdit}
                  onSlotClick={(d, h) => openCreate(d, h)}
                />
              )}
              {effectiveView === "lista" && (
                <ListView
                  ocorrencias={ocorrencias}
                  colorBy={filtros.colorBy}
                  ministerios={ministerios}
                  onEventClick={openEdit}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* FAB mobile */}
      {isMobile && canEdit && (
        <button
          onClick={() => openCreate()}
          className="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform z-40"
          aria-label="Novo evento"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      <EditScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} onChoose={handleScope} action="editar" />

      <PrintAgendaDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        filtrosAtuais={filtros}
        ministerios={ministerios}
        areas={areas}
        locais={locais}
        refDate={refDate}
      />

      <DuplicatesDialog
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        ocorrencias={ocorrencias}
        onChanged={load}
      />

      <EventDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        ocorrencia={editing}
        defaultDate={defaultDate}
        defaultHora={defaultHora}
        ministerios={ministerios}
        areas={areas}
        locais={locais}
        initialMinisterios={initialMins}
        initialAreas={initialAreas}
        onSubmit={handleSubmit}
      />

      {/* Hide unused-import warning */}
      <span className="hidden">
        <CalendarDays />
      </span>
    </div>
  );
}
