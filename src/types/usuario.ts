// ─── Tipos compartilhados — Módulo de Usuários ───────────────────────────────

export interface Usuario {
  id:              string;
  nome:            string | null;
  telefone:        string | null;
  role:            string | null;
  primeiro_acesso: boolean | null;
}

export type RoleOption =
  | "admin" | "secretaria" | "diakonia" | "lideranca"
  | "membro" | "voluntario" | "congregado";

export const ROLE_LABEL: Record<string, string> = {
  admin:      "Administrador",
  secretaria: "Secretaria",
  diakonia:   "Pastor",
  lideranca:  "Liderança",
  membro:     "Membro",
  voluntario: "Voluntário",
  congregado: "Congregado",
};

export const ROLE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin:      "default",
  secretaria: "secondary",
  diakonia:   "outline",
  lideranca:  "outline",
  membro:     "outline",
  voluntario: "outline",
  congregado: "outline",
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
