import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, UserPlus, CalendarPlus, Home as HomeIcon, HeartHandshake, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

/**
 * FAB com ações rápidas mobile.
 * Ações: Adicionar pessoa, Novo evento, Nova família, Criar ministério, Nova campanha.
 */
export function QuickActionsFab() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { canEdit } = useAuth();

  if (!canEdit) return null;

  const go = (path: string, query?: string) => {
    setOpen(false);
    if (location.pathname === path && query) {
      navigate(`${path}?${query}=1&t=${Date.now()}`);
    } else {
      navigate(query ? `${path}?${query}=1` : path);
    }
  };

  const actions = [
    {
      label: "Adicionar pessoa",
      icon: UserPlus,
      color: "bg-primary",
      onClick: () => go("/membros", "novo"),
    },
    {
      label: "Novo evento",
      icon: CalendarPlus,
      color: "bg-primary",
      onClick: () => go("/eventos", "novo"),
    },
    {
      label: "Nova família",
      icon: HomeIcon,
      color: "bg-primary",
      onClick: () => go("/familias", "novo"),
    },
    {
      label: "Criar ministério",
      icon: HeartHandshake,
      color: "bg-primary",
      onClick: () => go("/ministerios", "novo"),
    },
    {
      label: "Nova campanha",
      icon: Flame,
      color: "bg-gold",
      onClick: () => go("/admin/campanhas", "novo"),
    },
  ];

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      {open && (
        <button
          aria-label="Fechar"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
        />
      )}

      {/* Action items */}
      <div
        className={cn(
          "fixed right-4 z-50 flex flex-col-reverse items-end gap-3 transition-all duration-200",
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
          open
            ? "opacity-100 pointer-events-auto translate-y-0"
            : "opacity-0 pointer-events-none translate-y-4"
        )}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="flex items-center gap-3 pl-4 pr-3 h-14 rounded-full bg-card border border-border shadow-[var(--shadow-elevated)] text-sm font-medium animate-scale-in active:scale-95 transition-transform"
          >
            <span className="text-foreground">{a.label}</span>
            <span className={`w-10 h-10 rounded-full ${a.color} text-primary-foreground flex items-center justify-center`}>
              <a.icon className="w-4 h-4" />
            </span>
          </button>
        ))}
      </div>

      {/* FAB principal */}
      <div
        className="fixed right-4 z-50 flex flex-col items-center gap-1"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      >
        {!open && (
          <span className="text-[10px] font-semibold tracking-wide text-primary/80 bg-background/80 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm border border-border/40 select-none">
            Adicionar
          </span>
        )}
        <button
          aria-label={open ? "Fechar ações rápidas" : "Ações rápidas"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-elevated)]",
            "flex items-center justify-center active:scale-95 transition-transform"
          )}
        >
          <Plus
            className={cn(
              "w-6 h-6 transition-transform duration-200",
              open && "rotate-45"
            )}
          />
        </button>
      </div>
    </div>
  );
}

export default QuickActionsFab;
