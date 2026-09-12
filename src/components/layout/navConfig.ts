// ─── navConfig.ts ────────────────────────────────────────────────────────────
// Fonte única da estrutura de navegação.
//
// Antes, os grupos viviam dentro do AppLayout — que é `hidden md:flex`.
// Resultado: no celular a sidebar simplesmente não existia, e módulos
// inteiros (EBD, PGM, Membresia, Reuniões, Assuntos, Finanças, Bazar…)
// ficavam inalcançáveis. Agora sidebar e menu mobile leem daqui.

import {
  LayoutDashboard, Users, HeartHandshake, Home, CalendarDays, MapPin,
  BarChart2, GraduationCap, Sparkles, DollarSign, Building2,
  Network, FileText, ScrollText,
  CheckSquare, UserCheck, Sprout, Gavel,
  ShoppingBag, type LucideIcon,
  ClipboardCheck, Wallet, HandCoins,
} from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";

// ─── Roles auxiliares ────────────────────────────────────────────────────────
// ── QUEM É O PASTOR TITULAR MUDOU DE NOME EM 02/09/2026 ────────────────────
//
// Era `diakonia` — o nome do FORNECEDOR vestindo um cargo da igreja. A igreja
// separou as três coisas:
//
//   diakonia    dono do sistema, que o constrói; vê tudo e todos, em qualquer
//               igreja. Não é cargo de igreja nenhuma.
//   admin       pessoa da igreja que configura o sistema do zero
//   pastor      o pastor titular
//
// Então `diakonia` entra em toda lista onde `admin` está, porque vê tudo, e
// `pastor` passa a ser o titular — o que INVERTE as listas "sem titular"
// logo abaixo.
export const ROLES_LIDERES: AppRole[]  = ["admin", "diakonia", "secretaria", "tesouraria", "pastor", "lideranca"];
export const ROLES_PASTORAL: AppRole[] = ["admin", "diakonia", "secretaria", "pastor"];
export const ROLES_ADMIN: AppRole[]    = ["admin", "diakonia", "secretaria"];

/**
 * As mesmas listas, sem o pastor titular.
 *
 * ── A REGRA ────────────────────────────────────────────────────────────────
 *
 * Dita pela igreja em 01/09/2026: "o pastor deve visualizar só o que estiver
 * no painel pastoral", depois de "ADMINISTRADOR dono do sistema vê tudo e
 * todos".
 *
 * O painel dele cobre um recorte definido — o dia, o rebanho, os visitantes,
 * os candidatos à membresia, o discipulado (EBD e Pequenos Grupos), as
 * famílias, quem serve e os assuntos urgentes. Tudo o que o pastor titular
 * alcança pelo menu tem de estar dentro desse recorte; o resto é trabalho de
 * outra bancada.
 *
 * ── O QUE ELE PERDE, E POR QUÊ ─────────────────────────────────────────────
 *
 *   Ministérios, Organograma   gestão de equipes — bancada de quem lidera
 *   Reuniões e Atas            governança, trabalho da secretaria
 *   Estrutura                  matéria institucional, não pastoral
 *   Bazar e Cantina            arrecadação
 *   Financeiro (os quatro)     tesouraria
 *   Espaços                    cadastro de locais
 *
 * ── POR QUE POR SUBTRAÇÃO, E NÃO POR UMA LISTA NOVA ────────────────────────
 *
 * O menu já decide audiência item a item, com `allowedRoles`. Uma lista
 * paralela de "rotas do pastor" seria um QUARTO portão — somando-se ao menu, à
 * guarda de rota e à permissão do banco, que já discordavam entre si esta
 * semana e custaram dois defeitos de cartão que não leva a lugar nenhum.
 *
 * A regra inteira, que a subtração espalha, fica verificável num lugar só: o
 * teste "o pastor titular alcança exatamente o recorte do painel dele", em
 * `navConfig.test.ts`.
 */
