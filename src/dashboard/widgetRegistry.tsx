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
  Bell,
  Heart,
  CalendarCheck,
  GraduationCap,
  DollarSign,
  Users,
  CalendarDays,
  Lightbulb,
  CheckSquare,
  AlertTriangle,
  Receipt,
  Wrench,
  ClipboardCheck,
  HeartHandshake,
} from "lucide-react";

export type Prioridade = 0 | 1 | 2 | 3;

/**
 * Faixa da tela HOJE em que o widget aparece.
 *
 * Widget sem `faixa` continua existindo só no painel — é o que permite
 * migrar de forma incremental, sem tocar em todos de uma vez.
 *
 *   trava  → impede alguém de seguir; some quando resolvido
 *   gente  → o lado humano do dia (aniversários, ausências, visitantes)
 *   agenda → compromissos de hoje
 *
 * A faixa "tarefa" não vem daqui: ela é uma acao unica resolvida em
 * hoje/tarefaPrincipal.ts, e nao um bloco informativo.
 */
export type FaixaHoje = "trava" | "gente" | "agenda";

export interface Widget {
  id: string;
  label: string;
  subtitulo?: string;
  icone: ComponentType<any>;
  component: LazyExoticComponent<ComponentType<any>>;
  permissoes: string[];
  areas?: string[];
  prioridade: Prioridade;
  faixa?: FaixaHoje;
  ativo?: boolean;
}

const AlertasInteligentes = lazy(() => import("@/components/dashboard/AlertasInteligentes").then(m => ({ default: m.AlertasInteligentes })));
const CadastrosInconsistentes = lazy(() => import("@/components/dashboard/CadastrosInconsistentes").then(m => ({ default: m.CadastrosInconsistentes })));
const QuemNinguemProcurou = lazy(() => import("@/components/dashboard/QuemNinguemProcurou").then(m => ({ default: m.QuemNinguemProcurou })));
const AcoesDoDia          = lazy(() => import("@/components/dashboard/AcoesDoDia").then(m => ({ default: m.AcoesDoDia })));
const VidaDasFamilias     = lazy(() => import("@/components/dashboard/VidaDasFamilias").then(m => ({ default: m.VidaDasFamilias })));
const ResumoEbd           = lazy(() => import("@/components/dashboard/ResumoEbd").then(m => ({ default: m.ResumoEbd })));
const CampanhasEbd        = lazy(() => import("@/components/dashboard/CampanhasEbd").then(m => ({ default: m.CampanhasEbd })));
const ResumoPgm           = lazy(() => import("@/components/dashboard/ResumoPgm").then(m => ({ default: m.ResumoPgm })));
const AtencaoEmPessoas    = lazy(() => import("@/components/dashboard/AtencaoEmPessoas").then(m => ({ default: m.AtencaoEmPessoas })));
const AgendaDoDia         = lazy(() => import("@/components/dashboard/AgendaDoDia").then(m => ({ default: m.AgendaDoDia })));
const AgendaFiscalUrgente = lazy(() => import("@/components/dashboard/AgendaFiscalUrgente").then(m => ({ default: m.AgendaFiscalUrgente })));
const ManutencaoArrec     = lazy(() => import("@/components/dashboard/ManutencaoArrecadacao").then(m => ({ default: m.ManutencaoArrecadacao })));
const MeusAssuntos        = lazy(() => import("@/components/dashboard/MeusAssuntos").then(m => ({ default: m.MeusAssuntos })));
const AssuntosUrgentes    = lazy(() => import("@/components/dashboard/AssuntosUrgentes").then(m => ({ default: m.AssuntosUrgentes })));
const InsightsDoSistema   = lazy(() => import("@/components/dashboard/InsightsDoSistema").then(m => ({ default: m.InsightsDoSistema })));

