import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard, Users, Home, HeartHandshake, Layers, UserCheck,
  GraduationCap, Sprout, Sparkles, FileText, Gavel, CheckSquare, ShoppingBag,
  DollarSign, CalendarDays, MapPin, Church, ScrollText, Flame,
  Network, Building2, BarChart2, Upload, Download, KeyRound,
  ShieldAlert, UserPlus, type LucideIcon,
} from "lucide-react";
import { usePermissoes } from "@/hooks/usePermissoes";

interface CommandRoute {
  to: string;
  label: string;
  icon: LucideIcon;
  group: "Navegação" | "Discipulado" | "Administração" | "Financeiro" | "Configurações" | "Ações";
  keywords?: string[];      // sinônimos pra busca
  permissoes?: string[];    // OR
}

const ROUTES: CommandRoute[] = [
  // ── Ações rápidas (criam algo) ────────────────────────────────────
  { to: "/membros?abrir=novo",  label: "+ Cadastrar pessoa", icon: UserPlus,
    group: "Ações", keywords: ["novo","membro","congregado","cadastro"],
    permissoes: ["criar_pessoa"] },
  { to: "/financas?lancar=true", label: "+ Lançamento financeiro", icon: DollarSign,
    group: "Ações", keywords: ["entrada","saida","despesa","receita","lancar"],
    permissoes: ["lancar_financeiro"] },
  { to: "/membresia?abrir=novo", label: "+ Solicitar membresia", icon: FileText,
    group: "Ações", keywords: ["solicitacao","batismo","aclamacao"],
    permissoes: ["criar_membresia","ver_membresia"] },

  // ── Navegação ─────────────────────────────────────────────────────
  { to: "/",           label: "Painel inicial",  icon: LayoutDashboard, group: "Navegação", keywords: ["home","dashboard","inicio"] },
  { to: "/membros",    label: "Pessoas (catálogo)", icon: Users,        group: "Navegação", keywords: ["membros","congregados"] },
  { to: "/visitantes", label: "Visitantes",       icon: UserCheck,      group: "Navegação", keywords: ["visita"] },
  { to: "/familias",   label: "Famílias",         icon: Home,           group: "Navegação", keywords: ["lar","familia"] },
  { to: "/ministerios",label: "Ministérios",      icon: HeartHandshake, group: "Navegação", keywords: ["ministerio","servico"] },
  { to: "/areas",      label: "Equipes",          icon: Layers,         group: "Navegação", keywords: ["areas","grupo"] },

  // ── Discipulado ───────────────────────────────────────────────────
  { to: "/ebd",             label: "EBD",                  icon: GraduationCap, group: "Discipulado", keywords: ["escola","classe","dominical"] },
  { to: "/pgm",             label: "Pequenos Grupos",      icon: Sprout,        group: "Discipulado", keywords: ["pgm","celula","pg"] },
  { to: "/painel-pastoral", label: "Acompanhamento Pastoral", icon: Sparkles,   group: "Discipulado", keywords: ["pastoral","cuidado"] },

  // ── Administração ─────────────────────────────────────────────────
  { to: "/membresia",  label: "Membresia",  icon: FileText,    group: "Administração", keywords: ["solicitacao","batismo"] },
  { to: "/governanca", label: "Reuniões e Assembleias", icon: Gavel, group: "Administração", keywords: ["assembleia","ata","pauta","decisao"] },
  { to: "/assuntos",   label: "Assuntos",   icon: CheckSquare, group: "Administração", keywords: ["pendencia","tarefa"] },
  { to: "/bazar",      label: "Bazar / Cantina", icon: ShoppingBag, group: "Administração", keywords: ["venda","caixa","pdv","cantina","arrecadacao","campanha","missoes","aniversario","oferta"], permissoes: ["ver_bazar","ver_financeiro"] },
  { to: "/bazar/campanhas/nova", label: "+ Novo evento de bazar/cantina", icon: ShoppingBag, group: "Ações", keywords: ["bazar","cantina","campanha","nova"], permissoes: ["gerenciar_bazar","ver_financeiro"] },
  { to: "/bazar", label: "🛒 PDV / Caixa do bazar", icon: ShoppingBag, group: "Ações", keywords: ["caixa","pdv","venda","vender","registrar","fechar caixa","cantina"], permissoes: ["operar_caixa_bazar","ver_bazar","ver_financeiro"] },
  { to: "/bazar/config", label: "Configurar taxas do bazar", icon: ShoppingBag, group: "Configurações", keywords: ["taxa","cartao","debito","credito","pix","bazar","cantina","pagseguro","cielo"], permissoes: ["gerenciar_bazar","ver_financeiro"] },

  // ── Financeiro ────────────────────────────────────────────────────
  { to: "/financas",         label: "Tesouraria",     icon: DollarSign, group: "Financeiro", keywords: ["dinheiro","caixa","contas","conta"] },
  { to: "/financas/fiscal",    label: "Módulo Fiscal",       icon: DollarSign, group: "Financeiro", keywords: ["fgts","dctfweb","esocial","iss","darf","dirf","obrigacao","imposto","tributo","fisco"], permissoes: ["ver_fiscal","ver_financeiro"] },
  { to: "/financas/reunioes",   label: "Reuniões financeiras", icon: DollarSign, group: "Financeiro", keywords: ["pauta","reunia","ata","decisao","tesouraria","balancete","conciliacao"], permissoes: ["ver_financeiro"] },
  { to: "/financas/executivo",  label: "Dashboard Executivo",  icon: DollarSign, group: "Financeiro", keywords: ["executivo","conselho","pastor","tesoureiro","saldo","fluxo","caixa","grafico","dizimo","oferta","missao"], permissoes: ["ver_dashboard_executivo","ver_financeiro"] },

  // ── Agenda & Espaços ──────────────────────────────────────────────
  { to: "/eventos",    label: "Agenda",     icon: CalendarDays, group: "Navegação", keywords: ["evento","calendario"] },
  { to: "/locais",     label: "Espaços",    icon: MapPin,       group: "Navegação", keywords: ["local","reserva","sala","templo"] },

  // ── Configurações (raramente buscadas mas indexadas) ──────────────
  { to: "/admin/identidade",        label: "Identidade da igreja", icon: Church,      group: "Configurações", keywords: ["estatuto","missao","visao"] },
  { to: "/admin/documentos",        label: "Documentos institucionais", icon: ScrollText, group: "Configurações", keywords: ["regimento","atas"] },
  { to: "/admin/campanhas",         label: "Campanhas",            icon: Flame,       group: "Configurações", keywords: ["natal","missoes","ofertas"] },
  { to: "/estrutura",               label: "Estrutura",            icon: Network,     group: "Configurações", keywords: ["organograma","arvore"] },
  { to: "/organograma",             label: "Organograma",          icon: Building2,   group: "Configurações" },
  { to: "/painel-estrategico",      label: "Crescimento",          icon: BarChart2,   group: "Configurações", keywords: ["metricas","kpi"] },
  { to: "/admin/importacao",        label: "Importação de dados",  icon: Upload,      group: "Configurações" },
  { to: "/admin/exportacao",        label: "Exportação de dados",  icon: Download,    group: "Configurações" },
  { to: "/usuarios",                label: "Usuários do sistema",  icon: Users,       group: "Configurações", keywords: ["acesso","login"] },
  { to: "/admin/recuperacao-senha", label: "Recuperar senha",      icon: KeyRound,    group: "Configurações", keywords: ["esqueci","redefinir"] },
  { to: "/admin/lgpd",              label: "LGPD",                 icon: ShieldAlert, group: "Configurações", keywords: ["privacidade","dados"] },
];

