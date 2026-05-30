import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, MapPin, Pencil, Users, Filter, Upload, Accessibility, Lock,
  Calendar, Image as ImageIcon, Wrench, Sparkles, AlertTriangle,
  CheckCircle, Clock, XCircle, ChevronDown, ChevronUp, History,
  Building2, Layers, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { ListSkeleton, EmptyState, ErrorState } from "@/components/ListState";
import { cn } from "@/lib/utils";
import { format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EstruturaOnboarding } from "@/components/locais/EstruturaOnboarding";

// ── Tipos ────────────────────────────────────────────────────────────────────
type LocalStatus = "ativo" | "inativo";
type LocalStatusOp = "disponivel" | "em_uso" | "em_manutencao" | "interditado" | "inativo";
type LocalPredio = "rp" | "sf";
type LocalPavimento = "subsolo" | "terreo" | "galeria" | "andares_superiores" | "area_tecnica";
type LocalAmbiente = "templo" | "sala" | "administrativo" | "tecnico" | "area_social" | "circulacao" | "deposito";
type LocalUso = "culto" | "ensino" | "musica" | "comunicacao" | "administrativo" | "manutencao" | "apoio_tecnico" | "armazenamento";
type LocalLocInterna = "frente" | "fundos" | "lado_esquerdo" | "lado_direito" | "centro" | "area_externa";
type LocalRestricao = "livre" | "restrito" | "tecnico";
type EventoTipo = "culto" | "reuniao" | "ensaio" | "acao_social" | "curso" | "outro";
type FreqLimpeza = "diaria" | "semanal" | "quinzenal" | "mensal" | "sob_demanda";
type HistTipo = "manutencao" | "limpeza" | "interdito" | "reativacao" | "vistoria" | "outro";

interface Local {
  id: string;
  nome: string;
  nome_completo: string | null;
  codigo: string | null;
  predio: LocalPredio | null;
  pavimento: LocalPavimento | null;
  ambiente: LocalAmbiente | null;
  uso_principal: LocalUso | null;
  capacidade: number | null;
  status: LocalStatus;
  status_operacional: LocalStatusOp;
  motivo_status: string | null;
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
  // Manutencao
  periodicidade_manutencao: number | null;
  ultima_manutencao: string | null;
  proxima_manutencao: string | null;
  responsavel_manutencao_id: string | null;
  // Limpeza
  frequencia_limpeza: FreqLimpeza | null;
  ultima_limpeza: string | null;
  responsavel_limpeza_id: string | null;
  // Responsavel geral
  responsavel_id: string | null;
  codigo_chave: string | null;
}

interface HistoricoItem {
  id: string;
  local_id: string;
  tipo: HistTipo;
  descricao: string | null;
  data: string;
  realizado_por: string | null;
  custo: number | null;
  created_at: string;
}