export const widgetRegistry: Widget[] = [
  { id: "alertas-inteligentes", label: "Alertas inteligentes",
    subtitulo: "Coisas que precisam da sua decisão",
    icone: Bell, component: AlertasInteligentes,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0, faixa: "trava" },

  // Faixa "gente", prioridade 0: e a pergunta pastoral do dia, e vem antes de
  // qualquer pendencia de cadastro. Um cadastro incompleto espera; uma pessoa
  // que ninguem procura ha meses, nao.
  { id: "quem-ninguem-procurou", label: "Quem ninguém procurou?",
    subtitulo: "Pessoas esperando um contato — as mais esquecidas primeiro",
    icone: HeartHandshake, component: QuemNinguemProcurou,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0, faixa: "gente" },

  // Prioridade 1, nao 0: cadastro contraditorio pede correcao, mas nao e
  // urgente como um visitante que esta se perdendo. Faixa "trava" porque e
  // exatamente isso — algo que impede outra coisa de funcionar (as bodas do
  // mes, o tempo de casa).
  { id: "cadastros-inconsistentes", label: "Cadastros a corrigir",
    subtitulo: "Registros que se contradizem",
    icone: ClipboardCheck, component: CadastrosInconsistentes,
    permissoes: ["ver_pessoas","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 1, faixa: "trava" },

  { id: "acoes-do-dia", label: "Ações de hoje",
    subtitulo: "Aniversários, bodas e visitas que acontecem agora",
    icone: CalendarCheck, component: AcoesDoDia,
    permissoes: ["ver_pessoas"], prioridade: 1, faixa: "gente" },

  { id: "agenda-do-dia", label: "Agenda do dia",
    subtitulo: "Eventos da igreja hoje",
    icone: CalendarDays, component: AgendaDoDia,
    permissoes: ["ver_pessoas","ver_familias","ver_ebd","ver_pgm"], prioridade: 1, faixa: "agenda" },

  { id: "vida-das-familias", label: "Vida das famílias",
    subtitulo: "Aniversários e bodas da semana",
    icone: Heart, component: VidaDasFamilias,
    permissoes: ["ver_familias","ver_painel_pastoral"], prioridade: 2, faixa: "gente" },

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
    permissoes: ["ver_pessoas"], prioridade: 2, faixa: "gente" },

  { id: "resumo-pgm", label: "Pequenos Grupos",
    subtitulo: "Onde a vida da igreja acontece durante a semana",
    icone: Users, component: ResumoPgm,
    permissoes: ["ver_pgm"], prioridade: 2 },

  { id: "meus-assuntos", label: "Meus assuntos",
    subtitulo: "Tarefas sob sua responsabilidade",
    icone: CheckSquare, component: MeusAssuntos,
    permissoes: ["ver_assuntos"], prioridade: 1, faixa: "trava" },

  { id: "agenda-fiscal-urgente", label: "Agenda fiscal",
    subtitulo: "Obrigações vencendo e atrasadas",
    icone: Receipt, component: AgendaFiscalUrgente,
    permissoes: ["ver_fiscal","ver_financeiro","ver_painel_tesouraria","ver_painel_admin"], prioridade: 0, faixa: "trava" },

  { id: "manutencao-arrecadacao", label: "Manutenção Bazar/Cantina",
    subtitulo: "Problemas reportados e recorrências",
    icone: Wrench, component: ManutencaoArrec,
    permissoes: ["ver_manutencao","ver_arrecadacao_admin"], prioridade: 1, faixa: "trava" },

  { id: "assuntos-urgentes", label: "Assuntos urgentes da igreja",
    subtitulo: "Atrasados e vencendo essa semana",
    icone: AlertTriangle, component: AssuntosUrgentes,
    permissoes: ["ver_painel_admin","ver_painel_secretaria","ver_painel_pastoral"], prioridade: 0, faixa: "trava" },

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
 * Widgets de uma faixa da tela HOJE, já filtrados por permissão e
 * ordenados por prioridade.
 *
 * O limite é parte da regra de produto, não detalhe de layout: a tela HOJE
 * existe para responder "o que preciso fazer agora", e uma lista longa
 * deixa de responder isso. Travas e Gente ficam em 3; Agenda idem.
 */
export function getWidgetsDaFaixa(
  ctx: ContextoUsuario,
  faixa: NonNullable<Widget["faixa"]>,
  limite = 3,
): Widget[] {
  return getWidgetsParaUsuario(ctx)
    .filter(w => w.faixa === faixa)
    .slice(0, limite);
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
