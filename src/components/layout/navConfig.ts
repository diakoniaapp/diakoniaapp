// ─── navConfig.ts ────────────────────────────────────────────────────────────
// Fonte única da estrutura de navegação.
//
// Antes, os grupos viviam dentro do AppLayout — que é `hidden md:flex`.
// Resultado: no celular a sidebar simplesmente não existia, e módulos
// inteiros (EBD, PGM, Membresia, Reuniões, Assuntos, Finanças, Bazar…)
// ficavam inalcançáveis. Agora sidebar e menu mobile leem daqui.

import {
  LayoutDashboard, Users, HeartHandshake, Home, CalendarDays, MapPin,
  BarChart2, GraduationCap, Sparkles, DollarSign, Layers, Building2,
  Network, KeyRound, ShieldAlert, Church, FileText, ScrollText,
  CheckSquare, Upload, Download, Flame, UserCheck, Cog, Sprout, Gavel,
  ShoppingBag, type LucideIcon,
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

// Painel sempre visível no topo, fora dos grupos
export const PAINEL: NavItem = { to: "/", label: "Painel", icon: LayoutDashboard, end: true };

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
      { to: "/areas",        label: "Equipes",     icon: Layers,         allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "discipulado",
    label: "Discipulado",
    icon: GraduationCap,
    items: [
      { to: "/ebd",              label: "EBD",             icon: GraduationCap, allowedRoles: ROLES_LIDERES },
      { to: "/pgm",              label: "Pequenos Grupos", icon: Sprout,        allowedRoles: ROLES_LIDERES },
      { to: "/painel-pastoral",  label: "Acompanhamento",  icon: Sparkles,      allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "administracao",
    label: "Administração",
    icon: ScrollText,
    items: [
      { to: "/membresia",   label: "Membresia",       icon: FileText,    allowedRoles: ROLES_LIDERES },
      { to: "/governanca",  label: "Reuniões",        icon: Gavel,       allowedRoles: ROLES_LIDERES },
      { to: "/assuntos",    label: "Assuntos",        icon: CheckSquare, allowedRoles: ROLES_LIDERES },
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
      { to: "/financas/reunioes",  label: "Reuniões",            icon: DollarSign, allowedRoles: ROLES_LIDERES },
      { to: "/financas/executivo", label: "Dashboard Executivo", icon: DollarSign, allowedRoles: ROLES_PASTORAL },
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
  {
    key: "configuracoes",
    label: "Configurações",
    icon: Cog,
    allowedRoles: ROLES_PASTORAL,
    items: [
      { to: "/admin/identidade",        label: "Identidade",      icon: Church,      allowedRoles: ROLES_ADMIN },
      { to: "/admin/documentos",        label: "Documentos",      icon: ScrollText,  allowedRoles: ROLES_ADMIN },
      { to: "/admin/campanhas",         label: "Campanhas",       icon: Flame,       allowedRoles: ROLES_ADMIN },
      { to: "/estrutura",               label: "Estrutura",       icon: Network,     allowedRoles: ROLES_PASTORAL },
      { to: "/organograma",             label: "Organograma",     icon: Building2,   allowedRoles: ROLES_LIDERES },
      { to: "/painel-estrategico",      label: "Crescimento",     icon: BarChart2,   allowedRoles: ROLES_PASTORAL },
      { to: "/admin/importacao",        label: "Importação",      icon: Upload,      allowedRoles: ROLES_ADMIN },
      { to: "/admin/exportacao",        label: "Exportação",      icon: Download,    allowedRoles: ROLES_ADMIN },
      { to: "/usuarios",                label: "Usuários",        icon: Users,       allowedRoles: ROLES_ADMIN },
      { to: "/admin/recuperacao-senha", label: "Recuperar Senha", icon: KeyRound,    allowedRoles: ROLES_ADMIN },
      { to: "/admin/lgpd",              label: "LGPD",            icon: ShieldAlert, allowedRoles: ROLES_ADMIN },
    ],
  },
];

export const pageTitles: Record<string, string> = {
  "/":                        "Diakonia",
  "/membros":                 "Pessoas",
  "/familias":                "Famílias",
  "/ministerios":             "Ministérios",
  "/areas":                   "Equipes",
  "/eventos":                 "Agenda",
  "/agenda-pastoral":         "Agenda Pastoral",
  "/painel-pastoral":         "Acompanhamento Pastoral",
  "/locais":                  "Espaços",
  "/visitantes":              "Visitantes",
  "/painel-estrategico":      "Crescimento",
  "/ebd":                     "EBD",
  "/pgm":                     "Pequenos Grupos",
  "/organograma":             "Organograma",
  "/estrutura":               "Estrutura",
  "/usuarios":                "Usuários",
  "/membresia":               "Membresia",
  "/governanca":              "Reuniões",
  "/assuntos":                "Assuntos",
  "/financas":                "Tesouraria",
  "/arrecadacao":             "Bazar e Cantina",
  "/admin/recuperacao-senha": "Recuperar Senha",
  "/admin/lgpd":              "LGPD",
  "/admin/identidade":        "Identidade",
  "/admin/documentos":        "Documentos",
  "/admin/importacao":        "Importação",
  "/admin/exportacao":        "Exportação",
  "/admin/campanhas":         "Campanhas",
};

export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/membros":            ROLES_LIDERES,
  "/familias":           ROLES_LIDERES,
  "/ministerios":        ROLES_LIDERES,
  "/locais":             ROLES_LIDERES,
  "/painel-estrategico": ROLES_PASTORAL,
  "/ebd":                ROLES_LIDERES,
  "/organograma":        ROLES_LIDERES,
  "/estrutura":          ROLES_PASTORAL,
  "/usuarios":           ROLES_ADMIN,
};
