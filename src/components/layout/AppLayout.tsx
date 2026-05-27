import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  Home,
  LogOut,
  ShieldCheck,
  CalendarDays,
  ChevronLeft,
  MapPin,
  BarChart2,
} from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { useEffect } from "react";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";

const desktopNav = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/membros", label: "Pessoas", icon: Users },
  { to: "/familias", label: "Famílias", icon: Home },
  { to: "/ministerios", label: "Ministérios", icon: HeartHandshake },
  { to: "/eventos", label: "Agenda", icon: CalendarDays },
  { to: "/locais", label: "Locais", icon: MapPin },
  { to: "/painel-estrategico", label: "Crescimento", icon: BarChart2 },
];

const pageTitles: Record<string, string> = {
  "/": "Diakonia",
  "/membros": "Pessoas",
  "/familias": "Famílias",
  "/ministerios": "Ministérios",
  "/eventos": "Agenda",
  "/locais": "Locais",
  "/visitantes": "Visitantes",
  "/painel-estrategico": "Crescimento",
};

export default function AppLayout() {
  const { user, loading, signOut, roles } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
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
    admin: "Administrador",
    secretaria: "Secretaria",
    diakonia: "Diakonia",
    lideranca: "Liderança",
  };

  const currentTitle = pageTitles[location.pathname] ?? "Diakonia";
  const isHome = location.pathname === "/";

  return (
    <div className="h-screen overflow-hidden flex w-full bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        <div className="p-6 border-b border-sidebar-border">
          <BrandMark className="text-2xl text-sidebar-foreground" />
          <div className="text-[10px] tracking-[0.18em] uppercase text-sidebar-foreground/55 mt-2">
            Sistema da Igreja
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {desktopNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-gold"
                      : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span translate="no">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-gold" />
            <span className="text-sidebar-foreground/70">Perfil:</span>
            <span className="font-medium">{roleLabel[principalRole]}</span>
          </div>
          <div className="text-xs text-sidebar-foreground/60 truncate">{user.email}</div>
          <ThemeToggle
            variant="outline"
            className="w-full bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent justify-center"
          />
          <Button
            variant="outline"
            size="sm"
            className="w-full bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={signOut}
          >
            <LogOut className="w-3.5 h-3.5 mr-2" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-0">
        {/* App-like mobile header (fixed, with back/title) */}
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border pt-safe">
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
            <h1 translate="no" className="font-serif text-base truncate ml-auto text-sidebar-foreground/90">
              {currentTitle}
            </h1>
          )}
          <ThemeToggle
            className={`text-sidebar-foreground hover:bg-sidebar-accent shrink-0 ${isHome ? "ml-auto" : "ml-2"}`}
          />
        </header>

        <main
          key={location.pathname}
          className="flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0 animate-fade-in"
        >
          <Outlet />
        </main>

        {/* Floating quick actions (mobile) */}
        <QuickActionsFab />

        <MobileBottomNav />
      </div>
    </div>
  );
}
