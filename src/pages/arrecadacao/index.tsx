import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingBag, Plus, Loader2, ChevronRight, Settings, Calendar,
  Clock, CheckCircle2, AlertCircle, Sparkles,
} from "lucide-react";
import {
  listarEspacos, listarReservas,
  type Espaco, type Reserva, type ReservaStatus,
} from "@/services/arrecadacaoService";

const STATUS_LABEL: Record<ReservaStatus, string> = {
  solicitada: "Solicitada", aprovada: "Aprovada", recusada: "Recusada",
  em_uso: "Em uso", encerrada: "Encerrada", cancelada: "Cancelada",
};
const STATUS_COR: Record<ReservaStatus, string> = {
  solicitada: "bg-amber-50 text-amber-700 border-amber-200",
  aprovada:   "bg-blue-50 text-blue-700 border-blue-200",
  em_uso:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  encerrada:  "bg-muted text-muted-foreground border-border",
  recusada:   "bg-rose-50 text-rose-700 border-rose-200",
  cancelada:  "bg-muted text-muted-foreground line-through",
};

function fmtPeriodo(p: string) {
  // tstzrange: '["2026-10-26 00:00:00+00","2026-10-26 23:59:00+00")'
  const m = p.match(/\["?([^",)]+)/);
  if (!m) return p;
  return new Date(m[1]).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function ArrecadacaoHome() {
  const [espacos, setEspacos] = useState<Espaco[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listarEspacos(), listarReservas()])
      .then(([e, r]) => { setEspacos(e); setReservas(r); })
      .finally(() => setLoading(false));
  }, []);

  const ativas = reservas.filter(r => r.status === "em_uso");
  const aprovadas = reservas.filter(r => r.status === "aprovada");
  const solicitadas = reservas.filter(r => r.status === "solicitada");

  if (loading) {
    return <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <ShoppingBag className="w-5 h-5 text-gold" />
        <div className="flex-1">
          <h1 className="font-serif text-xl md:text-2xl">Arrecadação</h1>
          <p className="text-xs text-muted-foreground">
            Bazar e Cantina · áreas reservam para campanhas
          </p>
        </div>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao/espacos" title="Configurar espaços">
            <Settings className="w-4 h-4" />
          </Link>
        </Button>
        <Button size="sm" asChild className="gap-2">
          <Link to="/arrecadacao/reservas/nova"><Plus className="w-4 h-4" /> Nova reserva</Link>
        </Button>
      </header>

      {/* Cards dos 2 espaços */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {espacos.map(e => (
          <Card key={e.id} className="hover:bg-muted/30 transition">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <ShoppingBag className="w-4 h-4 text-gold mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{e.nome}</span>
                    <Badge variant="outline" className="text-[9px]">{e.codigo}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{e.descricao}</p>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Taxas: déb {e.taxa_debito_pct}% · créd {e.taxa_credito_pct}% · pix {e.taxa_pix_pct}%
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Em uso agora */}
      {ativas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" /> Em uso agora ({ativas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {ativas.map(r => <LinhaReserva key={r.id} r={r} />)}
          </CardContent>
        </Card>
      )}

      {/* Aprovadas aguardando uso */}
      {aprovadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600" /> Aprovadas — aguardando uso ({aprovadas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {aprovadas.map(r => <LinhaReserva key={r.id} r={r} />)}
          </CardContent>
        </Card>
      )}

      {/* Solicitações pendentes */}
      {solicitadas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" /> Solicitações pendentes ({solicitadas.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {solicitadas.map(r => <LinhaReserva key={r.id} r={r} />)}
          </CardContent>
        </Card>
      )}

      {ativas.length + aprovadas.length + solicitadas.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma reserva ativa ou pendente.
            <br />
            <Button asChild size="sm" className="mt-3 gap-1.5">
              <Link to="/arrecadacao/reservas/nova"><Plus className="w-3.5 h-3.5" /> Solicitar a primeira</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );

  function LinhaReserva({ r }: { r: Reserva }) {
    return (
      <Link to={`/arrecadacao/reserva/${r.id}`}
        className="flex items-center gap-2 border rounded-md p-2 hover:bg-muted/30 transition text-xs">
        <Badge variant="outline" className="text-[9px]">{r.espaco?.codigo}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{r.finalidade}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-2.5 h-2.5" /> {fmtPeriodo(r.periodo)}
            {r.area && <span>· {r.area.nome}</span>}
            {r.responsavel && <span>· {r.responsavel.nome_completo}</span>}
          </div>
        </div>
        <Badge variant="outline" className={`text-[9px] ${STATUS_COR[r.status]}`}>
          {STATUS_LABEL[r.status]}
        </Badge>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
      </Link>
    );
  }
}
