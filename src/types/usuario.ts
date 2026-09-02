// ─── Tipos compartilhados — Módulo de Usuários ───────────────────────────────

export interface Usuario {
  id:              string;
  nome:            string | null;
  telefone:        string | null;
  role:            string | null;
  primeiro_acesso: boolean | null;
}

// RoleOption = enum app_role do Supabase.
//
// ── SOBRE `diakonia` — corrigido em 26/08/2026 ───────────────────────────────
//
// O comentario anterior dizia que `diakonia` era legado "ja migrado para
// pastor", e citava sql/migrations/diakonia_para_pastor.sql. **Esse arquivo
// nunca existiu, e a migracao nunca aconteceu.**
//
// A ordem real e o contrario do que se supunha: `diakonia` estava no enum
// desde a primeira migration (20260429013015) e `pastor` foi acrescentado
// depois. `diakonia` e o papel mais antigo — e o mais completo.
//
// Medido no banco em 26/08/2026, com usuarios reais em ambiente local:
//
//   `pastor` sozinho NAO enxerga familias, vinculos familiares, visitas,
//   historico de membresia, acompanhamento de visitante, locais nem membros
//   de ministerio. `diakonia` enxerga tudo isso.
//
//   62 combinacoes tabela+operacao para `diakonia`, 34 para `pastor`.
//   `pastor` nao acrescenta nada que `diakonia` ja nao tenha.
//
// Por isso `diakonia` voltou a ser oferecido em 26/08/2026, com o rotulo que
// descrevia o que ele era na pratica: **Pastor titular**.
//
// ── E POR QUE ELE SAIU DAQUI EM 02/09/2026 ─────────────────────────────────
//
// Tudo acima continua sendo verdade sobre o ALCANCE de `diakonia` — ele
// enxergava mesmo o dobro de `pastor`. O que estava errado era outra coisa,
// e a igreja a nomeou: **`diakonia` e o nome do FORNECEDOR**, e ele estava
// vestindo um cargo de igreja.
//
// A separacao ficou assim:
//
//   diakonia    dono do sistema, que o constroi. Ve tudo e todos, em
//               qualquer igreja. NAO e um perfil que uma igreja concede —
//               por isso saiu desta lista de opcoes de convite.
//   admin       pessoa da igreja que configura o sistema do zero
//   pastor      o pastor titular, que em 20260902190000 recebeu o rebanho
//               inteiro que faltava: familias, vinculos, historico, visitas
//               e acompanhamento de visitante
//
// `tesouraria` entra na lista porque nasceu em 20260902150000: quem opera o
// dinheiro da igreja, que o admin apenas configura.
export type RoleOption =
  | "admin"
  | "secretaria"
  | "tesouraria"
  | "pastor"
  | "lideranca"
  | "voluntario"
  | "membro";

// `diakonia` e `pastor` sao papeis distintos com alcances distintos — nao
// rotule os dois igual, ou quem escolhe no menu nao tem como diferenciar.
export const ROLE_LABEL: Record<string, string> = {
  // ── 02/09/2026: TRÊS COISAS QUE ESTAVAM EMBOLADAS ────────────────────────
  //
  // A igreja separou o que o sistema misturava:
  //
  //   diakonia   dono do sistema, que o CONSTRÓI. Vê tudo e todos, em
  //              qualquer igreja. Não é cargo de igreja nenhuma — e era ele
  //              que, até esta data, vestia o cargo de pastor titular.
  //   admin      pessoa da igreja que CONFIGURA o sistema do zero. "do
  //              sistema" está no rótulo de propósito: sem isso, confunde-se
  //              com o Ministério de Administração, que é outra coisa.
  //   pastor     o pastor titular.
  admin:      "Administrador do sistema",
  secretaria: "Secretaria",
  diakonia:   "Diakonia — dono do sistema",
  pastor:     "Pastor titular",
  tesouraria: "Tesouraria",
  lideranca:  "Liderança",
  voluntario: "Voluntário",
  // O padrão de fábrica desde 20260901250000: toda conta nova nasce assim.
  // Sem esta linha, a conta recém-criada aparece sem rótulo de perfil.
  membro:     "Membro",
};

export const ROLE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin:      "default",
  diakonia:   "default",     // dono do sistema — o mesmo destaque do admin
  secretaria: "secondary",
  tesouraria: "secondary",
  pastor:     "secondary",
  lideranca:  "outline",
  voluntario: "outline",
  membro:     "outline",
};

export interface NovoUsuarioDados {
  nome:     string;
  telefone: string;
  role:     RoleOption;
}

export interface UserServiceResult {
  ok:    boolean;
  erro?: string;
  senha?: string;
  tel?:   string;
}
