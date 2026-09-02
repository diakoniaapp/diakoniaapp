import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, UserCheck, Menu } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { usePermissoes } from "@/hooks/usePermissoes";
import { supabase } from "@/integrations/supabase/client";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";
import { resolverTarefaPrincipal, type TarefaPrincipal } from "@/hoje/tarefaPrincipal";

const ROLES_LIDERES: AppRole[] = ["admin", "diakonia", "secretaria", "tesouraria", "pastor", "lideranca"];

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
  const { hasRole, user } = useAuth();
  const { permissoes } = usePermissoes();
  const [tarefa, setTarefa] = useState<TarefaPrincipal | null>(null);

  // Aba adaptativa: o mesmo resolvedor que alimenta a faixa "Sua tarefa" do
  // HOJE. Para o professor ela diz Chamada; para o operador, Caixa. É ela
  // que encurta os fluxos que hoje custam cinco cliques.
  useEffect(() => {
    if (!user?.id || permissoes.size === 0) return;
    let cancelado = false;
    (async () => {
      const { data } = await supabase
        .from("profiles").select("pessoa_id").eq("id", user.id).maybeSingle();
      if (cancelado) return;
      const t = await resolverTarefaPrincipal({
        pessoaId: data?.pessoa_id ?? null, permissoes,
      });
      if (!cancelado) setTarefa(t);
    })();
    return () => { cancelado = true; };
  }, [user?.id, permissoes]);

  // A barra tem no máximo 5 alvos. A aba adaptativa não soma: ela ocupa o
  // lugar de Visitantes, que é o item fixo de menor frequência. Sem tarefa
  // resolvida, a barra segue exatamente como antes.
  const base = items.filter(i => !i.allowedRoles || hasRole(i.allowedRoles));
  let visible = base;
  if (tarefa) {
    const semVisitantes = base.filter(i => i.to !== "/visitantes");
    // logo após Painel: é o segundo alvo mais provável do dedo
    visible = [
      semVisitantes[0],
      { to: tarefa.to, label: tarefa.abaLabel, icon: tarefa.icon },
      ...semVisitantes.slice(1),
    ].filter(Boolean);
  }

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
