import type { ComponentType } from "react";
import {
  UserPlus, Home, GraduationCap, Users, Sparkles, FileText,
  DollarSign, CheckSquare, Gavel, MapPin, CalendarDays,
  ShoppingCart, Wallet, HandCoins, Scale,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry central de AÇÕES RÁPIDAS — análogo ao widgetRegistry.
 * Cada ação tem um label curto, ícone, rota destino e permissões.
 *
 * Como adicionar uma nova ação:
 *   1. Importe o ícone Lucide
 *   2. Acrescente um registro abaixo (id único, permissões, prioridade)
 *   3. Pronto — aparece no painel pra quem tem permissão
 *
 * ── "APARECE NO PAINEL": EM QUAL PAINEL? NENHUM, HOJE ──────────────────────
 *
 * Achado em 09/09/2026, construindo o Painel da Tesouraria: o único
 * consumidor deste registry é `getAcoesParaUsuario()` chamado de dentro de
 * `pages/Dashboard.tsx` — e `Dashboard.tsx` não aparece em nenhuma rota de
 * `App.tsx`. É o painel de trabalho anterior à Home virar tela pessoal
 * (ver o cabeçalho de `Home.tsx`), preservado no repositório mas nunca
 * apagado nem religado. Este arquivo continua correto — cada ação daqui é
 * dado válido — só que hoje ninguém o lê de verdade.
 *
 * Diferente do `widgetRegistry`, que tem um campo `paineis` dizendo onde
 * cada widget mora, este registry é uma lista única, sem esse recorte —
 * então religá-lo a um painel específico (o da Tesouraria, por exemplo)
 * hoje misturaria ações de todo o sistema ali dentro. Dar a `QuickAction`
 * o mesmo campo `paineis` do widget é o conserto de verdade; até lá, o
 * Painel da Tesouraria mostra os próprios botões direto no JSX, e este
 * registry fica como estava — pronto pra quando alguém ligar o fio.
 */

export interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  to: string;
  permissoes: string[];      // OR — basta ter UMA das permissões
  prioridade: 0 | 1 | 2;     // 0 = mais frequente, 2 = secundária
  ativo?: boolean;
}

export const quickActionsRegistry: QuickAction[] = [
  // ── P0 — As 3-4 ações MAIS frequentes (vão pro topo) ───────────────
  { id: "nova-pessoa", label: "Cadastrar pessoa", icon: UserPlus,
    to: "/membros?abrir=novo", permissoes: ["criar_pessoa"], prioridade: 0 },

  { id: "novo-lancamento", label: "Lançamento", icon: DollarSign,
    to: "/financas?lancar=true", permissoes: ["lancar_financeiro"], prioridade: 0 },

  { id: "nova-membresia", label: "Solicitar membresia", icon: FileText,
    to: "/membresia?abrir=novo", permissoes: ["criar_membresia","ver_membresia"], prioridade: 0 },

  // ── Sprint 3 do Painel da Tesouraria (09/09/2026) ──────────────────
  //
  // "Abrir caixa" e "Fechar caixa" não têm um `to` que já resolva a ação
  // sozinho — abrir depende de qual reserva/evento, fechar depende de qual
  // caixa. `/arrecadacao` deixa escolher a reserva; `/painel-tesouraria`
  // já lista os caixas abertos com o link direto de cada um pro fechamento,
  // exatamente o que a seção "Caixa" do painel constrói desde o Sprint 1.
  { id: "abrir-caixa", label: "Abrir caixa", icon: ShoppingCart,
    to: "/arrecadacao", permissoes: ["operar_caixa"], prioridade: 0 },

  { id: "fechar-caixa", label: "Fechar caixa", icon: Wallet,
    to: "/painel-tesouraria", permissoes: ["operar_caixa"], prioridade: 0 },

  // `&tipo=entrada` é redundante com o padrão de `LancamentoForm`
  // (`tipoPadrao = "entrada"`), mas escrito explícito: se o padrão do
  // formulário um dia mudar, esta ação continua abrindo em entrada mesmo
  // assim — ela representa "oferta", que É uma entrada, não "o que quer que
  // o formulário abra primeiro".
  { id: "registrar-oferta", label: "Registrar oferta", icon: HandCoins,
    to: "/financas?lancar=true&tipo=entrada", permissoes: ["lancar_financeiro"], prioridade: 0 },

  { id: "conciliar", label: "Conciliar", icon: Scale,
    to: "/financas", permissoes: ["lancar_financeiro"], prioridade: 1 },

  // ── P1 — Acessos a módulos principais ─────────────────────────────
  { id: "abrir-familias", label: "Famílias", icon: Home,
    to: "/familias", permissoes: ["ver_familias"], prioridade: 1 },

  { id: "abrir-ebd", label: "EBD", icon: GraduationCap,
    to: "/ebd", permissoes: ["ver_ebd"], prioridade: 1 },

  { id: "abrir-pgm", label: "Pequenos Grupos", icon: Users,
    to: "/pgm", permissoes: ["ver_pgm"], prioridade: 1 },

  { id: "abrir-acompanhamento", label: "Acompanhamento", icon: Sparkles,
    to: "/painel-pastoral", permissoes: ["ver_painel_pastoral"], prioridade: 1 },

  // ── P2 — Atalhos administrativos secundários ──────────────────────
  { id: "abrir-reunioes", label: "Reuniões", icon: Gavel,
    to: "/governanca", permissoes: ["ver_governanca"], prioridade: 2 },

  { id: "abrir-assuntos", label: "Assuntos", icon: CheckSquare,
    to: "/assuntos", permissoes: ["ver_assuntos"], prioridade: 2 },

  { id: "abrir-agenda", label: "Agenda", icon: CalendarDays,
    to: "/eventos", permissoes: [], prioridade: 2 },

  { id: "abrir-espacos", label: "Espaços", icon: MapPin,
    to: "/locais", permissoes: ["ver_locais","ver_familias"], prioridade: 2 },
];

export interface ContextoAcao {
  permissoes: Set<string>;
}

/**
 * Filtra + ordena ações pelo perfil do usuário.
 * Por padrão limita a 6 atalhos (pesquisa de UX: <7 reduz fadiga de escolha).
 */
export function getAcoesParaUsuario(
  ctx: ContextoAcao,
  opts: { limite?: number } = {}
): QuickAction[] {
  const { limite = 6 } = opts;
  return quickActionsRegistry
    .filter(a => a.ativo !== false)
    .filter(a => a.permissoes.length === 0 ||
                 a.permissoes.some(p => ctx.permissoes.has(p)))
    .sort((a, b) => a.prioridade - b.prioridade)
    .slice(0, limite);
}
