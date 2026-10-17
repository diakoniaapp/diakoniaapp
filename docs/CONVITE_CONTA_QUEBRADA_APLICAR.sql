-- ─── O convite criava a conta QUEBRADA: o Auth respondia 500 em todo login ────────────────────────────────────────────────────────────────────────────
--
-- Relatado por ela (17/10/2026): convite → cria a senha → "sucesso" → tela de login → "Algo deu errado", e a conta não entra de jeito nenhum.
--
-- ── O DEFEITO (medido em produção, 17/10/2026, por SELECT no SQL Editor + sondagem anônima do Auth) ────────────────────────────────────────────────────
-- `aceitar_convite`, quando a pessoa ainda não tem conta, faz INSERT direto em `auth.users` preenchendo só 9 colunas. As colunas de token ficam NULL:
--     confirmation_token · recovery_token · email_change · email_change_token_new
-- (as outras quatro — email_change_token_current, phone_change, phone_change_token, reauthentication_token — têm default '' no banco e saem certas.)
-- O Auth de produção (GoTrue v2.197.0) lê essas colunas como texto simples, sem tratar NULL: ao localizar a conta para o login ele falha com
--     HTTP 500  {"error_code":"unexpected_failure","msg":"Database error querying schema"}
-- e falha ANTES de conferir a senha — com a senha certa ou errada, o resultado é o mesmo. A tela só sabe traduzir 4 mensagens do Auth; esta cai em "Algo deu errado".
--
-- Medido: 2 contas no banco têm NULL nessas colunas, as duas com provider = 'phone' (a marca do INSERT desta função) e as duas NUNCA entraram:
--     5521980005475  criada em 23/08/2026
--     5521979303125  criada em 17/10/2026
-- Toda conta que nasce por convite novo sai assim. Quem já tinha conta (a função só troca a senha) e o fluxo de senha temporária (signUp) não são afetados.
-- O comentário da migration 20260826100000 ("o convite funciona, o login funciona") valia para o ramo UPDATE; para o ramo INSERT estava errado.
--
-- ── A CORREÇÃO ───────────────────────────────────────────────────────────
-- 1. REPARO: as contas que já nasceram assim ganham '' nas colunas de token que estão NULL. Não mexe em senha, papel, metadados nem em quem já está certo. Refazer o convite NÃO
--    consertaria: o ramo UPDATE da função só troca a senha e deixa a linha como está.
-- 2. `aceitar_convite` passa a criar a conta com TODAS as colunas de token já em '' — o que o próprio Auth grava quando cria um usuário.
--
-- O resto da função é idêntico à versão de 20260826170000 (papéis só no primeiro acesso, perfil vinculado à ficha, auto-aceite, convite marcado como usado).
-- Reversível: docs/CONVITE_CONTA_QUEBRADA_ROLLBACK.sql (volta a função; o reparo das duas contas não precisa ser desfeito).

