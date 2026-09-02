-- ═══════════════════════════════════════════════════════════════════════════
-- Visitante não tem acesso
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── A REGRA ────────────────────────────────────────────────────────────────
--
-- Ditada pela igreja em 01/09/2026: "visitantes não terão acessos ao sistema".
--
-- Auditadas as quatro contas antes de escrever: **nenhuma é de visitante**.
-- Todas as quatro estão ligadas a fichas `tipo_pessoa = 'membro'`, com status
-- ativo. A regra já está cumprida hoje — mas por coincidência, não por guarda.
-- São 3 visitantes cadastrados, e nada impedia o quarto de ganhar login.
--
-- ── O QUE MAIS A AUDITORIA ENCONTROU ───────────────────────────────────────
--
--   0  contas ligadas a ficha de visitante
--   0  contas ligadas a ficha inativa, transferida ou falecida
--   0  contas sem ficha vinculada
--   0  contas sem papel, ou com mais de um
--   0  duas contas para a mesma ficha
--   0  usuários no Auth sem profile
--   2  **`profiles.role` divergindo de `user_roles`**  ← o único achado
--
-- A divergência é do Bruno (`membro` em `profiles`, `lideranca` em
-- `user_roles`) e da Lourdes (vazio em `profiles`, `secretaria` em
-- `user_roles`). Quem manda é `user_roles`; o CLAUDE.md já registra que
-- `profiles.role` "não deve ser lido".
--
-- A causa é estrutural e está nesta migration: `criarAcessoPessoa` escreve
-- `profiles.role` na criação, e `definir_perfil` — a única porta para mudar
-- papel — escreve só `user_roles`. Toda troca de perfil desde sempre deixou
-- as duas colunas mais distantes.
--
-- Não apago a coluna: ela é lida em `acessoService.ts` para montar a lista do
-- Painel de Acessos, e arrancá-la é trabalho de outro tamanho. O que esta
-- migration faz é impedir que elas voltem a divergir, e alinhar as duas que
-- já divergiam.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- A guarda: nenhuma conta se liga a uma ficha de visitante
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Fica no banco, e não só na tela, pelo mesmo motivo de sempre: a tela decide
-- o que OFERECER, o banco decide o que PERMITIR. `NovoAcessoDialog` passa a
-- não oferecer visitantes na busca, mas quem chamar a API direto encontra
-- esta porta fechada também.
--
-- A guarda é sobre o VÍNCULO, não sobre a pessoa: se um visitante virar
-- membro ou congregado amanhã, o vínculo passa a ser aceito sem que nada
-- precise mudar aqui.

CREATE OR REPLACE FUNCTION public.impedir_acesso_de_visitante()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_nome text;
BEGIN
  IF NEW.pessoa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.tipo_pessoa::text, m.nome_completo
    INTO v_tipo, v_nome
    FROM public.membros m
   WHERE m.id = NEW.pessoa_id;

  IF v_tipo = 'visitante' THEN
    RAISE EXCEPTION
      '% está cadastrada como visitante, e visitante não tem acesso ao sistema. Mude o tipo para membro ou congregado na ficha antes de criar o acesso.',
      COALESCE(v_nome, 'Esta pessoa');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.impedir_acesso_de_visitante() IS
  'Regra da igreja (01/09/2026): visitante nao tem acesso. Guarda o VINCULO conta<->ficha; se a pessoa virar membro depois, o vinculo passa a ser aceito.';

DROP TRIGGER IF EXISTS trg_impedir_acesso_de_visitante ON public.profiles;
CREATE TRIGGER trg_impedir_acesso_de_visitante
  BEFORE INSERT OR UPDATE OF pessoa_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.impedir_acesso_de_visitante();

-- ═══════════════════════════════════════════════════════════════════════════
-- `definir_perfil` passa a manter as duas colunas juntas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Três mudanças, e só três: a escrita em `profiles.role`, o rótulo de
-- `membro` (que virou o padrão de fábrica em 20260901250000 e apareceria como
-- "membro" cru na mensagem de sucesso) e `diakonia`, que dizia "Pastor" onde
-- a interface inteira diz "Pastor titular". O resto do corpo é o que já
-- estava, incluindo as duas travas — não mexer no próprio perfil e não
-- rebaixar o último administrador.

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

  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role);

  -- A coluna espelho. Quem manda continua sendo `user_roles`; esta linha
  -- existe para que `profiles.role` pare de contar outra história.
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;

  RETURN v_nome || ' agora é ' ||
         CASE p_role
           WHEN 'admin'      THEN 'Administrador'
           WHEN 'secretaria' THEN 'Secretaria'
           WHEN 'pastor'     THEN 'Pastor'
           WHEN 'diakonia'   THEN 'Pastor titular'
           WHEN 'lideranca'  THEN 'Liderança'
           WHEN 'voluntario' THEN 'Voluntário'
           WHEN 'membro'     THEN 'Membro'
           ELSE p_role::text
         END ||
         COALESCE(' (era ' || v_atual || ')', ' (não tinha perfil)') || '.';
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- E as duas que já divergiam
-- ═══════════════════════════════════════════════════════════════════════════
--
-- `user_roles` é a fonte, então é ela que dita. Não há escolha a fazer aqui:
-- é o que o sistema já obedecia.

UPDATE public.profiles p
   SET role = ur.role
  FROM public.user_roles ur
 WHERE ur.user_id = p.id
   AND p.role::text IS DISTINCT FROM ur.role::text;

COMMIT;
