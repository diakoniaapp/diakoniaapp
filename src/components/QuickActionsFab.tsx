import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Plus, UserPlus, CalendarPlus, Home as HomeIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

/**
 * Floating Action Button (FAB) com ações rápidas.
 * Visível apenas em mobile (md:hidden) e somente para usuários com permissão de edição.
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
      // força refresh do parâmetro
      navigate(`${path}?${query}=1&t=${Date.now()}`);
    } else {
      navigate(query ? `${path}?${query}=1` : path);
    }
  };

  const actions = [
    { label: "Nova pessoa", icon: UserPlus, onClick: () => go("/membros", "novo") },
    { label: "Novo evento", icon: CalendarPlus, onClick: () => go("/eventos", "novo") },
    { label: "Nova família", icon: HomeIcon, onClick: () => go("/familias", "novo") },
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
          "fixed right-4 z-50 flex flex-col-reverse items-end gap-3 transition-all",
          // sit above bottom nav (h~64) + safe-area
          "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none translate-y-2"
        )}
      >
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="flex items-center gap-3 pl-4 pr-3 h-12 rounded-full bg-card border border-border shadow-elevated text-sm font-medium animate-scale-in"
          >
            <span>{a.label}</span>
            <span className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
              <a.icon className="w-4 h-4" />
            </span>
          </button>
        ))}
      </div>

      {/* FAB */}
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
          aria-label={open ? "Fechar ações rápidas" : "Adicionar pessoa, evento ou família"}
          title={open ? "Fechar" : "Adicionar pessoa, evento ou família"}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-elevated",
            "flex items-center justify-center active:scale-95 transition-transform"
          )}
        >
          {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}

export default QuickActionsFab;