-- Reverte a migration 20261020220000_fin_recusa_movimento_duplicado.sql: remove o gatilho e a função. Nenhum lançamento é alterado.
DROP TRIGGER IF EXISTS fin_lanc_recusa_duplicado ON public.fin_lancamentos;
DROP FUNCTION IF EXISTS public.fin_recusa_movimento_duplicado();

-- Conferência (esperado: 0 e 0)
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'fin_lanc_recusa_duplicado') AS gatilhos_restantes,
  (SELECT count(*) FROM pg_proc WHERE proname = 'fin_recusa_movimento_duplicado') AS funcoes_restantes;
