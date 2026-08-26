// ─── navConfig.ts ────────────────────────────────────────────────────────────
// Fonte única da estrutura de navegação.
//
// Antes, os grupos viviam dentro do AppLayout — que é `hidden md:flex`.
// Resultado: no celular a sidebar simplesmente não existia, e módulos
// inteiros (EBD, PGM, Membresia, Reuniões, Assuntos, Finanças, Bazar…)
// ficavam inalcançáveis. Agora sidebar e menu mobile leem daqui.

import {
  LayoutDashboard, Users, HeartHandshake, Home, CalendarDays, MapPin,
  BarChart2, GraduationCap, Sparkles, DollarSign, Building2,
  Network, FileText, ScrollText,
  CheckSquare, UserCheck, Sprout, Gavel,
  ShoppingBag, type LucideIcon,
  ClipboardCheck,
} from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";

// ─── Roles auxiliares ────────────────────────────────────────────────────────
export const ROLES_LIDERES: AppRole[]  = ["admin", "secretaria", "pastor", "diakonia", "lideranca"];
export const ROLES_PASTORAL: AppRole[] = ["admin", "secretaria", "pastor", "diakonia"];
export const ROLES_ADMIN: AppRole[]    = ["admin", "secretaria"];

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  allowedRoles?: AppRole[];
}

export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  allowedRoles?: AppRole[];
}

// Painel sempre visível no topo, fora dos grupos.
//
// Passou a se chamar "Home" em 26/08/2026: com o Painel Pastoral logo abaixo,
// dois itens chamados "Painel" e "Painel Pastoral" no mesmo bloco obrigavam a
// ler os dois para escolher. "Home" diz o que é sem disputar o nome.
export const PAINEL: NavItem = { to: "/", label: "Home", icon: LayoutDashboard, end: true };

/**
 * Os itens fixos do topo, fora dos grupos.
 *
 * O Painel Pastoral subiu para cá vindo de "Discipulado". Ele deixou de ser
 * uma tela do módulo de discipulado e virou a tela de trabalho da liderança —
 * reúne o dia, a semana, os candidatos, os visitantes e o discipulado inteiro.
 * Uma tela que se abre todo dia não deve exigir abrir um grupo antes.
 *
 * Cada item ainda passa por `allowedRoles`: "Home" é de todos, o Painel
 * Pastoral é da liderança.
 */
