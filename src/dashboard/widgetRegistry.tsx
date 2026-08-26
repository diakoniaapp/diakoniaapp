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
  HandHeart,
} from "lucide-react";

export type Prioridade = 0 | 1 | 2 | 3;

// As faixas ("trava", "gente", "agenda") e a marca `apenasHoje` sumiram
// junto com a tela HOJE. Elas existiam para repartir os mesmos widgets entre
// duas telas — e era justamente essa repartição que produzia duas versões da
// mesma coisa, por mais bem feito que fosse o corte. Com uma tela só, o
// registry volta a ter uma regra só: prioridade.

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
const SinaisDeVoluntariado = lazy(() => import("@/components/dashboard/SinaisDeVoluntariado").then(m => ({ default: m.SinaisDeVoluntariado })));
// `limit` de 4 para o painel: a fila inteira mora em /visitantes, e um bloco
// que cresce sem teto empurraria o resto da tela para baixo num domingo de
// muitas visitas. O mesmo componente, sem limite, continua servindo la.
const AcolhimentoVisitantes = lazy(() => import("@/components/membros/AcoesHoje").then(m => ({
  default: () => <m.default limit={4} />,
})));
const InsightsDoSistema   = lazy(() => import("@/components/dashboard/InsightsDoSistema").then(m => ({ default: m.InsightsDoSistema })));

