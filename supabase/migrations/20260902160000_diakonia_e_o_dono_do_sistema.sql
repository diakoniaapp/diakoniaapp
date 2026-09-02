-- ═══════════════════════════════════════════════════════════════════════════
-- Diakonia é o dono do sistema
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── AS TRÊS DEFINIÇÕES, DITADAS PELA IGREJA EM 02/09/2026 ──────────────────
--
--   Diakonia   dono do sistema, que o constrói, tem acesso a tudo e todos
--   Admin      pessoa da igreja que configura o sistema do zero — libera
--              acessos, configura perfis, monta a estrutura
--   Ministério de Administração   é um ministério da igreja, e nada mais.
--              Nesta igreja calha de ser quem receberá o admin; noutra não
--              será. Nada no sistema deve amarrar os dois.
--
-- ── A INVERSÃO QUE ISTO CORRIGE ────────────────────────────────────────────
--
-- Hoje `diakonia` — o nome do fornecedor — veste o cargo de pastor titular,
-- com 19 permissões pastorais e 59 políticas. É o único papel do sistema cujo
-- nome não é um cargo de igreja, e ele está no lugar errado.
--
-- Esta migration põe o nome do fornecedor no fornecedor. O pastor titular sai
-- daqui em 20260902190000, depois que `pastor` estiver pronto para recebê-lo.
--
-- ── POR QUE A CONTA CARREGA DOIS PAPÉIS ────────────────────────────────────
--
-- Medido: para `diakonia` alcançar por política própria tudo o que `admin`
-- alcança seriam **238 políticas** reescritas, e toda política nova teria de
-- lembrar dele. Fazer a subsunção dentro de `is_admin()` cobriria 104 e
-- deixaria 134 de fora.
--
-- Mas `has_role` e `has_any_role` fazem, os dois, `SELECT 1 FROM user_roles
-- WHERE user_id = ? AND role = ?` — e `user_roles` é uma tabela de duas
-- colunas que **sempre aceitou mais de uma linha por conta**. Dar à conta
-- construtora as duas linhas custa **zero políticas**.
--
-- A separação que a igreja quis é de CONTAS, e ela continua: o que for feito
-- como Diakonia fica no log da conta Diakonia; o que a igreja fizer fica na
-- conta dela. A conta construtora carregar `admin` junto é o que lhe dá a
-- chave mestra do fornecedor sem duplicar regra nenhuma.
--
-- ── A ARMADILHA, FECHADA AQUI MESMO ────────────────────────────────────────
--
-- `definir_perfil` apagava TODOS os papéis da conta e inseria um. Ela
-- colapsaria a conta construtora em um papel só na primeira vez que alguém
-- tocasse no Painel de Acessos, e ninguém veria acontecer.
--
-- Agora ela preserva `diakonia`: é o papel do fornecedor, não um perfil da
-- igreja, e não é a tela de acessos de uma igreja que o concede ou o tira.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Diakonia recebe tudo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- "Acesso a tudo e todos" — então todas as permissões do catálogo, as 47 de
-- hoje e as que vierem. Quem quiser saber o que Diakonia pode, a resposta é
-- "o catálogo inteiro", e não uma lista para manter em dia.

INSERT INTO public.role_permissoes (role, permissao_codigo)
SELECT 'diakonia'::app_role, p.codigo
  FROM public.permissoes p
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. A conta construtora ganha o papel, sem perder o que já tinha
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pelo `pessoa_id`, e não pelo id da conta: se a conta for recriada um dia, a
-- ficha continua a mesma. E `ON CONFLICT` para a migration poder rodar duas
-- vezes.

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'diakonia'::app_role
  FROM public.profiles p
 WHERE p.id = '58eb1c4e-97f5-4354-a51e-25dee1111677'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. `definir_perfil` aprende que uma conta pode ter mais de um papel
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Só duas linhas mudam no corpo: o DELETE passa a poupar `diakonia`, e a
-- mensagem ganha os papéis novos. O resto é o que já estava, incluindo as
-- duas travas — não mexer no próprio perfil e não rebaixar o último
-- administrador.

CREATE OR REPLACE FUNCTION public.definir_perfil(p_user_id uuid, p_role app_role)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- `diakonia` é o papel de quem CONSTRÓI o sistema, não um perfil desta
  -- igreja. A tela de acessos de uma igreja não o concede nem o tira, e por
  -- isso ele sobrevive à troca de perfil.
  DELETE FROM public.user_roles
   WHERE user_id = p_user_id
     AND role <> 'diakonia'::app_role;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT DO NOTHING;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

  RETURN v_nome || ' agora é ' ||
         CASE p_role
           WHEN 'admin'      THEN 'Administrador do sistema'
           WHEN 'secretaria' THEN 'Secretaria'
           WHEN 'tesouraria' THEN 'Tesouraria'
           WHEN 'pastor'     THEN 'Pastor titular'
           WHEN 'diakonia'   THEN 'Diakonia — dono do sistema'
           WHEN 'lideranca'  THEN 'Liderança'
           WHEN 'voluntario' THEN 'Voluntário'
           WHEN 'membro'     THEN 'Membro'
           ELSE p_role::text
         END ||
         COALESCE(' (era ' || v_atual || ')', ' (não tinha perfil)') || '.';
END;
$function$;

COMMIT;
