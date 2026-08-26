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
// Por isso `diakonia` volta a ser oferecido, com o rotulo que descreve o que
// ele e na pratica: **Pastor titular**.
export type RoleOption =
  | "admin"
  | "secretaria"
  | "diakonia"
  | "pastor"
  | "lideranca"
  | "voluntario";

// `diakonia` e `pastor` sao papeis distintos com alcances distintos — nao
// rotule os dois igual, ou quem escolhe no menu nao tem como diferenciar.
export const ROLE_LABEL: Record<string, string> = {
  admin:      "Administrador",
  secretaria: "Secretaria",
  diakonia:   "Pastor titular",   // alcance completo — ver comentario acima
  pastor:     "Pastor",           // alcance reduzido: sem familias nem acolhimento
  lideranca:  "Liderança",
  voluntario: "Voluntário",
};

export const ROLE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin:      "default",
  secretaria: "secondary",
  diakonia:   "secondary",   // alcance amplo — destaca como a secretaria
  pastor:     "outline",
  lideranca:  "outline",
  voluntario: "outline",
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
