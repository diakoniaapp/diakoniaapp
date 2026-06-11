import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Layers, Sparkles, Loader2, AlertTriangle,
  TrendingUp, ChevronRight, Search, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarCentrosComResumo, seedCentrosCusto, alertasCentros,
  brl, type FinCentroResumo, type FinAlertaCentro, type FinCentroVinculo,
} from "@/services/finService";

const VINCULO_LABEL: Record<FinCentroVinculo, string> = {
  ministerio: "Ministério",
  area: "Área",
  ebd_classe: "Classe EBD",
  pgm_grupo: "PGM",
  campanha: "Campanha",
  evento: "Evento",
  geral: "Geral",
};

const VINCULO_COR: Record<FinCentroVinculo, string> = {
  ministerio: "bg-purple-100 text-purple-700 border-purple-300",
  area:       "bg-blue-100 text-blue-700 border-blue-300",
  ebd_classe: "bg-emerald-100 text-emerald-700 border-emerald-300",
  pgm_grupo:  "bg-amber-100 text-amber-700 border-amber-300",
  campanha:   "bg-rose-100 text-rose-700 border-rose-300",
  evento:     "bg-cyan-100 text-cyan-700 border-cyan-300",
  geral:      "bg-muted text-muted-foreground border-border",
};

export default function FinancasCentros() {
  const [centros, setCentros] = useState<FinCentroResumo[]>([]);
  const [alertas, setAlertas] = useState<FinAlertaCentro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FinCentroVinculo | "__all__">("__all__");
  const [seedBusy, setSeedBusy] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [cs, al] = await Promise.all([
        listarCentrosComResumo(),
        alertasCentros().catch(() => []),
      ]);
      setCentros(cs);
      setAlertas(al);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setLoading(false); }
  }

  async function gerarSeed() {
    setSeedBusy(true);
    try {
      const r = await seedCentrosCusto();
      if (r) {
        toast.success(`${r.criados} criado(s), ${r.ja_existiam} já existiam`);
      }
      await carregar();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setSeedBusy(false); }
  }

  const filtrados = useMemo(() => {
    return centros.filter(c => {
      if (filtroTipo !== "__all__" && c.vinculo_tipo !== filtroTipo) return false;
      if (busca.length >= 2 && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [centros, filtroTipo, busca]);

  const totalGasto = centros.reduce((s, c) => s + Number(c.gasto_90d), 0);

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/financas">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-xl flex items-center gap-2">
            <Layers className="w-5 h-5 text-gold" /> Centros de Custo
          </h1>
          <p className="text-xs text-muted-foreground">
            Mapa do dinheiro da igreja por ministério, área, EBD, PGM e campanhas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={gerarSeed} disabled={seedBusy} className="gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> {seedBusy ? "..." : "Sincronizar com ministérios"}
        </Button>
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-1.5">
          {alertas.slice(0, 4).map((a, i) => (
            <Card key={i} className={
              a.severidade === "critico" ? "border-rose-300 bg-rose-50/30" :
              a.severidade === "atencao" ? "border-amber-300 bg-amber-50/30" :
              "border-blue-200 bg-blue-50/20"
            }>
              <CardContent className="py-2 px-3 flex items-center gap-2">
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${a.severidade === "critico" ? "text-rose-700" : a.severidade === "atencao" ? "text-amber-700" : "text-blue-700"}`} />
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">{a.descricao}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs: Ranking | Por tipo */}
      <Tabs defaultValue="ranking">
        <TabsList>
          <TabsTrigger value="ranking" className="gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Ranking
          </TabsTrigger>
          <TabsTrigger value="tipos" className="gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Por tipo
          </TabsTrigger>
        </TabsList>

        {/* ── RANKING (todos centros ordenados por gasto 90d) ───────────── */}
        <TabsContent value="ranking" className="space-y-2">
          <Card>
            <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-3 gap-2 items-end">
              <div className="md:col-span-2 relative">
                <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)}
                  className="h-8 text-xs pl-6" placeholder="Buscar centro..." />
              </div>
              <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os tipos</SelectItem>
                  {Object.entries(VINCULO_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {filtrados.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {centros.length === 0 ? (
                  <>
                    <p>Nenhum centro de custo cadastrado.</p>
                    <Button onClick={gerarSeed} variant="outline" className="gap-1.5 mt-2">
                      <Sparkles className="w-4 h-4" /> Gerar do sistema
                    </Button>
                  </>
                ) : "Sem centros com esse filtro."}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {filtrados.map((c, idx) => {
                const pct = totalGasto > 0 ? (Number(c.gasto_90d) / totalGasto) * 100 : 0;
                return (
                  <Link key={c.id} to={`/financas/centro/${c.id}`} className="block border rounded-md px-3 py-2 hover:bg-muted/30 cursor-pointer">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{c.nome}</span>
                            <Badge variant="outline" className={`text-[9px] ${VINCULO_COR[c.vinculo_tipo]}`}>
                              {VINCULO_LABEL[c.vinculo_tipo]}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex gap-3 flex-wrap mt-0.5">
                            <span>{c.qtd_lancamentos_90d} lançamento(s) nos últimos 90d</span>
                            {c.ultima_movimentacao && (
                              <span>Última: {new Date(c.ultima_movimentacao + "T00:00").toLocaleDateString("pt-BR")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-rose-700">{brl(Number(c.gasto_90d))}</p>
                        <p className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                    {pct > 0 && (
                      <div className="h-1 bg-muted rounded mt-1.5 overflow-hidden">
                        <div className="h-full bg-gold/60" style={{ width: `${Math.min(100, pct * 3)}%` }} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── POR TIPO (agrupado em cards) ─────────────────────────────── */}
        <TabsContent value="tipos" className="space-y-3">
          {(Object.entries(VINCULO_LABEL) as [FinCentroVinculo, string][]).map(([tipo, label]) => {
            const lista = centros.filter(c => c.vinculo_tipo === tipo);
            if (lista.length === 0) return null;
            const total = lista.reduce((s, c) => s + Number(c.gasto_90d), 0);
            return (
              <Card key={tipo}>
                <CardContent className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${VINCULO_COR[tipo]}`}>{label}</Badge>
                      <span>{lista.length} centro(s)</span>
                    </h3>
                    <p className="text-sm font-semibold tabular-nums text-rose-700">{brl(total)}</p>
                  </div>
                  {lista.slice(0, 5).map(c => (
                    <Link key={c.id} to={`/financas/centro/${c.id}`}
                      className="flex items-center justify-between text-xs border-b border-border/40 py-1 hover:bg-muted/30 transition-colors">
                      <span className="truncate">{c.nome}</span>
                      <span className="tabular-nums text-rose-700 shrink-0 ml-2">{brl(Number(c.gasto_90d))}</span>
                    </Link>
                  ))}
                  {lista.length > 5 && (
                    <p className="text-[10px] text-muted-foreground text-center">+{lista.length - 5} centro(s)…</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <div className="text-center text-[10px] text-muted-foreground pt-2">
        Período de análise: últimos 90 dias · {centros.length} centros ativos
      </div>
    </div>
  );
}
