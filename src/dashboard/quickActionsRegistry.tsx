import type { ComponentType } from "react";
import {
  UserPlus, Home, GraduationCap, Users, Sparkles, FileText,
  DollarSign, CheckSquare, Gavel, MapPin, CalendarDays,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry central de AÇÕES RÁPIDAS — análogo ao widgetRegistry.
 * Cada ação tem um label curto, ícone, rota destino e permissões.
 *
 * Como adicionar uma nova ação:
 *   1. Importe o ícone Lucide
 *   2. Acrescente um registro abaixo (id único, permissões, prioridade)
 *   3. Pronto — aparece no painel pra quem tem permissão
 */

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  permissoes: string[];      // OR — basta ter UMA das permissões
  prioridade: 0 | 1 | 2;     // 0 = mais frequente, 2 = secundária
  ativo?: boolean;
}

export const quickActionsRegistry: QuickAction[] = [
  // ── P0 — As 3-4 ações MAIS frequentes (vão pro topo) ───────────────
  { id: "nova-pessoa", label: "Cadastrar pessoa", icon: UserPlus,
    to: "/membros?abrir=novo", permissoes: ["criar_pessoa"], prioridade: 0 },

  { id: "novo-lancamento", label: "Lançamento", icon: DollarSign,
    to: "/financas?lancar=true", permissoes: ["lancar_financeiro"], prioridade: 0 },

  { id: "nova-membresia", label: "Solicitar membresia", icon: FileText,
    to: "/membresia?abrir=novo", permissoes: ["criar_membresia","ver_membresia"], prioridade: 0 },

  // ── P1 — Acessos a módulos principais ─────────────────────────────
  { id: "abrir-familias", label: "Famílias", icon: Home,
    to: "/familias", permissoes: ["ver_familias"], prioridade: 1 },

  { id: "abrir-ebd", label: "EBD", icon: GraduationCap,
    to: "/ebd", permissoes: ["ver_ebd"], prioridade: 1 },

  { id: "abrir-pgm", label: "Pequenos Grupos", icon: Users,
    to: "/pgm", permissoes: ["ver_pgm"], prioridade: 1 },

  { id: "abrir-acompanhamento", label: "Acompanhamento", icon: Sparkles,
    to: "/painel-pastoral", permissoes: ["ver_painel_pastoral"], prioridade: 1 },

  // ── P2 — Atalhos administrativos secundários ──────────────────────
  { id: "abrir-reunioes", label: "Reuniões", icon: Gavel,
    to: "/governanca", permissoes: ["ver_governanca"], prioridade: 2 },

  { id: "abrir-assuntos", label: "Assuntos", icon: CheckSquare,
    to: "/assuntos", permissoes: ["ver_assuntos"], prioridade: 2 },

  { id: "abrir-agenda", label: "Agenda", icon: CalendarDays,
    to: "/eventos", permissoes: [], prioridade: 2 },

  { id: "abrir-espacos", label: "Espaços", icon: MapPin,
    to: "/locais", permissoes: ["ver_locais","ver_familias"], prioridade: 2 },
];

export interface ContextoAcao {
  permissoes: Set<string>;
}

/**
 * Filtra + ordena ações pelo perfil do usuário.
 * Por padrão limita a 6 atalhos (pesquisa de UX: <7 reduz fadiga de escolha).
 */
export function getAcoesParaUsuario(
  ctx: ContextoAcao,
  opts: { limite?: number } = {}
): QuickAction[] {
  const { limite = 6 } = opts;
  return quickActionsRegistry
    .filter(a => a.ativo !== false)
    .filter(a => a.permissoes.length === 0 ||
                 a.permissoes.some(p => ctx.permissoes.has(p)))
    .sort((a, b) => a.prioridade - b.prioridade)
    .slice(0, limite);
}
