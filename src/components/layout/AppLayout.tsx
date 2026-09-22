import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { FaixaVerComo } from "@/components/layout/VerComoMenu";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, ChevronLeft, ChevronDown, Search, Moon, Sun, User, Mail } from "lucide-react";
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
  NAV_GROUPS, PAINEL, ATALHOS_TOPO, pageTitles, papeisExigidosPara,
  type NavGroup, type NavItem,
} from "@/components/layout/navConfig";
import { contarPendenciasP0, PAINEL_POR_ROTA } from "@/dashboard/pendenciasP0";
import { toast } from "sonner";
import { ADMIN_MENU_GROUPS } from "@/components/layout/adminMenuItems";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

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

  // Pedido dela (22/09/2026), depois de medir: quem é admin+diakonia entra
  // em TODA lista de `allowedRoles` do menu — é a única combinação que
  // atravessa os quatro grupos da barra inteiros mais os sete itens do
  // menu de administração. A barra já aprende sozinha (`grupoMereceAbrir`
  // acima); o menu de administração não tinha peça nenhuma nesse sentido,
  // porque só existe desde 09/09/2026 e sempre apareceu por inteiro. Fecha
  // por padrão a cada vez que o menu abre — sem persistir: diferente da
  // barra lateral, que fica o tempo todo na tela, este dropdown já é
  // transitório por natureza (fecha ao clicar fora), não pede memória de
  // longo prazo.
  const [adminAberto, setAdminAberto] = useState(false);

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

  // Épico 7 do roadmap "90 Dias" (22/09/2026) — indicador de pendência P0
  // no ícone de cada painel, primeira versão. Uma vez por carga de sessão,
  // não a cada navegação: é um resumo do que precisa de decisão, não um
  // contador em tempo real — mesmo espírito do `rotasAtalho` acima
  // ("calculado uma vez, nunca a cada navegação"). `PAINEL_POR_ROTA` cobre
  // só pastoral/secretaria/financas — os únicos com widget prioridade 0
  // hoje (medido em `widgetRegistry.tsx`); `estrategico` fica de fora
  // porque não tem nenhum.
  const [pendenciasP0, setPendenciasP0] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all(
      Object.entries(PAINEL_POR_ROTA).map(([rota, painel]) =>
        contarPendenciasP0(painel).then(n => [rota, n] as const)),
    ).then(pares => {
      if (!cancelled) setPendenciasP0(Object.fromEntries(pares));
    });
    return () => { cancelled = true; };
  }, [user]);

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

    // Prefixo, e não `ROUTE_ROLES[location.pathname]` exato — o Risco 5 do
    // CLAUDE.md já registrava: rota com parâmetro ou sub-rota (`/financas/*`,
    // 18 rotas; `/admin/*`, 7 rotas) não batia com a entrada exata do grupo, e
    // passava sem guarda nenhuma aqui — só a paleta Ctrl+K já usava
    // `papeisExigidosPara` pra esconder o ITEM, o que não impedia digitar a
    // URL direto. A função já existia, só não estava ligada na guarda de
    // verdade.
    const required = papeisExigidosPara(location.pathname);
    if (required && roles.length > 0 && !hasRole(required)) {
      // Sem aviso nenhum, o redirecionamento parecia bug: a pessoa clicava
      // num link ou digitava a URL e "voltava pra Home" sem explicação —
      // igual ao "tela que promete e não entrega" que o projeto já persegue
      // em outros lugares, só que aqui nem chegava a prometer.
      toast.error("Você não tem acesso a esta tela.");
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
    diakonia: "Diakonia — dono do sistema", pastor: "Pastor titular",
    tesouraria: "Tesouraria",
    lideranca: "Liderança", voluntario: "Voluntário",
    // Todo acesso novo nasce aqui desde 20260901250000 — sem este rótulo,
    // a conta recém-criada apareceria sem nome de perfil na interface.
    membro: "Membro",
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
      {/* `print:hidden` — achado em 15/09/2026: nenhuma tela com botão
          "Imprimir/PDF" (FinancasConta, FinancasRelatorio...) escondia o
          menu lateral na impressão. Cada uma tratava só o PRÓPRIO conteúdo;
          o chevron do app (esta barra, o header mobile, o FAB, a barra
          inferior) nunca tinha sido marcado — ia inteiro pro papel/PDF. */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground print:hidden">
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
          {ATALHOS_TOPO.filter(itemAllowed).map(item => {
            const pendencias = pendenciasP0[item.to] ?? 0;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={itemClass}>
                <item.icon className="w-4 h-4 shrink-0" />
                <span translate="no" className="flex-1">{item.label}</span>
                {/* Épico 7 — badge de pendência P0. Só aparece com contagem
                    > 0, mesma regra "bloco vazio não existe" (DA-016) que
                    os próprios widgets já seguem. */}
                {pendencias > 0 && (
                  <span className="text-[10px] font-semibold leading-none px-1.5 py-0.5 rounded-full bg-destructive-soft text-destructive-text border border-destructive-line tabular-nums">
                    {pendencias}
                  </span>
                )}
              </NavLink>
            );
          })}
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
                {/* 09/09/2026, pedido dela: sem e-mail aqui nem no rótulo
                    do menu abaixo — pra quem entrou por telefone,
                    `user.email` é o valor sintético do auth
                    (telefone@app.diakonia...), não um e-mail de verdade. */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{nomeDisplay ?? "Sem nome"}</div>
                </div>
                <ChevronDown className="w-4 h-4 text-sidebar-foreground/60 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{nomeDisplay ?? "Sem nome"}</span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {roleLabel[principalRole] ?? principalRole}
                  </span>
                </div>
              </DropdownMenuLabel>
              {/* 09/09/2026: o menu do celular (UserMenuButton) tinha "Meu
                  Painel" e este, do desktop, não — mais uma metade que
                  ficava pra trás, o mesmo defeito que o comentário logo
                  abaixo descreve para os itens de administração. Vai para
                  "Meus dados" na Home, não `/membros` — ver o comentário da
                  âncora em `Home.tsx`. Rótulo "Meu Painel", não "Meu
                  Perfil" — pedido dela. */}
              <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/#meus-dados")}>
                <User className="w-4 h-4 mr-2 text-muted-foreground" />
                Meu Painel
              </DropdownMenuItem>

              {/* As funcoes de administracao do sistema ficam aqui, no menu do
                  perfil. Este e o menu do DESKTOP; o do celular vive no
                  UserMenuButton e le a mesma lista — antes so ele tinha os
                  itens, e no desktop nao havia entrada nenhuma.

                  Em três grupos desde 09/09/2026 — ver o comentário no topo
                  de adminMenuItems.ts. Atrás de um só disclosure fechado por
                  padrão desde 22/09/2026 — pedido dela, medindo que
                  admin+diakonia é a única combinação que vê os quatro grupos
                  da barra inteiros MAIS estes sete itens; o menu de perfil
                  ficava quase todo tomado por algo que ela abre de vez em
                  quando, não a cada clique no avatar. */}
              {(hasRole(["admin", "secretaria"]) || hasRole(["admin", "diakonia"])) && (
                <>
                  <DropdownMenuSeparator />
                  <Collapsible open={adminAberto} onOpenChange={setAdminAberto}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground outline-none">
                      <span className="text-muted-foreground">Administração do sistema</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${adminAberto ? "rotate-180" : ""}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {hasRole(["admin", "secretaria"]) && ADMIN_MENU_GROUPS.map(({ label: grupo, items }) => (
                        <div key={grupo}>
                          <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground/60 py-1">
                            {grupo}
                          </DropdownMenuLabel>
                          {items.map(({ path, label, icon: Icon }) => (
                            <DropdownMenuItem key={path} className="cursor-pointer" onClick={() => navigate(path)}>
                              <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                              {label}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      ))}
                      {/* Admin+diakonia, não admin+secretaria — mais estreito
                          que os três grupos acima, ver a nota de
                          `ROLES_DONO_SISTEMA` em navConfig.ts. */}
                      {hasRole(["admin", "diakonia"]) && (
                        <div>
                          <DropdownMenuLabel className="text-xs uppercase tracking-widest text-muted-foreground/60 py-1">
                            Sistema
                          </DropdownMenuLabel>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => navigate("/admin/resumo-semanal")}>
                            <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                            Resumo Semanal por E-mail
                          </DropdownMenuItem>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
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
        <header className="md:hidden sticky top-0 z-40 flex items-center gap-2 h-14 px-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border pt-safe print:hidden">
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
          <FaixaVerComo />
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
