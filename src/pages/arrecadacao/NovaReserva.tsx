import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Save, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listarEspacos, solicitarReserva, materializarChecklist,
  type Espaco,
} from "@/services/arrecadacaoService";

export default function NovaReserva() {
  const nav = useNavigate();
  const hoje = new Date();
  const proximaSemana = new Date(hoje.getTime() + 7 * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0,10);

  const [espacos, setEspacos] = useState<Espaco[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [membros, setMembros] = useState<any[]>([]);

  const [form, setForm] = useState({
    espaco_id: "",
    area_solicitante_id: "",
    centro_custo_id: "",
    responsavel_id: "",
    finalidade: "",
    data_inicio: fmt(proximaSemana),
    data_fim: fmt(proximaSemana),
    observacoes: "",
  });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: a }, { data: cc }, { data: m }, e] = await Promise.all([
        supabase.from("areas").select("id, nome, ministerio_id").eq("ativo", true).order("nome"),
        supabase.from("fin_centros_custo").select("id, nome").order("nome"),
        supabase.from("membros").select("id, nome_completo").eq("status", "ativo").order("nome_completo").limit(500),
        listarEspacos(),
      ]);
      setAreas(a ?? []); setCentros(cc ?? []); setMembros(m ?? []); setEspacos(e);
      if (e.length > 0) setForm(f => ({ ...f, espaco_id: e[0].id }));
    })();
  }, []);

  async function salvar() {
    if (!form.finalidade.trim()) { toast.error("Informe a finalidade"); return; }
    if (!form.espaco_id || !form.area_solicitante_id || !form.centro_custo_id || !form.responsavel_id) {
      toast.error("Preencha espaço, área, centro de custo e responsável"); return;
    }
    if (form.data_fim < form.data_inicio) {
      toast.error("Data fim antes do início"); return;
    }
    setSalvando(true);
    try {
      const r = await solicitarReserva({
        espaco_id: form.espaco_id,
        area_solicitante_id: form.area_solicitante_id,
        centro_custo_id: form.centro_custo_id,
        responsavel_id: form.responsavel_id,
        finalidade: form.finalidade,
        periodo_inicio: `${form.data_inicio}T00:00:00`,
        periodo_fim:    `${form.data_fim}T23:59:59`,
        observacoes: form.observacoes || undefined,
      });
      // Já materializa o checklist a partir do template
      try { await materializarChecklist(r.id, form.espaco_id); } catch {}
      toast.success("Reserva solicitada");
      nav(`/arrecadacao/reserva/${r.id}`);
    } catch (err: any) {
      const msg = String(err?.message ?? "Erro");
      if (msg.includes("arr_reservas_sem_conflito")) {
        toast.error("Conflito de datas: já há reserva aprovada/em uso desse espaço no período.");
      } else toast.error(msg);
    } finally { setSalvando(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/arrecadacao"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <ShoppingBag className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Nova reserva</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da solicitação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Field label="Espaço *">
            <Select value={form.espaco_id} onValueChange={(v) => setForm({...form, espaco_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {espacos.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Finalidade *">
            <Input value={form.finalidade}
              onChange={e => setForm({...form, finalidade: e.target.value})}
              placeholder="Ex: Arrecadar p/ flores aniversário da igreja" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Início *">
              <Input type="date" value={form.data_inicio}
                onChange={e => setForm({...form, data_inicio: e.target.value})} />
            </Field>
            <Field label="Fim *">
              <Input type="date" value={form.data_fim}
                onChange={e => setForm({...form, data_fim: e.target.value})} />
            </Field>
          </div>

          <Field label="Área solicitante *">
            <Select value={form.area_solicitante_id} onValueChange={(v) => setForm({...form, area_solicitante_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Centro de custo (saldo virtual vai pra cá) *">
            <Select value={form.centro_custo_id} onValueChange={(v) => setForm({...form, centro_custo_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Responsável *">
            <Select value={form.responsavel_id} onValueChange={(v) => setForm({...form, responsavel_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.nome_completo}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Observações">
            <Textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})}
              placeholder="Detalhes adicionais" />
          </Field>

          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enviar solicitação
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Depois de enviar, a Administração analisa e aprova/recusa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