// Invertidas em 02/09/2026: o titular passou de `diakonia` para `pastor`,
// então é `pastor` que sai daqui. `diakonia` entra, porque o dono do sistema
// alcança tudo — inclusive o que o titular não alcança.
export const ROLES_LIDERES_SEM_TITULAR: AppRole[]  = ["admin", "diakonia", "secretaria", "tesouraria", "lideranca"];
export const ROLES_PASTORAL_SEM_TITULAR: AppRole[] = ["admin", "diakonia", "secretaria"];

// ── O DINHEIRO TEM LISTA PRÓPRIA ───────────────────────────────────────────
//
// Regra da igreja em 02/09/2026, em quatro palavras: "liderança nao opera o
// financeiro". A RLS já a obedece — 20260902210000 tirou `lideranca` das 21
// tabelas de `fin_` e `fiscal_`.
//
// O menu tem de obedecer também, senão oferece o que o banco nega: quem
// lidera um ministério veria "Tesouraria" na barra e abriria uma tela vazia.
// Tela que promete o que não entrega é o defeito que este projeto vem
// consertando a semana toda.
//
// Lista própria, e não `ROLES_LIDERES_SEM_TITULAR` menos um: aquela constante
// serve a ministérios, governança, assuntos e arrecadação, onde a liderança
// continua entrando. Reusá-la aqui amarraria duas decisões diferentes na
// mesma linha.
export const ROLES_FINANCEIRO: AppRole[] = ["admin", "diakonia", "secretaria", "tesouraria"];

/**
 * Quem enxerga o Painel Pastoral.
 *
 * ── ESTREITADO EM 01/09/2026, A PEDIDO DA IGREJA ───────────────────────────
 *
 * Era `["admin", "pastor", "diakonia", "lideranca"]`. O pedido foi direto —
 * "o acesso deve ser para quem tem o perfil de PASTOR TITULAR" — com a
 * separação dita em seguida: "ADMINISTRAÇÃO dono do sistema".
 *
 * São dois, e por razões diferentes:
 *
 *   diakonia   é o pastor titular, e esta é a bancada DELE: acolhimento,
 *              candidatos ao batismo, discipulado, o cuidado da igreja.
 *   admin      não é perfil pastoral. Entra por administrar o sistema — por
 *              ser dona da casa, não por fazer o trabalho de dentro dela.
 *
 * ── QUEM SAIU, E POR QUÊ ───────────────────────────────────────────────────
 *
 * `lideranca` — acompanhava o cuidado sem executá-lo, que é exatamente o
 * motivo pelo qual a secretária saiu daqui em 26/08.
 *
 * `pastor` — é papel REDUZIDO, não um segundo pastor titular. O CLAUDE.md
 * mede: `diakonia` tem 62 combinações tabela+operação contra 34 de `pastor`, e
 * `pastor` sozinho não enxerga famílias, visitas nem histórico de membresia.
 * Mandá-lo a um painel de cuidado que ele não consegue ler seria promessa
 * vazia. Nenhuma conta tem esse papel hoje.
 *
 * ── O QUE ISSO CUSTA AGORA ─────────────────────────────────────────────────
 *
 * Medido em 01/09/2026: **nenhuma conta tem `diakonia`**. As três são admin,
 * secretaria e lideranca. Até a secretaria criar o acesso do pastor titular,
 * quem abre este painel é a administração — e é por isso que ela ficou.
 *
 * ── A PERMISSÃO DO BANCO AINDA DISCORDA ────────────────────────────────────
 *
 * `ver_painel_pastoral` em `role_permissoes` vale para admin, diakonia E
 * pastor. Esta lista governa menu, rota e paleta; aquela governa o cartão da
 * Home e as ações rápidas. Enquanto não se alinharem, um usuário `pastor`
 * veria o cartão na Home e bateria na guarda ao clicar.
 *
 * Alinhar exige apagar uma linha em produção, e está proposto à parte.
 */
export const ROLES_PAINEL_PASTORAL: AppRole[] = ["pastor", "admin", "diakonia"];

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  allowedRoles?: AppRole[];
}

export interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  allowedRoles?: AppRole[];
}

