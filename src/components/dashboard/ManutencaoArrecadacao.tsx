import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertCircle, Wrench, ArrowRight, AlertTriangle } from "lucide-react";
import { carregarResumoManutencao, type ResumoManutencao } from "@/services/arrecadacaoService";

const CAT_ICONE: Record<string, string> = {
  eletrico: "🔌", hidraulico: "🚿", eletrodomestico: "🏠",
  mobiliario: "🪑", limpeza: "🧹", esquadrias: "🪟",
  estoque: "📦", outros: "🔧",
};

export function ManutencaoArrecadacao() {
  const [data, setData] = useState<ResumoManutencao | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarResumoManutencao().then(setData)
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

  if (!data || (data.total_aberto + data.total_andamento === 0)) {
    return (
      <div className="py-3 text-center text-xs text-emerald-700">
        ✓ Bazar e Cantina sem problemas de manutenção pendentes
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data.total_alta_prioridade > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 font-medium">
            🚨 {data.total_alta_prioridade} alta prioridade
          </span>
        )}
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          {data.total_aberto} aberto{data.total_aberto > 1 ? "s" : ""}
        </span>
        {data.total_andamento > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            {data.total_andamento} em andamento
          </span>
        )}
      </div>

      {/* Por categoria */}
      {data.por_categoria.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.por_categoria.slice(0, 6).map(c => (
            <span key={c.categoria} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">
              {CAT_ICONE[c.categoria] ?? "🔧"} {c.categoria} ({c.qtd})
            </span>
          ))}
        </div>
      )}

      {/* Recorrentes */}
      {data.recorrentes.length > 0 && (
        <div className="border-l-2 border-amber-400 pl-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-600" /> Recorrentes (180 dias)
          </div>
          <ul className="text-xs mt-1 space-y-0.5">
            {data.recorrentes.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-medium flex-1 truncate">{r.titulo}</span>
                <span className="text-rose-600 text-[10px]">{r.qtd}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link to="/arrecadacao/manutencao"
        className="text-xs text-gold hover:underline inline-flex items-center gap-1">
        Abrir manutenção <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
