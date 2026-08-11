import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, UserCheck, Menu } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";

const ROLES_LIDERES: AppRole[] = ["admin", "secretaria", "pastor", "diakonia", "lideranca"];

// Máximo 4 destinos fixos + "Menu".
//
// Antes eram 7 abas: num aparelho de 360px cada uma ficava com ~51px, e
// rótulos como "Ministérios"/"Visitantes" em 10px não cabiam. Famílias,
// Ministérios e Espaços passaram para o menu completo, junto com todo o
// resto do sistema.
const items: {
  to: string; label: string; icon: typeof LayoutDashboard;
  end?: boolean; allowedRoles?: AppRole[];
}[] = [
  { to: "/",           label: "Painel",     icon: LayoutDashboard, end: true },
  { to: "/membros",    label: "Pessoas",    icon: Users, allowedRoles: ROLES_LIDERES },
  { to: "/visitantes", label: "Visitantes", icon: UserCheck },
  { to: "/eventos",    label: "Agenda",     icon: Calendar },
];

const tabClass =
  "flex-1 flex flex-col items-center justify-center py-2 min-h-[56px] text-xs gap-0.5 transition-colors";

export function MobileBottomNav() {
  const { hasRole } = useAuth();
  const visible = items.filter(i => !i.allowedRoles || hasRole(i.allowedRoles));

  return (
    <nav
      className="flex md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border pb-safe"
      aria-label="Navegação principal"
    >
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `${tabClass} ${
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

      <MobileNavDrawer>
        <button
          type="button"
          aria-label="Abrir menu completo"
          className={`${tabClass} text-sidebar-foreground/70 hover:text-sidebar-foreground`}
        >
          <Menu className="w-5 h-5" />
          <span className="leading-none">Menu</span>
        </button>
      </MobileNavDrawer>
    </nav>
  );
}

export default MobileBottomNav;
