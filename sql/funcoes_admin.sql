-- ============================================================
-- DiakoniaApp — Funções Admin para Gestão de Usuários
-- Execute no Supabase Dashboard → SQL Editor
-- Só precisa rodar UMA VEZ.
-- ============================================================

-- ── 1. Resetar senha de um usuário ───────────────────────────────────────────
-- Apenas admin e secretaria podem chamar esta função.
-- Roda como "postgres" (SECURITY DEFINER), acessa auth.users diretamente.

CREATE OR REPLACE FUNCTION reset_user_password(
  target_user_id UUID,
  new_password   TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Verificar permissão do usuário logado
  SELECT role INTO caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Permissão negada: apenas admin e secretaria podem resetar senhas.';
  END IF;

  -- Atualizar senha e forçar troca no próximo login
  UPDATE auth.users
  SET
    encrypted_password = crypt(new_password, gen_salt('bf')),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
                         || '{"must_change_password": true}'::jsonb,
    updated_at = now()
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado: %', target_user_id;
  END IF;
END;
$$;


-- ── 2. Buscar email de um usuário (para recuperar telefone) ──────────────────

CREATE OR REPLACE FUNCTION get_user_email(target_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role TEXT;
  user_email  TEXT;
BEGIN
  SELECT role INTO caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF caller_role NOT IN ('admin', 'secretaria') THEN
    RAISE EXCEPTION 'Permissão negada.';
  END IF;

  SELECT email INTO user_email
  FROM auth.users
  WHERE id = target_user_id;

  RETURN user_email;
END;
$$;


-- ── 3. Permissões: usuários autenticados podem chamar as funções ──────────────

GRANT EXECUTE ON FUNCTION reset_user_password TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_email      TO authenticated;


-- ── VERIFICAÇÃO: deve retornar as duas funções ────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN ('reset_user_password', 'get_user_email')
  AND routine_schema = 'public';
