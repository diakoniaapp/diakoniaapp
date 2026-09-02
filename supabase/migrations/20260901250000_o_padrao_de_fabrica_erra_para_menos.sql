-- ═══════════════════════════════════════════════════════════════════════════
-- O padrão de fábrica erra para menos
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE ESTAVA ACONTECENDO ───────────────────────────────────────────────
--
-- `handle_new_user` dá `admin` ao primeiro usuário do banco e `lideranca` a
-- **todos os seguintes**. E `lideranca`, depois de 20260901210000, é um dos
-- papéis do Grupo A: financeiro, fiscal e governança, com `ALL` — ler,
-- alterar e apagar.
--
-- Ou seja: toda conta criada nascia podendo mexer no dinheiro da igreja, e só
-- deixava de poder quando alguém, num segundo passo, ajustava o perfil. Se
-- esse segundo passo falhasse — RLS, rede, uma janela fechada antes da hora —
-- ela ficava assim.
--
-- Isso importa agora e não importava antes: são 4 contas hoje e **19 líderes
-- esperando conta**, mais os membros depois deles.
--
-- ── O CRITÉRIO ────────────────────────────────────────────────────────────
--
-- Um padrão de fábrica deve errar para MENOS. `membro` é o papel mais fraco
-- que existe: a própria ficha, a própria EBD, a própria escala, o próprio
-- PGM, a agenda — exatamente o recorte que a igreja ditou em 01/09 e que
-- 20260901240000 aplicou.
--
-- Quem precisa de mais é promovido pela tela de acessos, que é onde a
-- secretaria já escolhe o perfil. A diferença é que agora, se a promoção
-- falhar, a pessoa fica de menos em vez de ficar de mais.
--
-- ── O RAMO DO PRIMEIRO USUÁRIO FICA ────────────────────────────────────────
--
-- `IF user_count = 1 THEN 'admin'` continua. Sem ele, um banco recém-criado
-- não teria ninguém capaz de promover ninguém — a porta ficaria trancada por
-- dentro. Hoje é letra morta (existem 4 contas), e é o tipo de letra morta
-- que se deve manter viva.
--
-- ── O SEGUNDO PASSO PRECISOU MUDAR JUNTO ───────────────────────────────────
--
-- `NovoAcessoDialog.tsx` tinha `if (papel !== "lideranca")` antes de chamar
-- `definirPerfil` — um atalho que pulava o segundo passo justamente quando o
-- papel escolhido era igual ao padrão do gatilho. Trocar o padrão aqui sem
-- mexer lá faria TODA nova liderança nascer como membro, calada.
--
-- O atalho saiu no mesmo commit: agora `definirPerfil` é sempre chamado. Uma
-- chamada a mais é mais barata que um acoplamento entre a tela e o gatilho
-- que ninguém lembra que existe.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome, email, telefone_e164)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.phone, NEW.email, 'Membro'),
    NEW.email,
    CASE WHEN NEW.phone IS NOT NULL AND NEW.phone <> ''
         THEN '+' || NEW.phone ELSE NULL END
  );

  SELECT COUNT(*) INTO user_count FROM auth.users;

  IF user_count = 1 THEN
    -- A primeira conta do banco precisa poder promover as outras. Sem este
    -- ramo, um banco novo tranca por dentro.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    -- Todas as demais nascem no papel mais fraco. Quem precisa de mais é
    -- promovido pela tela de acessos; se a promoção falhar, a pessoa fica
    -- de menos, e não de mais.
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'membro');
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Cria profile e papel inicial de toda conta nova. A primeira do banco vira admin (para poder promover as outras); as demais nascem membro — o padrao de fabrica erra para menos.';

COMMIT;
