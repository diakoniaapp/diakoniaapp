import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertCircle, Clock, ArrowRight } from "lucide-react";
import { buscarUrgentesIgreja, type UrgentesIgrejaResposta } from "@/services/assuntosService";

export function AssuntosUrgentes() {
  const [data, setData] = useState<UrgentesIgrejaResposta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    buscarUrgentesIgreja()
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

  if (!data || data.lista.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-emerald-700">
        ✓ Nenhum assunto urgente na igreja
      </div>
    );
  }

  const fmtPrazo = (p: string | null) => {
    if (!p) return "—";
    return new Date(p + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data.total_atrasados > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">
            🔴 {data.total_atrasados} atrasado{data.total_atrasados > 1 ? "s" : ""}
          </span>
        )}
        {data.total_vence_semana > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
            🟡 {data.total_vence_semana} vence essa semana
          </span>
        )}
      </div>

      <ul className="divide-y divide-border/40">
        {data.lista.map(a => (
          <li key={a.id} className="py-1.5 flex items-center gap-2 text-xs">
            <span className="shrink-0">
              {a.situacao === "atrasado"
                ? <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                : <Clock className="w-3.5 h-3.5 text-amber-600" />}
            </span>
            <span className="text-muted-foreground shrink-0 max-w-[8rem] truncate" title={a.responsavel_nome ?? ""}>
              {a.responsavel_nome ?? "Sem responsável"}
            </span>
            <span className="text-muted-foreground/50">→</span>
            <span className="flex-1 truncate">{a.titulo}</span>
            <span className={
              "text-[10px] tabular-nums shrink-0 " +
              (a.situacao === "atrasado" ? "text-rose-600 font-semibold" : "text-amber-700")
            }>
              {fmtPrazo(a.prazo)}
            </span>
          </li>
        ))}
      </ul>

      <div className="text-right">
        <Link to="/assuntos?filtro=urgentes" className="text-xs text-gold hover:underline inline-flex items-center gap-1">
          Ver todos e cobrar via WhatsApp <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