export const ATALHOS_TOPO: NavItem[] = [
  PAINEL,
  { to: "/painel-pastoral", label: "Painel Pastoral", icon: Sparkles, allowedRoles: ROLES_LIDERES },
  // Só admin e secretaria. Aparecer para a liderança faria o atalho prometer
  // uma tela que a guarda de rota recusa — pior que não aparecer.
  { to: "/painel-secretaria", label: "Painel da Secretaria", icon: ClipboardCheck, allowedRoles: ROLES_ADMIN },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "pessoas",
    label: "Pessoas",
    icon: Users,
    items: [
      { to: "/membros",      label: "Catálogo",    icon: Users,          allowedRoles: ROLES_LIDERES },
      { to: "/visitantes",   label: "Visitantes",  icon: UserCheck },
      { to: "/familias",     label: "Famílias",    icon: Home,           allowedRoles: ROLES_LIDERES },
      { to: "/ministerios",  label: "Ministérios", icon: HeartHandshake, allowedRoles: ROLES_LIDERES },
      // Organograma veio de "Configurações". Ele nao configura nada: e uma
      // VISTA das pessoas e de como se organizam — mesma materia de Catalogo,
      // Familias e Ministerios, e para o mesmo publico (liderancas).
      { to: "/organograma",  label: "Organograma", icon: Building2,      allowedRoles: ROLES_LIDERES },
      // "Equipes" (/areas) saiu do menu: area mora dentro de ministerio, e
      // agora se chega la pelo proprio ministerio — o cartao inteiro abre
      // "Áreas — <ministério>". Um item de primeiro nivel para algo que e
      // filho de outro item disputava atencao e sugeria dois caminhos
      // paralelos. A rota continua existindo e atendendo quem tem link salvo.
    ],
  },
  {
    key: "discipulado",
    label: "Discipulado",
    icon: GraduationCap,
    items: [
      { to: "/ebd",              label: "EBD",             icon: GraduationCap, allowedRoles: ROLES_LIDERES },
      { to: "/pgm",              label: "Pequenos Grupos", icon: Sprout,        allowedRoles: ROLES_LIDERES },
      // Tres itens sairam deste grupo, e todos pelo mesmo motivo: viraram
      // conteudo do Painel Pastoral, e ter os dois caminhos disputava
      // atencao. As tres rotas continuam existindo, para nao quebrar link
      // salvo.
      //
      //   "Painel Pastoral"        subiu para o topo, fora dos grupos
      //   "Campanhas Espirituais"  virou aba da secao Discipulado do painel
      //   "Crescimento"            idem — /painel-estrategico embutido
    ],
  },
  {
    key: "administracao",
    label: "Administração",
    icon: ScrollText,
    items: [
      { to: "/membresia",   label: "Membresia",       icon: FileText,    allowedRoles: ROLES_LIDERES },
      // "Reuniões" aparecia DUAS vezes na barra — aqui e no Financeiro — com o
      // mesmo rotulo para coisas diferentes. Esta trata de reunioes e
      // assembleias da igreja; a outra, das financeiras. Agora cada uma diz
      // qual e, sem depender de o usuario reparar em qual grupo esta.
      { to: "/governanca",  label: "Reuniões e Atas", icon: Gavel,       allowedRoles: ROLES_LIDERES },
      { to: "/assuntos",    label: "Assuntos",        icon: CheckSquare, allowedRoles: ROLES_LIDERES },
      // Estrutura veio de "Configurações": e a estrutura institucional da
      // igreja, extraida dos documentos — materia administrativa, e continua
      // aberta a pastores, que o menu da conta nao alcanca.
      { to: "/estrutura",   label: "Estrutura",       icon: Network,     allowedRoles: ROLES_PASTORAL },
      { to: "/arrecadacao", label: "Bazar e Cantina", icon: ShoppingBag, allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    allowedRoles: ROLES_LIDERES,
    items: [
      { to: "/financas",           label: "Tesouraria",          icon: DollarSign, allowedRoles: ROLES_LIDERES },
      { to: "/financas/fiscal",    label: "Módulo Fiscal",       icon: DollarSign, allowedRoles: ROLES_LIDERES },
      { to: "/financas/reunioes",  label: "Reuniões financeiras", icon: DollarSign, allowedRoles: ROLES_LIDERES },
      { to: "/financas/executivo", label: "Visão Executiva",     icon: DollarSign, allowedRoles: ROLES_PASTORAL },
    ],
  },
  {
    key: "agenda",
    label: "Agenda & Espaços",
    icon: CalendarDays,
    items: [
      { to: "/eventos", label: "Agenda",  icon: CalendarDays },
      { to: "/locais",  label: "Espaços", icon: MapPin, allowedRoles: ROLES_LIDERES },
    ],
  },
  // O grupo "Configurações" deixou de existir.
  //
  // Ele comecou com onze itens, sete dos quais ja estavam no menu da conta.
  // Removidos aqueles, sobraram quatro — e nenhum era configuracao:
  // Organograma e uma vista das pessoas, Crescimento e um painel do
  // discipulado, Estrutura e materia administrativa. Cada um foi para o grupo
  // que trata do mesmo assunto.
  //
  // O que restou de fato administracao do sistema — "Usuários", que gerencia
  // acessos — foi para o menu da conta, junto de Recuperacao de Senhas e
  // Painel LGPD, que sao da mesma familia e ja estavam la.
  //
  // Um grupo chamado "Configurações" que nao guardava configuracao nenhuma
  // custava uma faixa na barra e uma decisao a cada busca: "sera que esta em
  // Configurações?".
];

export const pageTitles: Record<string, string> = {
  "/":                        "Diakonia",
  "/membros":                 "Pessoas",
  "/familias":                "Famílias",
  "/ministerios":             "Ministérios",
  "/areas":                   "Equipes",
  "/eventos":                 "Agenda",
  "/agenda-pastoral":         "Agenda Pastoral",
  "/painel-pastoral":         "Painel Pastoral",
  "/painel-secretaria":       "Painel da Secretaria",
  "/locais":                  "Espaços",
  "/visitantes":              "Visitantes",
  "/painel-estrategico":      "Crescimento",
  "/ebd":                     "EBD",
  // /ebd/acompanhamento virou redirecionamento para /painel-pastoral.
  "/pgm":                     "Pequenos Grupos",
  "/organograma":             "Organograma",
  "/estrutura":               "Estrutura",
  "/usuarios":                "Usuários",
  "/membresia":               "Membresia",
  "/governanca":              "Reuniões",
  "/assuntos":                "Assuntos",
  "/financas":                "Tesouraria",
  "/financas/executivo":      "Visão Executiva",
  "/arrecadacao":             "Bazar e Cantina",
  "/admin/recuperacao-senha": "Recuperar Senha",
  "/admin/lgpd":              "LGPD",
  "/admin/identidade":        "Identidade",
  "/admin/documentos":        "Documentos",
  "/admin/importacao":        "Importação",
  "/admin/exportacao":        "Exportação",
  "/admin/campanhas":         "Campanhas Espirituais",
};

export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/membros":            ROLES_LIDERES,
  "/familias":           ROLES_LIDERES,
  "/ministerios":        ROLES_LIDERES,
  "/locais":             ROLES_LIDERES,
  "/painel-estrategico": ROLES_PASTORAL,
  "/ebd":                ROLES_LIDERES,
  "/admin/campanhas":    ROLES_LIDERES,
  "/organograma":        ROLES_LIDERES,
  "/estrutura":          ROLES_PASTORAL,
  "/usuarios":           ROLES_ADMIN,
  // `ROLES_ADMIN` é ["admin", "secretaria"] — o nome engana, mas é exatamente
  // o par que deve entrar aqui. Pastor e liderança ficam de fora de propósito:
  // esta tela não informa sobre a igreja, ela distribui trabalho a quem o
  // executa, e trabalho endereçado a quem não o faz é o defeito que ela veio
  // corrigir.
  "/painel-secretaria":  ROLES_ADMIN,
};
