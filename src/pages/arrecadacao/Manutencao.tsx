import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Wrench, Loader2, CheckCircle2, AlertTriangle, Filter, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarProblemas, resolverProblema, atualizarProblema,
  type ProblemaManutencao, type ProblemaStatus,
} from "@/services/arrecadacaoService";

const STATUS_COR: Record<ProblemaStatus, string> = {
  aberto:        "bg-rose-50 text-rose-700 border-rose-200",
  em_andamento:  "bg-amber-50 text-amber-700 border-amber-200",
  resolvido:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  descartado:    "bg-muted text-muted-foreground line-through",
};
const PRIO_COR: Record<string, string> = {
  alta:  "bg-rose-100 text-rose-700",
  media: "bg-amber-100 text-amber-700",
  baixa: "bg-blue-50 text-blue-700",
};

export default function ManutencaoLista() {
  const [problemas, setProblemas] = useState<ProblemaManutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"abertos" | "todos" | ProblemaStatus>("abertos");
  const [resolvendo, setResolvendo] = useState<ProblemaManutencao | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const f = filtro === "abertos"
        ? { status: ["aberto","em_andamento"] as ProblemaStatus[] }
        : filtro === "todos" ? {} : { status: filtro };
      setProblemas(await listarProblemas(f));
    } finally { setLoading(false); }
  }
  useEffect(() => { carregar(); }, [filtro]);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <header className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <Wrench className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Manutenção dos espaços</h1>
        <div className="ml-auto flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={filtro} onValueChange={(v) => setFiltro(v as any)}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="abertos">Abertos + em andamento</SelectItem>
              <SelectItem value="aberto">Só abertos</SelectItem>
              <SelectItem value="em_andamento">Em andamento</SelectItem>
              <SelectItem value="resolvido">Resolvidos</SelectItem>
              <SelectItem value="descartado">Descartados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : problemas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            ✓ Nenhum problema com esse filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {problemas.map(p => (
            <Card key={p.id} className={p.status === "resolvido" ? "opacity-60" : ""}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="font-medium text-sm">{p.titulo}</span>
                  <Badge variant="outline" className={`text-[9px] ${STATUS_COR[p.status]}`}>
                    {p.status.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline" className={`text-[9px] ${PRIO_COR[p.prioridade]}`}>
                    {p.prioridade}
                  </Badge>
                  {p.espaco && (
                    <Badge variant="outline" className="text-[9px]">{p.espaco.codigo}</Badge>
                  )}
                </div>
                {p.descricao && (
                  <p className="text-xs text-muted-foreground italic">{p.descricao}</p>
                )}
                <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>📅 {new Date(p.reportado_em).toLocaleString("pt-BR")}</span>
                  {p.resolvido_em && (
                    <span className="text-emerald-700">
                      ✓ Resolvido em {new Date(p.resolvido_em).toLocaleString("pt-BR")}
                    </span>
                  )}
                </div>
                {p.resolucao_descricao && (
                  <p className="text-[11px] text-emerald-700 bg-emerald-50/30 p-1.5 rounded mt-1">
                    {p.resolucao_descricao}
                  </p>
                )}
                {p.status !== "resolvido" && (
                  <div className="flex gap-2 pt-1">
                    {p.status === "aberto" && (
                      <Button size="sm" variant="outline" className="text-xs"
                        onClick={async () => {
                          try { await atualizarProblema(p.id, { status: "em_andamento" }); carregar(); }
                          catch (err: any) { toast.error(err?.message ?? "Erro"); }
                        }}>
                        Marcar em andamento
                      </Button>
                    )}
                    <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-xs"
                      onClick={() => setResolvendo(p)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolver
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-muted-foreground"
                      onClick={async () => {
                        if (!confirm("Descartar este problema?")) return;
                        try { await atualizarProblema(p.id, { status: "descartado" }); carregar(); }
                        catch (err: any) { toast.error(err?.message ?? "Erro"); }
                      }}>
                      Descartar
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resolvendo && (
        <ResolverDialog problema={resolvendo}
          onCancel={() => setResolvendo(null)}
          onResolved={() => { setResolvendo(null); carregar(); }} />
      )}
    </div>
  );
}

function ResolverDialog({ problema, onCancel, onResolved }: {
  problema: ProblemaManutencao; onCancel: () => void; onResolved: () => void;
}) {
  const [desc, setDesc] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function resolver() {
    if (!desc.trim()) { toast.error("Descreva o que foi feito"); return; }
    setSalvando(true);
    try {
      await resolverProblema(problema.id, desc);
      toast.success("Problema marcado como resolvido");
      onResolved();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Resolver problema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{problema.titulo}</p>
          <Label className="text-[11px]">Como foi resolvido?</Label>
          <Textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ex: Lâmpada trocada em 14/06" />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={resolver} disabled={salvando}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Salvar resolução
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