// A ordem deste array decide empates de prioridade — é o desempate da tela.
export const widgetRegistry: Widget[] = [
  // DESATIVADO por decisão de produto: o painel passou a ser sobre o que
  // acontece hoje e nos próximos dias — agenda, cultos, reuniões, contas a
  // vencer —, e não uma fila de trabalho pastoral.
  //
  // `ativo: false` e não remoção: o componente e a consulta continuam
  // inteiros. Voltar é apagar esta linha.
  //
  // Desde então uma segunda decisão passou por cima desta: acompanhamento por
  // contato virou coisa só de visitante, e este widget consulta `membros` sem
  // filtro de tipo — ou seja, ele pergunta "quem ninguém procurou?" sobre 281
  // pessoas que a igreja não acompanha por contato. Reativar hoje traria de
  // volta a fila que se decidiu não ter.
  //
  // O link que ele oferece (/membros?cuidado=nunca) também não existe mais: o
  // filtro de cuidado saiu da tela de Pessoas junto com o resto. Quem reativar
  // precisa refazer as duas pontas, não só apagar a linha do `ativo`.
  { id: "quem-ninguem-procurou", label: "Quem ninguém procurou?",
    subtitulo: "Pessoas esperando um contato — as mais esquecidas primeiro",
    icone: HeartHandshake, component: QuemNinguemProcurou,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0, ativo: false },

  // "Ações de hoje" passou à frente de "Acontecendo hoje". Os dois são
  // prioridade 0, e a ordem do array é o desempate — então ela é uma
  // decisão, não um acaso de digitação.
  //
  // "Acontecendo hoje" LISTA a agenda: culto às 19h, ensaio às 20h. É
  // informação, e não pede nada de ninguém — o culto acontece com ou sem
  // esta tela.
  //
  // "Ações de hoje" NOMEIA UMA PESSOA e oferece o botão de falar com ela:
  // "Joseana Viegas de Souza, 23 anos hoje" · [Enviar mensagem]. É a única
  // coisa na tela que não acontece sozinha, e a única que deixa de
  // acontecer se ninguém abrir o sistema.
  //
  // Quem cuida abre o Diakonia perguntando "o que precisa de mim agora?".
  // A resposta tem que ser a primeira coisa.
  // Aniversário, bodas e visita de hoje são a única coisa da tela que perde
  // a validade ao fim do dia — um cadastro incompleto continua incompleto
  // amanhã. E, quando o dia não tem nenhum, o bloco se apaga e devolve o
  // espaço. O comentário aqui já dizia "primeiro widget do painel"; agora
  // ele também é verdade.
  // ── A ordem dos tres primeiros e deliberada ─────────────────────────
  //
  // Acolhimento, depois efemerides, depois agenda. Nao e ordem de
  // importancia no abstrato: e ordem de quanto se perde ao deixar passar.
  //
  // Um visitante que veio uma vez e nao foi procurado nao volta, e nao ha
  // segunda chance marcada no calendario. Um aniversario esquecido dói,
  // mas acontece de novo no ano que vem. Um culto acontece com ou sem o
  // painel — ele esta ali para consulta, nao para cobranca.
  //
  // Os tres sao prioridade 0 e os tres somem quando nao ha o que fazer,
  // entao esta ordem so decide quem fica no topo entre os que sobraram.
  { id: "acolhimento-visitantes", label: "Acolhimento",
    subtitulo: "Quem chegou e ainda espera um contato",
    icone: HandHeart, component: AcolhimentoVisitantes,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0 },

  { id: "acoes-do-dia", label: "Ações de hoje",
    // Nao "que acontecem agora": o bloco tambem mostra o que vem pela
    // frente, e num dia sem efemeride ele mostrava SO isso — sob um titulo
    // dizendo "agora". Quem olhava concluia que o aniversario de daqui a
    // oito dias era hoje.
    subtitulo: "Aniversários, bodas e visitas — hoje e nos próximos dias",
    icone: CalendarCheck, component: AcoesDoDia,
    permissoes: ["ver_pessoas"], prioridade: 0 },

  { id: "agenda-do-dia", label: "Acontecendo hoje",
    subtitulo: "Cultos, reuniões, ensaios e reservas de hoje",
    icone: CalendarDays, component: AgendaDoDia,
    permissoes: ["ver_pessoas","ver_familias","ver_ebd","ver_pgm"], prioridade: 0 },

  // Prioridade 1, nao 0: um voluntario sobrecarregado pede conversa esta
  // semana, nao neste minuto. O que e de hoje — aniversario, agenda — vem
  // antes; isto vem logo depois, junto do resto que pede decisao.
  //
  // O componente se apaga sozinho quando nao ha sinal, e o BlocoSecao vazio
  // some junto: nenhum espaco gasto para dizer "esta tudo bem".
  { id: "sinais-voluntariado", label: "Quem serve",
    subtitulo: "Sinais de quem está servindo demais, ou parou de servir",
    icone: HeartHandshake, component: SinaisDeVoluntariado,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 1 },

  { id: "alertas-inteligentes", label: "Alertas inteligentes",
    subtitulo: "Coisas que precisam da sua decisão",
    icone: Bell, component: AlertasInteligentes,
    permissoes: ["ver_pessoas","ver_painel_pastoral","ver_painel_secretaria","ver_painel_admin"],
    prioridade: 0 },

  // Prioridade 1, nao 0: cadastro contraditorio pede correcao, mas nao e
  // urgente como um visitante que esta se perdendo. Faixa "trava" porque e
  // exatamente isso — algo que impede outra coisa de funcionar (as bodas do
  // mes, o tempo de casa).
  { id: "cadastros-inconsistentes", label: "Cadastros a corrigir",
    subtitulo: "Registros que se contradizem",
    icone: ClipboardCheck, component: CadastrosInconsistentes,
    // SEM `ver_pessoas`. Corrigir cadastro é tarefa da secretaria, e
    // `ver_pessoas` pertence a seis papéis — admin, pastor, diakonia,
    // secretaria, lideranca e voluntario. Como o teste abaixo é `.some()`,
    // bastava esse para o aviso aparecer a todos: um voluntário via um cartão
    // anunciando que 64 pessoas da igreja estavam sem telefone.
    //
    // Tarefa endereçada a todos não é de ninguém. Restam `ver_painel_secretaria`
    // (admin, secretaria) e `ver_painel_admin`.
    permissoes: ["ver_painel_secretaria","ver_painel_admin"],
    prioridade: 1 },

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

  { id: "agenda-fiscal-urgente", label: "Agenda fiscal",
    subtitulo: "Obrigações vencendo e atrasadas",
    icone: Receipt, component: AgendaFiscalUrgente,
    permissoes: ["ver_fiscal","ver_financeiro","ver_painel_tesouraria","ver_painel_admin"], prioridade: 0 },

  { id: "manutencao-arrecadacao", label: "Manutenção Bazar/Cantina",
    subtitulo: "Problemas reportados e recorrências",
    icone: Wrench, component: ManutencaoArrec,
    permissoes: ["ver_manutencao","ver_arrecadacao_admin"], prioridade: 1 },

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
