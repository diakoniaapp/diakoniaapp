import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Layers, Loader2, Calendar, TrendingUp, TrendingDown,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarLancamentos, comprovanteSignedUrl, brl,
  type FinLancamentoExtenso,
} from "@/services/finService";
import { supabase } from "@/integrations/supabase/client";
import { PaginaSkeleton } from "@/components/ListState";

interface CentroInfo {
  id: string; nome: string;
  vinculo_tipo: string;
  vinculo_nome: string | null;
  cor: string | null;
}

function dataBr(s: string) {
  return new Date(s + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function FinancasCentroDetalhe() {
  const { centroId = "" } = useParams();
  const [centro, setCentro] = useState<CentroInfo | null>(null);
  const [lancs, setLancs] = useState<FinLancamentoExtenso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, [centroId]);

  async function carregar() {
    if (!centroId) return;
    setLoading(true);
    try {
      const { data: c } = await supabase
        .from("fin_centros_custo")
        .select("id, nome, vinculo_tipo, vinculo_nome, cor")
        .eq("id", centroId).maybeSingle();
      setCentro(c as any);

      const ls = await listarLancamentos({ centroCustoId: centroId });
      setLancs(ls);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function abrirComprovante(path: string) {
    const url = await comprovanteSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  // Agrupar por mês
  const porMes = useMemo(() => {
    const map = new Map<string, { gasto: number; recebido: number; qtd: number }>();
    lancs.forEach(l => {
      if (l.status !== "realizado" && l.status !== "conciliado") return;
      const key = l.data.slice(0, 7); // YYYY-MM
      const ex = map.get(key) ?? { gasto: 0, recebido: 0, qtd: 0 };
      if (l.tipo === "saida") ex.gasto += Number(l.valor);
      else ex.recebido += Number(l.valor);
      ex.qtd += 1;
      map.set(key, ex);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6);
  }, [lancs]);

  const maxMes = Math.max(...porMes.map(([_, v]) => Math.max(v.gasto, v.recebido)), 1);

  const stats = useMemo(() => {
    const realizados = lancs.filter(l => l.status === "realizado" || l.status === "conciliado");
    return {
      total: realizados.length,
      gastoTotal: realizados.filter(l => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0),
      recebidoTotal: realizados.filter(l => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0),
    };
  }, [lancs]);

  if (loading) return <PaginaSkeleton />;
  if (!centro) return <div className="p-8 text-center text-muted-foreground">
    Centro não encontrado. <Link to="/financas/centros" className="text-primary underline">Voltar</Link>
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas/centros"><ArrowLeft className="w-4 h-4" /></Link></Button>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Layers className="w-5 h-5 text-gold" />
            {centro.nome}
            <Badge variant="outline" className="text-xs">{centro.vinculo_tipo}</Badge>
          </h1>
          {centro.vinculo_nome && (
            <p className="text-xs text-muted-foreground">Vinculado a: {centro.vinculo_nome}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-muted-foreground">Total lançamentos</p>
            <p className="text-base font-semibold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive-soft/30 border-destructive-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-destructive-text">Total gasto</p>
            <p className="text-base font-semibold text-destructive-text tabular-nums">{brl(stats.gastoTotal)}</p>
          </CardContent>
        </Card>
        <Card className="bg-success-soft/30 border-success-line">
          <CardContent className="py-2 px-3">
            <p className="text-xs uppercase text-success-text">Total recebido</p>
            <p className="text-base font-semibold text-success-text tabular-nums">{brl(stats.recebidoTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolução mensal */}
      {porMes.length > 0 && (
        <Card>
          <CardContent className="py-3 space-y-2">
            <h3 className="font-serif text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" /> Evolução por mês
            </h3>
            <div className="space-y-1.5">
              {porMes.map(([mes, v]) => (
                <div key={mes} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{mes}</span>
                    <span className="text-muted-foreground">{v.qtd} lançamentos</span>
                  </div>
                  <div className="flex gap-1 h-2">
                    {v.recebido > 0 && (
                      <div className="bg-success/60 rounded-l"
                        style={{ flex: v.recebido / maxMes }}
                        title={`Recebido: ${brl(v.recebido)}`} />
                    )}
                    {v.gasto > 0 && (
                      <div className={`bg-destructive/60 ${v.recebido > 0 ? "rounded-r" : "rounded"}`}
                        style={{ flex: v.gasto / maxMes }}
                        title={`Gasto: ${brl(v.gasto)}`} />
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {v.recebido > 0 && <span className="text-success-text">+{brl(v.recebido)}</span>}
                    {v.gasto > 0 && <span className="text-destructive-text ml-auto">−{brl(v.gasto)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de lançamentos */}
      <div className="space-y-1.5">
        <h3 className="text-xs uppercase tracking-wide text-muted-foreground px-1">
          Lançamentos ({lancs.length})
        </h3>
        {lancs.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center text-sm text-muted-foreground italic">
              Sem lançamentos vinculados a este centro.
            </CardContent>
          </Card>
        ) : (
          lancs.map(l => (
            <div key={l.id} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-muted/30">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {l.tipo === "entrada"
                  ? <TrendingUp className="w-3.5 h-3.5 text-success-text shrink-0" />
                  : <TrendingDown className="w-3.5 h-3.5 text-destructive-text shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{l.descricao ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataBr(l.data)}
                    {l.categoria_nome && ` · ${l.categoria_nome}`}
                    {l.conta_nome && ` · ${l.conta_nome}`}
                    {l.fornecedor_nome && ` · ${l.fornecedor_nome}`}
                  </p>
                </div>
              </div>
              {l.comprovante_url && (
                <button onClick={() => abrirComprovante(l.comprovante_url!)}
                  className="text-info-text hover:text-info-text mr-2" title="Ver comprovante">
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
              )}
              <p className={`text-sm font-semibold tabular-nums shrink-0 ${l.tipo === "entrada" ? "text-success-text" : "text-destructive-text"}`}>
                {l.tipo === "entrada" ? "+" : "−"} {brl(Number(l.valor))}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
