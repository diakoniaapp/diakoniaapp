import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, MapPin, Pencil, Users, Filter, Upload, Accessibility, Lock, Calendar, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";

type LocalStatus = "ativo" | "inativo";
type LocalPredio = "rp" | "sf";
type LocalPavimento = "subsolo" | "terreo" | "galeria" | "andares_superiores" | "area_tecnica";
type LocalAmbiente = "templo" | "sala" | "administrativo" | "tecnico" | "area_social" | "circulacao" | "deposito";
type LocalUso = "culto" | "ensino" | "musica" | "comunicacao" | "administrativo" | "manutencao" | "apoio_tecnico" | "armazenamento";
type LocalLocInterna = "frente" | "fundos" | "lado_esquerdo" | "lado_direito" | "centro" | "area_externa";
type LocalRestricao = "livre" | "restrito" | "tecnico";
type EventoTipo = "culto" | "reuniao" | "ensaio" | "acao_social" | "curso" | "outro";

interface Local {
  id: string;
  nome: string;
  nome_completo: string | null;
  predio: LocalPredio | null;
  pavimento: LocalPavimento | null;
  ambiente: LocalAmbiente | null;
  uso_principal: LocalUso | null;
  capacidade: number | null;
  status: LocalStatus;
  descricao: string | null;
  observacoes: string | null;
  localizacao_interna: LocalLocInterna | null;
  area_m2: number | null;
  acessibilidade: boolean;
  restricao_acesso: LocalRestricao;
  referencia_visual: string | null;
  mapa_url: string | null;
  permite_agendamento: boolean;
  tipos_evento_permitidos: EventoTipo[];
}

const PREDIOS: { value: LocalPredio; label: string }[] = [
  { value: "rp", label: "RP – Rua Paraíba" },
  { value: "sf", label: "SF – Senador Furtado" },
];
const PAVIMENTOS: { value: LocalPavimento; label: string }[] = [
  { value: "subsolo", label: "Subsolo" },
  { value: "terreo", label: "Térreo" },
  { value: "galeria", label: "Galeria" },
  { value: "andares_superiores", label: "Andares superiores" },
  { value: "area_tecnica", label: "Área técnica" },
];
const AMBIENTES: { value: LocalAmbiente; label: string }[] = [
  { value: "templo", label: "Templo" },
  { value: "sala", label: "Sala" },
  { value: "administrativo", label: "Administrativo" },
  { value: "tecnico", label: "Técnico" },
  { value: "area_social", label: "Área Social" },
  { value: "circulacao", label: "Circulação" },
  { value: "deposito", label: "Depósito" },
];
const USOS: { value: LocalUso; label: string }[] = [
  { value: "culto", label: "Culto" },
  { value: "ensino", label: "Ensino" },
  { value: "musica", label: "Música" },
  { value: "comunicacao", label: "Comunicação" },
  { value: "administrativo", label: "Administrativo" },
  { value: "manutencao", label: "Manutenção" },
  { value: "apoio_tecnico", label: "Apoio Técnico" },
  { value: "armazenamento", label: "Armazenamento" },
];
const LOC_INTERNAS: { value: LocalLocInterna; label: string }[] = [
  { value: "frente", label: "Frente" },
  { value: "fundos", label: "Fundos" },
  { value: "lado_esquerdo", label: "Lado esquerdo" },
  { value: "lado_direito", label: "Lado direito" },
  { value: "centro", label: "Centro" },
  { value: "area_externa", label: "Área externa" },
];
const RESTRICOES: { value: LocalRestricao; label: string }[] = [
  { value: "livre", label: "Livre" },
  { value: "restrito", label: "Restrito" },
  { value: "tecnico", label: "Técnico" },
];
const EVENTO_TIPOS: { value: EventoTipo; label: string }[] = [
  { value: "culto", label: "Culto" },
  { value: "reuniao", label: "Reunião" },
  { value: "ensaio", label: "Ensaio" },
  { value: "acao_social", label: "Ação Social" },
  { value: "curso", label: "Curso" },
  { value: "outro", label: "Outro" },
];

const labelOf = <T extends string>(arr: { value: T; label: string }[], v: T | null | undefined) =>
  v ? arr.find((x) => x.value === v)?.label ?? v : "—";

