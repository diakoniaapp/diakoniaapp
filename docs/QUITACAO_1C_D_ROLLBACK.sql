-- DESFAZER a Fase 1C-d (migration 20261015120000): tira o job diário, a função do relógio e a visão de prazos. Nada mais muda; a Mesa continua realinhando as ofertas ao abrir.
DO $cron$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('cron.unschedule(text)') IS NOT NULL
     AND to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'quitacao-sincronizar'$q$;
  END IF;
END $cron$;
DROP FUNCTION IF EXISTS public.fin_quitacao_sincronizar_agendada();
DROP VIEW IF EXISTS public.vw_fin_quitacao_prazos;
