-- ─── Trocar o perfil de uma pessoa que já usa o sistema ────────────────────
--
-- Pergunta da Telma: "como altero o perfil de uma pessoa que já está usando o
-- sistema, aumentando ou diminuindo as funções?"
--
-- Resposta até hoje: não altera. `user_roles` decide tudo — `useAuth`,
-- `minhas_permissoes()`, 263 políticas de RLS — e NENHUMA tela do sistema
-- escrevia nela. O papel de alguém era escolhido na criação do acesso e
-- ficava.
--
-- A RLS já permitia: `admin_insert_user_roles`, `admin_update_user_roles` e
-- `admin_delete_user_roles` existem e liberam `is_admin()`. Faltava só quem
-- chamasse.
--
-- ── POR QUE UMA FUNÇÃO, E NÃO DOIS COMANDOS NA TELA ────────────────────────
--
-- Trocar perfil é apagar o papel antigo e inserir o novo. Feito da tela, são
-- duas idas ao banco, e entre uma e outra a pessoa fica sem papel nenhum. Se a
-- segunda falhar — rede caindo, aba fechando —, ela fica sem acesso e ninguém
-- percebe. Dentro de uma função é um passo só: ou troca, ou não mexe.
--
-- ── AS TRÊS TRAVAS ─────────────────────────────────────────────────────────
--
-- Só admin. Nunca em si mesmo — rebaixar a própria conta tranca quem estava
-- configurando do lado de fora da tela que resolveria. E nunca o último
-- administrador, pelo mesmo motivo, com o agravante de não ter volta.
--
-- ── UM PAPEL POR PESSOA ────────────────────────────────────────────────────
--
-- `user_roles` aceita vários por pessoa, e os seis usuários de hoje têm um
-- cada. A função assume um: apaga o que houver e grava o escolhido. Se um dia
-- a igreja precisar de acúmulo — alguém que é secretaria E tesouraria —, isto
-- aqui é o lugar de mudar, e a tela precisará mudar junto.

CREATE OR REPLACE FUNCTION public.definir_perfil(p_user_id uuid, p_role app_role)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nome    text;
  v_atual   text;
  v_admins  int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas a administração pode alterar perfis.';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Você não pode alterar o próprio perfil. Peça a outra pessoa da administração.';
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.nome), ''), 'esta conta') INTO v_nome
    FROM public.profiles p WHERE p.id = p_user_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Conta não encontrada.';
  END IF;

  SELECT string_agg(role::text, ', ') INTO v_atual
    FROM public.user_roles WHERE user_id = p_user_id;

  -- Rebaixar o último administrador deixaria a igreja sem ninguém capaz de
  -- promover outro — e esta função é a única porta para promover.
  IF p_role <> 'admin'::app_role
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')
  THEN
    SELECT count(*) INTO v_admins FROM public.user_roles WHERE role = 'admin';
    IF v_admins <= 1 THEN
      RAISE EXCEPTION 'Este é o único administrador. Promova outra pessoa antes de rebaixar este perfil.';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);

  RETURN v_nome || ' agora é ' ||
         CASE p_role
           WHEN 'admin'      THEN 'Administrador'
           WHEN 'secretaria' THEN 'Secretaria'
           WHEN 'pastor'     THEN 'Pastor'
           WHEN 'diakonia'   THEN 'Pastor'
           WHEN 'lideranca'  THEN 'Liderança'
           WHEN 'voluntario' THEN 'Voluntário'
           ELSE p_role::text
         END ||
         COALESCE(' (era ' || v_atual || ')', ' (não tinha perfil)') || '.';
END;
$$;

COMMENT ON FUNCTION public.definir_perfil(uuid, app_role) IS
  'Troca o perfil de um usuario num passo so. Guardas: apenas admin, nunca a propria conta, nunca o ultimo administrador. Assume um papel por pessoa: apaga o que houver e grava o escolhido.';

REVOKE ALL ON FUNCTION public.definir_perfil(uuid, app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.definir_perfil(uuid, app_role) TO authenticated;