// Painel sempre visível no topo, fora dos grupos.
//
// Passou a se chamar "Home" em 26/08/2026: com o Painel Pastoral logo abaixo,
// dois itens chamados "Painel" e "Painel Pastoral" no mesmo bloco obrigavam a
// ler os dois para escolher. "Home" diz o que é sem disputar o nome.
export const PAINEL: NavItem = { to: "/", label: "Home", icon: LayoutDashboard, end: true };

/**
 * Os itens fixos do topo, fora dos grupos.
 *
 * O Painel Pastoral subiu para cá vindo de "Discipulado". Ele deixou de ser
 * uma tela do módulo de discipulado e virou a tela de trabalho da liderança —
 * reúne o dia, a semana, os candidatos, os visitantes e o discipulado inteiro.
 * Uma tela que se abre todo dia não deve exigir abrir um grupo antes.
 *
 * Cada item ainda passa por `allowedRoles`: "Home" é de todos, o Painel
 * Pastoral é da liderança.
 */
export const ATALHOS_TOPO: NavItem[] = [
  PAINEL,
  { to: "/painel-pastoral", label: "Painel Pastoral", icon: Sparkles, allowedRoles: ROLES_PAINEL_PASTORAL },
  // Só admin e secretaria. Aparecer para a liderança faria o atalho prometer
  // uma tela que a guarda de rota recusa — pior que não aparecer.
  { to: "/painel-secretaria", label: "Painel da Secretaria", icon: ClipboardCheck, allowedRoles: ROLES_ADMIN },
  // Fecha o trio. Achado na auditoria de navegação de 08/09/2026: pastor e
  // secretaria já tinham bancada própria com chegada automática no login, e
  // tesouraria caía na Home genérica — o maior problema estrutural que a
  // auditoria encontrou. `ROLES_FINANCEIRO`, não `ROLES_ADMIN`: quem tem só o
  // papel `tesouraria` precisa ver o atalho, não só admin/diakonia/secretaria.
  { to: "/painel-tesouraria", label: "Painel da Tesouraria", icon: Wallet, allowedRoles: ROLES_FINANCEIRO },
  // Quarto atalho fixo, 09/09/2026 — não uma quarta tela. Achado revendo o
  // próprio "Diakonia Care" do Painel Pastoral: a Diaconia e Ação Social
  // tinha módulo pronto (`SecaoDiaconia`, dentro do painel genérico de
  // ministério) e nenhum endereço fixo para chegar lá, ao contrário de
  // Pastoral/Secretaria/Tesouraria. A tentativa inicial construiu uma tela
  // própria e duplicou o que `SecaoDiaconia` já mostrava em
  // `/ministerios/:id/painel` — ela pegou a sobreposição no mesmo dia.
  // `PainelDiaconia.tsx` virou um redirecionamento: resolve qual ministério
  // tem `modulo = 'diaconia'` e manda para o painel de verdade dele, sem
  // segunda tela. `ROLES_LIDERES_SEM_TITULAR`, a mesma malha de
  // "/ministerios": a Diaconia não é um papel de sistema (`AppRole`) próprio,
  // é um ministério, e sua liderança é quem já enxerga ministérios.
  { to: "/painel-diaconia", label: "Painel da Diaconia", icon: HeartHandshake, allowedRoles: ROLES_LIDERES_SEM_TITULAR },
  // Subiu do grupo "Agenda & Espaços" em 09/09/2026, ao desmontar aquele
  // grupo — ver o comentário no fim de `NAV_GROUPS`. Sem `allowedRoles`,
  // como já era: Agenda é de uso diário e transversal, todo papel a vê,
  // igual a "Home".
  { to: "/eventos", label: "Agenda", icon: CalendarDays },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "pessoas",
    label: "Pessoas",
    icon: Users,
    items: [
      { to: "/membros",      label: "Catálogo",    icon: Users,          allowedRoles: ROLES_LIDERES },
      { to: "/visitantes",   label: "Visitantes",  icon: UserCheck },
      { to: "/familias",     label: "Famílias",    icon: Home,           allowedRoles: ROLES_LIDERES },
      { to: "/ministerios",  label: "Ministérios", icon: HeartHandshake, allowedRoles: ROLES_LIDERES_SEM_TITULAR },
      // Organograma veio de "Configurações". Ele nao configura nada: e uma
      // VISTA das pessoas e de como se organizam — mesma materia de Catalogo,
      // Familias e Ministerios, e para o mesmo publico (liderancas).
      { to: "/organograma",  label: "Organograma", icon: Building2,      allowedRoles: ROLES_LIDERES_SEM_TITULAR },
      // "Equipes" (/areas) saiu do menu: area mora dentro de ministerio, e
      // agora se chega la pelo proprio ministerio — o cartao inteiro abre
      // "Áreas — <ministério>". Um item de primeiro nivel para algo que e
      // filho de outro item disputava atencao e sugeria dois caminhos
      // paralelos. A rota continua existindo e atendendo quem tem link salvo.
      //
      // Membresia veio de "Administração" em 09/09/2026, ao desmontar aquele
      // grupo — ver o comentário no fim deste arquivo. É cadastro de pessoa
      // (o processo formal de entrada no rol), mesma matéria de Catálogo e
      // Famílias — não administração de sistema nenhuma.
      { to: "/membresia",    label: "Membresia",   icon: FileText,       allowedRoles: ROLES_LIDERES },
    ],
  },
  {
    key: "discipulado",
    label: "Discipulado",
    icon: GraduationCap,
    items: [
      { to: "/ebd",              label: "EBD",             icon: GraduationCap, allowedRoles: ROLES_LIDERES },
      { to: "/pgm",              label: "Pequenos Grupos", icon: Sprout,        allowedRoles: ROLES_LIDERES },
      // Tres itens sairam deste grupo, e todos pelo mesmo motivo: viraram
      // conteudo do Painel Pastoral, e ter os dois caminhos disputava
      // atencao. As tres rotas continuam existindo, para nao quebrar link
      // salvo.
      //
      //   "Painel Pastoral"        subiu para o topo, fora dos grupos
      //   "Campanhas Espirituais"  virou aba da secao Discipulado do painel
      //   "Crescimento"            idem — /painel-estrategico embutido
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    allowedRoles: ROLES_FINANCEIRO,
    items: [
      { to: "/financas",           label: "Tesouraria",          icon: DollarSign, allowedRoles: ROLES_FINANCEIRO },
      { to: "/financas/doacoes",   label: "Doações",             icon: HandCoins,  allowedRoles: ROLES_FINANCEIRO },
      { to: "/financas/fiscal",    label: "Módulo Fiscal",       icon: DollarSign, allowedRoles: ROLES_FINANCEIRO },
      { to: "/financas/reunioes",  label: "Reuniões financeiras", icon: DollarSign, allowedRoles: ROLES_FINANCEIRO },
      { to: "/financas/executivo", label: "Visão Executiva",     icon: DollarSign, allowedRoles: ROLES_PASTORAL_SEM_TITULAR },
      // ── BAZAR E CANTINA SÃO DA ADMINISTRAÇÃO ────────────────────────
      //
      // Regra da igreja em 02/09/2026: "Ministério de Administração e Perfil
      // Administração apenas verão as arrecadações". São as duas
      // Administrações que ela mesma separou — o PERFIL (`admin`, dona do
      // sistema) e o MINISTÉRIO (com líder no cadastro).
      //
      // O MENU oferece só ao perfil. Quem lidera o ministério não chega por
      // aqui e sim pelo próprio painel, no link "Abrir o Bazar" — e a rota o
      // deixa passar (ver ROUTE_ROLES). Menu e rota são coisas diferentes: o
      // menu é o convite, a rota é a porta.
      //
      // Pôr `lideranca` no menu colocaria "Bazar e Cantina" na barra de quem
      // lidera a Música, que abriria uma tela vazia — a RLS não lhe dá linha
      // nenhuma. Tela que oferece o que não entrega é o defeito que este
      // projeto vem consertando a semana toda.
      //
      // Migrou do extinto grupo "Administração" em 09/09/2026 — ver o
      // comentário no fim deste arquivo. É operação de varejo com fluxo de
      // caixa próprio: mais perto de Financeiro do que de qualquer outro
      // vizinho que já teve.
      { to: "/arrecadacao", label: "Bazar e Cantina", icon: ShoppingBag, allowedRoles: ["admin"] },
      // Espaços migrou do extinto grupo "Agenda & Espaços" na mesma leva —
      // cadastro do prédio físico, mesmo assunto de Bazar e Cantina (que
      // também reserva espaço), e não tinha relação nenhuma com Agenda além
      // de os dois começarem com a letra A.
      { to: "/locais",  label: "Espaços", icon: MapPin, allowedRoles: ROLES_LIDERES_SEM_TITULAR },
    ],
  },
  // ── "LIDERANÇA" — O QUE SOBROU DE "ADMINISTRAÇÃO" DEPOIS DE REDISTRIBUÍDO ──
  //
  // Achado na auditoria de navegação de 08/09/2026 (Raio-X do Diakonia):
  // "Administração" reunia Membresia, Reuniões e Atas, Assuntos, Estrutura e
  // Bazar e Cantina — cinco assuntos sem parentesco além de "não coube em
  // outro grupo". Cada um foi para onde o assunto já mora: Membresia em
  // Pessoas (é cadastro de gente), Bazar e Cantina em Financeiro (é dinheiro).
  //
  // Os três que sobraram — Reuniões e Atas, Assuntos, Estrutura — SÃO
  // parentes de verdade: os três são como a liderança da igreja decide e
  // registra, não como ela cuida de gente nem como ela move dinheiro. Um
  // grupo de três, e não três itens soltos, porque a matéria em comum é real
  // — diferente do que "Administração" tinha.
  {
    key: "lideranca",
    label: "Liderança",
    icon: ScrollText,
    items: [
      // "Reuniões" aparecia DUAS vezes na barra — aqui e no Financeiro — com o
      // mesmo rotulo para coisas diferentes. Esta trata de reunioes e
      // assembleias da igreja; a outra, das financeiras. Agora cada uma diz
      // qual e, sem depender de o usuario reparar em qual grupo esta.
      // ── A LIDERANÇA VÊ AS ATAS, E ISSO FOI DECIDIDO ─────────────────
      //
      // Em 02/09/2026 a igreja tirou `lideranca` do financeiro
      // (20260902210000) e, na mesma conversa, foi perguntada sobre a
      // vizinha: e as atas? A resposta foi "sim, liderança vê".
      //
      // Fica escrito porque a semelhança engana. Governança estava ao lado
      // do financeiro nas 28 tabelas fechadas em 01/09, e quem vier depois
      // vai olhar esta linha, lembrar que o dinheiro perdeu a liderança, e
      // achar que aqui ficou um serviço por fazer. Não ficou: ata de
      // assembleia e voto não são dinheiro, e quem lidera um ministério
      // participa de assembleia.
      { to: "/governanca",  label: "Reuniões e Atas", icon: Gavel,       allowedRoles: ROLES_LIDERES_SEM_TITULAR },
      { to: "/assuntos",    label: "Assuntos",        icon: CheckSquare, allowedRoles: ROLES_LIDERES },
      // Estrutura veio de "Configurações": e a estrutura institucional da
      // igreja, extraida dos documentos — materia administrativa, e continua
      // aberta a pastores, que o menu da conta nao alcanca.
      { to: "/estrutura",   label: "Estrutura",       icon: Network,     allowedRoles: ROLES_PASTORAL_SEM_TITULAR },
    ],
  },
  // O grupo "Configurações" deixou de existir.
  //
  // Ele comecou com onze itens, sete dos quais ja estavam no menu da conta.
  // Removidos aqueles, sobraram quatro — e nenhum era configuracao:
  // Organograma e uma vista das pessoas, Crescimento e um painel do
  // discipulado, Estrutura e materia administrativa. Cada um foi para o grupo
  // que trata do mesmo assunto.
  //
  // O que restou de fato administracao do sistema — "Usuários", que gerencia
  // acessos — foi para o menu da conta, junto de Recuperacao de Senhas e
  // Painel LGPD, que sao da mesma familia e ja estavam la.
  //
  // Um grupo chamado "Configurações" que nao guardava configuracao nenhuma
  // custava uma faixa na barra e uma decisao a cada busca: "sera que esta em
  // Configurações?".
  //
  // ── "ADMINISTRAÇÃO" E "AGENDA & ESPAÇOS" TIVERAM O MESMO DESTINO (09/09/2026) ──
  //
  // Fase 1 da Bússola do Diakonia, último item em aberto. "Administração"
  // era um grupo por eliminação — cinco assuntos sem parentesco, o mesmo
  // defeito que já tinha derrubado "Configurações". "Agenda & Espaços" era
  // um grupo de dois itens sem relação nenhuma entre si além do nome: Agenda
  // é de uso diário e transversal (subiu para os atalhos do topo, ao lado de
  // Home); Espaços é cadastro do prédio (desceu para Financeiro, perto de
  // Bazar e Cantina, que também reserva espaço). Nenhuma rota mudou, nenhum
  // `allowedRoles` mudou — só o endereço no menu.
];

