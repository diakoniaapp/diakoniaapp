-- Volta `aceitar_convite` a versao de 20260826170000 (a que cria a conta com colunas de token NULL — NAO recomendado). O reparo das contas ja consertadas nao precisa ser desfeito.
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
  -- num reset, `user_roles` fica como esta. Ver cabecalho, defeito 2.
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
    INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES (v_user_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_email_login,
            crypt(p_senha, gen_salt('bf')),NOW(),
            jsonb_build_object('provider','phone','providers',ARRAY['phone']),
            jsonb_build_object('must_change_password', false, 'pessoa_id', v_pessoa.id, 'nome', v_pessoa.nome_completo),
            NOW(),NOW());
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
  -- A coluna e `nome`, nao `nome_completo` — ver 20260826100000.
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

GRANT EXECUTE ON FUNCTION public.aceitar_convite(uuid, text) TO anon, authenticated;
