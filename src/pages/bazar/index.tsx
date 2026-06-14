import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag, Plus, Loader2, ChevronRight, Calendar, Target, TrendingUp, ShoppingCart, Settings,
  Sparkles,
} from "lucide-react";
import { carregarResumoBazar, type ResumoBazar } from "@/services/bazarService";

const MODAL_LABEL: Record<string, string> = {
  bazar: "Bazar", cantina: "Cantina", ambos: "Bazar + Cantina",
};

const fmtBR = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BazarHome() {
  const [resumo, setResumo] = useState<ResumoBazar | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarResumoBazar().then(setResumo).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-gold" />
        <div className="flex-1">
          <h1 className="font-serif text-xl md:text-2xl">Bazar e Cantina</h1>
          <p className="text-xs text-muted-foreground">Área compartilhada — campanhas pra arrecadação por ministério</p>
        </div>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/bazar/config" title="Configurar taxas"><Settings className="w-4 h-4" /></Link>
        </Button>
        <Button size="sm" asChild className="gap-2">
          <Link to="/bazar/campanhas/nova"><Plus className="w-4 h-4" /> Nova campanha</Link>
        </Button>
      </header>

      {/* Resumo do ano */}
      <Card className="bg-gradient-verse border-0">
        <CardContent className="p-3 flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-gold" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total arrecadado este ano (líquido)</div>
            <div className="text-2xl font-serif font-medium">{fmtBR(resumo?.total_arrecadado_ano ?? 0)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Ativas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" /> Campanhas ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {resumo?.ativas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhuma campanha em andamento.
            </p>
          ) : (
            <div className="space-y-2">
              {resumo?.ativas.map(c => (
                <div key={c.id} className="border rounded-md p-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <Link to={`/bazar/campanha/${c.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm">{c.nome}</span>
                        <Badge variant="outline" className="text-[9px]">{MODAL_LABEL[c.modalidade]}</Badge>
                        <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">ATIVA</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(c.data_inicio + "T00:00").toLocaleDateString("pt-BR")} →
                        {" "}{new Date(c.data_fim + "T00:00").toLocaleDateString("pt-BR")}
                        {" · "}{c.qtd_vendas} venda(s)
                      </p>
                    </Link>
                    <Button size="sm" asChild className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 shrink-0">
                      <Link to={`/bazar/caixa/${c.id}`}>
                        <ShoppingCart className="w-3.5 h-3.5" /> Abrir caixa
                      </Link>
                    </Button>
                  </div>
                  {/* Progresso */}
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, c.percentual_meta ?? 0)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      <span className="font-medium text-foreground">{fmtBR(c.total_bruto)}</span>
                      {c.meta && (<> / <span>{fmtBR(c.meta)}</span> ({c.percentual_meta?.toFixed(0)}%)</>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Próximas */}
      {resumo && resumo.proximas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" /> Próximas campanhas planejadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {resumo.proximas.map(c => (
              <Link key={c.id} to={`/bazar/campanha/${c.id}`}
                className="flex items-center gap-2 border rounded-md p-2 text-xs hover:bg-muted/30">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="flex-1 truncate font-medium">{c.nome}</span>
                <Badge variant="outline" className="text-[9px]">{MODAL_LABEL[c.modalidade]}</Badge>
                <span className="text-muted-foreground">{new Date(c.data_inicio + "T00:00").toLocaleDateString("pt-BR")}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
