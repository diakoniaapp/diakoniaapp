// ─── adminMenuItems.ts ───────────────────────────────────────────────────────
// Fonte única das funções de administração do sistema, exibidas dentro do menu
// do perfil — onde o usuário se identifica.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// Havia DOIS menus de perfil, e eu não tinha percebido:
//
//   UserMenuButton   avatar no cabeçalho do celular  (a <header> é md:hidden)
//   AppLayout        rodapé da barra lateral         (a <aside> é hidden md:flex)
//
// Ou seja, um só aparece no celular e o outro só no desktop. Quando os itens
// de administração saíram da barra lateral para "o menu da conta", foram parar
// apenas no do celular: no desktop deixaram de ter qualquer entrada, exceto
// pela busca (Ctrl+K). A afirmação de que "nenhum acesso se perdeu" valia só
// para metade dos casos.
//
// Com a lista aqui, os dois menus mostram o mesmo conjunto, e acrescentar um
// item novo não deixa mais um dos lados para trás.
//
// ── 09/09/2026: OITO ITENS SOLTOS VIRARAM TRÊS GRUPOS, E UM SUMIU ────────────
//
// Pedido dela — "organize melhor" — depois de ver, no celular, oito itens
// empilhados sob um único rótulo "Administração", sem relação de proximidade
// entre eles: acesso de gente, identidade da igreja, importação de dados,
// tudo na mesma coluna sem pausa.
//
// "Criar Ministério" saiu de vez, não só de grupo: apontava para
// `/ministerios?novo=1`, mas `Ministerios.tsx` nunca leu esse parâmetro — o
// atalho não abria coisa nenhuma, só largava a pessoa na lista, onde o botão
// "Novo ministério" já faz o trabalho de verdade. Um atalho que promete um
// passo a menos e entrega o mesmo número de cliques é pior que não existir.
//
// Os sete que sobraram viraram três grupos, pela pergunta que cada um
// responde — não por ordem alfabética nem por quando foram criados:
//
//   Acessos     quem entra no sistema, e como recuperar quando trava
//   Da igreja   como a igreja se identifica e documenta pra fora
//   Dados       levar gente pra dentro do sistema, ou pra fora dele

import {
  Users, KeyRound, ShieldAlert, Church,
  FileText, Upload, Download, type LucideIcon,
} from "lucide-react";

export interface AdminMenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface AdminMenuGroup {
  label: string;
  items: AdminMenuItem[];
}

export const ADMIN_MENU_GROUPS: AdminMenuGroup[] = [
  {
    label: "Acessos",
    items: [
      { path: "/usuarios",                label: "Usuários e Acessos",    icon: Users },
      { path: "/admin/recuperacao-senha", label: "Recuperação de Senhas", icon: KeyRound },
    ],
  },
  {
    label: "Da igreja",
    items: [
      { path: "/admin/identidade",  label: "Identidade da Igreja", icon: Church },
      { path: "/admin/documentos",  label: "Documentos",           icon: FileText },
      { path: "/admin/lgpd",        label: "Painel LGPD",          icon: ShieldAlert },
    ],
  },
  {
    label: "Dados",
    items: [
      { path: "/admin/importacao", label: "Importação de Membros", icon: Upload },
      { path: "/admin/exportacao", label: "Exportação de Dados",   icon: Download },
    ],
  },
];

/** As mesmas funções, em lista única — pra quem só precisa varrer todas. */
export const ADMIN_MENU_ITEMS: AdminMenuItem[] = ADMIN_MENU_GROUPS.flatMap(g => g.items);
