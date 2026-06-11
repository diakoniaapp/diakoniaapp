import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Calendar, Clock, AlertTriangle, CheckCircle2, Loader2,
  TrendingUp, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarProximosVencimentos, confirmarPagamento, brl,
  type FinVencimento,
} from "@/services/finService";

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const URGENCIA_INFO: Record<FinVencimento["urgencia"], { cor: string; label: string }> = {
  vencido:      { cor: "text-rose-700 bg-rose-50 border-rose-200",        label: "Vencido" },
  vence_hoje:   { cor: "text-amber-700 bg-amber-50 border-amber-300",      label: "Vence hoje" },
  urgente:      { cor: "text-amber-700 bg-amber-50/60 border-amber-200",   label: "Urgente" },
  esta_semana:  { cor: "text-blue-700 bg-blue-50 border-blue-200",         label: "Esta semana" },
  futuro:       { cor: "text-muted-foreground border-border",              label: "Futuro" },
};

export default function FinancasAgenda() {
  const [vencimentos, setVencimentos] = useState<FinVencimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "entrada" | "saida">("saida");

  useEffect(() => { carregar(); }, [filtroTipo]);

  async function carregar() {
    setLoading(true);
    try {
      const ate30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const data = await listarProximosVencimentos({
        ateData: ate30,
        tipo: filtroTipo !== "todos" ? filtroTipo : undefined,
      });
      setVencimentos(data);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function confirmar(v: FinVencimento) {
    if (!confirm(`Confirmar ${v.tipo === "saida" ? "pagamento" : "recebimento"} de ${brl(Number(v.valor))}?`)) return;
    try {
      await confirmarPagamento(v.id);
      toast.success(`${v.tipo === "saida" ? "Pago" : "Recebido"}!`);
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  // Agrupa por urgência
  const grupos: Record<string, FinVencimento[]> = { vencido: [], vence_hoje: [], urgente: [], esta_semana: [], futuro: [] };
  vencimentos.forEach(v => grupos[v.urgencia].push(v));

  const totalSaidas = vencimentos.filter(v => v.tipo === "saida").reduce((s, v) => s + Number(v.valor), 0);
  const totalEntradas = vencimentos.filter(v => v.tipo === "entrada").reduce((s, v) => s + Number(v.valor), 0);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando agenda...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gold" /> Agenda Financeira
          </h1>
          <p className="text-xs text-muted-foreground">Próximos 30 dias — vencimentos e recebimentos previstos</p>
        </div>
        <Link to="/financas/recorrencias">
          <Button variant="outline" size="sm">Gerenciar recorrências</Button>
        </Link>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Mostrar:</span>
        {(["saida", "entrada", "todos"] as const).map(t => (
          <Button key={t} size="sm" variant={filtroTipo === t ? "default" : "outline"}
            onClick={() => setFiltroTipo(t)}
            className={
              filtroTipo === t
                ? t === "entrada" ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
                  t === "saida"   ? "bg-rose-600 hover:bg-rose-700 text-white" : ""
                : ""
            }>
            {t === "saida" ? "A pagar" : t === "entrada" ? "A receber" : "Tudo"}
          </Button>
        ))}
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-rose-50/30 border-rose-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-rose-700 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> A pagar (30d)</p>
            <p className="text-base font-semibold text-rose-700 tabular-nums">{brl(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-50/30 border-emerald-200">
          <CardContent className="py-2 px-3">
            <p className="text-[10px] uppercase text-emerald-700 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> A receber (30d)</p>
            <p className="text-base font-semibold text-emerald-700 tabular-nums">{brl(totalEntradas)}</p>
          </CardContent>
        </Card>
      </div>

      {vencimentos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground text-sm space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto opacity-30 text-emerald-500" />
            <p>Nenhum vencimento previsto nos próximos 30 dias.</p>
            <Link to="/financas/recorrencias" className="text-primary underline text-xs">
              Cadastrar recorrência →
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(["vencido","vence_hoje","urgente","esta_semana","futuro"] as const).map(u => {
            const lista = grupos[u];
            if (lista.length === 0) return null;
            const info = URGENCIA_INFO[u];
            return (
              <div key={u} className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground px-1">
                  {u === "vencido" && <AlertTriangle className="w-3 h-3 inline mr-1 text-rose-600" />}
                  {info.label} ({lista.length})
                </p>
                {lista.map(v => (
                  <div key={v.id} className={`flex items-center justify-between border rounded-md px-3 py-2 ${info.cor}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {v.tipo === "entrada"
                        ? <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                        : <TrendingDown className="w-4 h-4 text-rose-600 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{v.descricao ?? "—"}</p>
                        <p className="text-[10px] flex items-center gap-1.5">
                          <Clock className="w-2.5 h-2.5" /> {dataBr(v.data)}
                          {v.dias_para_vencer >= 0
                            ? <> · em <strong>{v.dias_para_vencer}d</strong></>
                            : <> · <strong>{-v.dias_para_vencer}d em atraso</strong></>}
                          {v.conta_nome && <> · {v.conta_nome}</>}
                          {v.fornecedor_nome && <> · {v.fornecedor_nome}</>}
                        </p>
                      </div>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums mr-2 ${v.tipo === "entrada" ? "text-emerald-700" : "text-rose-700"}`}>
                      {brl(Number(v.valor))}
                    </p>
                    <Button size="sm" onClick={() => confirmar(v)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 h-7 text-[11px]">
                      <CheckCircle2 className="w-3 h-3" /> {v.tipo === "saida" ? "Pagar" : "Receber"}
                    </Button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
