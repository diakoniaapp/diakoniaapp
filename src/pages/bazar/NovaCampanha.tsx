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
import { ArrowLeft, Loader2, ShoppingBag, Save } from "lucide-react";
import { toast } from "sonner";
import { criarCampanha, type ModalidadeBazar } from "@/services/bazarService";
import { supabase } from "@/integrations/supabase/client";

export default function NovaCampanha() {
  const nav = useNavigate();
  const hoje = new Date();
  const proximaSemana = new Date(hoje.getTime() + 7 * 86_400_000);

  const [form, setForm] = useState({
    nome: "",
    descricao: "",
    modalidade: "cantina" as ModalidadeBazar,
    data_inicio: hoje.toISOString().slice(0,10),
    data_fim: proximaSemana.toISOString().slice(0,10),
    meta_arrecadacao: "",
    ministerio_id: "",
    centro_custo_id: "",
    conta_destino_id: "",
  });

  const [ministerios, setMinisterios] = useState<any[]>([]);
  const [centros, setCentros] = useState<any[]>([]);
  const [contas, setContas] = useState<any[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: cc }, { data: ct }] = await Promise.all([
        supabase.from("ministerios").select("id, nome").order("nome"),
        supabase.from("fin_centros_custo").select("id, nome").order("nome"),
        supabase.from("fin_contas").select("id, nome").order("nome"),
      ]);
      setMinisterios(m ?? []); setCentros(cc ?? []); setContas(ct ?? []);
    })();
  }, []);

  async function salvar() {
    if (!form.nome.trim()) { toast.error("Informe o nome"); return; }
    setSalvando(true);
    try {
      const c = await criarCampanha({
        nome: form.nome,
        descricao: form.descricao || null,
        modalidade: form.modalidade,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim,
        ministerio_id: form.ministerio_id || null,
        centro_custo_id: form.centro_custo_id || null,
        conta_destino_id: form.conta_destino_id || null,
        meta_arrecadacao: form.meta_arrecadacao
          ? Number(form.meta_arrecadacao.replace(",", "."))
          : null,
        status: "planejada",
      });
      toast.success("Campanha criada");
      nav(`/bazar/campanha/${c.id}`);
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <Button size="sm" variant="ghost" asChild>
          <Link to="/bazar"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <ShoppingBag className="w-5 h-5 text-gold" />
        <h1 className="font-serif text-xl">Nova campanha</h1>
      </header>

      <Card>
        <CardContent className="p-4 space-y-3 text-sm">
          <Field label="Nome da campanha *">
            <Input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})}
              placeholder="Ex: Cantina aniversário 75 anos QIBRJ" />
          </Field>
          <Field label="Descrição / propósito">
            <Textarea value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})}
              placeholder="Ex: Arrecadar pra oferta de missões" />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Modalidade">
              <Select value={form.modalidade} onValueChange={(v) => setForm({...form, modalidade: v as ModalidadeBazar})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cantina">Cantina</SelectItem>
                  <SelectItem value="bazar">Bazar</SelectItem>
                  <SelectItem value="ambos">Bazar + Cantina</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Meta de arrecadação">
              <Input value={form.meta_arrecadacao}
                onChange={e => setForm({...form, meta_arrecadacao: e.target.value})}
                placeholder="R$ 5.000,00" />
            </Field>
            <Field label="Início"><Input type="date" value={form.data_inicio}
              onChange={e => setForm({...form, data_inicio: e.target.value})} /></Field>
            <Field label="Fim"><Input type="date" value={form.data_fim}
              onChange={e => setForm({...form, data_fim: e.target.value})} /></Field>
          </div>

          <Field label="Ministério beneficiado">
            <Select value={form.ministerio_id} onValueChange={(v) => setForm({...form, ministerio_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {ministerios.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Centro de custo (pra onde vai o dinheiro)">
            <Select value={form.centro_custo_id} onValueChange={(v) => setForm({...form, centro_custo_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Conta que recebe o dinheiro">
            <Select value={form.conta_destino_id} onValueChange={(v) => setForm({...form, conta_destino_id: v})}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Button onClick={salvar} disabled={salvando} className="w-full gap-2">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Criar campanha
          </Button>
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
