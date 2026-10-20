-- Desfaz 20261020200000_admin_criar_acesso.sql: apaga a função. As contas já criadas por ela continuam como estão.
-- (Se o cadastro público do Auth já tiver sido desligado, volte a ligá-lo ANTES de desfazer, ou "Novo acesso" deixa de funcionar.)
DROP FUNCTION IF EXISTS public.admin_criar_acesso(uuid, text, text);