const emptyForm = {
  nome: "",
  predio: "" as "" | LocalPredio,
  pavimento: "" as "" | LocalPavimento,
  ambiente: "" as "" | LocalAmbiente,
  uso_principal: "" as "" | LocalUso,
  capacidade: "",
  status: "ativo" as LocalStatus,
  descricao: "",
  localizacao_interna: "" as "" | LocalLocInterna,
  area_m2: "",
  acessibilidade: false,
  restricao_acesso: "livre" as LocalRestricao,
  referencia_visual: "",
  mapa_url: "" as string,
  permite_agendamento: true,
  tipos_evento_permitidos: [] as EventoTipo[],
};

export default function Locais() {
  const { canEdit } = useAuth();
  const [locais, setLocais] = useState<Local[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Local | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | LocalStatus>("ativo");
  const [fPredio, setFPredio] = useState<"todos" | LocalPredio>("todos");
  const [fPavimento, setFPavimento] = useState<"todos" | LocalPavimento>("todos");
  const [fAmbiente, setFAmbiente] = useState<"todos" | LocalAmbiente>("todos");
  const [fUso, setFUso] = useState<"todos" | LocalUso>("todos");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("locais" as any)
      .select("*")
      .order("nome");
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setError(error.message);
      return;
    }
    setLocais((data ?? []) as unknown as Local[]);
  };
  useEffect(() => { load(); }, []);

  const abrirNovo = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const abrirEdicao = (l: Local) => {
    setEditing(l);
    setForm({
      nome: l.nome,
      predio: l.predio ?? "",
      pavimento: l.pavimento ?? "",
      ambiente: l.ambiente ?? "",
      uso_principal: l.uso_principal ?? "",
      capacidade: l.capacidade?.toString() ?? "",
      status: l.status,
      descricao: l.descricao ?? l.observacoes ?? "",
      localizacao_interna: l.localizacao_interna ?? "",
      area_m2: l.area_m2?.toString() ?? "",
      acessibilidade: !!l.acessibilidade,
      restricao_acesso: l.restricao_acesso ?? "livre",
      referencia_visual: l.referencia_visual ?? "",
      mapa_url: l.mapa_url ?? "",
      permite_agendamento: l.permite_agendamento ?? true,
      tipos_evento_permitidos: l.tipos_evento_permitidos ?? [],
    });
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return toast.error("Informe o nome do local.");
    if (!form.predio) return toast.error("Selecione o prédio.");
    if (!form.pavimento) return toast.error("Selecione o pavimento.");
    if (!form.ambiente) return toast.error("Selecione o tipo de ambiente.");
    if (!form.uso_principal) return toast.error("Selecione o uso principal.");
    const cap = form.capacidade.trim() === "" ? null : Number(form.capacidade);
    if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) {
      return toast.error("Capacidade deve ser um número maior que zero.");
    }

    const payload: any = {
      nome,
      predio: form.predio,
      pavimento: form.pavimento,
      ambiente: form.ambiente,
      uso_principal: form.uso_principal,
      capacidade: cap,
      status: form.status,
      descricao: form.descricao.trim() || null,
      localizacao_interna: form.localizacao_interna || null,
      area_m2: form.area_m2.trim() === "" ? null : Number(form.area_m2),
      acessibilidade: form.acessibilidade,
      restricao_acesso: form.restricao_acesso,
      referencia_visual: form.referencia_visual.trim() || null,
      mapa_url: form.mapa_url || null,
      permite_agendamento: form.permite_agendamento,
      tipos_evento_permitidos: form.tipos_evento_permitidos,
    };

    if (editing) {
      const { error } = await supabase.from("locais" as any).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Local atualizado");
    } else {
      const { error } = await supabase.from("locais" as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Local cadastrado");
    }
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    load();
  };

  const onUploadMapa = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("locais-mapas").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("locais-mapas").getPublicUrl(path);
      setForm((f) => ({ ...f, mapa_url: data.publicUrl }));
      toast.success("Mapa enviado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const toggleTipoEvento = (t: EventoTipo) => {
    setForm((f) => ({
      ...f,
      tipos_evento_permitidos: f.tipos_evento_permitidos.includes(t)
        ? f.tipos_evento_permitidos.filter((x) => x !== t)
        : [...f.tipos_evento_permitidos, t],
    }));
  };

  const toggleStatus = async (l: Local) => {
    const novo: LocalStatus = l.status === "ativo" ? "inativo" : "ativo";
    const { error } = await supabase.from("locais" as any).update({ status: novo }).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(novo === "ativo" ? "Local reativado" : "Local inativado");
    load();
  };

  const lista = locais.filter((l) =>
    (filtroStatus === "todos" || l.status === filtroStatus) &&
    (fPredio === "todos" || l.predio === fPredio) &&
    (fPavimento === "todos" || l.pavimento === fPavimento) &&
    (fAmbiente === "todos" || l.ambiente === fAmbiente) &&
    (fUso === "todos" || l.uso_principal === fUso)
  );

  const pluralLabel = (n: number, status: "todos" | LocalStatus) => {
    if (status === "todos") return n === 1 ? "local no total" : "locais no total";
    if (status === "ativo") return n === 1 ? "local ativo" : "locais ativos";
    return n === 1 ? "local inativo" : "locais inativos";
  };

  return (
    <div>
      <PageHeader
        title="Locais"
        description={loading ? "Carregando…" : `${lista.length} ${pluralLabel(lista.length, filtroStatus)}`}
        actions={canEdit && (
          <Button onClick={abrirNovo}>
            <Plus className="w-4 h-4 mr-2" /> Novo local
          </Button>
        )}
      />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {(["ativo", "inativo", "todos"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filtroStatus === s ? "default" : "outline"}
              onClick={() => setFiltroStatus(s)}
              className="capitalize"
            >
              {s === "todos" ? "Todos" : s + "s"}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="min-w-0">
            <Label className="text-xs flex items-center gap-1"><Filter className="w-3 h-3"/> Prédio</Label>
            <Select value={fPredio} onValueChange={(v) => setFPredio(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {PREDIOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Pavimento</Label>
            <Select value={fPavimento} onValueChange={(v) => setFPavimento(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {PAVIMENTOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Ambiente</Label>
            <Select value={fAmbiente} onValueChange={(v) => setFAmbiente(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {AMBIENTES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0">
            <Label className="text-xs">Uso Principal</Label>
            <Select value={fUso} onValueChange={(v) => setFUso(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {USOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <ErrorState onRetry={load} />
        ) : lista.length === 0 ? (
          <EmptyState message="Nenhum local cadastrado" />
        ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lista.map((l) => (
            <Card key={l.id} className="shadow-card-soft overflow-hidden">
              <CardContent className="p-4 md:p-5">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-md bg-gold/15 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h3 className="font-serif text-lg md:text-xl truncate min-w-0 w-full">{l.nome_completo || l.nome}</h3>
                      {l.status === "inativo" && (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                      {!l.permite_agendamento && (
                        <Badge variant="outline" className="text-[10px]"><Lock className="w-3 h-3 mr-1"/>Sem agendamento</Badge>
                      )}
                      {l.acessibilidade && (
                        <Badge variant="outline" className="text-[10px]"><Accessibility className="w-3 h-3 mr-1"/>Acessível</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {l.predio && <Badge variant="outline" className="text-[10px]">{labelOf(PREDIOS, l.predio)}</Badge>}
                      {l.pavimento && <Badge variant="outline" className="text-[10px]">{labelOf(PAVIMENTOS, l.pavimento)}</Badge>}
                      {l.ambiente && <Badge variant="outline" className="text-[10px]">{labelOf(AMBIENTES, l.ambiente)}</Badge>}
                      {l.uso_principal && <Badge className="text-[10px]">{labelOf(USOS, l.uso_principal)}</Badge>}
                      {l.localizacao_interna && <Badge variant="outline" className="text-[10px]">{labelOf(LOC_INTERNAS, l.localizacao_interna)}</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {l.capacidade != null && (
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {l.capacidade} pessoas</span>
                      )}
                      {l.area_m2 != null && (
                        <span>{l.area_m2} m²</span>
                      )}
                      <span className="flex items-center gap-1"><Lock className="w-3 h-3"/>{labelOf(RESTRICOES, l.restricao_acesso)}</span>
                    </div>
                    {l.referencia_visual && (
                      <p className="text-xs text-muted-foreground mt-1 italic">📍 {l.referencia_visual}</p>
                    )}
                    {l.mapa_url && (
                      <a href={l.mapa_url} target="_blank" rel="noreferrer" className="block mt-2">
                        <img src={l.mapa_url} alt={`Mapa ${l.nome}`} className="rounded-md border max-h-32 object-cover w-full"/>
                      </a>
                    )}
                    {(l.descricao || l.observacoes) && (
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{l.descricao ?? l.observacoes}</p>
                    )}
                    {canEdit && (
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" onClick={() => abrirEdicao(l)}>
                          <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(l)}>
                          {l.status === "ativo" ? "Inativar" : "Reativar"}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {editing ? "Editar local" : "Novo local"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>Nome do local *</Label>
              <Input
                required
                placeholder="Ex.: Templo principal, Sala 05"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Nome completo: <strong>{form.nome || "—"}{form.pavimento ? " - " + labelOf(PAVIMENTOS, form.pavimento) : ""}{form.localizacao_interna ? " - " + labelOf(LOC_INTERNAS, form.localizacao_interna) : ""}</strong>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prédio *</Label>
                <Select value={form.predio} onValueChange={(v) => setForm({ ...form, predio: v as LocalPredio })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PREDIOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pavimento *</Label>
                <Select value={form.pavimento} onValueChange={(v) => setForm({ ...form, pavimento: v as LocalPavimento })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {PAVIMENTOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Ambiente *</Label>
                <Select value={form.ambiente} onValueChange={(v) => setForm({ ...form, ambiente: v as LocalAmbiente })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {AMBIENTES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Uso Principal *</Label>
                <Select value={form.uso_principal} onValueChange={(v) => setForm({ ...form, uso_principal: v as LocalUso })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {USOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Localização interna</Label>
                <Select value={form.localizacao_interna} onValueChange={(v) => setForm({ ...form, localizacao_interna: v as LocalLocInterna })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {LOC_INTERNAS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Restrição de acesso</Label>
                <Select value={form.restricao_acesso} onValueChange={(v) => setForm({ ...form, restricao_acesso: v as LocalRestricao })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RESTRICOES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Capacidade</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="Opcional"
                  value={form.capacidade}
                  onChange={(e) => setForm({ ...form, capacidade: e.target.value })}
                />
              </div>
              <div>
                <Label>Área (m²)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Opcional"
                  value={form.area_m2}
                  onChange={(e) => setForm({ ...form, area_m2: e.target.value })}
                />
              </div>
              <div>
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as LocalStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Referência visual</Label>
              <Input
                placeholder="Ex.: Em frente ao púlpito, ao lado da escada"
                value={form.referencia_visual}
                onChange={(e) => setForm({ ...form, referencia_visual: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-md border bg-muted/30">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2 text-sm"><Accessibility className="w-4 h-4"/> Acessibilidade</span>
                <Switch checked={form.acessibilidade} onCheckedChange={(v) => setForm({ ...form, acessibilidade: v })} />
              </label>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2 text-sm"><Calendar className="w-4 h-4"/> Permite agendamento</span>
                <Switch checked={form.permite_agendamento} onCheckedChange={(v) => setForm({ ...form, permite_agendamento: v })} />
              </label>
            </div>

            <div>
              <Label>Tipos de evento permitidos</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                {EVENTO_TIPOS.map((t) => (
                  <label key={t.value} className="flex items-center gap-2 text-sm border rounded-md px-2 py-1.5 cursor-pointer hover:bg-accent">
                    <Checkbox
                      checked={form.tipos_evento_permitidos.includes(t.value)}
                      onCheckedChange={() => toggleTipoEvento(t.value)}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Vazio = aceita qualquer tipo.</p>
            </div>

            <div>
              <Label className="flex items-center gap-2"><ImageIcon className="w-4 h-4"/> Mapa / planta</Label>
              {form.mapa_url ? (
                <div className="mt-1 flex items-center gap-3">
                  <img src={form.mapa_url} alt="Mapa" className="h-20 w-20 object-cover rounded-md border"/>
                  <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, mapa_url: "" })}>Remover</Button>
                </div>
              ) : (
                <div className="mt-1">
                  <input
                    id="mapa-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUploadMapa(e.target.files[0])}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={uploading}
                    onClick={() => document.getElementById("mapa-upload")?.click()}>
                    <Upload className="w-4 h-4 mr-1.5"/> {uploading ? "Enviando..." : "Enviar imagem"}
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-muted-foreground mt-1">
                Locais inativos não aparecem ao criar novos eventos. O histórico é preservado.
              </p>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={3} value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Salvar alterações" : "Cadastrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
