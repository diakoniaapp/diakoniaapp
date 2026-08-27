import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, ChevronLeft, ChevronDown, Search, Moon, Sun } from "lucide-react";
import { BrandMark } from "@/components/Brand";
import { useEffect, useState } from "react";
import { QuickActionsFab } from "@/components/QuickActionsFab";
import { FichaProvider } from "@/components/membros/ficha";
import { useTheme } from "@/hooks/useTheme";
import { CommandPalette } from "@/components/CommandPalette";
import { openCommandPalette } from "@/lib/commandPalette";
import { registrarVisita, atalhos, grupoMereceAbrir, temHistoricoBastante } from "@/lib/navUso";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { UserMenuButton } from "@/components/layout/UserMenuButton";
import {
  NAV_GROUPS, PAINEL, ATALHOS_TOPO, pageTitles, ROUTE_ROLES,
  type NavGroup, type NavItem,
} from "@/components/layout/navConfig";
import { ADMIN_MENU_ITEMS } from "@/components/layout/adminMenuItems";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// A estrutura do menu (grupos, rotulos, roles e titulos de pagina) mora em
// navConfig.ts — compartilhada com o menu mobile, que antes nao existia.

// ─── Componente ──────────────────────────────────────────────────────────────
export default function AppLayout() {
  const { user, loading, signOut, roles, hasRole } = useAuth();

  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // ── O menu aprende ────────────────────────────────────────────────────
  //
  // 21 itens em 5 grupos, para 76 rotas. A estrutura está certa; o problema
  // é que ela mostra tudo para todos. Um professor de EBD vê Tesouraria,
  // Módulo Fiscal e Visão Executiva todo dia, o dia inteiro, e nunca abre
  // nenhum dos três.
  //
  // A escolha explícita da pessoa continua mandando: `nav_expanded_v2` só
  // guarda os grupos que ela mesma abriu ou fechou. O uso decide apenas o
  // PADRÃO dos que ela nunca tocou — e só depois de duas semanas de
  // histórico, para ninguém receber um menu quase todo fechado no primeiro
  // dia de uso.
  // Só o que a pessoa DECIDIU. A chave é nova de propósito: a antiga
  // (nav_expanded_v2) guardava os cinco grupos de uma vez, para todo mundo
  // que já usa o sistema — lida como "escolha", ela travaria o aprendizado
  // antes do primeiro dia.
  const [escolhas, setEscolhas] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem("nav_grupos_v3");
      if (raw) return JSON.parse(raw);
    } catch {
      // localStorage indisponível ou JSON corrompido — vale só o padrão
    }
    return {};
  });

  // O padrão de cada grupo, calculado uma vez por carga. "Configurações"
  // continua fechado por decisão, não por medida: é o grupo que se abre
  // uma vez por semestre.
  const [padraoDoUso] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map(g => [
      g.key,
      g.key === "configuracoes"
        ? false
        : grupoMereceAbrir(g.items.map(i => "/" + i.to.split("/")[1])),
    ])),
  );

  const expanded = { ...padraoDoUso, ...escolhas };

  // Registra onde a pessoa esteve. É o que alimenta tudo acima.
  useEffect(() => { registrarVisita(location.pathname); }, [location.pathname]);

  // Calculado UMA vez por carga de página, e nunca a cada navegação: um
  // bloco de atalhos que se reordena enquanto se olha para ele é pior que
  // inútil. Vazio até haver sinal de verdade — ver navUso.ts.
  const [rotasAtalho] = useState<string[]>(() =>
    atalhos(new Set(NAV_GROUPS.flatMap(g => g.items.map(i => "/" + i.to.split("/")[1])))),
  );

  useEffect(() => {
    try {
      localStorage.setItem("nav_grupos_v3", JSON.stringify(escolhas));
    } catch {
      // sem localStorage (aba privada, cota cheia): o menu só não memoriza
    }
  }, [escolhas]);

  // Nome bonito do user (vindo do membro vinculado, se houver)
  const [nomeDisplay, setNomeDisplay] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id) { setNomeDisplay(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("nome, pessoa_id")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.pessoa_id) {
        const { data: m } = await supabase
          .from("membros")
          .select("nome_completo")
          .eq("id", data.pessoa_id)
          .maybeSingle();
        if (!cancelled && m?.nome_completo) {
          setNomeDisplay(m.nome_completo);
          return;
        }
      }
      if (!cancelled) setNomeDisplay(data?.nome ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Guards de auth + must_change_password + LGPD + role
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
      return;
    }

    const required = ROUTE_ROLES[location.pathname];
    if (required && roles.length > 0 && !hasRole(required)) {
      navigate("/", { replace: true });
    }
  }, [user, loading, navigate, location.pathname, roles, hasRole]);

  if (loading || !user) {
    return (
      <div className="h-screen overflow-hidden flex items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const principalRole = (roles[0] ?? "lideranca") as string;
  const roleLabel: Record<string, string> = {
    admin: "Administrador", secretaria: "Secretaria",
    // `diakonia` e `pastor` sao papeis com alcances diferentes — ver
    // types/usuario.ts. Rotular os dois de "Pastor" escondia a diferenca.
    diakonia: "Pastor titular", pastor: "Pastor",
    lideranca: "Liderança", voluntario: "Voluntário",
  };

  const currentTitle = pageTitles[location.pathname] ?? "Diakonia";
  const isHome = location.pathname === "/";

  // Filtragem por role
  const itemAllowed = (it: NavItem) => !it.allowedRoles || hasRole(it.allowedRoles);
  const groupAllowed = (g: NavGroup) => (!g.allowedRoles || hasRole(g.allowedRoles)) && g.items.some(itemAllowed);

  // Avatar: iniciais do nome
  const iniciais = (nomeDisplay ?? user.email ?? "?")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(s => s[0]?.toUpperCase()).join("") || "?";

  // ── NavLink class
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-gold"
        : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
    }`;

  // Grava a decisão, não o estado inteiro: mexer num grupo não pode
  // congelar os outros quatro.
  const toggleGroup = (key: string) =>
    setEscolhas(prev => ({ ...prev, [key]: !(prev[key] ?? padraoDoUso[key] ?? true) }));

  // A ficha de qualquer pessoa passa a poder ser aberta de qualquer tela.
  // O diálogo mora aqui, uma vez, em vez de cada tela declarar o próprio
  // estado — era por isso que só três telas tinham ficha clicável.
  return (
    <FichaProvider>
    <div className="h-screen overflow-hidden flex w-full bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground">
        {/* Logo */}
        <div className="p-5 border-b border-sidebar-border text-center">
          <BrandMark className="text-[2.23rem] text-sidebar-foreground" />
          {/* A margem negativa cancela o espacejamento que sobra DEPOIS da
              última letra. Sem ele o texto centraliza pela caixa, que é
              2,3px mais larga que a tinta, e as bordas de baixo ficam
              1,2px à esquerda das de cima — justo o desalinho que este
              par de larguras existe para não ter. */}
          <div className="text-xs tracking-[0.18em] -mr-[0.18em] uppercase text-sidebar-foreground/55 mt-2">
            Gestão Ministerial
          </div>
        </div>

        {/* Busca global — descoberta por clique, não só por Ctrl+K */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={openCommandPalette}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/40 hover:bg-sidebar-accent/70 text-sm text-sidebar-foreground/60 transition-colors"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span className="flex-1 text-left">Buscar...</span>
            <kbd className="text-xs px-1.5 py-0.5 rounded bg-sidebar-foreground/10 tracking-wider">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Home e Painel Pastoral, fora dos grupos — ver ATALHOS_TOPO */}
        <nav className="px-3 pt-3">
          {ATALHOS_TOPO.filter(itemAllowed).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
              <item.icon className="w-4 h-4 shrink-0" />
              <span translate="no">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* ── Atalhos ─────────────────────────────────────────────────────

            Aditivo, nunca substitutivo: os grupos abaixo continuam
            exatamente onde sempre estiveram. A razão de um menu ser rápido
            é memória muscular — a pessoa alcança "Famílias" sem ler, porque
            Famílias está sempre no mesmo lugar. Um menu que se reorganiza
            sozinho destrói justamente isso, e fica mais lento por parecer
            mais esperto.

            Some inteiro quando não há sinal, em vez de aparecer vazio ou
            com dois cliques de acaso dentro. */}
        {rotasAtalho.length > 0 && (
          <nav className="px-3 pt-3">
            <p className="px-3 pb-1 text-xs uppercase tracking-widest text-sidebar-foreground/55">
              Atalhos
            </p>
            {rotasAtalho.map(rota => {
              const item = NAV_GROUPS.flatMap(g => g.items)
                .find(i => "/" + i.to.split("/")[1] === rota);
              if (!item || !itemAllowed(item)) return null;
              const Icone = item.icon;
              return (
                <NavLink key={rota} to={item.to} end={item.end} className={itemClass}>
                  {({ isActive }) => (
                    <>
                      <Icone className={`w-4 h-4 ${isActive ? "" : "opacity-55"}`} />
                      <span translate="no">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        )}

        {/* Categorias colapsáveis */}
        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {NAV_GROUPS.filter(groupAllowed).map((group) => {
            const isExpanded = expanded[group.key] ?? true;
            const visibleItems = group.items.filter(itemAllowed);
            return (
              <div key={group.key} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-widest text-sidebar-foreground/55 hover:text-sidebar-foreground/70 transition-colors"
                >
                  {/* O icone do grupo saiu. Ele nao tinha funcao: o rotulo
                      nomeia o grupo e a seta ja mostra se esta aberto ou
                      fechado. Eram seis marcas a mais numa coluna que fica
                      permanentemente a vista. */}
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                </button>
                {isExpanded && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
                          {/* O icone do item fica, mas recuado: numa lista de
                              18 destinos ele ajuda a mirar sem ler, e a 55% de
                              opacidade deixa de disputar com o rotulo. No item
                              ativo volta ao peso normal — ali ele tem funcao,
                              que e dizer onde voce esta. */}
                          {({ isActive }) => (
                            <>
                              <ItemIcon className={`w-4 h-4 ${isActive ? "" : "opacity-55"}`} />
                              <span translate="no">{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Perfil — footer */}
        <div className="border-t border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent/60 transition-colors text-left">
                <div className="w-9 h-9 rounded-full bg-gold/20 flex items-center justify-center text-gold font-semibold text-xs shrink-0">
                  {iniciais}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{nomeDisplay ?? "Sem nome"}</div>
                  <div className="text-xs text-sidebar-foreground/60 truncate">{user.email}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-sidebar-foreground/60 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{nomeDisplay ?? "Sem nome"}</span>
                  <span className="text-xs font-normal text-muted-foreground truncate">{user.email}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {roleLabel[principalRole] ?? principalRole}
                  </span>
                </div>
              </DropdownMenuLabel>
              {/* As funcoes de administracao do sistema ficam aqui, no menu do
                  perfil. Este e o menu do DESKTOP; o do celular vive no
                  UserMenuButton e le a mesma lista — antes so ele tinha os
                  itens, e no desktop nao havia entrada nenhuma. */}
              {hasRole(["admin", "secretaria"]) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground/60 py-1">
                    Administração
                  </DropdownMenuLabel>
                  {ADMIN_MENU_ITEMS.map(({ path, label, icon: Icon }) => (
                    <DropdownMenuItem key={path} className="cursor-pointer" onClick={() => navigate(path)}>
                      <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                      {label}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              {/* O tema escuro existia inteiro no CSS e não tinha por onde ser
                  ligado — 120 linhas que nunca chegavam à tela. O padrão segue
                  claro; isto é escolha de quem usa, não da igreja. */}
              <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
                {theme === "dark"
                  ? <><Sun className="w-4 h-4 mr-2" /> Tema claro</>
                  : <><Moon className="w-4 h-4 mr-2" /> Tema escuro</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* min-w-0 e essencial: sem ele este item flex nao encolhe abaixo da
          largura min-content do conteudo, e qualquer texto longo empurra a
          area util para fora do viewport no celular. */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
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
            {/* Busca global — no celular não existe Ctrl+K */}
            <button
              onClick={openCommandPalette}
              aria-label="Buscar página ou ação"
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-sidebar-accent active:scale-95 transition"
            >
              <Search className="w-5 h-5" />
            </button>
            <UserMenuButton />
          </div>
        </header>

        <main
          key={location.pathname}
          className="flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0 animate-fade-in"
        >
          <Outlet />
        </main>

        <CommandPalette />
        <QuickActionsFab />
        <MobileBottomNav />
      </div>
    </div>
    </FichaProvider>
  );
}
