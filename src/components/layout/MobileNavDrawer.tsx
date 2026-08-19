import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Search, LogOut } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/Brand";
import { useAuth } from "@/hooks/useAuth";
import { openCommandPalette } from "@/lib/commandPalette";
import { NAV_GROUPS, PAINEL, type NavGroup, type NavItem } from "@/components/layout/navConfig";
import { atalhos } from "@/lib/navUso";

/**
 * Menu completo para celular.
 *
 * A sidebar do AppLayout é `hidden md:flex`, então no celular a navegação
 * se resumia à barra inferior + FAB. Módulos inteiros (EBD, PGM, Membresia,
 * Reuniões, Assuntos, Finanças, Bazar, Configurações) não tinham como ser
 * abertos. Este drawer expõe a mesma árvore da sidebar, com as mesmas
 * regras de role.
 */
export function MobileNavDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Calculado uma vez, na montagem: a lista não pode mudar enquanto a
  // gaveta está aberta na frente da pessoa.
  const [rotasAtalho] = useState<string[]>(() =>
    atalhos(new Set(NAV_GROUPS.flatMap(g => g.items.map(i => "/" + i.to.split("/")[1])))),
  );
  const { hasRole, signOut } = useAuth();
  const navigate = useNavigate();

  const itemAllowed = (it: NavItem) => !it.allowedRoles || hasRole(it.allowedRoles);
  const groupAllowed = (g: NavGroup) =>
    (!g.allowedRoles || hasRole(g.allowedRoles)) && g.items.some(itemAllowed);

  const fechar = () => setOpen(false);

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 min-h-[44px] rounded-md text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-gold"
        : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
    }`;

  const sair = async () => {
    fechar();
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent
        side="left"
        className="w-[85vw] max-w-sm p-0 flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border"
      >
        <SheetHeader className="p-4 border-b border-sidebar-border text-left space-y-0">
          <SheetTitle asChild>
            <div>
              <BrandMark className="text-xl text-sidebar-foreground" />
              <div className="text-xs tracking-[0.18em] uppercase text-sidebar-foreground/55 mt-1">
                Sistema da Igreja
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Busca global — o Ctrl+K do desktop, alcançável no toque.
            A busca abre só depois do Sheet fechar: no mesmo tick o Radix
            devolveria o foco ao gatilho e roubaria o cursor do campo. */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => { fechar(); setTimeout(openCommandPalette, 250); }}
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md bg-sidebar-accent/40 hover:bg-sidebar-accent/70 text-sm text-sidebar-foreground/70 transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Buscar página ou ação…</span>
          </button>
        </div>

        <nav className="px-3 pt-3">
          <NavLink to={PAINEL.to} end={PAINEL.end} onClick={fechar} className={itemClass}>
            <PAINEL.icon className="w-4 h-4 shrink-0" />
            <span translate="no">{PAINEL.label}</span>
          </NavLink>
        </nav>

        {/* Os mesmos atalhos da sidebar. Aqui valem ainda mais: a gaveta do
            celular lista os 21 destinos sem colapso nenhum, e chegar ao
            grupo Financeiro exige rolar a tela inteira. Some quando não há
            sinal — ver navUso.ts. */}
        {rotasAtalho.length > 0 && (
          <nav className="px-3 pt-3">
            <p className="px-3 pb-1 text-xs uppercase tracking-widest text-sidebar-foreground/45">
              Atalhos
            </p>
            {rotasAtalho.map(rota => {
              const item = NAV_GROUPS.flatMap(g => g.items)
                .find(i => "/" + i.to.split("/")[1] === rota);
              if (!item || !itemAllowed(item)) return null;
              const Icone = item.icon;
              return (
                <NavLink key={rota} to={item.to} end={item.end} onClick={fechar} className={itemClass}>
                  <Icone className="w-4 h-4 shrink-0" />
                  <span translate="no">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        )}

        <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
          {NAV_GROUPS.filter(groupAllowed).map((group) => {
            const Icon = group.icon;
            return (
              <div key={group.key} className="space-y-0.5">
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-widest text-sidebar-foreground/45">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{group.label}</span>
                </div>
                {group.items.filter(itemAllowed).map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={fechar}
                      className={itemClass}
                    >
                      <ItemIcon className="w-4 h-4 shrink-0" />
                      <span translate="no">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <button
            type="button"
            onClick={sair}
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-md text-sm text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sair</span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default MobileNavDrawer;
