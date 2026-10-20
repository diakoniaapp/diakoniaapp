-- ─── "Novo acesso" passa a criar a conta NO BANCO — para o cadastro público do Auth poder ser fechado ───────────────────────────────────────────────────────────────
--
-- ── O RISCO (medido em 20/10/2026) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O Auth de produção está com `disable_signup = false` e `mailer_autoconfirm = true` (GET /auth/v1/settings, sem login): QUALQUER pessoa que conheça a URL pública do projeto e a chave anônima
-- (as duas vão no pacote do navegador) cria uma conta e entra na hora, sem convite e sem e-mail confirmado. O gatilho `handle_new_user` dá papel `membro` a toda conta nova, e a partir daí
-- vale tudo o que o banco concede a "qualquer usuário autenticado". Hoje nenhum estranho se cadastrou (27 perfis, todos @app.diakonia e todos ligados a uma ficha), mas nada impede.
--
-- ── POR QUE NÃO BASTA DESLIGAR ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- O botão "Novo acesso" (Usuários › NovoAcessoDialog › criarAcessoPessoa) cria a conta pelo MESMO endpoint público (`auth.signUp`, com um cliente isolado). Desligar o cadastro público sem tirar
-- esse caminho quebraria a criação de acessos pelo administrador ("Signups not allowed for this instance").
--
-- ── A CORREÇÃO ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- `admin_criar_acesso(pessoa, papel, senha)`: só `is_admin()` executa, cria a conta com o mesmo INSERT que o `aceitar_convite` já usa (provado em produção: a conta 17/10, criada assim e reparada,
-- entrou em 17/10), com tokens '' (ver 20261017100000), papel em `user_roles`, perfil ligado à ficha com `primeiro_acesso = true` e `must_change_password = true` (a pessoa troca a senha no 1º login e
-- aceita a LGPD — diferente do convite, aqui quem escolhe a senha é o administrador, então NÃO há auto-aceite).
-- Alternativa descartada: Auth Hook "before user created" (manteria o signUp aberto só para telefones pré-autorizados) — exige configurar o hook no painel, ficaria dependente de duas peças e continuaria
-- aceitando o endpoint público; função no banco é uma peça só e o endpoint público pode ser fechado de vez.
--
-- ORDEM DE USO (importa): 1) aplicar esta migration; 2) publicar o código (criarAcessoPessoa passa a chamar esta função); 3) SÓ ENTÃO desligar "Allow new users to sign up" no painel do Supabase.
-- Reversível: docs/ADMIN_CRIAR_ACESSO_ROLLBACK.sql (apaga a função; as contas já criadas não mudam).

CREATE OR REPLACE FUNCTION public.admin_criar_acesso(p_pessoa_id uuid, p_role text, p_senha text)
 RETURNS TABLE(ok boolean, erro text, telefone text, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_pessoa        public.membros%ROWTYPE;
  v_role          public.app_role;
  v_tel           TEXT;
  v_email_login   TEXT;
  v_user_id       UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN QUERY SELECT FALSE, 'Apenas o administrador cria acessos'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;

  IF p_senha IS NULL OR length(p_senha) < 8 THEN
    RETURN QUERY SELECT FALSE, 'A senha temporária precisa ter ao menos 8 caracteres'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;

  BEGIN
    v_role := p_role::public.app_role;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN QUERY SELECT FALSE, 'Perfil inválido'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END;

  SELECT * INTO v_pessoa FROM public.membros m WHERE m.id = p_pessoa_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Pessoa não encontrada'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;

  v_tel := public.normalizar_telefone(v_pessoa.telefone_celular);
  IF v_tel IS NULL OR v_tel = '' THEN
    RETURN QUERY SELECT FALSE, 'Esta pessoa não tem telefone celular cadastrado'::TEXT, NULL::TEXT, NULL::UUID; RETURN;
  END IF;

  v_email_login := v_tel || '@app.diakonia';
  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.email = v_email_login) THEN
    RETURN QUERY SELECT FALSE, 'Este telefone já possui acesso ao sistema. Use "Reenviar acesso" se necessário.'::TEXT, v_tel, NULL::UUID; RETURN;
  END IF;

  v_user_id := gen_random_uuid();
  -- Mesmo INSERT do `aceitar_convite` (20261017100000): todas as colunas de token já em '' — o Auth responde 500 a qualquer login numa linha com NULL nelas.
  INSERT INTO auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
                          confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
  VALUES (v_user_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',v_email_login,
          crypt(p_senha, gen_salt('bf')),NOW(),
          jsonb_build_object('provider','phone','providers',ARRAY['phone']),
          jsonb_build_object('must_change_password', true, 'pessoa_id', v_pessoa.id, 'nome', v_pessoa.nome_completo),
          NOW(),NOW(),
          '','','','','','','','');

  -- O gatilho `handle_new_user` já pôs o papel mais fraco (ou `admin`, se for a primeira conta do banco); aqui vale o escolhido.
  DELETE FROM public.user_roles ur WHERE ur.user_id = v_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, v_role);

  INSERT INTO public.profiles AS p (id, pessoa_id, nome, telefone, role, primeiro_acesso, created_at, updated_at)
  VALUES (v_user_id, v_pessoa.id, v_pessoa.nome_completo, v_tel, v_role, TRUE, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
     SET pessoa_id = EXCLUDED.pessoa_id, nome = EXCLUDED.nome, telefone = EXCLUDED.telefone, role = EXCLUDED.role,
         primeiro_acesso = TRUE, updated_at = NOW();

  BEGIN
    UPDATE public.membros m SET perfil_acesso = v_role::text::public.perfil_acesso, updated_at = NOW() WHERE m.id = v_pessoa.id;
  EXCEPTION WHEN OTHERS THEN NULL; END;   -- o perfil de acesso da ficha é espelho; a conta já está certa

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_tel, v_user_id;
END;
$function$;

-- SECURITY DEFINER em auth.users: nunca para anônimo. (O PUBLIC recebe EXECUTE por padrão no Postgres.)
REVOKE ALL ON FUNCTION public.admin_criar_acesso(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_criar_acesso(uuid, text, text) TO authenticated;
