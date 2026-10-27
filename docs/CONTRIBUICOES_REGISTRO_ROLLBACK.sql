-- Reverte supabase/migrations/20261027160000_contribuicoes_registro_de_acessos.sql
-- ATENÇÃO: apaga o rastro de quem consultou contribuições. Exporte a tabela antes, se ela já tiver linhas.
DROP FUNCTION IF EXISTS public.contribuicoes_registrar_acesso(text, jsonb, integer);
DROP TABLE IF EXISTS public.contribuicoes_acessos;
DROP FUNCTION IF EXISTS public.contribuicoes_acessos_imutavel();
