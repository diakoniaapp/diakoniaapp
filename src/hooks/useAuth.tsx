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
  /**
   * A ficha em `membros` de quem está logado — o elo `profiles.pessoa_id`.
   *
   * `user.id` diz qual CONTA entrou; este diz qual PESSOA ela é. São duas
   * coisas, e confundi-las já custou caro neste banco: duas políticas de
   * `membros` — `membro_ve_proprio` e `membro_edita_proprio` — comparavam
   * `membros.id` com `auth.uid()`. Medido em 01/09/2026: das 297 fichas,
   * ZERO têm o id de uma conta. As duas nunca liberaram uma linha.
   *
   * Antes disto, três telas descobriam o elo por conta própria — `AppLayout`,
   * `MobileBottomNav` e `arrecadacao/Caixa` —, cada uma com a sua consulta a
   * `profiles`. Agora quem precisa pergunta aqui.
   *
   * `null` quer dizer duas coisas, e `pessoaCarregada` separa: ainda não
   * respondeu, ou esta conta não tem ficha ligada — o que acontece quando o
   * acesso é criado antes de a pessoa existir no cadastro.
   */
  pessoaId: string | null;
  /** Se a consulta do elo já respondeu. Ver a nota em `pessoaId`. */
  pessoaCarregada: boolean;
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
  const [pessoaId, setPessoaId] = useState<string | null>(null);
  const [pessoaCarregada, setPessoaCarregada] = useState(false);
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

  /**
   * O elo conta → ficha.
   *
   * Consulta própria, e não `select("role, pessoa_id")` junto da de papéis:
   * são tabelas diferentes (`user_roles` e `profiles`) e falhas diferentes.
   * Quem não tem ficha ligada continua com os papéis dele — perder o acesso
   * inteiro porque o cadastro está incompleto seria o pior dos dois mundos.
   */
  const fetchPessoa = async (uid: string) => {
    try {
      const { data } = await supabase
        .from("profiles").select("pessoa_id").eq("id", uid).maybeSingle();
      setPessoaId(data?.pessoa_id ?? null);
    } finally {
      setPessoaCarregada(true);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setRolesCarregados(false);   // trocou de usuário: o que havia não vale
        setPessoaCarregada(false);   // e a ficha do anterior menos ainda
        setTimeout(() => { fetchRoles(sess.user.id); fetchPessoa(sess.user.id); }, 0);
      } else {
        setRoles([]);
        setRolesCarregados(true);    // sem usuário, "nenhum papel" é resposta
        setPessoaId(null);
        setPessoaCarregada(true);
      }
    });
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Só `loading` espera os papéis: é ele que segura a navegação. A ficha
        // é assunto de tela, e uma tela pode desenhar o esqueleto enquanto ela
        // não chega — prender o app inteiro por causa dela atrasaria todo mundo.
        fetchPessoa(sess.user.id);
        fetchRoles(sess.user.id).finally(() => setLoading(false));
      } else {
        setRolesCarregados(true); setPessoaCarregada(true); setLoading(false);
      }
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
   * O pastor titular entra aqui e não lá: ele cuida de pessoas, não administra
   * espaço nem escala.
   *
   * ── A LIDERANÇA SAIU EM 26/08/2026 ──────────────────────────────────────
   *
   * Ela havia entrado seis dias antes, e o motivo estava escrito na migration
   * `20260820140000`: quatro dos SEIS usuários de então eram `lideranca` e não
   * conseguiam corrigir um telefone. Hoje são três usuários e só um é
   * liderança — a premissa acabou, e a decisão que ela sustentava também.
   *
   * ── OS TRÊS LUGARES PRECISAM MUDAR JUNTOS ───────────────────────────────
   *
   * "Quem edita pessoa" morava em três sítios com três respostas: a política
   * `staff_update_membros` (5 papéis), a permissão `editar_pessoa` (2) e esta
   * linha (3). Quem lê a tela de permissões via a mais restritiva das três e
   * concluía que liderança não editava — enquanto o banco deixava.
   *
   * Agora os três dizem admin, secretaria, diakonia e pastor. Mexer em um sem
   * os outros recria o defeito, e o `COMMENT` da política no banco repete
   * este aviso para quem chegar por lá.
   */
  const podeEditarPessoas = hasRole(["admin", "secretaria", "diakonia", "pastor"]);

  return (
    <AuthContext.Provider value={{ user, session, roles, rolesCarregados, pessoaId, pessoaCarregada, loading, signOut, hasRole, canEdit, podeEditarPessoas }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}