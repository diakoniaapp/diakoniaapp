-- ─── O aceite de convite nunca gravava o vínculo com a ficha ────────────────
--
-- ── O DEFEITO ────────────────────────────────────────────────────────────────
--
-- `aceitar_convite` grava o perfil da pessoa assim:
--
--   BEGIN
--     INSERT INTO public.profiles (id, pessoa_id, nome_completo, telefone, role, …)
--     VALUES (v_user_id, v_pessoa.id, v_pessoa.nome_completo, …);
--   EXCEPTION WHEN OTHERS THEN NULL; END;
--
-- **A coluna `nome_completo` não existe em `profiles`.** As colunas reais são
-- `id, nome, email, created_at, updated_at, telefone_e164, role, telefone,
-- primeiro_acesso, lgpd_aceito, lgpd_data, pessoa_id`.
--
-- O INSERT falha SEMPRE, com `column "nome_completo" does not exist`. E o
-- `EXCEPTION WHEN OTHERS THEN NULL` engole o erro — a função segue e devolve
-- `ok = true`.
--
-- Resultado: **todo mundo que entra por convite nasce sem `pessoa_id` e sem
-- `role` em `profiles`.** O convite funciona, o login funciona, e só o Painel
-- de Acessos revela, escrevendo "sem vínculo com pessoa" debaixo do nome.
--
-- Medido em produção em 26/08/2026 — as três contas existentes:
--
--   Telma Souza                       pessoa_id preenchido   (criada por outro caminho)
--   Lourdes Beatriz Rodrigues Ramos   pessoa_id NULO         (entrou por convite)
--   Bruno Sepulvida do Amaral         pessoa_id NULO         (entrou por convite)
--
-- É também a raiz de um defeito consertado horas antes, na migration
-- 20260825180000: `profiles.role` estava nulo na secretaria porque este mesmo
-- INSERT — o único que o preencheria — nunca chegou a rodar.
--
-- ── A CORREÇÃO ───────────────────────────────────────────────────────────────
--
-- 1. `nome_completo` → `nome`, o nome real da coluna.
-- 2. O bloco deixa de engolir em silêncio: passa a `RAISE WARNING`, que aparece
--    no log do Postgres. O fluxo do convite continua concluindo, como hoje —
--    mas a falha deixa de ser invisível.
-- 3. Preenche o `pessoa_id` das contas que já existem, casando por telefone.
--
-- ── SOBRE O CASAMENTO POR TELEFONE ───────────────────────────────────────────
--
-- Não é adivinhação. `profiles.telefone` e `membros.telefone_celular` guardam o
-- mesmo formato canônico — 13 dígitos, `55` + DDD + número — e nas duas contas
-- pendentes **o nome também confere**:
--
--   5521965170413  Lourdes Beatriz Rodrigues Ramos  ->  Lourdes Beatriz Rodrigues Ramos
--   5521980005475  Bruno Sepulvida do Amaral        ->  Bruno Sepulvida do Amaral
--
-- O UPDATE é restrito a `pessoa_id IS NULL`, então não toca em vínculo já feito.
--
-- ── O QUE ESTA MIGRATION NÃO FAZ ─────────────────────────────────────────────
--
-- Não mexe nos outros três `EXCEPTION WHEN OTHERS THEN NULL` da função
-- (user_roles, consentimento e membros.perfil_acesso). Os três estão
-- funcionando — os papéis chegam a `user_roles`, que é a fonte da verdade.
-- Consertar o que não está quebrado numa migration de conserto só dificulta a
-- revisão.
--
-- Não preenche `profiles.role` retroativamente. Ele continua sendo o Achado 14
-- da auditoria — coluna a ser removida, não a ser alimentada. As guardas de
-- acesso já não a leem desde 20260825180000.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · Corrige a função ────────────────────────────────────────────────────
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

  -- Sincronizar user_roles: apaga roles antigos e insere o do convite
  BEGIN
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, v_convite.role);
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Auto-aceite LGPD
  BEGIN
    INSERT INTO public.consentimento (auth_user_id, tipo, base_legal, aceito, texto_versao, canal, registrado_por)
    VALUES (v_user_id, 'politica_privacidade', 'consentimento', TRUE, '1.0', 'web_app', v_user_id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Perfil vinculado a ficha.
  --
  -- A coluna e `nome`, nao `nome_completo` — escrever no nome errado fazia este
  -- INSERT falhar SEMPRE, e o handler antigo (THEN NULL) engolia. Por isso todo
  -- convite aceito nascia sem `pessoa_id`.
  --
  -- O handler agora avisa no log em vez de descartar. O fluxo do convite segue
  -- concluindo, como antes — mas a falha deixa rastro.
  BEGIN
    INSERT INTO public.profiles AS p (id,pessoa_id,nome,telefone,role,created_at,updated_at)
    VALUES (v_user_id, v_pessoa.id, v_pessoa.nome_completo, v_telefone_norm, v_convite.role, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
       SET pessoa_id=EXCLUDED.pessoa_id, nome=EXCLUDED.nome,
           telefone=EXCLUDED.telefone, role=EXCLUDED.role, updated_at=NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'aceitar_convite: falha ao gravar profiles do usuario % — %', v_user_id, SQLERRM;
  END;

  BEGIN
    UPDATE public.membros m SET perfil_acesso = v_convite.role::perfil_acesso, updated_at = NOW()
     WHERE m.id = v_pessoa.id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  UPDATE public.convites_acesso ca SET used_at = NOW() WHERE ca.token = p_token;

  RETURN QUERY SELECT TRUE, NULL::TEXT, v_email_login;
END;
$function$;

-- ── 2 · Preenche o vínculo das contas que já existem ────────────────────────
-- Restrito a `pessoa_id IS NULL`: nao toca em vinculo ja feito.
UPDATE public.profiles p
   SET pessoa_id = m.id,
       updated_at = NOW()
  FROM public.membros m
 WHERE m.telefone_celular = p.telefone
   AND p.pessoa_id IS NULL;
