-- Reverte a migration 20261022210000 (resumo diário da Tesouraria): remove o agendamento, as funções e as tabelas (inclusive o histórico do que foi enviado).
-- A Edge Function `resumo-diario` depende destas funções: desligue/retire-a antes (ou ela responderá erro 500 no próximo disparo, sem enviar nada).
DO $job$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resumo-diario') THEN PERFORM cron.unschedule('resumo-diario'); END IF;
END $job$;
DROP FUNCTION IF EXISTS public.resumo_diario_dados();
DROP FUNCTION IF EXISTS public.sistema_resumo_diario_salvar(jsonb, jsonb);
DROP FUNCTION IF EXISTS public.sistema_resumo_diario_status();
DROP TABLE IF EXISTS public.resumo_diario_enviados;
DROP TABLE IF EXISTS public.resumo_diario_destinatarios;
DROP TABLE IF EXISTS public.resumo_diario_config;
