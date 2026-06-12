import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, AlertCircle, Clock, ArrowRight, MessageCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  carregarResumoFiscal, marcarAtrasados, montarAlertaFiscalWhatsApp, carregarConfig,
  type ResumoFiscalDashboard,
} from "@/services/fiscalService";

export function AgendaFiscalUrgente() {
  const [data, setData] = useState<ResumoFiscalDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    try {
      // Atualiza atrasados antes de carregar (idempotente)
      await marcarAtrasados();
      const resumo = await carregarResumoFiscal();
      setData(resumo);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); }, []);

  async function avisarWhats() {
    if (!data) return;
    try {
      const cfg = await carregarConfig();
      const { url } = montarAlertaFiscalWhatsApp(data, cfg?.whatsapp_tesouraria ?? null);
      window.open(url, "_blank");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  }

  if (loading) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1.5" /> Carregando...
      </div>
    );
  }

  if (!data || (data.total_atrasados + data.total_urgentes + data.total_proximos === 0)) {
    return (
      <div className="py-3 text-center text-xs">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 inline mr-1" />
        <span className="text-emerald-700">Tudo em ordem — nada fiscal pendente.</span>
        {data && data.total_pagos_mes > 0 && (
          <span className="text-muted-foreground"> ({data.total_pagos_mes} obrigação(ões) paga(s) este mês)</span>
        )}
      </div>
    );
  }

  const fmtData = (s: string) => new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {data.total_atrasados > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200 font-medium">
            🔴 {data.total_atrasados} atrasado{data.total_atrasados > 1 ? "s" : ""}
          </span>
        )}
        {data.total_urgentes > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
            🟡 {data.total_urgentes} urgente{data.total_urgentes > 1 ? "s" : ""}
          </span>
        )}
        {data.total_proximos > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            📅 {data.total_proximos} próximo{data.total_proximos > 1 ? "s" : ""}
          </span>
        )}
        {data.total_pagos_mes > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 ml-auto">
            ✓ {data.total_pagos_mes} pago{data.total_pagos_mes > 1 ? "s" : ""} no mês
          </span>
        )}
      </div>

      <ul className="divide-y divide-border/40">
        {data.proximos.map(a => (
          <li key={a.id} className="py-1.5 flex items-center gap-2 text-xs">
            <span className="text-base shrink-0">{a.icone}</span>
            <span className="flex-1 truncate">{a.nome}</span>
            <span className={
              "text-[10px] tabular-nums shrink-0 " +
              (a.severidade === "atrasado" ? "text-rose-600 font-semibold" :
               a.severidade === "urgente" ? "text-amber-700 font-medium" : "text-muted-foreground")
            }>
              {fmtData(a.vencimento)}
              {a.severidade === "atrasado" && ` · ${Math.abs(a.dias_para_vencer)}d atraso`}
              {a.severidade !== "atrasado" && a.dias_para_vencer === 0 && " · HOJE"}
              {a.severidade !== "atrasado" && a.dias_para_vencer > 0 && ` · em ${a.dias_para_vencer}d`}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button size="sm" variant="outline" className="text-[10px] gap-1 h-7"
          onClick={avisarWhats}>
          <MessageCircle className="w-3 h-3 text-emerald-600" /> Avisar tesouraria
        </Button>
        <Link to="/financas/fiscal" className="text-xs text-gold hover:underline inline-flex items-center gap-1">
          Ver agenda fiscal <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}