export const pageTitles: Record<string, string> = {
  "/":                        "Diakonia",
  "/membros":                 "Pessoas",
  "/familias":                "Famílias",
  "/ministerios":             "Ministérios",
  "/areas":                   "Equipes",
  "/eventos":                 "Agenda",
  "/agenda-pastoral":         "Agenda Pastoral",
  "/painel-pastoral":         "Painel Pastoral",
  "/painel-secretaria":       "Painel da Secretaria",
  "/painel-tesouraria":       "Painel da Tesouraria",
  "/painel-diaconia":         "Painel da Diaconia",
  "/locais":                  "Espaços",
  "/visitantes":              "Visitantes",
  "/painel-estrategico":      "Crescimento",
  "/ebd":                     "EBD",
  // /ebd/acompanhamento virou redirecionamento para /painel-pastoral.
  "/pgm":                     "Pequenos Grupos",
  "/organograma":             "Organograma",
  "/estrutura":               "Estrutura",
  "/usuarios":                "Usuários",
  "/membresia":               "Membresia",
  "/governanca":              "Reuniões",
  "/assuntos":                "Assuntos",
  "/financas":                "Tesouraria",
  "/financas/executivo":      "Visão Executiva",
  "/arrecadacao":             "Bazar e Cantina",
  "/admin/recuperacao-senha": "Recuperar Senha",
  "/admin/lgpd":              "LGPD",
  "/admin/identidade":        "Identidade",
  "/admin/documentos":        "Documentos",
  "/admin/importacao":        "Importação",
  "/admin/exportacao":        "Exportação",
  "/admin/campanhas":         "Campanhas Espirituais",
};