// ── Constantes / lookup ───────────────────────────────────────────────────────
const PREDIOS = [
  { value: "rp" as LocalPredio, label: "RP – Rua Paraíba" },
  { value: "sf" as LocalPredio, label: "SF – Senador Furtado" },
];
const PAVIMENTOS = [
  { value: "subsolo" as LocalPavimento, label: "Subsolo" },
  { value: "terreo" as LocalPavimento, label: "Térreo" },
  { value: "galeria" as LocalPavimento, label: "Galeria" },
  { value: "andares_superiores" as LocalPavimento, label: "Andares superiores" },
  { value: "area_tecnica" as LocalPavimento, label: "Área técnica" },
];
const AMBIENTES = [
  { value: "templo" as LocalAmbiente, label: "Templo" },
  { value: "sala" as LocalAmbiente, label: "Sala" },
  { value: "administrativo" as LocalAmbiente, label: "Administrativo" },
  { value: "tecnico" as LocalAmbiente, label: "Técnico" },
  { value: "area_social" as LocalAmbiente, label: "Área Social" },
  { value: "circulacao" as LocalAmbiente, label: "Circulação" },
  { value: "deposito" as LocalAmbiente, label: "Depósito" },
];
const USOS = [
  { value: "culto" as LocalUso, label: "Culto" },
  { value: "ensino" as LocalUso, label: "Ensino" },
  { value: "musica" as LocalUso, label: "Música" },
  { value: "comunicacao" as LocalUso, label: "Comunicação" },
  { value: "administrativo" as LocalUso, label: "Administrativo" },
  { value: "manutencao" as LocalUso, label: "Manutenção" },
  { value: "apoio_tecnico" as LocalUso, label: "Apoio Técnico" },
  { value: "armazenamento" as LocalUso, label: "Armazenamento" },
];
const LOC_INTERNAS = [
  { value: "frente" as LocalLocInterna, label: "Frente" },
  { value: "fundos" as LocalLocInterna, label: "Fundos" },
  { value: "lado_esquerdo" as LocalLocInterna, label: "Lado esquerdo" },
  { value: "lado_direito" as LocalLocInterna, label: "Lado direito" },
  { value: "centro" as LocalLocInterna, label: "Centro" },
  { value: "area_externa" as LocalLocInterna, label: "Área externa" },
];
const RESTRICOES = [
  { value: "livre" as LocalRestricao, label: "Livre" },
  { value: "restrito" as LocalRestricao, label: "Restrito" },
  { value: "tecnico" as LocalRestricao, label: "Técnico" },
];
const EVENTO_TIPOS = [
  { value: "culto" as EventoTipo, label: "Culto" },
  { value: "reuniao" as EventoTipo, label: "Reunião" },
  { value: "ensaio" as EventoTipo, label: "Ensaio" },
  { value: "acao_social" as EventoTipo, label: "Ação Social" },
  { value: "curso" as EventoTipo, label: "Curso" },
  { value: "outro" as EventoTipo, label: "Outro" },
];
const FREQ_LIMPEZA = [
  { value: "diaria" as FreqLimpeza, label: "Diária" },
  { value: "semanal" as FreqLimpeza, label: "Semanal" },
  { value: "quinzenal" as FreqLimpeza, label: "Quinzenal" },
  { value: "mensal" as FreqLimpeza, label: "Mensal" },
  { value: "sob_demanda" as FreqLimpeza, label: "Sob demanda" },
];
const HIST_TIPOS = [
  { value: "manutencao" as HistTipo, label: "Manutenção" },
  { value: "limpeza" as HistTipo, label: "Limpeza" },
  { value: "interdito" as HistTipo, label: "Interdito" },
  { value: "reativacao" as HistTipo, label: "Reativação" },
  { value: "vistoria" as HistTipo, label: "Vistoria" },
  { value: "outro" as HistTipo, label: "Outro" },
];

