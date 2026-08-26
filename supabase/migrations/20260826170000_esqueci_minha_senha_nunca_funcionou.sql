-- ─── "Esqueci minha senha" nunca funcionou ──────────────────────────────────
--
-- Relatado pela administradora em 26/08/2026: o botão não faz nada.
--
-- ── DEFEITO 1 · A função estoura para todo telefone cadastrado ──────────────
--
-- `solicitar_reset_senha` declara `RETURNS TABLE(ok boolean, token uuid,
-- pessoa_id uuid)`. Em PL/pgSQL, o nome de uma coluna de retorno vira uma
-- variável — e `pessoa_id` também é uma coluna de `convites_acesso`. Nesta
-- linha os dois se encontram:
--
--   UPDATE convites_acesso SET used_at = now()
--    WHERE pessoa_id = v_pess_id AND tipo = 'reset_senha' AND used_at IS NULL;
--
-- O Postgres não tem como decidir e recusa a instrução inteira:
--
--   ERROR: 42702: column reference "pessoa_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--
-- Medido em produção em 26/08/2026, chamando a função com telefones reais
-- dentro de uma transação revertida. O erro aparece sempre.
--
-- **E o efeito é preciso e cruel:** esse UPDATE só é alcançado DEPOIS de
-- encontrar a pessoa. Telefone que não existe passa (a função retorna cedo,
-- sem token, de propósito, para não revelar quem é cadastrado). Telefone que
-- existe — exatamente o caso de quem precisa recuperar a senha — estoura.
--
-- A prova está nos dados: `convites_acesso` tem 25 linhas e **nenhuma com
-- `tipo = 'reset_senha'`**. Em quatro meses, nenhum reset chegou a nascer.
--
-- Correção: qualificar a coluna — `convites_acesso.pessoa_id`. É o mesmo
-- cuidado que a própria função já toma duas linhas abaixo, no
-- `RETURNING convites_acesso.token`, sinal de que alguém já tropeçou nisto.
--
-- ── DEFEITO 2 · Corrigir o 1 sozinho REBAIXARIA quem usasse o botão ─────────
--
-- Este é o motivo de a migration mexer em duas funções, e não em uma.
--
-- O link de reset leva a `redefinir_senha`, que é só um repasse:
--
--   RETURN QUERY SELECT * FROM aceitar_convite(p_token, p_senha);
--
-- E `aceitar_convite` **apaga e reescreve os papéis do usuário**:
--
--   DELETE FROM user_roles WHERE user_id = v_user_id;
--   INSERT INTO user_roles (user_id, role) VALUES (v_user_id, v_convite.role);
--
-- O papel gravado no token vem de `profiles.role` — a coluna legada que
-- diverge de `user_roles` (Risco 9 do CLAUDE.md) — com queda para
-- 'voluntario' quando ela é nula.
--
-- Medido em produção em 26/08/2026, nas três contas que existem:
--
--   pessoa                            profiles.role   user_roles    viraria
--   Telma Rodrigues de Souza          admin           admin         admin
--   Lourdes Beatriz Rodrigues Ramos   (NULO)          secretaria    voluntario
--   Bruno Sepulvida do Amaral         membro          lideranca     membro
--
-- **A secretaria da igreja perderia o acesso ao trocar a própria senha**, e a
-- liderança viraria "membro". Hoje isso está escondido atrás do defeito 1:
-- como nenhum token de reset nasce, nenhuma conta foi rebaixada. Consertar a
-- ambiguidade sem consertar isto transformaria um botão quebrado num botão
-- perigoso.
--
-- Correção: **trocar a senha não é reatribuir papel.** `aceitar_convite`
-- passa a mexer em papéis apenas quando o convite é `primeiro_acesso`, que é
-- quando atribuir papel é justamente o propósito. Em `reset_senha` os papéis
-- ficam como estão.
--
-- E `solicitar_reset_senha` passa a ler o papel de `user_roles`, a fonte da
-- verdade, em vez de `profiles.role` — o mesmo conserto que a migration
-- 20260825180000 fez nas outras três funções e que deixou esta de fora, por
-- não ser guarda de acesso. Agora que ela deixou de ser inofensiva, entra.
-- O papel gravado no token passa a ser informativo: `validar_convite` o
-- devolve para a tela, e ninguém mais o aplica num reset.
--
-- ── O QUE ESTA MIGRATION NÃO FAZ ────────────────────────────────────────────
--
-- **Não integra WhatsApp.** `EsqueciSenha.tsx` promete "você receberá um link
-- no WhatsApp" e o próprio arquivo registra que a integração é de uma fase
-- seguinte; enquanto isso, a tela mostra o link. Com o defeito 1 de pé, ela
-- nunca recebia link nenhum para mostrar. Depois desta migration o link
-- aparece na tela — o envio automático continua pendente, e é outro assunto.
--
-- Não remove `profiles.role` nem os outros `EXCEPTION WHEN OTHERS THEN NULL`
-- de `aceitar_convite`. Continuam sendo os Achados 14 e a dívida já
-- registrada.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 · solicitar_reset_senha ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.solicitar_reset_senha(p_telefone text)
 RETURNS TABLE(ok boolean, token uuid, pessoa_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  v_tel       TEXT;
  v_pess_id   UUID;
  v_role      public.app_role;
  v_token     UUID;
BEGIN
  v_tel := regexp_replace(p_telefone, '\D', '', 'g');
  IF length(v_tel) BETWEEN 10 AND 11 THEN v_tel := '55' || v_tel; END IF;

  SELECT m.id INTO v_pess_id FROM public.membros m WHERE m.telefone_celular = v_tel LIMIT 1;
  IF v_pess_id IS NULL THEN
    -- Nunca revela se o telefone existe ou nao (seguranca).
    RETURN QUERY SELECT true, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  -- Le `user_roles`, nao `profiles.role` — ver cabecalho, defeito 2.
  -- Sem COALESCE para 'voluntario': inventar um papel foi o que tornou este
  -- caminho perigoso. Nulo diz a verdade — este token nao concede papel.
  SELECT ur.role INTO v_role
    FROM public.profiles pr
    JOIN public.user_roles ur ON ur.user_id = pr.id
   WHERE pr.pessoa_id = v_pess_id
   LIMIT 1;

  -- `convites_acesso.pessoa_id` qualificado: sem o prefixo, o nome colide com
  -- a coluna de retorno `pessoa_id` e o Postgres recusa o UPDATE inteiro.
  UPDATE public.convites_acesso
     SET used_at = now()
   WHERE convites_acesso.pessoa_id = v_pess_id
     AND convites_acesso.tipo      = 'reset_senha'
     AND convites_acesso.used_at   IS NULL;

  INSERT INTO public.convites_acesso (tipo, pessoa_id, role, expires_at)
  VALUES ('reset_senha', v_pess_id, v_role, now() + INTERVAL '1 hour')
  RETURNING convites_acesso.token INTO v_token;

  RETURN QUERY SELECT true, v_token, v_pess_id;
END;
$function$;

-- ── 2 · aceitar_convite ─────────────────────────────────────────────────────
-- Igual a versao de 20260826100000, com uma unica mudanca: as escritas de
-- papel passam a acontecer so quando o convite e `primeiro_acesso`.
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

-- ── Concessoes ──────────────────────────────────────────────────────────────
-- `solicitar_reset_senha` precisa de `anon`: quem esqueceu a senha nao esta
-- autenticado. `aceitar_convite` idem — e chamada da tela do link.
GRANT EXECUTE ON FUNCTION public.solicitar_reset_senha(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aceitar_convite(uuid, text)  TO anon, authenticated;
