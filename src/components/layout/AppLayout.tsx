import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, HeartHandshake, Home, LogOut, ShieldCheck,
  CalendarDays, ChevronLeft, MapPin, BarChart2, Building2, KeyRound,
  ShieldAlert, Church, FileText, Upload, Download, Flame,
} from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { useEffect } from "react";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { UserMenuButton } from "@/components/layout/UserMenuButton";

const desktopNav = [
  { to: "/",                  label: "Painel",      icon: LayoutDashboard, end: true },
  { to: "/membros",           label: "Pessoas",     icon: Users },
  { to: "/familias",          label: "Familias",    icon: Home },
  { to: "/ministerios",       label: "Ministerios", icon: HeartHandshake },
  { to: "/eventos",           label: "Agenda",      icon: CalendarDays },
  { to: "/locais",            label: "Locais",      icon: MapPin },
  { to: "/painel-estrategico",label: "Crescimento", icon: BarChart2 },
  { to: "/organograma",       label: "Organograma", icon: Building2 },
];

const pageTitles: Record<string, string> = {
  "/":                        "Diakonia",
  "/membros":                 "Pessoas",
  "/familias":                "Familias",
  "/ministerios":             "Ministerios",
  "/eventos":                 "Agenda",
  "/locais":                  "Locais",
  "/visitantes":              "Visitantes",
  "/painel-estrategico":      "Crescimento",
  "/organograma":             "Organograma",
  "/admin/recuperacao-senha": "Recuperacao de Senhas",
  "/admin/lgpd":              "Painel LGPD",
  "/admin/identidade":        "Identidade da Igreja",
  "/admin/documentos":        "Documentos Institucionais",
  "/admin/importacao":        "Importacao de Membros",
  "/admin/exportacao":        "Exportacao de Dados",
  "/admin/campanhas":         "Campanhas Espirituais",
};

export default function AppLayout() {
  const { user, loading, signOut, roles, hasRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

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
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const principalRole = roles[0] ?? "lideranca";
  const roleLabel: Record<string, string> = {
    admin:      "Administrador",
    secretaria: "Secretaria",
    diakonia:   "Pastor",
    lideranca:  "Lideranca",
  };

  const currentTitle = pageTitles[location.pathname] ?? "Diakonia";
  const isHome = location.pathname === "/";

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-gold"
        : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
    }`;

  return (
    <div className="h-screen overflow-hidden flex w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="p-6 border-b border-sidebar-border">
          <BrandMark className="text-2xl text-sidebar-foreground" />
          <div className="text-[10px] tracking-[0.18em] uppercase text-sidebar-foreground/55 mt-2">
            Sistema da Igreja
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {desktopNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                <Icon className="w-4 h-4" />
                <span translate="no">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Secao Admin */}
        {hasRole(["admin", "secretaria"]) && (
          <div className="px-3 pb-2 border-t border-sidebar-border pt-2">
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 px-3 pb-1 pt-1">
              Administracao
            </div>
            {[
              { to: "/admin/recuperacao-senha", label: "Recuperacao de Senhas",  Icon: KeyRound },
              { to: "/admin/lgpd",              label: "Painel LGPD",            Icon: ShieldAlert },
              { to: "/admin/identidade",        label: "Identidade da Igreja",   Icon: Church },
              { to: "/admin/documentos",        label: "Documentos",             Icon: FileText },
              { to: "/admin/importacao",        label: "Importacao de Membros",  Icon: Upload },
              { to: "/admin/exportacao",        label: "Exportacao de Dados",    Icon: Download },
              { to: "/admin/campanhas",         label: "Campanhas Espirituais",  Icon: Flame },
            ].map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                <Icon className="w-4 h-4" />
                <span translate="no">{label}</span>
              </NavLink>
            ))}
          </div>
        )}

        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-gold" />
            <span className="text-sidebar-foreground/70">Perfil:</span>
            <span className="font-medium">{roleLabel[principalRole] ?? principalRole}</span>
          </div>
          <div className="text-xs text-sidebar-foreground/60 truncate">{user.email}</div>
          <Button
            variant="outline" size="sm"
            className="w-full bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sair
          </Button>
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

        <QuickActionsFab />
        <MobileBottomNav />
      </div>
    </div>
  );
}
