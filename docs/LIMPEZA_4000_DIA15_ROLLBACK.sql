-- ─── DESFAZER a limpeza dos 12 previstos de R$ 4.000 do dia 15 (só se algo estiver errado) ───────────────────────────────
-- Devolve os 12 lançamentos a partir de fin_lancamentos_previstos_4000_backup_20261008 (só os que ainda não existem). Previsto não entra no saldo.
-- Atenção: a recorrência continua ENCERRADA (data_fim 2026-09-15); desfazer só traz de volta os 12 previstos.
DO $desfazer$
DECLARE cols text; n_antes bigint; n_depois bigint;
BEGIN
  SELECT string_agg(quote_ident(b.column_name), ', ' ORDER BY b.ordinal_position) INTO cols
    FROM information_schema.columns b
    JOIN information_schema.columns l ON l.table_schema = 'public' AND l.table_name = 'fin_lancamentos' AND l.column_name = b.column_name
   WHERE b.table_schema = 'public' AND b.table_name = 'fin_lancamentos_previstos_4000_backup_20261008';
  SELECT count(*) INTO n_antes FROM public.fin_lancamentos;
  EXECUTE format(
    'INSERT INTO public.fin_lancamentos (%1$s) SELECT %1$s FROM public.fin_lancamentos_previstos_4000_backup_20261008 b
      WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = b.id)', cols);
  SELECT count(*) INTO n_depois FROM public.fin_lancamentos;
  RAISE NOTICE 'LIMPEZA DESFEITA: % lançamentos restaurados', n_depois - n_antes;
END
$desfazer$;
