// ─── widgetRegistry.tsx ─────────────────────────────────────────────────
// Registry central de widgets do Dashboard.
// Cada widget é declarado uma única vez aqui e renderizado dinamicamente.
//
// PRIORIDADES:
//   0 → ALERTAS (sempre primeiro)
//   1 → OPERACIONAL (o que precisa fazer hoje)
//   2 → ATUAÇÃO (resumos do meu trabalho)
//   3 → SECUNDÁRIO (insights, exploração)
// ─────────────────────────────────────────────────────────────────────────

import { lazy, ComponentType, LazyExoticComponent } from "react";
import {
  Bell, Heart, CalendarCheck, GraduationCap, DollarSign, Users,
  CalendarDays, Lightbulb, CheckSquare, AlertTriangle,
} from "lucide-react";

export type Prioridade = 0 | 1 | 2 | 3;

export interface Widget {
  id: string;
  label: string;
  subtitulo?: string;
  icone: ComponentType<any>;
  component: LazyExoticComponent<ComponentType<any>>;
  permissoes: string[];
  areas?: string[];
  prioridade: Prioridade;
  ativo?: boolean;
}

const AlertasInteligentes = lazy(() => import("@/components/dashboard/AlertasInteligentes").then(m => ({ default: m.AlertasInteligentes })));
const AcoesDoDia          = lazy(() => import("@/components/dashboard/AcoesDoDia").then(m => ({ default: m.AcoesDoDia })));
const VidaDasFamilias     = lazy(() => import("@/components/dashboard/VidaDasFamilias").then(m => ({ default: m.VidaDasFamilias })));
const ResumoEbd           = lazy(() => import("@/components/dashboard/ResumoEbd").then(m => ({ default: m.ResumoEbd })));
const CampanhasEbd        = lazy(() => import("@/components/dashboard/CampanhasEbd").then(m => ({ default: m.CampanhasEbd })));
const ResumoPgm           = lazy(() => import("@/components/dashboard/ResumoPgm").then(m => ({ default: m.ResumoPgm })));
const AtencaoEmPessoas    = lazy(() => import("@/components/dashboard/AtencaoEmPessoas").then(m => ({ default: m.AtencaoEmPessoas })));
const AgendaDoDia         = lazy(() => import("@/components/dashboard/AgendaDoDia").then(m => ({ default: m.AgendaDoDia })));
const MeusAssuntos        = lazy(() => import("@/components/dashboard/MeusAssuntos").then(m => ({ default: m.MeusAssuntos })));
const AssuntosUrgentes    = lazy(() => import("@/components/dashboard/AssuntosUrgentes").then(m => ({ default: m.AssuntosUrgentes })));
const InsightsDoSistema   = lazy(() => import("@/components/dashboard/InsightsDoSistema").then(m => ({ default: m.InsightsDoSistema })));

export const widgetRegistry: Widget[] = [
  { id: "alertas-inteligentes", label: "Alertas inteligentes",
    subtitulo: "Coisas que precisam da sua decisão",
    icone: Bell, component: AlertasInteligentes,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0 },

  { id: "acoes-do-dia", label: "Ações de hoje",
    subtitulo: "Aniversários, bodas e visitas que acontecem agora",
    icone: CalendarCheck, component: AcoesDoDia,
    permissoes: ["ver_pessoas"], prioridade: 1 },

  { id: "agenda-do-dia", label: "Agenda do dia",
    subtitulo: "Eventos da igreja hoje",
    icone: CalendarDays, component: AgendaDoDia,
    permissoes: ["ver_pessoas","ver_familias","ver_ebd","ver_pgm"], prioridade: 1 },

  { id: "vida-das-familias", label: "Vida das famílias",
    subtitulo: "Aniversários e bodas da semana",
    icone: Heart, component: VidaDasFamilias,
    permissoes: ["ver_familias","ver_painel_pastoral"], prioridade: 2 },

  { id: "resumo-ebd", label: "Resumo da EBD",
    subtitulo: "Presença, crescimento e atenção pastoral",
    icone: GraduationCap, component: ResumoEbd,
    permissoes: ["ver_ebd"], prioridade: 2 },

  { id: "campanhas-ebd", label: "Campanhas em andamento",
    subtitulo: "Metas e arrecadação",
    icone: DollarSign, component: CampanhasEbd,
    permissoes: ["ver_financeiro","ver_ebd"], prioridade: 2 },

  { id: "atencao-pessoas", label: "Atenção em pessoas",
    subtitulo: "Visitantes recentes, sem família, sem classe EBD",
    icone: Users, component: AtencaoEmPessoas,
    permissoes: ["ver_pessoas"], prioridade: 2 },

  { id: "resumo-pgm", label: "Pequenos Grupos",
    subtitulo: "Onde a vida da igreja acontece durante a semana",
    icone: Users, component: ResumoPgm,
    permissoes: ["ver_pgm"], prioridade: 2 },

  { id: "meus-assuntos", label: "Meus assuntos",
    subtitulo: "Tarefas sob sua responsabilidade",
    icone: CheckSquare, component: MeusAssuntos,
    permissoes: ["ver_assuntos"], prioridade: 1 },

  { id: "assuntos-urgentes", label: "Assuntos urgentes da igreja",
    subtitulo: "Atrasados e vencendo essa semana",
    icone: AlertTriangle, component: AssuntosUrgentes,
    permissoes: ["ver_painel_admin","ver_painel_secretaria","ver_painel_pastoral"], prioridade: 0 },

  { id: "insights-sistema", label: "Insights do sistema",
    subtitulo: "Sugestões automáticas para a liderança",
    icone: Lightbulb, component: InsightsDoSistema,
    permissoes: ["ver_painel_admin"], prioridade: 3 },
];

export interface ContextoUsuario {
  permissoes: Set<string>;
  areas?: string[];
}

export function getWidgetsParaUsuario(
  ctx: ContextoUsuario,
  opts: { limite?: number } = {},
): Widget[] {
  const filtrados = widgetRegistry.filter(w => {
    if (w.ativo === false) return false;
    const temPerm = w.permissoes.some(p => ctx.permissoes.has(p));
    if (!temPerm) return false;
    if (w.areas && w.areas.length > 0) {
      const userAreas = ctx.areas ?? [];
      const temArea = w.areas.some(a => userAreas.includes(a));
      if (!temArea) return false;
    }
    return true;
  });
  const ordenados = filtrados.sort((a, b) => {
    if (a.prioridade !== b.prioridade) return a.prioridade - b.prioridade;
    return widgetRegistry.indexOf(a) - widgetRegistry.indexOf(b);
  });
  return opts.limite ? ordenados.slice(0, opts.limite) : ordenados;
}


/**
 * Para UX "menos é mais": retorna o painel essencial (P0-P2) e os
 * widgets secundários (P3+) separados. Útil quando se quer mostrar
 * "Ver mais widgets" depois.
 */
export function getWidgetsDivididos(
  ctx: ContextoUsuario,
  opts: { limiteEssencial?: number } = {},
): { essenciais: Widget[]; secundarios: Widget[] } {
  const todos = getWidgetsParaUsuario(ctx);
  const limite = opts.limiteEssencial ?? 5;
  return {
    essenciais: todos.slice(0, limite),
    secundarios: todos.slice(limite),
  };
}
