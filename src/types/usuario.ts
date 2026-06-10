// ─── Tipos compartilhados — Módulo de Usuários ───────────────────────────────

export interface Usuario {
  id:              string;
  nome:            string | null;
  telefone:        string | null;
  role:            string | null;
  primeiro_acesso: boolean | null;
}

// RoleOption = enum app_role do Supabase.
// FASE C: migration adiciona "voluntario" e "pastor".
// "diakonia" é legado (mesma semântica de "pastor"); mantemos no tipo para
// compatibilidade com registros antigos. UI nova só oferece "pastor".
export type RoleOption =
  | "admin"
  | "secretaria"
  | "pastor"
  | "lideranca"
  | "voluntario";

// Mapa renderiza "diakonia" como Pastor para registros legados, mas UI nova
// nao oferece a opcao. Migracao SQL (sql/migrations/diakonia_para_pastor.sql)
// converte os registros existentes.
export const ROLE_LABEL: Record<string, string> = {
  admin:      "Administrador",
  secretaria: "Secretaria",
  pastor:     "Pastor",
  diakonia:   "Pastor",     // legado, somente leitura
  lideranca:  "Liderança",
  voluntario: "Voluntário",
};

export const ROLE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  admin:      "default",
  secretaria: "secondary",
  pastor:     "outline",
  diakonia:   "outline",
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
