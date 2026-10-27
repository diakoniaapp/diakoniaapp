-- Reverte supabase/migrations/20261027180000_comunicacao_envios.sql
-- ATENÇÃO: apaga o histórico de envios de relatórios. Exporte a tabela antes, se ela já tiver linhas.
DROP TABLE IF EXISTS public.comunicacao_envios;
DROP FUNCTION IF EXISTS public.comunicacao_envios_imutavel();
