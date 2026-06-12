import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { buscarMeusAssuntos, type MeusAssuntosResposta, PRIORIDADE_ICONE } from "@/services/assuntosService";

export function MeusAssuntos() {
  const [data, setData] = useState<MeusAssuntosResposta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buscarMeusAssuntos()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Carregando...
      </div>
    );
  }

  if (!data || data.total_abertos === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        Nenhum assunto sob sua responsabilidade ✓
      </div>
    );
  }

  const fmtPrazo = (p: string | null) => {
    if (!p) return "sem prazo";
    return new Date(p + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">{data.total_abertos} aberto{data.total_abertos > 1 ? "s" : ""}</span>
        {data.total_atrasados > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
            🔴 {data.total_atrasados} atrasado{data.total_atrasados > 1 ? "s" : ""}
          </span>
        )}
        {data.total_vence_breve > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
            🟡 {data.total_vence_breve} vence em breve
          </span>
        )}
        {data.total_parados > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
            ⏸ {data.total_parados} parado{data.total_parados > 1 ? "s" : ""}
          </span>
        )}
      </div>

      <ul className="divide-y divide-border/40">
        {data.proximos.map(a => (
          <li key={a.id} className="py-1.5 flex items-center gap-2 text-xs">
            <span className="shrink-0">
              {a.situacao === "atrasado" && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
              {a.situacao === "vence_breve" && <Clock className="w-3.5 h-3.5 text-amber-600" />}
              {a.situacao === "parado" && <Clock className="w-3.5 h-3.5 text-purple-600" />}
              {a.situacao === "normal" && <span className="text-sm">{PRIORIDADE_ICONE[a.prioridade]}</span>}
            </span>
            <span className="flex-1 truncate">{a.titulo}</span>
            <span className={
              "text-[10px] tabular-nums shrink-0 " +
              (a.situacao === "atrasado" ? "text-rose-600 font-semibold" :
               a.situacao === "vence_breve" ? "text-amber-700" : "text-muted-foreground")
            }>
              {fmtPrazo(a.prazo)}
            </span>
          </li>
        ))}
      </ul>

      <div className="text-right">
        <Link to="/assuntos" className="text-xs text-gold hover:underline inline-flex items-center gap-1">
          Abrir todos <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