-- ── 1 · Reparo das contas que já nasceram quebradas ─────────────────────────
UPDATE auth.users
   SET confirmation_token         = COALESCE(confirmation_token, ''),
       recovery_token             = COALESCE(recovery_token, ''),
       email_change               = COALESCE(email_change, ''),
       email_change_token_new     = COALESCE(email_change_token_new, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       phone_change               = COALESCE(phone_change, ''),
       phone_change_token         = COALESCE(phone_change_token, ''),
       reauthentication_token     = COALESCE(reauthentication_token, '')
 WHERE confirmation_token IS NULL OR recovery_token IS NULL OR email_change IS NULL OR email_change_token_new IS NULL
    OR email_change_token_current IS NULL OR phone_change IS NULL OR phone_change_token IS NULL OR reauthentication_token IS NULL;

-- ── 2 · aceitar_convite: a conta nasce com os tokens em '' ───────────────────
CREATE OR REPLACE FUNCTION public.aceitar_convite(p_token uuid, p_senha text)
 RETURNS TABLE(ok boolean, erro text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_convite       public.convites_acesso%ROWTYPE;
  v_pessoa        public.membros%ROWTYPE;
  v_email_login   TEXT;
  v_user_id       UUID;
  v_telefone_norm TEXT;
  v_define_papel  BOOLEAN;
BEGIN
  SELECT * INTO v_convite FROM public.convites_acesso ca WHERE ca.token = p_token;
  IF NOT FOUND THEN RETURN QUERY SELECT FALSE,'Convite invalido'::TEXT,NULL::TEXT; RETURN; END IF;
  IF v_convite.used_at IS NOT NULL THEN RETURN QUERY SELECT FALSE,'Convite ja utilizado'::TEXT,NULL::TEXT; RETURN; END IF;
  IF v_convite.expires_at < NOW() THEN RETURN QUERY SELECT FALSE,'Convite expirado'::TEXT,NULL::TEXT; RETURN; END IF;

  SELECT * INTO v_pessoa FROM public.membros m WHERE m.id = v_convite.pessoa_id;
  IF NOT FOUND THEN RETURN QUERY SELECT FALSE,'Pessoa nao encontrada'::TEXT,NULL::TEXT; RETURN; END IF;
  IF v_pessoa.telefone_celular IS NULL OR v_pessoa.telefone_celular = '' THEN
    RETURN QUERY SELECT FALSE,'Pessoa sem telefone'::TEXT,NULL::TEXT; RETURN;
  END IF;

  -- Trocar a senha nao e reatribuir papel. So o primeiro acesso define papel;
  -- num reset, `user_roles` fica como esta. Ver 20260826170000.
  v_define_papel := (v_convite.tipo = 'primeiro_acesso');

  v_telefone_norm := public.normalizar_telefone(v_pessoa.telefone_celular);
  v_email_login   := v_telefone_norm || '@app.diakonia';

  SELECT u.id INTO v_user_id FROM auth.users u WHERE u.email = v_email_login LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users u
       SET encrypted_password = crypt(p_senha, gen_salt('bf')),
           updated_at         = NOW(),
           email_confirmed_at = COALESCE(u.email_confirmed_at, NOW()),
           raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object(
                                   'must_change_password', false,
                                   'pessoa_id', v_pessoa.id,
                                   'nome', v_pessoa.nome_completo
                                 )
     WHERE u.id = v_user_id;
  ELSE
    v_user_id := gen_random_uuid();
    -- As colunas de token vao em '' (e nao ficam NULL): o Auth le todas como texto simples e responde 500 "Database error querying schema" a qualquer login numa linha com NULL
    -- nelas — ver o cabecalho. Sao as mesmas que o proprio Auth grava ao criar um usuario.
    INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
                            confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
    VALUES (v_user_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_email_login,
            crypt(p_senha, gen_salt('bf')),NOW(),
            jsonb_build_object('provider','phone','providers',ARRAY['phone']),
            jsonb_build_object('must_change_password', false, 'pessoa_id', v_pessoa.id, 'nome', v_pessoa.nome_completo),
            NOW(),NOW(),
            '','','','','','','','');
  END IF;

  -- Sincronizar user_roles — SO no primeiro acesso.
  IF v_define_papel THEN
    BEGIN
      DELETE FROM public.user_roles WHERE user_id = v_user_id;
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, v_convite.role);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Auto-aceite LGPD
  BEGIN
    INSERT INTO public.consentimento (auth_user_id, tipo, base_legal, aceito, texto_versao, canal, registrado_por)
    VALUES (v_user_id, 'politica_privacidade', 'consentimento', TRUE, '1.0', 'web_app', v_user_id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Perfil vinculado a ficha.
  --
  -- No reset, `role` e preservado: o CASE mantem o valor que ja esta la em
  -- vez de sobrescrever com o do token.
  BEGIN
    INSERT INTO public.profiles AS p (id,pessoa_id,nome,telefone,role,created_at,updated_at)
    VALUES (v_user_id, v_pessoa.id, v_pessoa.nome_completo, v_telefone_norm,
            CASE WHEN v_define_papel THEN v_convite.role ELSE NULL END, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
       SET pessoa_id  = EXCLUDED.pessoa_id,
           nome       = EXCLUDED.nome,
           telefone   = EXCLUDED.telefone,
           role       = CASE WHEN v_define_papel THEN EXCLUDED.role ELSE p.role END,
           updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'aceitar_convite: falha ao gravar profiles do usuario % — %', v_user_id, SQLERRM;
  END;

  -- `membros.perfil_acesso` — tambem so no primeiro acesso.
  IF v_define_papel THEN
    BEGIN
      UPDATE public.membros m SET perfil_acesso = v_convite.role::perfil_acesso, updated_at = NOW()
       WHERE m.id = v_pessoa.id;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  UPDATE public.convites_acesso ca SET used_at = NOW() WHERE ca.token = p_token;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_email_login;
END;
$function$;

-- Os grants da versao anterior se mantem (CREATE OR REPLACE preserva o ACL); reafirmados aqui:
GRANT EXECUTE ON FUNCTION public.aceitar_convite(uuid, text) TO anon, authenticated;
