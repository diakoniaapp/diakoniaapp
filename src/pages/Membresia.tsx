import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, Plus, Loader2, ChevronRight, Search,
  AlertTriangle, BarChart3,
} from "lucide-react";
import {
  listarSolicitacoes, TIPO_LABEL, STATUS_LABEL, STATUS_COR,
  type SolicitacaoMembresia, type StatusSolicitacao, type TipoSolicitacao,
} from "@/services/membresiaService";
import { SolicitacaoForm } from "@/components/membresia/SolicitacaoForm";

export default function Membresia() {
  const [lista, setLista] = useState<SolicitacaoMembresia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<StatusSolicitacao | "todos">("todos");
  const [filtroTipo, setFiltroTipo] = useState<TipoSolicitacao | "__all__">("__all__");
  const [busca, setBusca] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);

  useEffect(() => { carregar(); }, [filtroStatus, filtroTipo, busca]);

  async function carregar() {
    setLoading(true);
    try {
      const r = await listarSolicitacoes({
        status: filtroStatus,
        tipo: filtroTipo !== "__all__" ? filtroTipo : undefined,
        busca: busca.length >= 2 ? busca : undefined,
      });
      setLista(r);
    } finally { setLoading(false); }
  }

  const pendentes = lista.filter(s =>
    s.status !== "concluida" && s.status !== "cancelada" && s.status !== "rejeitada"
  ).length;

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <FileText className="w-6 h-6 text-gold" /> Membresia
          </h1>
          <p className="text-xs text-muted-foreground">
            Entradas, saídas e transferências — gestão estatutária da igreja.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/painel-secretaria">
            <Button variant="outline" size="sm" className="gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Painel
              {pendentes > 0 && <Badge variant="outline" className="text-[9px] bg-amber-100 text-amber-700 border-amber-300">{pendentes}</Badge>}
            </Button>
          </Link>
          <Button onClick={() => setNovoOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
            <Plus className="w-4 h-4" /> Nova solicitação
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-2.5 px-3 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="md:col-span-2 relative">
            <Search className="w-3 h-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs pl-6" placeholder="Buscar por nome..." />
          </div>
          <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(Object.entries(STATUS_LABEL) as [StatusSolicitacao, string][]).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os tipos</SelectItem>
              {(Object.entries(TIPO_LABEL) as [TipoSolicitacao, string][]).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Lista */}
      {lista.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <BarChart3 className="w-10 h-10 mx-auto opacity-30" />
            <p>Nenhuma solicitação encontrada.</p>
            <Button onClick={() => setNovoOpen(true)} variant="outline" className="gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Criar primeira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {lista.map(s => (
            <Link key={s.id} to={`/membresia/${s.id}`} className="block">
              <div className="border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{s.pessoa_nome}</span>
                    <Badge variant="outline" className={`text-[9px] ${STATUS_COR[s.status]}`}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {TIPO_LABEL[s.tipo]} · solicitada em {new Date(s.data_solicitacao + "T00:00").toLocaleDateString("pt-BR")}
                    {s.data_assembleia && ` · assembleia ${new Date(s.data_assembleia + "T00:00").toLocaleDateString("pt-BR")}`}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <SolicitacaoForm open={novoOpen} onOpenChange={setNovoOpen} onSaved={carregar} />
    </div>
  );
}