// ── Status operacional: cores e ícones ────────────────────────────────────────
const STATUS_OP_CONFIG: Record<LocalStatusOp, {
  label: string; color: string; dot: string; icon: any;
}> = {
  disponivel:     { label: "Disponível",     color: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400", dot: "bg-emerald-500", icon: CheckCircle },
  em_uso:         { label: "Em uso",         color: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400",   dot: "bg-blue-500",    icon: Clock },
  em_manutencao:  { label: "Manutenção",  color: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400",  dot: "bg-amber-500",   icon: Wrench },
  interditado:    { label: "Interditado",    color: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400",         dot: "bg-red-500",     icon: XCircle },
  inativo:        { label: "Inativo",        color: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400",   dot: "bg-gray-400",    icon: EyeOff },
};

// ── Alerta manutencao: label/cor ──────────────────────────────────────────────
function alertaManutencao(proxima: string | null): { label: string; color: string } | null {
  if (!proxima) return null;
  const dias = differenceInDays(parseISO(proxima), new Date());
  if (dias < 0)  return { label: "Vencida",            color: "text-red-600" };
  if (dias <= 7) return { label: `Urgente (${dias}d)`,  color: "text-amber-600" };
  if (dias <= 30) return { label: `Em ${dias} dias`,    color: "text-yellow-600" };
  return null;
}

const labelOf = <T extends string>(arr: { value: T; label: string }[], v: T | null | undefined) =>
  v ? arr.find((x) => x.value === v)?.label ?? v : "—";


// ── Interfaces adicionais ────────────────────────────────────────────────────
interface Unidade {
  id: string;
  nome: string;
  tipo: "sede" | "congregacao" | "missao";
  responsavel_id: string | null;
  created_at: string;
}

interface Predio {
  id: string;
  unidade_id: string;
  nome: string;
  tipo: "templo" | "anexo" | "residencia" | "administrativo" | "apoio";
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  ativo: boolean;
}

const UNIDADE_TIPOS = [
  { value: "sede" as const, label: "Sede" },
  { value: "congregacao" as const, label: "Congregação" },
  { value: "missao" as const, label: "Missão" },
];

const PREDIO_TIPOS = [
  { value: "templo" as const, label: "Templo" },
  { value: "anexo" as const, label: "Anexo" },
  { value: "residencia" as const, label: "Residência" },
  { value: "administrativo" as const, label: "Administrativo" },
  { value: "apoio" as const, label: "Apoio" },
];

const emptyLocal = (): Partial<Local> => ({
  nome: "", status: "ativo", status_operacional: "disponivel",
  acessibilidade: false, restricao_acesso: "livre",
  permite_agendamento: true, tipos_evento_permitidos: [],
});

const emptyUnidade = (): Partial<Unidade> => ({
  nome: "", tipo: "sede",
});

const emptyPredio = (): Partial<Predio> => ({
  nome: "", tipo: "templo", ativo: true,
});

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT: UnidadeDialog
// ══════════════════════════════════════════════════════════════════════════════
function UnidadeDialog({
  open, onClose, initial, onSaved,
}: { open: boolean; onClose: () => void; initial?: Partial<Unidade>; onSaved: (u: Unidade) => void }) {
  const [form, setForm] = useState<Partial<Unidade>>(initial ?? emptyUnidade());
  const [loading, setLoading] = useState(false);
  useEffect(() => { setForm(initial ?? emptyUnidade()); }, [initial, open]);

  const save = async () => {
    if (!form.nome?.trim()) { toast.error("Informe o nome da unidade"); return; }
    setLoading(true);
    try {
      if (form.id) {
        const { data, error } = await supabase.from("unidades").update({
          nome: form.nome, tipo: form.tipo,
        }).eq("id", form.id).select().single();
        if (error) throw error;
        toast.success("Unidade atualizada");
        onSaved(data as Unidade);
      } else {
        const { data, error } = await supabase.from("unidades").insert({
          nome: form.nome, tipo: form.tipo ?? "sede",
        }).select().single();
        if (error) throw error;
        toast.success("Unidade criada");
        onSaved(data as Unidade);
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar unidade");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar Unidade" : "Nova Unidade / Congregação"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Nome *</Label>
            <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Sede Central, Congregação Norte..." />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.tipo ?? "sede"} onValueChange={(v) => setForm({ ...form, tipo: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {UNIDADE_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT: PredioDialog
// ══════════════════════════════════════════════════════════════════════════════
function PredioDialog({
  open, onClose, initial, unidades, defaultUnidadeId, onSaved,
}: {
  open: boolean; onClose: () => void; initial?: Partial<Predio>;
  unidades: Unidade[]; defaultUnidadeId?: string;
  onSaved: (p: Predio) => void;
}) {
  const [form, setForm] = useState<Partial<Predio>>(initial ?? emptyPredio());
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setForm({ ...(initial ?? emptyPredio()), unidade_id: initial?.unidade_id ?? defaultUnidadeId ?? "" });
  }, [initial, open, defaultUnidadeId]);

  const save = async () => {
    if (!form.nome?.trim()) { toast.error("Informe o nome do prédio"); return; }
    if (!form.unidade_id) { toast.error("Selecione a unidade"); return; }
    setLoading(true);
    try {
      const payload = {
        nome: form.nome, tipo: form.tipo ?? "templo",
        unidade_id: form.unidade_id,
        logradouro: form.logradouro ?? null, numero: form.numero ?? null,
        bairro: form.bairro ?? null, cidade: form.cidade ?? null,
        estado: form.estado ?? null, cep: form.cep ?? null,
        ativo: form.ativo ?? true,
      };
      if (form.id) {
        const { data, error } = await supabase.from("predios").update(payload).eq("id", form.id).select().single();
        if (error) throw error;
        toast.success("Prédio atualizado");
        onSaved(data as Predio);
      } else {
        const { data, error } = await supabase.from("predios").insert(payload).select().single();
        if (error) throw error;
        toast.success("Prédio criado");
        onSaved(data as Predio);
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar prédio");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar Prédio" : "Novo Prédio / Estrutura"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Unidade *</Label>
              <Select value={form.unidade_id ?? ""} onValueChange={(v) => setForm({ ...form, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade..." /></SelectTrigger>
                <SelectContent>
                  {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Nome do prédio *</Label>
              <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Templo Principal, Prédio Anexo..." />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo ?? "templo"} onValueChange={(v) => setForm({ ...form, tipo: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PREDIO_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CEP</Label>
              <Input value={form.cep ?? ""} onChange={(e) => setForm({ ...form, cep: e.target.value })}
                placeholder="00000-000" />
            </div>
            <div className="col-span-2">
              <Label>Logradouro</Label>
              <Input value={form.logradouro ?? ""} onChange={(e) => setForm({ ...form, logradouro: e.target.value })}
                placeholder="Rua, Av., Praça..." />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={form.numero ?? ""} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={form.bairro ?? ""} onChange={(e) => setForm({ ...form, bairro: e.target.value })} />
            </div>
            <div>
              <Label>Cidade</Label>
              <Input value={form.cidade ?? ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            </div>
            <div>
              <Label>Estado</Label>
              <Input value={form.estado ?? ""} onChange={(e) => setForm({ ...form, estado: e.target.value })} placeholder="SP" maxLength={2} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.ativo ?? true} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
            <Label>Prédio ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT: LocalDialog
// ══════════════════════════════════════════════════════════════════════════════
function LocalDialog({
  open, onClose, initial, predios, unidades, defaultPredioId, onSaved,
}: {
  open: boolean; onClose: () => void; initial?: Partial<Local>;
  predios: Predio[]; unidades: Unidade[];
  defaultPredioId?: string;
  onSaved: (l: Local) => void;
}) {
  const [form, setForm] = useState<Partial<Local>>(initial ?? emptyLocal());
  const [loading, setLoading] = useState(false);
  const [selectedUnidadeId, setSelectedUnidadeId] = useState<string>("");

  useEffect(() => {
    const f = { ...(initial ?? emptyLocal()), predio_id: initial?.predio_id ?? defaultPredioId ?? "" } as any;
    setForm(f);
    if (f.predio_id) {
      const p = predios.find((x) => x.id === f.predio_id);
      if (p) setSelectedUnidadeId(p.unidade_id);
    }
  }, [initial, open, defaultPredioId]);

  const filteredPredios = selectedUnidadeId
    ? predios.filter((p) => p.unidade_id === selectedUnidadeId)
    : predios;

  const save = async () => {
    if (!form.nome?.trim()) { toast.error("Informe o nome do espaço"); return; }
    setLoading(true);
    try {
      const payload: any = {
        nome: form.nome, codigo: form.codigo ?? null,
        predio_id: (form as any).predio_id ?? null,
        tipo_local: form.ambiente ?? null,
        capacidade: form.capacidade ?? null,
        status: form.status ?? "ativo",
        status_operacional: form.status_operacional ?? "disponivel",
        uso_principal: form.uso_principal ?? null,
        observacoes: form.observacoes ?? null,
        acessibilidade: form.acessibilidade ?? false,
        restricao_acesso: form.restricao_acesso ?? "livre",
        permite_agendamento: form.permite_agendamento ?? true,
        tipos_evento_permitidos: form.tipos_evento_permitidos ?? [],
        periodicidade_manutencao: form.periodicidade_manutencao ?? null,
        ultima_manutencao: form.ultima_manutencao ?? null,
        proxima_manutencao: form.proxima_manutencao ?? null,
        frequencia_limpeza: form.frequencia_limpeza ?? null,
        descricao: form.descricao ?? null,
        area_m2: form.area_m2 ?? null,
      };
      if (form.id) {
        const { data, error } = await supabase.from("locais").update(payload).eq("id", form.id).select().single();
        if (error) throw error;
        toast.success("Espaço atualizado");
        onSaved(data as Local);
      } else {
        const { data, error } = await supabase.from("locais").insert(payload).select().single();
        if (error) throw error;
        toast.success("Espaço criado");
        onSaved(data as Local);
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar espaço");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar Espaço" : "Novo Espaço / Sala"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* Localização */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Localização</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Unidade</Label>
                <Select value={selectedUnidadeId} onValueChange={(v) => { setSelectedUnidadeId(v); setForm({ ...form } as any); }}>
                  <SelectTrigger><SelectValue placeholder="Filtrar por unidade..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Todas as unidades</SelectItem>
                    {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prédio / Estrutura</Label>
                <Select value={(form as any).predio_id ?? ""} onValueChange={(v) => setForm({ ...form, ...({"predio_id": v} as any) })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o prédio..." /></SelectTrigger>
                  <SelectContent>
                    {filteredPredios.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          {/* Identificação */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificação</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Nome *</Label>
                <Input value={form.nome ?? ""} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  placeholder="Ex: Auditório, Sala 201, Cozinha..." />
              </div>
              <div>
                <Label>Código</Label>
                <Input value={form.codigo ?? ""} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="S-01" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo de ambiente</Label>
                <Select value={form.ambiente ?? ""} onValueChange={(v) => setForm({ ...form, ambiente: v as any })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{AMBIENTES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Uso principal</Label>
                <Select value={form.uso_principal ?? ""} onValueChange={(v) => setForm({ ...form, uso_principal: v as any })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>{USOS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Capacidade</Label>
                <Input type="number" value={form.capacidade ?? ""} onChange={(e) => setForm({ ...form, capacidade: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <Label>Área (m²)</Label>
                <Input type="number" value={form.area_m2 ?? ""} onChange={(e) => setForm({ ...form, area_m2: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
          </div>
          {/* Status */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status Operacional</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status_operacional ?? "disponivel"} onValueChange={(v) => setForm({ ...form, status_operacional: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_OP_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Restrição de acesso</Label>
                <Select value={form.restricao_acesso ?? "livre"} onValueChange={(v) => setForm({ ...form, restricao_acesso: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RESTRICOES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.permite_agendamento ?? true} onCheckedChange={(v) => setForm({ ...form, permite_agendamento: v })} />
                <Label>Disponível para agendamento</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.acessibilidade ?? false} onCheckedChange={(v) => setForm({ ...form, acessibilidade: v })} />
                <Label>Acessível (PCD)</Label>
              </div>
            </div>
          </div>
          {/* Manutenção */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Manutenção</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Periodicidade (dias)</Label>
                <Input type="number" value={form.periodicidade_manutencao ?? ""} onChange={(e) => setForm({ ...form, periodicidade_manutencao: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <Label>Última manutenção</Label>
                <Input type="date" value={form.ultima_manutencao ?? ""} onChange={(e) => setForm({ ...form, ultima_manutencao: e.target.value || null })} />
              </div>
              <div>
                <Label>Próxima manutenção</Label>
                <Input type="date" value={form.proxima_manutencao ?? ""} onChange={(e) => setForm({ ...form, proxima_manutencao: e.target.value || null })} />
              </div>
            </div>
            <div>
              <Label>Frequência de limpeza</Label>
              <Select value={form.frequencia_limpeza ?? ""} onValueChange={(v) => setForm({ ...form, frequencia_limpeza: v as any })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>{FREQ_LIMPEZA.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {/* Observações */}
          <div>
            <Label>Observações</Label>
            <Textarea value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              placeholder="Informações adicionais sobre o espaço..." rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={save} disabled={loading}>{loading ? "Salvando..." : "Salvar Espaço"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENT: HistoricoDialog
// ══════════════════════════════════════════════════════════════════════════════
function HistoricoDialog({
  open, onClose, local, historico,
}: { open: boolean; onClose: () => void; local: Local | null; historico: HistoricoItem[] }) {
  if (!local) return null;
  const items = historico.filter((h) => h.local_id === local.id);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Histórico — {local.nome}</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum registro encontrado.</p>
        ) : (
          <div className="space-y-3 py-2">
            {items.map((h) => (
              <div key={h.id} className="border rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{labelOf(HIST_TIPOS, h.tipo)}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {format(parseISO(h.data), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
                {h.descricao && <p className="text-muted-foreground">{h.descricao}</p>}
                {h.custo != null && (
                  <p className="text-xs text-muted-foreground">
                    Custo: R$ {h.custo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Locais() {
  const { user } = useAuth();

  // ── Data state ──────────────────────────────────────────────────────────────
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [predios, setPredios] = useState<Predio[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterUnidade, setFilterUnidade] = useState("_all");
  const [filterPredio, setFilterPredio] = useState("_all");
  const [filterStatus, setFilterStatus] = useState<LocalStatusOp | "_all">("_all");
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(false);

  // ── Dialog state ────────────────────────────────────────────────────────────
  const [localDialog, setLocalDialog] = useState<{ open: boolean; item?: Partial<Local>; defaultPredioId?: string }>({ open: false });
  const [unidadeDialog, setUnidadeDialog] = useState<{ open: boolean; item?: Partial<Unidade> }>({ open: false });
  const [predioDialog, setPredioDialog] = useState<{ open: boolean; item?: Partial<Predio>; defaultUnidadeId?: string }>({ open: false });
  const [historicoDialog, setHistoricoDialog] = useState<{ open: boolean; local?: Local }>({ open: false });
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Load all data ────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [unRes, prRes, loRes, hiRes] = await Promise.all([
        supabase.from("unidades").select("*").order("nome"),
        supabase.from("predios").select("*").order("nome"),
        supabase.from("locais").select("*").order("nome"),
        supabase.from("locais_historico_operacional").select("*").order("data", { ascending: false }).limit(200),
      ]);
      if (unRes.error) throw unRes.error;
      if (prRes.error) throw prRes.error;
      if (loRes.error) throw loRes.error;
      setUnidades(unRes.data as Unidade[]);
      setPredios(prRes.data as Predio[]);
      setLocais(loRes.data as Local[]);
      setHistorico((hiRes.data ?? []) as HistoricoItem[]);
    } catch (e: any) {
      setError(e.message ?? "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ── Filtered predios based on selected unidade filter ────────────────────────
  const availablePredios = useMemo(() => {
    if (filterUnidade === "_all") return predios;
    return predios.filter((p) => p.unidade_id === filterUnidade);
  }, [predios, filterUnidade]);

  // ── Filtered locais ──────────────────────────────────────────────────────────
  const filteredLocais = useMemo(() => {
    let list = locais;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        l.nome.toLowerCase().includes(q) ||
        (l.codigo ?? "").toLowerCase().includes(q) ||
        (l.descricao ?? "").toLowerCase().includes(q)
      );
    }
    if (filterStatus !== "_all") list = list.filter((l) => l.status_operacional === filterStatus);
    if (showOnlyAvailable) list = list.filter((l) => l.permite_agendamento);
    if (filterPredio !== "_all") list = list.filter((l) => (l as any).predio_id === filterPredio);
    else if (filterUnidade !== "_all") {
      const pidSet = new Set(predios.filter((p) => p.unidade_id === filterUnidade).map((p) => p.id));
      list = list.filter((l) => pidSet.has((l as any).predio_id));
    }
    return list;
  }, [locais, search, filterStatus, showOnlyAvailable, filterPredio, filterUnidade, predios]);

  // ── Counts for header ────────────────────────────────────────────────────────
  const counts = useMemo(() => ({
    total: locais.length,
    disponivel: locais.filter((l) => l.status_operacional === "disponivel").length,
    manutencao: locais.filter((l) => l.status_operacional === "em_manutencao").length,
    interditado: locais.filter((l) => l.status_operacional === "interditado").length,
  }), [locais]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleLocalSaved = (l: Local) => {
    setLocais((prev) => {
      const idx = prev.findIndex((x) => x.id === l.id);
      return idx >= 0 ? prev.map((x) => x.id === l.id ? l : x) : [...prev, l];
    });
  };
  const handleUnidadeSaved = (u: Unidade) => {
    setUnidades((prev) => {
      const idx = prev.findIndex((x) => x.id === u.id);
      return idx >= 0 ? prev.map((x) => x.id === u.id ? u : x) : [...prev, u];
    });
  };
  const handlePredioSaved = (p: Predio) => {
    setPredios((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      return idx >= 0 ? prev.map((x) => x.id === p.id ? p : x) : [...prev, p];
    });
  };
  const handleDeleteLocal = async (id: string) => {
    if (!confirm("Remover este espaço? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("locais").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setLocais((prev) => prev.filter((l) => l.id !== id));
    toast.success("Espaço removido");
  };

  // ── Render: status badge ─────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: LocalStatusOp }) => {
    const cfg = STATUS_OP_CONFIG[status];
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.color}`}>
        <Icon className="h-3 w-3" />
        {cfg.label}
      </span>
    );
  };

  // ── Render: maintenance alert badge ──────────────────────────────────────────
  const AlertBadge = ({ proxima }: { proxima: string | null }) => {
    const alerta = alertaManutencao(proxima);
    if (!alerta) return null;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${alerta.color}`}>
        <AlertTriangle className="h-3 w-3" />
        {alerta.label}
      </span>
    );
  };

  // ── Render: local card (inside predio) ────────────────────────────────────────
  const LocalCard = ({ local }: { local: Local }) => (
    <div className="flex items-start justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group transition-colors border border-transparent hover:border-border">
      <div className="flex items-start gap-3 min-w-0">
        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{local.nome}</span>
            {local.codigo && <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{local.codigo}</span>}
            <StatusBadge status={local.status_operacional} />
            <AlertBadge proxima={local.proxima_manutencao ?? null} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
            {local.capacidade && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{local.capacidade} pessoas</span>}
            {local.uso_principal && <span>{labelOf(USOS, local.uso_principal)}</span>}
            {local.permite_agendamento && <span className="text-emerald-600 flex items-center gap-1"><Calendar className="h-3 w-3" />Agendável</span>}
            {local.acessibilidade && <span className="text-blue-600 flex items-center gap-1"><Accessibility className="h-3 w-3" />Acessível</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => setHistoricoDialog({ open: true, local })}>
          <History className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7"
          onClick={() => setLocalDialog({ open: true, item: local })}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => handleDeleteLocal(local.id)}>
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  // ── Render: predio card (inside unidade) ─────────────────────────────────────
  const [expandedPredios, setExpandedPredios] = useState<Set<string>>(new Set());
  const togglePredio = (id: string) => {
    setExpandedPredios((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const PredioCard = ({ predio }: { predio: Predio }) => {
    const locaisNestePredio = filteredLocais.filter((l) => (l as any).predio_id === predio.id);
    const expanded = expandedPredios.has(predio.id);
    const alertCount = locaisNestePredio.filter((l) => alertaManutencao(l.proxima_manutencao ?? null)).length;
    const address = [predio.logradouro, predio.numero, predio.bairro, predio.cidade].filter(Boolean).join(", ");
    return (
      <div className="border rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between gap-2 p-3 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
          onClick={() => togglePredio(predio.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{predio.nome}</span>
                <Badge variant="outline" className="text-xs">{labelOf(PREDIO_TIPOS, predio.tipo)}</Badge>
                {!predio.ativo && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                {alertCount > 0 && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />{alertCount} alerta{alertCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {address && <p className="text-xs text-muted-foreground truncate">{address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{locaisNestePredio.length} espaço{locaisNestePredio.length !== 1 ? "s" : ""}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setPredioDialog({ open: true, item: predio }); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <div className="divide-y">
            {locaisNestePredio.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Nenhum espaço neste prédio.{" "}
                <button className="underline text-primary" onClick={() => setLocalDialog({ open: true, defaultPredioId: predio.id })}>
                  Adicionar espaço
                </button>
              </div>
            ) : (
              locaisNestePredio.map((l) => <LocalCard key={l.id} local={l} />)
            )}
            <div className="p-2 bg-muted/10">
              <Button size="sm" variant="ghost" className="text-xs h-7 gap-1"
                onClick={() => setLocalDialog({ open: true, defaultPredioId: predio.id })}>
                <Plus className="h-3 w-3" /> Adicionar espaço
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: unidade section ───────────────────────────────────────────────────
  const [expandedUnidades, setExpandedUnidades] = useState<Set<string>>(new Set());
  const toggleUnidade = (id: string) => {
    setExpandedUnidades((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Expand all unidades by default when data loads
  useEffect(() => {
    if (unidades.length > 0) {
      setExpandedUnidades(new Set(unidades.map((u) => u.id)));
      // Also expand all predios
      setExpandedPredios(new Set(predios.map((p) => p.id)));
    }
  }, [unidades, predios]);

  const UnidadeSection = ({ unidade }: { unidade: Unidade }) => {
    const prediosNaUnidade = availablePredios.filter((p) => p.unidade_id === unidade.id);
    const allLocaisNaUnidade = locais.filter((l) =>
      prediosNaUnidade.some((p) => p.id === (l as any).predio_id)
    );
    const expanded = expandedUnidades.has(unidade.id);
    const tipoLabel = labelOf(UNIDADE_TIPOS, unidade.tipo);
    return (
      <div className="space-y-2">
        <div
          className="flex items-center justify-between gap-2 p-3 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 cursor-pointer hover:from-primary/10 hover:to-primary/15 transition-all"
          onClick={() => toggleUnidade(unidade.id)}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{unidade.nome}</span>
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">{tipoLabel}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {prediosNaUnidade.length} prédio{prediosNaUnidade.length !== 1 ? "s" : ""} · {allLocaisNaUnidade.length} espaço{allLocaisNaUnidade.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setUnidadeDialog({ open: true, item: unidade }); }}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setPredioDialog({ open: true, defaultUnidadeId: unidade.id }); }}>
              <Plus className="h-3.5 w-3.5" /> Prédio
            </Button>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
        {expanded && (
          <div className="ml-4 space-y-2">
            {prediosNaUnidade.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground border border-dashed rounded-lg">
                <Building2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>Nenhum prédio cadastrado nesta unidade.</p>
                <button className="underline text-primary mt-1" onClick={() => setPredioDialog({ open: true, defaultUnidadeId: unidade.id })}>
                  Adicionar primeiro prédio
                </button>
              </div>
            ) : (
              prediosNaUnidade.map((p) => <PredioCard key={p.id} predio={p} />)
            )}
          </div>
        )}
      </div>
    );
  };

  // ── Render: locais sem prédio ─────────────────────────────────────────────────
  const locaisSemPredio = filteredLocais.filter((l) => !(l as any).predio_id);

  // ── Onboarding: show if no unidades ──────────────────────────────────────────
  const noSetup = !loading && unidades.length === 0;

  // ── MAIN RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <PageHeader
          title="Espaços e Locais"
          description={
            loading ? "Carregando..." :
            `${counts.total} espaço${counts.total !== 1 ? "s" : ""} · ${counts.disponivel} disponíve${counts.disponivel !== 1 ? "is" : "l"}${counts.manutencao > 0 ? ` · ${counts.manutencao} em manutenção` : ""}${counts.interditado > 0 ? ` · ${counts.interditado} interditado${counts.interditado !== 1 ? "s" : ""}` : ""}`
          }
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setShowOnboarding(true)}>
            <Sparkles className="h-4 w-4" /> Configurar estrutura
          </Button>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setUnidadeDialog({ open: true })}>
            <Plus className="h-4 w-4" /> Nova unidade
          </Button>
          <Button size="sm" className="gap-1" onClick={() => setLocalDialog({ open: true })}>
            <Plus className="h-4 w-4" /> Novo espaço
          </Button>
        </div>
      </div>

      {/* ── No setup state ──────────────────────────────────────────────────── */}
      {noSetup && (
        <div className="border border-dashed rounded-xl p-10 text-center space-y-4">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <div>
            <p className="font-semibold text-lg">Configure a estrutura física da sua igreja</p>
            <p className="text-muted-foreground text-sm mt-1">
              Organize a hierarquia: Unidade → Prédio → Espaço para gerenciar tudo de forma intuitiva.
            </p>
          </div>
          <Button onClick={() => setShowOnboarding(true)} className="gap-2">
            <Sparkles className="h-4 w-4" /> Iniciar configuração
          </Button>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────────────── */}
      {!noSetup && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou código..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={filterUnidade} onValueChange={(v) => { setFilterUnidade(v); setFilterPredio("_all"); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Unidade..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas as unidades</SelectItem>
              {unidades.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPredio} onValueChange={setFilterPredio}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Prédio..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os prédios</SelectItem>
              {availablePredios.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os status</SelectItem>
              {Object.entries(STATUS_OP_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch checked={showOnlyAvailable} onCheckedChange={setShowOnlyAvailable} />
            <Label className="text-sm whitespace-nowrap">Só agendáveis</Label>
          </div>
        </div>
      )}

      {/* ── Status summary cards ─────────────────────────────────────────────── */}
      {!noSetup && !loading && locais.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(Object.entries(STATUS_OP_CONFIG) as [LocalStatusOp, typeof STATUS_OP_CONFIG[LocalStatusOp]][]).map(([key, cfg]) => {
            const count = locais.filter((l) => l.status_operacional === key).length;
            const Icon = cfg.icon;
            return (
              <Card key={key} className={`cursor-pointer transition-all hover:shadow-md ${filterStatus === key ? "ring-2 ring-primary" : ""}`}
                onClick={() => setFilterStatus(filterStatus === key ? "_all" : key)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${cfg.dot} bg-opacity-20`}>
                    <Icon className={`h-4 w-4 `} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs text-muted-foreground">{cfg.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Content: loading / error / tree ─────────────────────────────────── */}
      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={loadAll} />
      ) : !noSetup && (
        <div className="space-y-4">
          {/* Hierarchical tree: Unidade → Prédio → Local */}
          {unidades.length > 0 ? (
            unidades.map((u) => <UnidadeSection key={u.id} unidade={u} />)
          ) : (
            <EmptyState
              title="Nenhuma unidade cadastrada"
              description="Crie unidades para organizar os prédios e espaços da sua igreja."
              action={<Button onClick={() => setUnidadeDialog({ open: true })}>
                <Plus className="h-4 w-4 mr-2" /> Nova unidade
              </Button>}
            />
          )}

          {/* Locais orphans (without predio_id) */}
          {locaisSemPredio.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">Espaços sem prédio definido ({locaisSemPredio.length})</span>
              </div>
              <div className="border rounded-lg divide-y">
                {locaisSemPredio.map((l) => <LocalCard key={l.id} local={l} />)}
              </div>
            </div>
          )}

          {/* Empty search state */}
          {filteredLocais.length === 0 && locais.length > 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              Nenhum espaço encontrado com os filtros aplicados.
              <button className="block mx-auto mt-2 underline text-primary"
                onClick={() => { setSearch(""); setFilterStatus("_all"); setFilterUnidade("_all"); setFilterPredio("_all"); setShowOnlyAvailable(false); }}>
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <UnidadeDialog
        open={unidadeDialog.open}
        onClose={() => setUnidadeDialog({ open: false })}
        initial={unidadeDialog.item}
        onSaved={handleUnidadeSaved}
      />
      <PredioDialog
        open={predioDialog.open}
        onClose={() => setPredioDialog({ open: false })}
        initial={predioDialog.item}
        unidades={unidades}
        defaultUnidadeId={predioDialog.defaultUnidadeId}
        onSaved={handlePredioSaved}
      />
      <LocalDialog
        open={localDialog.open}
        onClose={() => setLocalDialog({ open: false })}
        initial={localDialog.item}
        predios={predios}
        unidades={unidades}
        defaultPredioId={localDialog.defaultPredioId}
        onSaved={handleLocalSaved}
      />
      <HistoricoDialog
        open={historicoDialog.open}
        onClose={() => setHistoricoDialog({ open: false })}
        local={historicoDialog.local ?? null}
        historico={historico}
      />

      {/* ── Onboarding ──────────────────────────────────────────────────────── */}
      <EstruturaOnboarding
        open={showOnboarding}
        onOpenChange={(v) => { if (!v) setShowOnboarding(false); }}
        onConcluido={() => { setShowOnboarding(false); loadAll(); }}
      />
    </div>
  );
}