export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/membros":            ROLES_LIDERES,
  "/familias":           ROLES_LIDERES,
  // Sem o pastor titular, aqui e no menu, pelo mesmo motivo: sao telas fora do
  // recorte do painel dele. Esconder so o item do menu deixaria a URL digitada
  // e a paleta Ctrl+K abertas — o defeito que o comentario de
  // ROLES_PAINEL_PASTORAL ja registra.
  "/ministerios":        ROLES_LIDERES_SEM_TITULAR,
  "/locais":             ROLES_LIDERES_SEM_TITULAR,
  "/painel-estrategico": ROLES_PASTORAL,
  "/ebd":                ROLES_LIDERES,
  "/admin/campanhas":    ROLES_LIDERES,
  "/organograma":        ROLES_LIDERES_SEM_TITULAR,
  "/estrutura":          ROLES_PASTORAL_SEM_TITULAR,
  "/usuarios":           ROLES_ADMIN,
  // `ROLES_ADMIN` é ["admin", "secretaria"] — o nome engana, mas é exatamente
  // o par que deve entrar aqui. Pastor e liderança ficam de fora de propósito:
  // esta tela não informa sobre a igreja, ela distribui trabalho a quem o
  // executa, e trabalho endereçado a quem não o faz é o defeito que ela veio
  // corrigir.
  "/painel-secretaria":  ROLES_ADMIN,

  // ── AS ROTAS QUE NAO TINHAM GUARDA NENHUMA ────────────────────────────
  //
  // O Risco 5 do CLAUDE.md ja media: "/admin/* (7 rotas) e /financas/* (18
  // rotas) NAO aparecem em ROUTE_ROLES. Quem digitar a URL chega a tela."
  //
  // Entram agora porque o pastor titular precisa ser recusado nelas, e
  // esconder so o item do menu deixaria a URL e a paleta Ctrl+K abertas. O
  // efeito colateral e bem-vindo: hoje um voluntario que digitasse /financas
  // entrava.
  //
  // A guarda e por caminho EXATO — as sub-rotas de /financas continuam sem
  // portao. Fechar as dezoito exige casamento por prefixo, que e outro
  // trabalho; estas seis sao as que o menu oferece.
  "/governanca":         ROLES_LIDERES_SEM_TITULAR,
  // A porta é mais larga que o convite, de propósito: quem lidera o
  // ministério do Bazar precisa entrar pelo link do painel dele. Quem não
  // lidera passa por aqui e encontra o banco calado — as sete políticas de
  // 20260902140000 só respondem a quem lidera o módulo.
  "/arrecadacao":        ["admin", "lideranca"],
  "/financas":           ROLES_FINANCEIRO,
  "/financas/fiscal":    ROLES_FINANCEIRO,
  "/financas/reunioes":  ROLES_FINANCEIRO,
  "/financas/executivo": ROLES_PASTORAL_SEM_TITULAR,

  // ── /admin e /areas ───────────────────────────────────────────────────
  //
  // A outra metade do Risco 5: as sete telas sob /admin — LGPD, importação,
  // exportação, identidade, documentos, campanhas, recuperação de senha —
  // também não tinham guarda, e a paleta Ctrl+K as oferecia a qualquer papel.
  // Conferido em 01/09/2026: o pastor titular enxergava "LGPD" e "Exportação
  // de dados" na busca.
  //
  // A entrada de "/admin" vale para as sete pelo casamento por PREFIXO de
  // papeisExigidosPara(), que a paleta usa. O guarda do AppLayout continua
  // exato e não alcança as sub-rotas — mas o CLAUDE.md registra que essas
  // telas já se defendem sozinhas com hasRole, e a RLS é o último portão.
  //
  // "/areas" é a lista de equipes de todos os ministérios: mesma matéria de
  // "/ministerios", mesmo público.
  "/admin":              ROLES_ADMIN,
  "/areas":              ROLES_LIDERES_SEM_TITULAR,
  // Sem guarda, a secretaria continuaria chegando pela URL, pelo atalho
  // /ebd/acompanhamento e pela paleta — esconder o item do menu esconderia
  // so um dos quatro caminhos.
  "/painel-pastoral":    ROLES_PAINEL_PASTORAL,
  // `ROLES_FINANCEIRO`, não uma lista própria: é a mesma malha que já fecha
  // "/financas" e as outras três rotas do grupo Financeiro — o papel
  // `tesouraria` precisa entrar aqui pelo mesmo motivo que entra lá.
  "/painel-tesouraria":  ROLES_FINANCEIRO,
  // Mesma malha de "/ministerios" — ver o comentário no ATALHOS_TOPO.
  "/painel-diaconia":    ROLES_LIDERES_SEM_TITULAR,
};

