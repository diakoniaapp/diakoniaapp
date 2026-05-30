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

