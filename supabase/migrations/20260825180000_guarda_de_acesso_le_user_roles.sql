-- ─── A guarda das funções de acesso lia a coluna errada ─────────────────────
--
-- ── O DEFEITO ────────────────────────────────────────────────────────────────
--
-- Três funções `SECURITY DEFINER` decidiam quem pode agir lendo `profiles.role`:
--
--   SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
--   IF caller_role NOT IN ('admin','secretaria') THEN RAISE EXCEPTION ...
--
-- `profiles.role` é a coluna legada. A fonte da verdade do papel é
-- `user_roles`, e as duas divergem. Medido em produção em 25/08/2026, com os
-- três usuários que existem:
--
--   pessoa                            profiles.role   user_roles    cria convite?
--   Telma Souza                       admin           admin         sim
--   Lourdes Beatriz Rodrigues Ramos   (NULO)          secretaria    NÃO
--   Bruno Sepulvida do Amaral         membro          lideranca     NÃO
--
-- A secretaria da igreja **não conseguia criar convite de acesso**, e recebia
-- justamente a mensagem "Apenas admin e secretaria podem criar convites."
--
-- Confirmado na tela, em ambiente local, entrando como um usuário com
-- `secretaria` em `user_roles` e `profiles.role` nulo: a mensagem aparece.
--
-- Provável consequência já visível nos dados: há **25 convites emitidos para
-- 10 pessoas** — várias com 6 convites cada. Se só a administradora consegue
-- emitir, cada tentativa da secretaria virava um pedido a ela.
--
-- ── A CORREÇÃO ───────────────────────────────────────────────────────────────
--
-- Trocar a leitura da coluna por `has_any_role(auth.uid(), ARRAY[...])`, que é
-- a função que o resto do banco já usa — ela lê `user_roles`, é `SECURITY
-- DEFINER` e tem `search_path` fixo.
--
-- Nada além da guarda muda. O corpo de cada função é o mesmo.
--
-- ── ALTERNATIVA DESCARTADA ───────────────────────────────────────────────────
--
-- Preencher `profiles.role` a partir de `user_roles` resolveria hoje e
-- quebraria de novo no próximo papel alterado — porque nada mantém as duas em
-- sincronia. Além disso, o CLAUDE.md (Risco 9) já registra a decisão de parar
-- de escrever nessa coluna e removê-la; preenchê-la seria andar para trás.
--
-- ── O QUE ESTA MIGRATION NÃO FAZ ─────────────────────────────────────────────
--
-- Não remove `profiles.role`. Há uma quarta função, `solicitar_reset_senha`,
-- que também a lê — mas para outro fim: descobre o papel da **pessoa alvo**,
-- não do chamador, e cai em 'voluntario' por padrão. Não é guarda de acesso e
-- fica fora deste conserto, para não misturar dois assuntos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · criar_convite_acesso ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.criar_convite_acesso(p_pessoa_id uuid, p_role app_role)
 RETURNS TABLE(token uuid, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_token     UUID;
  v_expires   TIMESTAMPTZ;
BEGIN
  -- Le `user_roles`, nao `profiles.role` — ver cabecalho da migration.
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]) THEN
    RAISE EXCEPTION 'Apenas admin e secretaria podem criar convites.';
  END IF;

  -- Invalida convites anteriores não usados desta pessoa
  UPDATE convites_acesso
     SET used_at = now()
   WHERE pessoa_id = p_pessoa_id
     AND tipo = 'primeiro_acesso'
     AND used_at IS NULL;

  v_expires := now() + INTERVAL '7 days';

  INSERT INTO convites_acesso (tipo, pessoa_id, role, expires_at, created_by)
  VALUES ('primeiro_acesso', p_pessoa_id, p_role, v_expires, auth.uid())
  RETURNING convites_acesso.token INTO v_token;

  RETURN QUERY SELECT v_token, v_expires;
END;
$function$;

-- ── 2 · get_user_email ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_email(target_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  user_email TEXT;
BEGIN
  -- Le `user_roles`, nao `profiles.role` — ver cabecalho da migration.
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]) THEN
    RAISE EXCEPTION 'Permissao negada.';
  END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = target_user_id;
  RETURN user_email;
END;
$function$;

-- ── 3 · reset_user_password ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reset_user_password(target_user_id uuid, new_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
BEGIN
  -- Le `user_roles`, nao `profiles.role` — ver cabecalho da migration.
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]) THEN
    RAISE EXCEPTION 'Permissao negada: apenas admin e secretaria podem resetar senhas.';
  END IF;
  UPDATE auth.users
     SET encrypted_password = crypt(new_password, gen_salt('bf')),
         raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb,
         updated_at = now()
   WHERE id = target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario nao encontrado: %', target_user_id;
  END IF;
END;
$function$;

-- ── Concessoes ──────────────────────────────────────────────────────────────
-- CREATE OR REPLACE preserva o ACL existente, mas o Postgres concede EXECUTE a
-- PUBLIC em funcao NOVA. Estas tres ja existem, entao o ACL se mantem; as
-- linhas abaixo apenas tornam explicito o estado esperado.
REVOKE ALL ON FUNCTION public.criar_convite_acesso(uuid, app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_user_password(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_convite_acesso(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_password(uuid, text)      TO authenticated;
