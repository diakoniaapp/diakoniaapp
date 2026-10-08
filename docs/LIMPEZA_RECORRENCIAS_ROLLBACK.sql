-- ─── DESFAZER a limpeza de previstos de recorrência (NÃO execute sem necessidade) ─────────────────────────────
-- Usa as cópias criadas pela limpeza: fin_lancamentos_previstos_backup_20261008 e fin_recorrencias_backup_20261008.
-- Restaura os lançamentos apagados (só os que ainda não existem) e devolve data_fim / ultimo_gerado_ate das recorrências.
-- A lista de colunas é montada em tempo de execução (só as que existem nas duas tabelas), para não quebrar se o esquema mudou.
-- Depois de restaurar, os previstos até 2099 VOLTAM — e com eles o peso: só faça isto se a limpeza tiver apagado algo indevido.

BEGIN;

DO $$
DECLARE cols text; n_antes bigint; n_depois bigint;
BEGIN
  SELECT count(*) INTO n_antes FROM public.fin_lancamentos;
  SELECT string_agg(quote_ident(b.column_name), ', ' ORDER BY b.ordinal_position) INTO cols
    FROM information_schema.columns b
    JOIN information_schema.columns l ON l.table_schema = 'public' AND l.table_name = 'fin_lancamentos' AND l.column_name = b.column_name
   WHERE b.table_schema = 'public' AND b.table_name = 'fin_lancamentos_previstos_backup_20261008';
  EXECUTE format(
    'INSERT INTO public.fin_lancamentos (%1$s) SELECT %1$s FROM public.fin_lancamentos_previstos_backup_20261008 b
      WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = b.id)', cols);
  SELECT count(*) INTO n_depois FROM public.fin_lancamentos;
  RAISE NOTICE 'Lançamentos restaurados: %', n_depois - n_antes;
END $$;

UPDATE public.fin_recorrencias r
   SET data_fim = b.data_fim, ultimo_gerado_ate = b.ultimo_gerado_ate
  FROM public.fin_recorrencias_backup_20261008 b
 WHERE b.id = r.id;

-- conferência: nada de saldo deve mudar (previstos não entram no saldo)
SELECT jsonb_build_object(
  'lancamentos_agora', (SELECT count(*) FROM public.fin_lancamentos),
  'previstos_recorrencia_agora', (SELECT count(*) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto'),
  'recorrencias_com_data_fim_2099', (SELECT count(*) FROM public.fin_recorrencias WHERE data_fim >= DATE '2090-01-01')
) AS resultado;

COMMIT;

-- ─── Se for preciso desfazer também a migration 20261008150000 (gatilho de saldo), volte à função original: ──────
-- CREATE OR REPLACE FUNCTION public.fin_atualiza_saldo()
--  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- begin
--   if tg_op in ('INSERT','UPDATE') then
--     perform public.fin_recalc_saldo_conta(new.conta_id);
--     if tg_op = 'UPDATE' and old.conta_id <> new.conta_id then
--       perform public.fin_recalc_saldo_conta(old.conta_id);
--     end if;
--   end if;
--   if tg_op = 'DELETE' then
--     perform public.fin_recalc_saldo_conta(old.conta_id);
--   end if;
--   return null;
-- end;$function$;
