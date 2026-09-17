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
import { PaginaSkeleton } from "@/components/ListState";
import {
  listarCentrosComResumo, seedCentrosCusto, alertasCentros,
  brl, VINCULO_LABEL, VINCULO_COR,
  type FinCentroResumo, type FinAlertaCentro, type FinCentroVinculo,
} from "@/services/finService";

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

  // Subgrupo contábil não aparece na lista principal — mora dentro do
  // centro pai (`centro_pai_id`), e é lá (`FinancasCentroDetalhe.tsx`)
  // que aparece, numa seção "Subgrupos". Pedido da Telma (17/09/2026):
  // "clicando em min adm, abre os subgrupos deste centro" — misturar os
  // subgrupos soltos na lista principal, do lado do centro pai, é
  // exatamente o que essa pergunta queria evitar.
  const centrosPrincipais = useMemo(
    () => centros.filter(c => c.vinculo_tipo !== "subgrupo_administracao"),
    [centros],
  );
  const qtdSubgruposPorPai = useMemo(() => {
    const m = new Map<string, number>();
    centros.forEach(c => {
      if (c.vinculo_tipo === "subgrupo_administracao" && c.centro_pai_id) {
        m.set(c.centro_pai_id, (m.get(c.centro_pai_id) ?? 0) + 1);
      }
    });
    return m;
  }, [centros]);

  const filtrados = useMemo(() => {
    return centrosPrincipais.filter(c => {
      if (filtroTipo !== "__all__" && c.vinculo_tipo !== filtroTipo) return false;
      if (busca.length >= 2 && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [centrosPrincipais, filtroTipo, busca]);

  const totalGasto = centrosPrincipais.reduce((s, c) => s + Number(c.gasto_90d), 0);

  if (loading) return <PaginaSkeleton />;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link to="/financas"><ArrowLeft className="w-4 h-4" /></Link></Button>
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
              a.severidade === "critico" ? "border-destructive-line bg-destructive-soft/30" :
              a.severidade === "atencao" ? "border-warning-line bg-warning-soft/30" :
              "border-info-line bg-info-soft/20"
            }>
              <CardContent className="py-2 px-3 flex items-center gap-2">
                <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${a.severidade === "critico" ? "text-destructive-text" : a.severidade === "atencao" ? "text-warning-text" : "text-info-text"}`} />
                <div className="flex-1 min-w-0 text-xs">
                  <p className="font-medium">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.descricao}</p>
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
                  {/* Subgrupo contábil não filtra aqui — não aparece na
                      lista principal (ver comentário em `centrosPrincipais`
                      acima), então o filtro ficaria sempre vazio. */}
                  {Object.entries(VINCULO_LABEL)
                    .filter(([k]) => k !== "subgrupo_administracao")
                    .map(([k, l]) => (
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
                            <Badge variant="outline" className={`text-xs ${VINCULO_COR[c.vinculo_tipo]}`}>
                              {VINCULO_LABEL[c.vinculo_tipo]}
                            </Badge>
                            {/* Convite pra abrir o detalhe e ver os
                                subgrupos — não dá pra expandir aqui na
                                lista (cada subgrupo tem sua própria linha
                                de gasto/data, não cabe resumir num badge
                                só), então aponta pra onde estão. */}
                            {qtdSubgruposPorPai.has(c.id) && (
                              <Badge variant="outline" className="text-xs bg-gold/10 text-gold border-gold/30">
                                {qtdSubgruposPorPai.get(c.id)} subgrupo{qtdSubgruposPorPai.get(c.id)! > 1 ? "s" : ""}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex gap-3 flex-wrap mt-0.5">
                            <span>{c.qtd_lancamentos_90d} lançamento(s) nos últimos 90d</span>
                            {c.ultima_movimentacao && (
                              <span>Última: {new Date(c.ultima_movimentacao + "T00:00").toLocaleDateString("pt-BR")}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-destructive-text">{brl(Number(c.gasto_90d))}</p>
                        <p className="text-xs text-muted-foreground">{pct.toFixed(1)}%</p>
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
            if (tipo === "subgrupo_administracao") return null;
            const lista = centrosPrincipais.filter(c => c.vinculo_tipo === tipo);
            if (lista.length === 0) return null;
            const total = lista.reduce((s, c) => s + Number(c.gasto_90d), 0);
            return (
              <Card key={tipo}>
                <CardContent className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif text-base flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${VINCULO_COR[tipo]}`}>{label}</Badge>
                      <span>{lista.length} centro(s)</span>
                    </h3>
                    <p className="text-sm font-semibold tabular-nums text-destructive-text">{brl(total)}</p>
                  </div>
                  {lista.slice(0, 5).map(c => (
                    <Link key={c.id} to={`/financas/centro/${c.id}`}
                      className="flex items-center justify-between text-xs border-b border-border/40 py-1 hover:bg-muted/30 transition-colors">
                      <span className="truncate">{c.nome}</span>
                      <span className="tabular-nums text-destructive-text shrink-0 ml-2">{brl(Number(c.gasto_90d))}</span>
                    </Link>
                  ))}
                  {lista.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">+{lista.length - 5} centro(s)…</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <div className="text-center text-xs text-muted-foreground pt-2">
        Período de análise: últimos 90 dias · {centrosPrincipais.length} centros ativos
      </div>
    </div>
  );
}
