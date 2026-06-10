import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Home, Heart, Calendar, MapPin, UserCheck,
} from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";

const ROLES_LIDERES: AppRole[] = ["admin", "secretaria", "pastor", "diakonia", "lideranca"];

const items: {
  to: string; label: string; icon: typeof LayoutDashboard;
  end?: boolean; allowedRoles?: AppRole[];
}[] = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/membros", label: "Pessoas", icon: Users, allowedRoles: ROLES_LIDERES },
  { to: "/visitantes", label: "Visitantes", icon: UserCheck },
  { to: "/familias", label: "Famílias", icon: Home, allowedRoles: ROLES_LIDERES },
  { to: "/ministerios", label: "Ministérios", icon: Heart, allowedRoles: ROLES_LIDERES },
  { to: "/eventos", label: "Agenda", icon: Calendar },
  { to: "/locais", label: "Locais", icon: MapPin, allowedRoles: ROLES_LIDERES },
];

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
    </nav>
  );
}

export default MobileBottomNav;