/**
 * Para onde a pessoa vai ao ENTRAR no sistema.
 *
 * Quem tem uma bancada de trabalho cai nela; quem não tem cai na Home.
 * O pastor titular abre o Painel Pastoral, a secretária o da Secretaria —
 * ninguém precisa atravessar uma tela que não é sua para chegar à sua.
 *
 * ── SÓ NA ENTRADA ─────────────────────────────────────────────────────────
 *
 * A Home continua existindo e continua no menu. Isto decide o ponto de
 * partida, não fecha porta: a secretária que quiser ver o acolhimento clica
 * em "Home" e vê. Trocar o `/` pelo painel seria o passo seguinte, e tiraria
 * dela os doze blocos que ela hoje acompanha sem executar.
 *
 * ── A ORDEM É DELIBERADA ──────────────────────────────────────────────────
 *
 * `secretaria` é testada antes de `admin` porque quem acumula os dois está
 * fazendo trabalho de secretaria — admin é o que a pessoa PODE, não o que ela
 * FAZ. E `admin` sozinho cai na Home: administrar o sistema não é uma
 * bancada, é uma capacidade.
 *
 * Papel desconhecido, ou nenhum, cai na Home. Nunca devolve rota que a guarda
 * de `ROUTE_ROLES` recusaria — mandar alguém para uma tela que o portão
 * rejeita produziria um vaivém logo depois do login.
 */
