import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ScrollText, Plus, Loader2, ChevronRight, Calendar, Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  listarReunioes, criarReuniao, sugerirProximasReunioes,
  REUNIAO_TIPO_LABEL, REUNIAO_STATUS_LABEL, REUNIAO_STATUS_COR,
  type GovReuniao, type GovReuniaoTipo,
} from "@/services/governancaService";

export default function Governanca() {
  const [reunioes, setReunioes] = useState<GovReuniao[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const r = await listarReunioes();
      setReunioes(r);
    } finally { setLoading(false); }
  }

  if (loading) return <div className="p-8 flex items-center justify-center text-muted-foreground">
    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
  </div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-gold" /> Governança
          </h1>
          <p className="text-xs text-muted-foreground">
            Reuniões, pautas, assembleias e decisões — gestão estatutária da igreja.
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="gap-1.5 bg-gold hover:bg-gold/90 text-white">
          <Plus className="w-4 h-4" /> Nova reunião
        </Button>
      </div>

      {reunioes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground space-y-2">
            <ScrollText className="w-10 h-10 mx-auto opacity-30" />
            <p>Nenhuma reunião cadastrada.</p>
            <Button onClick={() => setNovoOpen(true)} variant="outline" className="gap-1.5 mt-2">
              <Plus className="w-4 h-4" /> Criar primeira reunião
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {reunioes.map(r => (
            <Link key={r.id} to={`/governanca/reuniao/${r.id}`} className="block">
              <div className="border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.titulo}</span>
                    <Badge variant="outline" className="text-[9px]">{REUNIAO_TIPO_LABEL[r.tipo]}</Badge>
                    <Badge variant="outline" className={`text-[9px] ${REUNIAO_STATUS_COR[r.status]}`}>
                      {REUNIAO_STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-2.5 h-2.5" />
                    {new Date(r.data_reuniao + "T00:00").toLocaleDateString("pt-BR")}
                    {r.horario && ` · ${r.horario.slice(0, 5)}`}
                    {r.local && ` · ${r.local}`}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <NovaReuniaoDialog open={novoOpen} onOpenChange={setNovoOpen} onSaved={carregar} />
    </div>
  );
}

function NovaReuniaoDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("Reunião de Diretoria");
  const [tipo, setTipo] = useState<GovReuniaoTipo>("diretoria");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [horario, setHorario] = useState("19:30");
  const [local, setLocal] = useState("Sala da Igreja");
  const [observacoes, setObservacoes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo("Reunião de Diretoria");
    setTipo("diretoria");
    setData(new Date().toISOString().slice(0, 10));
    setHorario("19:30");
    setLocal("Sala da Igreja");
    setObservacoes("");
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    setBusy(true);
    try {
      const proxData = sugerirProximasReunioes(data, 1)[0];
      await criarReuniao({
        titulo: titulo.trim(),
        tipo,
        data_reuniao: data,
        horario: horario || null,
        local: local.trim() || null,
        observacoes: observacoes.trim() || null,
        proxima_sugerida: proxData,
      });
      toast.success("Reunião criada");
      onOpenChange(false);
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">Nova reunião</DialogTitle>
          <DialogDescription>Diretoria, liderança, conselho ou extraordinária.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as GovReuniaoTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(REUNIAO_TIPO_LABEL) as [GovReuniaoTipo, string][]).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data *</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
            <div>
              <Label>Horário</Label>
              <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
            <div>
              <Label>Local</Label>
              <Input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ou link online" />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
