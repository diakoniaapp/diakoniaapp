import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// AppRole reflete o enum app_role do Supabase.
// FASE C: migration adiciona "voluntario" e "pastor".
export type AppRole =
  | "admin"
  | "secretaria"
  | "pastor"
  // "diakonia" NAO e legado. Corrigido em 26/08/2026: a migracao para "pastor"
  // nunca aconteceu, e ele e o papel mais antigo E mais completo dos dois —
  // 62 combinacoes tabela+operacao contra 34. A UI o chama de "Pastor titular".
  // Ver o comentario longo em types/usuario.ts.
  | "diakonia"
  | "lideranca"
  | "voluntario";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  /** Se a consulta de papéis já respondeu — ver a nota em `fetchRoles`. */
  rolesCarregados: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (r: AppRole | AppRole[]) => boolean;
  canEdit: boolean;
  /** Ficha de pessoa e contatos. Ver a nota em `podeEditarPessoas`. */
  podeEditarPessoas: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Se a consulta de papéis já respondeu.
   *
   * `roles` vazio quer dizer DUAS coisas — "ainda não carregou" e "esta pessoa
   * não tem papel nenhum" — e quem precisa decidir pelo papel não pode
   * confundir as duas. `loading` não serve para isso: ele só é desligado pelo
   * `getSession()` da montagem. Num login NOVO quem dispara é o
   * `onAuthStateChange`, que chama `fetchRoles` num `setTimeout` e não toca em
   * `loading` — então `loading` já é `false` enquanto `roles` ainda é `[]`.
   *
   * Sem esta bandeira, mandar a secretária para o painel dela no login daria
   * certo de vez em quando: na corrida entre a navegação e a consulta, o
   * comum é a navegação ganhar e todo mundo cair na Home.
   */
  const [rolesCarregados, setRolesCarregados] = useState(false);

  const fetchRoles = async (uid: string) => {
    // `finally` porque agora há quem ESPERE por esta bandeira. A tela de login
    // só navega depois dela; se uma falha de rede deixasse a consulta sem
    // resolver, a pessoa ficaria presa no login com a senha certa e sem
    // mensagem nenhuma. Falhar aqui vira "nenhum papel" — a pessoa entra pela
    // Home, que é o destino de quem não tem bancada, e não fica de fora.
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      setRoles((data ?? []).map((r) => r.role as AppRole));
    } finally {
      setRolesCarregados(true);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setRolesCarregados(false);   // trocou de usuário: o que havia não vale
        setTimeout(() => fetchRoles(sess.user.id), 0);
      } else {
        setRoles([]);
        setRolesCarregados(true);    // sem usuário, "nenhum papel" é resposta
      }
    });
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) fetchRoles(sess.user.id).finally(() => setLoading(false));
      else { setRolesCarregados(true); setLoading(false); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (r: AppRole | AppRole[]) => {
    const arr = Array.isArray(r) ? r : [r];
    return roles.some((role) => arr.includes(role));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const canEdit = hasRole(["admin", "secretaria"]);

  /**
   * Quem mexe na ficha de uma pessoa: nome, telefone, tipo de vínculo,
   * cadastro de quem chegou.
   *
   * Separado de `canEdit` de propósito. `canEdit` é o portão geral — agenda,
   * locais, ministérios, áreas, famílias — e continua sendo admin+secretaria.
   * Pessoas e contatos foram abertos à liderança em 20/08/2026 (migration
   * 20260820140000), e usar o portão geral para isso abriria junto meia
   * dúzia de telas que ninguém pediu.
   *
   * Os papéis aqui espelham a política `staff_update_membros` do banco. Se
   * um dia divergirem, é a política que manda: a tela ofereceria um botão
   * que o banco recusa, e era exatamente esse o defeito que isto conserta.
   * Apagar pessoa NÃO entra — continua só de admin, no banco e aqui.
   */
  const podeEditarPessoas = hasRole(["admin", "secretaria", "lideranca"]);

  return (
    <AuthContext.Provider value={{ user, session, roles, rolesCarregados, loading, signOut, hasRole, canEdit, podeEditarPessoas }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}