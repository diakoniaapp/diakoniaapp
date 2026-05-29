import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Users, CalendarDays, Flame, MoreHorizontal,
  HeartHandshake, FileText, Church, Settings, X, Home as HomeIcon,
  ShieldAlert, KeyRound, Download, Upload, BarChart2, Building2, MapPin,
} from "lucide-react";

const mainItems = [
  { to: "/", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/membros", label: "Pessoas", icon: Users },
  { to: "/eventos", label: "Agenda", icon: CalendarDays },
  { to: "/admin/campanhas", label: "Campanhas", icon: Flame },
];

interface MoreItem {
  to: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const moreItems: MoreItem[] = [
  { to: "/ministerios", label: "Ministérios", icon: HeartHandshake },
  { to: "/familias", label: "Famílias", icon: HomeIcon },
  { to: "/locais", label: "Locais", icon: MapPin },
  { to: "/painel-estrategico", label: "Crescimento", icon: BarChart2 },
  { to: "/organograma", label: "Organograma", icon: Building2 },
  { to: "/admin/identidade", label: "Identidade", icon: Church, adminOnly: true },
  { to: "/admin/documentos", label: "Documentos", icon: FileText, adminOnly: true },
  { to: "/admin/importacao", label: "Importação", icon: Upload, adminOnly: true },
  { to: "/admin/exportacao", label: "Exportação", icon: Download, adminOnly: true },
  { to: "/admin/lgpd", label: "LGPD", icon: ShieldAlert, adminOnly: true },
  { to: "/admin/recuperacao-senha", label: "Senhas", icon: KeyRound, adminOnly: true },
];

export function MobileBottomNav() {
  const [showMore, setShowMore] = useState(false);
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole(["admin", "secretaria"]);

  const visibleMoreItems = moreItems.filter(i => !i.adminOnly || isAdmin);

  const handleMoreItemClick = (to: string) => {
    setShowMore(false);
    navigate(to);
  };

  return (
    <>
      {/* ── Bottom Sheet "Mais" ── */}
      {showMore && (
        <>
          {/* Backdrop */}
          <button
            aria-label="Fechar menu"
            onClick={() => setShowMore(false)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-fade-in"
          />

          {/* Sheet */}
          <div className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-2xl shadow-[0_-8px_32px_hsl(25_35%_18%/0.18)] animate-slide-up pb-safe">
            {/* Handle */}
            <div className="w-10 h-1 bg-border rounded-full mx-auto mt-3 mb-1" />

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border/60">
              <span className="font-serif text-base font-semibold text-foreground">Mais opções</span>
              <button
                onClick={() => setShowMore(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Grid of items */}
            <div className="grid grid-cols-3 gap-0 px-2 py-3">
              {visibleMoreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    onClick={() => handleMoreItemClick(item.to)}
                    className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl active:bg-muted/80 transition-colors text-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <span className="text-[11px] text-foreground/80 font-medium leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Safe area spacer */}
            <div className="h-4" />
          </div>
        </>
      )}

      {/* ── Bottom Nav Bar ── */}
      <nav
        className="flex md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border pb-safe"
        aria-label="Navegação principal"
      >
        {mainItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-[10px] gap-0.5 transition-colors ${
                  isActive
                    ? "text-gold"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span translate="no" className="leading-none">{item.label}</span>
            </NavLink>
          );
        })}

        {/* "Mais" button */}
        <button
          onClick={() => setShowMore(true)}
          className="flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-[10px] gap-0.5 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="leading-none">Mais</span>
        </button>
      </nav>
    </>
  );
}

export default MobileBottomNav;
