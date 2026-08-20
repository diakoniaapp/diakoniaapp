-- ─── O painel de acessos passa a dizer a verdade, e o admin pode revogar ────
--
-- A tela `/usuarios` mostrava três coisas falsas ao mesmo tempo.
--
-- ── 1. O PERFIL ERRADO ─────────────────────────────────────────────────────
--
-- `acessoService` lia `profiles.role`. O sistema inteiro — `useAuth`,
-- `minhas_permissoes()`, `tem_permissao()` — lê `user_roles`. As duas tabelas
-- discordam:
--
--   Adriana ... profiles.role NULO, user_roles = lideranca
--   Daniel .... profiles.role NULO, user_roles = lideranca
--   Lourdes ... profiles.role NULO, user_roles = lideranca
--   Telma ..... profiles.role admin, user_roles = lideranca
--
-- E o código fazia `data.role ?? "voluntario"`, então NULO virava "Voluntário"
-- na tela. Três líderes apareciam como voluntários — e a 2ª Secretária
-- Estatutária era um deles.
--
-- ── 2. O STATUS ERRADO ─────────────────────────────────────────────────────
--
-- A tela dizia "Aguardando 1º acesso" para os seis, e "0 Ativo". Ela lia
-- `profiles.primeiro_acesso`, que é `true` para todos — e ninguém nunca
-- limpa essa marca. Mas os seis JÁ ENTRARAM: `auth.users.last_sign_in_at`
-- está preenchido para todos, e o da Lourdes é de hoje.
--
-- Quem entrou é fato do `auth`, não uma marca que alguém precisa lembrar de
-- apagar. A função devolve `ultimo_acesso` e a tela deduz dali.
--
-- ── 3. O NOME SUMIDO ───────────────────────────────────────────────────────
--
-- Três linhas mostravam "— sem vínculo com pessoa". `pessoa_id` é nulo mesmo
-- nesses três, mas `profiles.nome` tem o nome. Faltar o vínculo com a ficha é
-- uma pendência a resolver; não é motivo para a tela não saber de quem fala.

-- ── A LISTA ────────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER porque `auth.users` não é legível pelo PostgREST. A guarda
-- de admin é a primeira linha do corpo, e não uma política: sem ela, definer
-- vira porta aberta.
CREATE OR REPLACE FUNCTION public.painel_de_acessos()
RETURNS TABLE(
  user_id         uuid,
  nome            text,
  login           text,
  telefone        text,
  pessoa_id       uuid,
  papeis          text[],
  ultimo_acesso   timestamptz,
  criado_em       timestamptz,
  bloqueado       boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas a administração pode ver o painel de acessos.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    -- A ficha da pessoa manda quando existe: é o nome que a igreja usa. O do
    -- profile é o que o usuário digitou ao criar a conta.
    COALESCE(NULLIF(btrim(m.nome_completo), ''), NULLIF(btrim(p.nome), ''), 'Sem nome')::text,
    COALESCE(au.email, p.email, '')::text,
    COALESCE(p.telefone, m.telefone_celular, '')::text,
    p.pessoa_id,
    COALESCE(
      (SELECT array_agg(ur.role::text ORDER BY ur.role::text)
         FROM public.user_roles ur WHERE ur.user_id = p.id),
      ARRAY[]::text[]
    ),
    au.last_sign_in_at,
    au.created_at,
    (au.banned_until IS NOT NULL AND au.banned_until > now())
  FROM public.profiles p
  LEFT JOIN public.membros m ON m.id = p.pessoa_id
  LEFT JOIN auth.users   au ON au.id = p.id
  ORDER BY 2;
END;
$$;

COMMENT ON FUNCTION public.painel_de_acessos() IS
  'Lista de acessos para /usuarios. Le user_roles (nao profiles.role, que esta nulo em 3 de 6) e auth.users.last_sign_in_at (nao primeiro_acesso, que ninguem limpa).';

-- ── REVOGAR UM ACESSO ──────────────────────────────────────────────────────
--
-- "Excluir" aqui quer dizer: esta pessoa nao entra mais. Nao quer dizer apagar
-- o que ela fez.
--
-- Trinta e seis tabelas apontam para `auth.users`, e boa parte SEM `ON DELETE`
-- — ou seja, RESTRICT. Um DELETE em quem ja registrou um contato ou cadastrou
-- alguem seria recusado pelo banco. Medido hoje: cinco dos seis usuarios tem
-- zero referencias e sairiam limpos; a Telma Souza tem 121 linhas de historico
-- e nao sairia.
--
-- Entao a funcao faz o que da para fazer sempre, e o resto quando da:
--
--   1. apaga os papeis  — revoga TUDO na hora, porque `useAuth`, as politicas
--                         de RLS e `minhas_permissoes()` todas leem dali;
--   2. bloqueia o login — `banned_until` no infinito, para nao bastar ter
--                         papel nenhum e ainda assim conseguir entrar e ler;
--   3. tenta apagar     — se nenhuma chave estrangeira segurar, a conta some
--                         de vez; se segurar, ela fica bloqueada e o historico
--                         permanece de pe, com autor.
--
-- Devolve em portugues o que aconteceu, porque as duas saidas sao diferentes e
-- a tela precisa poder contar a diferenca.
CREATE OR REPLACE FUNCTION public.revogar_acesso(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_nome     text;
  v_era_admin boolean;
  v_admins   int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas a administração pode remover acessos.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode remover o próprio acesso.';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.nome), ''), 'esta conta') INTO v_nome
    FROM public.profiles p WHERE p.id = p_user_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Acesso não encontrado.';
  END IF;

  -- Sem esta guarda, remover o penultimo admin deixaria a igreja com um so, e
  -- remover o ultimo trancaria todo mundo do lado de fora sem volta pela tela.
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')
    INTO v_era_admin;
  IF v_era_admin THEN
    SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
    IF v_admins <= 1 THEN
      RAISE EXCEPTION 'Este é o único administrador. Promova outra pessoa antes de remover este acesso.';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;

  UPDATE auth.users SET banned_until = 'infinity'::timestamptz WHERE id = p_user_id;

  BEGIN
    DELETE FROM auth.users WHERE id = p_user_id;
    RETURN 'O acesso de ' || v_nome || ' foi removido por completo.';
  EXCEPTION WHEN foreign_key_violation THEN
    RETURN 'O acesso de ' || v_nome || ' foi bloqueado e as permissões, removidas. ' ||
           'A conta permanece no sistema porque há registros feitos por ela — apagá-la ' ||
           'deixaria esse histórico sem autor.';
  END;
END;
$$;

COMMENT ON FUNCTION public.revogar_acesso(uuid) IS
  'Remove papeis e bloqueia o login. Tenta apagar a conta; se houver chave estrangeira segurando, mantem a conta bloqueada para nao deixar historico sem autor. Guardas: so admin, nunca a propria conta, nunca o ultimo admin.';

REVOKE ALL ON FUNCTION public.painel_de_acessos() FROM public, anon;
REVOKE ALL ON FUNCTION public.revogar_acesso(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.painel_de_acessos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_acesso(uuid) TO authenticated;
