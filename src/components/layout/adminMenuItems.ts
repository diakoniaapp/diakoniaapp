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

import {
  Users, HeartHandshake, KeyRound, ShieldAlert, Church,
  FileText, Upload, Download, type LucideIcon,
} from "lucide-react";

export interface AdminMenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  // Acessos primeiro: é a função de administração mais procurada, e veio da
  // barra lateral, onde competia com o trabalho do dia.
  { path: "/usuarios",                label: "Usuários e Acessos",    icon: Users },
  { path: "/ministerios?novo=1",      label: "Criar Ministério",      icon: HeartHandshake },
  { path: "/admin/recuperacao-senha", label: "Recuperação de Senhas", icon: KeyRound },
  { path: "/admin/lgpd",              label: "Painel LGPD",           icon: ShieldAlert },
  { path: "/admin/identidade",        label: "Identidade da Igreja",  icon: Church },
  { path: "/admin/documentos",        label: "Documentos",            icon: FileText },
  { path: "/admin/importacao",        label: "Importação de Membros", icon: Upload },
  { path: "/admin/exportacao",        label: "Exportação de Dados",   icon: Download },
];
