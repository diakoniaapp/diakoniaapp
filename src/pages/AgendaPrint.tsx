import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";
import { eventosExternos } from "@/lib/agenda/externalEvents";
import { aniversariosNoIntervalo, type PessoaAniv } from "@/lib/agenda/birthdays";
import type { CategoriaEvento, EventoOcorrencia, EventoRow, EventoStatus, EventoTipo } from "@/lib/agenda/types";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface Min { id: string; nome: string; sigla: string | null; }
interface Area { id: string; nome: string; }
interface EvMin { evento_id: string; ministerio_id: string; responsabilidade: string; }
interface EvArea { evento_id: string; area_id: string; }

export default function AgendaPrint() {
  const [sp] = useSearchParams();
  const inicio = sp.get("inicio") || format(new Date(), "yyyy-MM-dd");
  const fim = sp.get("fim") || inicio;
  const fMins = (sp.get("ministerios") || "").split(",").filter(Boolean);
  const fLocs = (sp.get("locais") || "").split(",").filter(Boolean);
  const fTipos = (sp.get("tipos") || "").split(",").filter(Boolean) as EventoTipo[];
  const fStatus = (sp.get("status") || "").split(",").filter(Boolean) as EventoStatus[];
  const fCats = ((sp.get("categorias") || "igreja,batista,feriado,aniversario,casamento").split(",").filter(Boolean)) as CategoriaEvento[];

  const [eventos, setEventos] = useState<EventoRow[]>([]);
  const [mins, setMins] = useState<Min[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [evMin, setEvMin] = useState<EvMin[]>([]);
  const [evArea, setEvArea] = useState<EvArea[]>([]);
  const [pessoasAniv, setPessoasAniv] = useState<PessoaAniv[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Eventos do período (inclui ocorrências-base) + mestres recorrentes anteriores
      const [ev, mn, ar, em, ea] = await Promise.all([
        supabase.from("eventos").select("*").gte("data", inicio).lte("data", fim).limit(10000),
        supabase.from("ministerios").select("id, nome, sigla"),
        supabase.from("areas").select("id, nome"),
        supabase.from("evento_ministerios").select("evento_id, ministerio_id, responsabilidade").limit(20000),
        supabase.from("evento_areas").select("evento_id, area_id").limit(20000),
      ]);
      const { data: pa } = await supabase
        .from("membros")
        .select("id, nome_completo, data_nascimento, data_casamento, tipo_pessoa")
        .in("tipo_pessoa", ["membro", "congregado"])
        .or("data_nascimento.not.is.null,data_casamento.not.is.null");
      const { data: masters } = await supabase
        .from("eventos")
        .select("*")
        .not("recorrencia_regra", "is", null)
        .lt("data", inicio)
        .limit(10000);
      // Dedupe por id (mestre pode aparecer em ambos)
      const map = new Map<string, EventoRow>();
      for (const e of (ev.data ?? []) as unknown as EventoRow[]) map.set(e.id, e);
      for (const e of (masters ?? []) as unknown as EventoRow[]) map.set(e.id, e);
      setEventos(Array.from(map.values()));
      setMins((mn.data ?? []) as Min[]);
      setAreas((ar.data ?? []) as Area[]);
      setEvMin((em.data ?? []) as EvMin[]);
      setEvArea((ea.data ?? []) as EvArea[]);
      setPessoasAniv((pa ?? []) as unknown as PessoaAniv[]);
      setLoading(false);
    })();
  }, [inicio, fim]);

  const ocorrencias = useMemo<EventoOcorrencia[]>(() => {
    const from = parseISO(inicio);
    const to = parseISO(fim);
    const internos = expandirOcorrencias(eventos, from, to).map((o) => ({ ...o, categoria: "igreja" as const }));
    const externos = eventosExternos(from, to);
    const aniversarios = aniversariosNoIntervalo(pessoasAniv, from, to);
    const all = [...internos, ...externos, ...aniversarios].filter((o) => {
      const cat = o.categoria ?? "igreja";
      if (!fCats.includes(cat)) return false;
      if (o.externalReadOnly) return true;
      if (fTipos.length && !fTipos.includes(o.evento.tipo)) return false;
      if (fStatus.length && !fStatus.includes(o.evento.status)) return false;
      if (fLocs.length && !fLocs.includes(o.evento.local_id || "")) return false;
      if (fMins.length) {
        const ems = evMin.filter((x) => x.evento_id === o.baseId).map((x) => x.ministerio_id);
        if (!ems.some((id) => fMins.includes(id))) return false;
      }
      return true;
    });
    // dedupe por chave de ocorrência
    const seen = new Set<string>();
    const deduped: EventoOcorrencia[] = [];
    for (const o of all) {
      const k = `${o.evento.titulo}|${o.data}|${o.evento.hora_inicio ?? ""}|${o.evento.local_id ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(o);
    }
    return deduped.sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return (a.evento.hora_inicio ?? "") < (b.evento.hora_inicio ?? "") ? -1 : 1;
    });
  }, [eventos, inicio, fim, evMin, fCats, fTipos, fStatus, fLocs, fMins, pessoasAniv]);

  const grupos = useMemo(() => {
    const map = new Map<string, EventoOcorrencia[]>();
    ocorrencias.forEach((o) => {
      const arr = map.get(o.data) || []; arr.push(o); map.set(o.data, arr);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [ocorrencias]);

  const ministerioById = useMemo(() => new Map(mins.map(m => [m.id, m])), [mins]);
  const areaById = useMemo(() => new Map(areas.map(a => [a.id, a])), [areas]);
  const minsOf = (id: string) => evMin.filter(x => x.evento_id === id);
  const areasOf = (id: string) => evArea.filter(x => x.evento_id === id);

  useEffect(() => {
    document.title = `Agenda — ${format(parseISO(inicio), "dd/MM/yyyy")} a ${format(parseISO(fim), "dd/MM/yyyy")}`;
  }, [inicio, fim]);

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 18mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-doc { font-family: Georgia, 'Times New Roman', serif; }
        .ev { page-break-inside: avoid; }
        .day-block { page-break-inside: avoid; }
      `}</style>

      <div className="no-print sticky top-0 bg-white border-b px-6 py-3 flex items-center gap-3">
        <Button onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" />Imprimir / Salvar PDF</Button>
        <span className="text-sm text-neutral-600">Use a opção “Salvar como PDF” na janela de impressão.</span>
      </div>

      <div className="print-doc max-w-4xl mx-auto px-8 py-10">
        <header className="border-b-2 border-black pb-4 mb-6">
          <div className="text-xs tracking-[0.25em] uppercase text-neutral-600">DIAKONIA · Igreja</div>
          <h1 className="text-3xl font-bold mt-1">Agenda da Igreja</h1>
          <p className="text-sm text-neutral-700 mt-1">
            Período: {format(parseISO(inicio), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            {" "}a{" "}
            {format(parseISO(fim), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </header>

        {loading ? (
          <p className="text-neutral-600">Carregando agenda…</p>
        ) : grupos.length === 0 ? (
          <p className="text-neutral-600">Nenhum evento neste período.</p>
        ) : (
          <div className="space-y-6">
            {grupos.map(([ymd, list]) => {
              const d = parseISO(ymd);
              return (
                <section key={ymd} className="day-block">
                  <h2 className="text-lg font-bold uppercase tracking-wide border-b border-neutral-400 pb-1 mb-2">
                    {format(d, "EEEE", { locale: ptBR })} — {format(d, "dd/MM/yyyy")}
                  </h2>
                  <ul className="space-y-2">
                    {list.map((o) => {
                      const hi = o.evento.hora_inicio?.slice(0, 5);
                      const hf = o.evento.hora_fim?.slice(0, 5);
                      const horario = hi && hf ? `${hi} – ${hf}` : hi ? hi : "Dia todo";
                      const local = o.evento.local || "";
                      const ms = minsOf(o.baseId);
                      const principal = ms.find(m => m.responsabilidade === "principal");
                      const apoio = ms.filter(m => m.responsabilidade === "apoio");
                      const arNames = areasOf(o.baseId).map(a => areaById.get(a.area_id)?.nome).filter(Boolean);
                      const principalNome = principal && ministerioById.get(principal.ministerio_id)?.nome;
                      const apoioNomes = apoio.map(a => ministerioById.get(a.ministerio_id)?.nome).filter(Boolean);

                      return (
                        <li key={o.key} className="ev flex gap-3">
                          <div className="w-28 shrink-0 font-semibold tabular-nums">{horario}</div>
                          <div className="flex-1">
                            <div className="font-semibold">
                              {o.evento.titulo}
                              {o.categoria === "feriado" && <span className="ml-2 text-xs uppercase text-neutral-600">[Feriado]</span>}
                              {o.categoria === "batista" && <span className="ml-2 text-xs uppercase text-neutral-600">[Institucional Batista]</span>}
                              {o.categoria === "aniversario" && <span className="ml-2 text-xs uppercase text-neutral-600">[Aniversário]</span>}
                              {o.categoria === "casamento" && <span className="ml-2 text-xs uppercase text-neutral-600">[Casamento]</span>}
                              {o.evento.status === "cancelado" && <span className="ml-2 text-xs uppercase text-red-700">[Cancelado]</span>}
                            </div>
                            <div className="text-sm text-neutral-700">
                              {local && <>Local: {local}{(principalNome || arNames.length) ? " · " : ""}</>}
                              {principalNome && <>Responsável: {principalNome}</>}
                              {apoioNomes.length > 0 && <> · Apoio: {apoioNomes.join(", ")}</>}
                              {arNames.length > 0 && <> · Áreas: {arNames.join(", ")}</>}
                            </div>
                            {o.evento.descricao && <div className="text-sm text-neutral-600 mt-0.5">{o.evento.descricao}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}

        <footer className="mt-10 pt-3 border-t text-xs text-neutral-500 flex justify-between">
          <span>Gerado em {format(new Date(), "dd/MM/yyyy HH:mm")}</span>
          <span>Sistema DIAKONIA</span>
        </footer>
      </div>
    </div>
  );
}