-- B1: marcar colunas legadas como DEPRECATED
-- A fonte da verdade do role e public.user_roles.role.
-- public.profiles.role e public.membros.perfil_acesso sao espelhos historicos.

COMMENT ON COLUMN public.membros.perfil_acesso IS
  'DEPRECATED: a fonte da verdade do role e user_roles.role. Esta coluna deve ser ignorada pelo app.';

COMMENT ON COLUMN public.profiles.role IS
  'DEPRECATED: a fonte da verdade do role e user_roles.role. Esta coluna deve ser ignorada pelo app.';

-- B2: migrar registros com role 'diakonia' (legado) para 'pastor'
-- Mantemos o valor 'diakonia' no enum app_role pra nao quebrar registros antigos
-- e referencias em codigo de compatibilidade, mas zeramos o uso ativo.

UPDATE public.user_roles SET role = 'pastor'::app_role WHERE role = 'diakonia'::app_role;
UPDATE public.profiles   SET role = 'pastor'::app_role WHERE role = 'diakonia'::app_role;

-- (Opcional, executar mais tarde) Renomeio do enum sem destruir registros:
-- O Postgres nao permite remover valor do enum diretamente. Para limpar
-- definitivamente, seria preciso criar um novo enum app_role_v2 e migrar.
-- Por agora basta a UI nao oferecer 'diakonia'.

-- Reload schema
NOTIFY pgrst, 'reload schema';
