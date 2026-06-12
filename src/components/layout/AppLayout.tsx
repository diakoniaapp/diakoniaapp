import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, HeartHandshake, Home, LogOut,
  CalendarDays, ChevronLeft, ChevronDown, MapPin, BarChart2, GraduationCap, Sparkles, DollarSign, Layers,
  Building2, Network, KeyRound, ShieldAlert, Church, FileText, ScrollText, CheckSquare,
  Upload, Download, Flame, UserCheck, Settings,
  Cog, Sprout, Gavel, type LucideIcon,
} from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { useEffect, useState } from "react";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { UserMenuButton } from "@/components/layout/UserMenuButton";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Roles auxiliares ────────────────────────────────────────────────────────
const ROLES_LIDERES: AppRole[]   = ["admin", "secretaria", "pastor", "diakonia", "lideranca"];
const ROLES_PASTORAL: AppRole[]  = ["admin", "secretaria", "pastor", "diakonia"];
const ROLES_ADMIN: AppRole[]     = ["admin", "secretaria"];

// ─── Estrutura do menu ───────────────────────────────────────────────────────
interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  allowedRoles?: AppRole[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  allowedRoles?: AppRole[];
}

// Painel sempre visível no topo, fora dos grupos
const PAINEL: NavItem = { to: "/", label: "Painel", icon: LayoutDashboard, end: true };

