import { useEffect, useState } from "react";
import { AlertTriangle, Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  verificarConflitoOcupacao,
  type ConflitoOcupacao,
} from "@/services/arrecadacaoService";
import { expandirOcorrencias } from "@/lib/agenda/recurrence";

/**
 * Aviso NÃO-BLOQUEANTE de conflito de ocupação.
 *
 * 1) Checa vw_ocupacao_local via RPC verifica_conflito_ocupacao
 *    → pega conflitos com EVENTOS materializados e outras reservas APROVADA/EM_USO
 *    no mesmo local físico.
 * 2) Expande eventos recorrentes (rrule) na janela do período pra detectar
 *    instâncias virtuais que a view não enxerga.
 *
 * Não bloqueia o submit — apenas mostra um card amarelo de aviso pra
 * a secretária decidir.
 */
interface Props {
  localId: string;           // id do local físico (não o espaço da arrecadação)
  periodoInicio: string;     // YYYY-MM-DDTHH:mm
  periodoFim: string;
  excluirRefId?: string;     // pra editar reserva sem o autoconflito
  origem?: "arrecadacao" | "evento";
}

interface ConflitoVisivel {
  fonte: "view" | "recorrente";
  titulo: string;
  inicio: string;
  fim: string;
  origem?: string;
}

export function AvisoConflitoOcupacao({
  localId, periodoInicio, periodoFim, excluirRefId, origem = "arrecadacao",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [conflitos, setConflitos] = useState<ConflitoVisivel[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!localId || !periodoInicio || !periodoFim) return;
    if (periodoFim <= periodoInicio) return;

    let cancelado = false;
    setLoading(true);
    setErro(null);

    (async () => {
      try {
        const achados: ConflitoVisivel[] = [];

        // 1) view (eventos materializados + outras reservas)
        try {
          const r: ConflitoOcupacao = await verificarConflitoOcupacao(
            localId, periodoInicio, periodoFim, origem, excluirRefId,
          );
          if (r.conflito) {
            achados.push({
              fonte: "view",
              titulo: r.origem === "evento" ? "Evento já agendado" : "Outra arrecadação",
              inicio: periodoInicio,
              fim: periodoFim,
              origem: r.origem,
            });
          }
        } catch (e: any) {
          // se a RPC falhou (ex: usuário sem permissão), seguimos com a checagem client
          if (!String(e?.message ?? "").includes("verifica_conflito_ocupacao")) {
            // só marca erro se for outro motivo
            setErro(e.message);
          }
        }

        // 2) recorrentes — buscar mestres do local na janela e expandir
        const ini = new Date(periodoInicio);
        const fim = new Date(periodoFim);
        const dataDe = isoData(ini);
        const dataAte = isoData(fim);

        const { data: eventos } = await supabase
          .from("eventos")
          .select(`
            id, titulo, data, hora_inicio, hora_fim,
            is_excecao, serie_origem_id, ocorrencia_original_data,
            recorrencia, local_id
          `)
          .eq("local_id", localId)
          .or(`recorrencia.not.is.null,and(data.gte.${dataDe},data.lte.${dataAte})`);

        if (eventos && eventos.length > 0) {
          // expande do início do dia ao fim do dia
          const fromExp = new Date(ini);
          fromExp.setHours(0, 0, 0, 0);
          const toExp = new Date(fim);
          toExp.setHours(23, 59, 59, 999);

          const ocorrencias = expandirOcorrencias(eventos as any, fromExp, toExp);

          for (const oc of ocorrencias) {
            // ignora a si mesmo
            if (excluirRefId && (oc.baseId === excluirRefId || oc.serieId === excluirRefId)) continue;
            const ocIni = combinarData(oc.data, oc.hora_inicio ?? "00:00");
            const ocFim = combinarData(oc.data, oc.hora_fim ?? "23:59", oc.hora_inicio);
            if (sobrepoe(ocIni, ocFim, ini, fim)) {
              achados.push({
                fonte: "recorrente",
                titulo: oc.titulo ?? "Evento recorrente",
                inicio: ocIni.toISOString(),
                fim: ocFim.toISOString(),
              });
            }
          }
        }

        if (!cancelado) setConflitos(achados);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();

    return () => { cancelado = true; };
  }, [localId, periodoInicio, periodoFim, excluirRefId, origem]);

  if (loading) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" /> verificando agenda...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="text-[11px] text-rose-700">
        Falha ao verificar agenda: {erro}
      </div>
    );
  }

  if (conflitos.length === 0) return null;

  return (
    <div className="border-2 border-amber-400 bg-amber-50/70 rounded-md p-3 space-y-2">
      <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
        <AlertTriangle className="w-4 h-4" />
        Atenção · há {conflitos.length} ocupação{conflitos.length > 1 ? "ões" : ""} no mesmo período
      </div>
      <ul className="space-y-1 text-xs">
        {conflitos.slice(0, 5).map((c, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <Calendar className="w-3 h-3 text-amber-700 mt-0.5 shrink-0" />
            <div>
              <span className="font-medium">{c.titulo}</span>
              <span className="text-muted-foreground ml-1">
                · {fmtBr(c.inicio)} → {fmtBr(c.fim)}
              </span>
              {c.fonte === "recorrente" && (
                <span className="ml-1 text-[10px] text-amber-700">(recorrente)</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-amber-700 italic">
        Este local permite uso simultâneo — a reserva pode prosseguir, mas confirme
        com o responsável do outro agendamento se houver risco de tumulto.
      </p>
    </div>
  );
}

function isoData(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function combinarData(dataYmd: string, hora: string, horaInicio?: string | null): Date {
  // se hora_fim < hora_inicio, soma 1 dia (vira a meia-noite)
  const [y, m, d] = dataYmd.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const base = new Date(y, m - 1, d, hh ?? 0, mm ?? 0);
  if (horaInicio) {
    const [ih, im] = horaInicio.split(":").map(Number);
    if (hh < ih || (hh === ih && mm < im)) {
      base.setDate(base.getDate() + 1);
    }
  }
  return base;
}

function sobrepoe(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && b1 < a2;
}

function fmtBr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}
