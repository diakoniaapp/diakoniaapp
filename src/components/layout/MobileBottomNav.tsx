import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Home, Heart, Calendar, MapPin,
} from "lucide-react";

const items = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/membros", label: "Pessoas", icon: Users },
  { to: "/familias", label: "Famílias", icon: Home },
  { to: "/ministerios", label: "Ministérios", icon: Heart },
  { to: "/eventos", label: "Agenda", icon: Calendar },
  { to: "/locais", label: "Locais", icon: MapPin },
];

export function MobileBottomNav() {
  return (
    <nav
      className="flex md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar text-sidebar-foreground border-t border-sidebar-border pb-safe"
      aria-label="Navegação principal"
    >
      {items.map((item) => {
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