// Refatoração UX (Fase 1):
//   • "Operacional" → "Administração"
//   • "Locais" → "Espaços"  (continua /locais)
//   • "Áreas" → "Equipes"   (continua /areas)
//   • EBD + PGM saem de "Pessoas" e viram grupo "Discipulado"
//   • Painel Pastoral entra em Discipulado (acompanhamento)
//   • Painel Secretaria removido do menu (já é o painel principal pra perfil de secretaria)
//   • Institucional + Dados + Admin antigo se consolidam em "Configurações"
//   • Bug dos ícones com vírgula corrigido (FileText, ScrollText, CheckSquare)
const NAV_GROUPS: NavGroup[] = [
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
      { to: "/ebd",              label: "EBD",                icon: GraduationCap, allowedRoles: ROLES_LIDERES },
      { to: "/pgm",              label: "Pequenos Grupos",    icon: Sprout,        allowedRoles: ROLES_LIDERES },
      { to: "/painel-pastoral",  label: "Acompanhamento",     icon: Sparkles,      allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "administracao",
    label: "Administração",
    icon: ScrollText,
    items: [
      { to: "/membresia",   label: "Membresia",  icon: FileText,    allowedRoles: ROLES_LIDERES },
      { to: "/governanca",  label: "Reuniões",   icon: Gavel,       allowedRoles: ROLES_LIDERES },
      { to: "/assuntos",    label: "Assuntos",   icon: CheckSquare, allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    allowedRoles: ROLES_LIDERES,
    items: [
      { to: "/financas",  label: "Tesouraria", icon: DollarSign, allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "agenda",
    label: "Agenda & Espaços",
    icon: CalendarDays,
    items: [
      { to: "/eventos", label: "Agenda",  icon: CalendarDays },
      { to: "/locais",  label: "Espaços", icon: MapPin,        allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "configuracoes",
    label: "Configurações",
    icon: Cog,
    allowedRoles: ROLES_PASTORAL,
    items: [
      { to: "/admin/identidade",        label: "Identidade",        icon: Church,      allowedRoles: ROLES_ADMIN },
      { to: "/admin/documentos",        label: "Documentos",        icon: ScrollText,  allowedRoles: ROLES_ADMIN },
      { to: "/admin/campanhas",         label: "Campanhas",         icon: Flame,       allowedRoles: ROLES_ADMIN },
      { to: "/estrutura",               label: "Estrutura",         icon: Network,     allowedRoles: ROLES_PASTORAL },
      { to: "/organograma",             label: "Organograma",       icon: Building2,   allowedRoles: ROLES_LIDERES },
      { to: "/painel-estrategico",      label: "Crescimento",       icon: BarChart2,   allowedRoles: ROLES_PASTORAL },
      { to: "/admin/importacao",        label: "Importação",        icon: Upload,      allowedRoles: ROLES_ADMIN },
      { to: "/admin/exportacao",        label: "Exportação",        icon: Download,    allowedRoles: ROLES_ADMIN },
      { to: "/usuarios",                label: "Usuários",          icon: Users,       allowedRoles: ROLES_ADMIN },
      { to: "/admin/recuperacao-senha", label: "Recuperar Senha",   icon: KeyRound,    allowedRoles: ROLES_ADMIN },
      { to: "/admin/lgpd",              label: "LGPD",              icon: ShieldAlert, allowedRoles: ROLES_ADMIN },
    ],
  },
];

const pageTitles: Record<string, string> = {
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
  "/admin/recuperacao-senha": "Recuperar Senha",
  "/admin/lgpd":              "LGPD",
  "/admin/identidade":        "Identidade",
  "/admin/documentos":        "Documentos",
  "/admin/importacao":        "Importação",
  "/admin/exportacao":        "Exportação",
  "/admin/campanhas":         "Campanhas",
};

const ROUTE_ROLES: Record<string, AppRole[]> = {
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

// ─── Componente ──────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, loading, signOut, roles, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Estado de expand/collapse por grupo, persistido em localStorage
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("nav_expanded_v2");
      if (raw) return JSON.parse(raw);
    } catch {}
    // padrão: tudo expandido, menos Configurações (raramente usado)
    return Object.fromEntries(NAV_GROUPS.map(g => [g.key, g.key !== "configuracoes"]));
  });

  useEffect(() => {
    try { localStorage.setItem("nav_expanded_v2", JSON.stringify(expanded)); } catch {}
  }, [expanded]);

  // Nome bonito do user (vindo do membro vinculado, se houver)
  const [nomeDisplay, setNomeDisplay] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) { setNomeDisplay(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, pessoa_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.pessoa_id) {
        const { data: m } = await supabase
          .from("membros")
          .select("nome_completo")
          .eq("id", data.pessoa_id)
          .maybeSingle();
        if (!cancelled && m?.nome_completo) {
          setNomeDisplay(m.nome_completo);
          return;
        }
      }
      if (!cancelled) setNomeDisplay(data?.nome ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Guards de auth + must_change_password + LGPD + role
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth", { replace: true }); return; }

    const meta = user.user_metadata as Record<string, unknown>;
    if (meta?.must_change_password) {
      navigate("/primeiro-acesso", { replace: true });
      return;
    }

    const lgpdOk = sessionStorage.getItem(`lgpd_ok_${user.id}`);
    if (!lgpdOk) {
      navigate("/aceite-lgpd", { replace: true });
      return;
    }

    const required = ROUTE_ROLES[location.pathname];
    if (required && roles.length > 0 && !hasRole(required)) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate, location.pathname, roles, hasRole]);

  if (loading || !user) {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const principalRole = (roles[0] ?? "lideranca") as string;
  const roleLabel: Record<string, string> = {
    admin: "Administrador", secretaria: "Secretaria",
    diakonia: "Pastor", pastor: "Pastor",
    lideranca: "Liderança", voluntario: "Voluntário",
  };

  const currentTitle = pageTitles[location.pathname] ?? "Diakonia";
  const isHome = location.pathname === "/";

  // Filtragem por role
  const itemAllowed = (it: NavItem) => !it.allowedRoles || hasRole(it.allowedRoles);
  const groupAllowed = (g: NavGroup) => (!g.allowedRoles || hasRole(g.allowedRoles)) && g.items.some(itemAllowed);

  // Avatar: iniciais do nome
  const iniciais = (nomeDisplay ?? user.email ?? "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase()).join("") || "?";

  // ── NavLink class
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-gold"
        : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
    }`;

  const toggleGroup = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="h-screen overflow-hidden flex w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border">
          <BrandMark className="text-2xl text-sidebar-foreground" />
          <div className="text-[10px] tracking-[0.18em] uppercase text-sidebar-foreground/55 mt-1.5">
            Sistema da Igreja
          </div>
        </div>

        {/* Painel destacado */}
        <nav className="px-3 pt-3">
          <NavLink to={PAINEL.to} end={PAINEL.end} className={itemClass}>
            <PAINEL.icon className="w-4 h-4" />
            <span translate="no">{PAINEL.label}</span>
          </NavLink>
        </nav>

        {/* Categorias colapsáveis */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {NAV_GROUPS.filter(groupAllowed).map((group) => {
            const Icon = group.icon;
            const isExpanded = expanded[group.key] ?? true;
            const visibleItems = group.items.filter(itemAllowed);
            return (
              <div key={group.key} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-widest text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors"
                >
                  <Icon className="w-3 h-3" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                </button>
                {isExpanded && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
                          <ItemIcon className="w-4 h-4" />
                          <span translate="no">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Perfil — footer */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent/60 transition-colors text-left">
                <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center text-gold font-semibold text-xs shrink-0">
                  {iniciais}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{nomeDisplay ?? "Sem nome"}</div>
                  <div className="text-[10px] text-sidebar-foreground/60 truncate">{user.email}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-sidebar-foreground/60 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{nomeDisplay ?? "Sem nome"}</span>
                  <span className="text-[11px] font-normal text-muted-foreground truncate">{user.email}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {roleLabel[principalRole] ?? principalRole}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/configuracoes")}>
                <Settings className="w-4 h-4 mr-2" /> Configurações
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Header mobile */}
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-2 h-14 px-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border pt-safe">
          {!isHome && (
            <button
              onClick={() => navigate(-1)}
              aria-label="Voltar"
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center hover:bg-sidebar-accent active:scale-95 transition shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <BrandMark className="text-base text-sidebar-foreground shrink-0" />
          {!isHome && (
            <h1 translate="no" className="font-serif text-base truncate ml-auto text-sidebar-foreground/90 mr-1">
              {currentTitle}
            </h1>
          )}
          {isHome && <span className="flex-1" />}
          <div className="flex items-center gap-1 shrink-0">
            <UserMenuButton />
          </div>
        </header>

        <main
          key={location.pathname}
          className="flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0 animate-fade-in"
        >
          <Outlet />
        </main>

        <CommandPalette />
        <QuickActionsFab />
        <MobileBottomNav />
      </div>
    </div>
  );
}