const GRUPO_ORDEM: CommandRoute["group"][] = ["Ações","Navegação","Discipulado","Administração","Financeiro","Configurações"];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { permissoes } = usePermissoes();

  // Atalho de teclado: Cmd+K (Mac) ou Ctrl+K (Windows/Linux)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Filtra rotas por permissão e agrupa
  const rotasFiltradas = useMemo(() => {
    const visiveis = ROUTES.filter(r =>
      !r.permissoes ||
      r.permissoes.length === 0 ||
      r.permissoes.some(p => permissoes.has(p))
    );
    const porGrupo: Record<string, CommandRoute[]> = {};
    visiveis.forEach(r => {
      if (!porGrupo[r.group]) porGrupo[r.group] = [];
      porGrupo[r.group].push(r);
    });
    return porGrupo;
  }, [permissoes]);

  const ir = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar página, ação ou atalho..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        {GRUPO_ORDEM.map((grupo, idx) => {
          const items = rotasFiltradas[grupo];
          if (!items || items.length === 0) return null;
          return (
            <div key={grupo}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={grupo}>
                {items.map(item => {
                  const Icon = item.icon;
                  const valueAlvo = [item.label, ...(item.keywords ?? [])].join(" ");
                  return (
                    <CommandItem
                      key={item.to + ":" + item.label}
                      value={valueAlvo}
                      onSelect={() => ir(item.to)}
                    >
                      <Icon className="w-4 h-4 mr-2 text-muted-foreground" />
                      <span>{item.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