export function rotaInicialPorPapel(roles: AppRole[]): string {
  if (roles.includes("secretaria")) return "/painel-secretaria";
  // `pastor` saiu daqui em 01/09/2026, junto com a estreitada de
  // `ROLES_PAINEL_PASTORAL` para o pastor titular. Deixá-lo mandaria a pessoa
  // para uma tela que a guarda recusa no instante seguinte — o vaivém que a
  // nota acima promete não produzir, e que o último teste deste arquivo pega.
  if (roles.includes("pastor")) return "/painel-pastoral";
  // Fecha o trio, achado na auditoria de navegação de 08/09/2026: tesouraria
  // caía na Home genérica enquanto secretaria e pastor já tinham bancada
  // própria — o maior problema estrutural que a auditoria encontrou.
  if (roles.includes("tesouraria")) return "/painel-tesouraria";
  return "/";
}

/**
 * Os papeis exigidos por uma rota, considerando SUB-ROTAS.
 *
 * `ROUTE_ROLES` e indexado por caminho exato, e o guarda do `AppLayout` o le
 * assim — e uma limitacao que o Risco 5 do CLAUDE.md ja registra: uma rota
 * com parametro, como `/ebd/:classeId`, nao casa com a entrada de `/ebd`.
 *
 * Esta funcao faz o casamento por PREFIXO, com o mais longo vencendo:
 * `/financas/executivo` acha a entrada dele, e nao a de `/financas`. Serve a
 * paleta Ctrl+K, onde a alternativa era cadastrar cada sub-rota a mao e
 * esquecer a proxima — foi assim que `/arrecadacao/espacos` continuou sendo
 * oferecido ao pastor titular depois de `/arrecadacao` ser fechado.
 *
 * ── O GUARDA DE ROTA JA USA ISTO ────────────────────────────────────────────
 *
 * Ligado em 08/09/2026: o `AppLayout` chamava `ROUTE_ROLES` por caminho exato,
 * e esta nota aqui ainda dizia o contrário — achado relendo o arquivo na
 * auditoria de navegação da mesma semana. `AppLayout` agora chama esta função
 * direto, então o casamento por prefixo vale para as setenta e seis rotas de
 * uma vez, não só para a paleta. O que continua por fazer é o oposto: cobrir
 * as rotas que nem `ROUTE_ROLES` nem esta lista de atalhos alcançam — o
 * Risco 5 do CLAUDE.md mede quantas ainda ficam de fora.
 */
export function papeisExigidosPara(rota: string): AppRole[] | undefined {
  // Sem a query string: `/financas?lancar=true` e a mesma tela de `/financas`.
  const limpa = rota.split("?")[0];
  let melhor: string | undefined;
  for (const caminho of Object.keys(ROUTE_ROLES)) {
    if (limpa !== caminho && !limpa.startsWith(caminho + "/")) continue;
    if (!melhor || caminho.length > melhor.length) melhor = caminho;
  }
  return melhor ? ROUTE_ROLES[melhor] : undefined;
}
