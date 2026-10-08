-- ─── DIAGNÓSTICO da limpeza das recorrências: por que o ensaio estourou o tempo (08/10/2026) ──────────────────────────
-- O ensaio completo (docs/LIMPEZA_RECORRENCIAS_ENSAIO.sql) deu "upstream timeout" do SQL Editor. Este comando NÃO apaga nada: mede.
-- (1) lista os gatilhos de fin_lancamentos e as chaves estrangeiras que apontam para ela, dizendo se a coluna que aponta TEM índice —
--     sem índice, cada linha apagada obriga o banco a varrer a tabela que a referencia (29 mil linhas × uma varredura = minutos);
-- (2) mede quanto custa montar a lista do que seria removido; (3) apaga uma AMOSTRA de 200 linhas e cronometra — depois extrapola.
-- Como os outros ensaios: um único comando que termina SEMPRE com erro de propósito ("DIAGNÓSTICO CONCLUÍDO (nada foi gravado)").

DO $diag$
DECLARE
  t0 timestamptz; t_lista numeric; t_amostra numeric; n_lista bigint; n_amostra bigint;
  gatilhos text; fks text; tamanho text; total bigint; previstos bigint;
BEGIN
  SELECT string_agg(format('%s [%s] %s', t.tgname,
                           CASE t.tgenabled WHEN 'O' THEN 'ativo' WHEN 'D' THEN 'desligado' ELSE t.tgenabled::text END,
                           regexp_replace(pg_get_triggerdef(t.oid), '^CREATE (CONSTRAINT )?TRIGGER [^ ]+ ', '')), E'\n' ORDER BY t.tgname)
    INTO gatilhos FROM pg_trigger t WHERE t.tgrelid = 'public.fin_lancamentos'::regclass AND NOT t.tgisinternal;

  SELECT string_agg(format('%s.%s  | ao apagar: %s | ~%s linhas | índice na coluna: %s',
                           c.conrelid::regclass::text,
                           (SELECT string_agg(a.attname, ',') FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k),
                           CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT' END,
                           (SELECT reltuples::bigint FROM pg_class WHERE oid = c.conrelid),
                           CASE WHEN EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0]::int = c.conkey[1]) THEN 'sim' ELSE '*** NÃO ***' END),
                    E'\n' ORDER BY c.conrelid::regclass::text)
    INTO fks FROM pg_constraint c WHERE c.contype = 'f' AND c.confrelid = 'public.fin_lancamentos'::regclass;

  SELECT pg_size_pretty(pg_total_relation_size('public.fin_lancamentos')), (SELECT count(*) FROM public.fin_lancamentos),
         (SELECT count(*) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto')
    INTO tamanho, total, previstos;

  -- (2) a lista do que seria removido (a mesma condição do ensaio)
  t0 := clock_timestamp();
  CREATE TEMP TABLE _limpa ON COMMIT DROP AS
  SELECT l.id FROM public.fin_lancamentos l
   WHERE l.origem = 'recorrencia' AND l.status = 'previsto'
     AND l.data > ((now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '12 months')::date
     AND l.parcela_numero IS NULL
     AND l.recorrencia_id IN (SELECT r.id FROM public.fin_recorrencias r
                               WHERE r.tipo_recorrencia IS DISTINCT FROM 'parcelamento' AND (r.data_fim IS NULL OR r.data_fim >= DATE '2090-01-01'))
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = l.id);
  GET DIAGNOSTICS n_lista = ROW_COUNT;
  t_lista := extract(epoch FROM clock_timestamp() - t0);

  -- (3) amostra: apaga 200 linhas com o gatilho de saldo desligado (como o ensaio) e cronometra
  ALTER TABLE public.fin_lancamentos DISABLE TRIGGER fin_lanc_saldo;
  t0 := clock_timestamp();
  DELETE FROM public.fin_lancamentos WHERE id IN (SELECT id FROM _limpa LIMIT 200);
  GET DIAGNOSTICS n_amostra = ROW_COUNT;
  t_amostra := extract(epoch FROM clock_timestamp() - t0);

  RAISE EXCEPTION E'DIAGNÓSTICO CONCLUÍDO (nada foi gravado)\n\nfin_lancamentos: % linhas, % (tabela + índices); % previstos de recorrência\n\nGATILHOS:\n%\n\nCHAVES ESTRANGEIRAS que apontam para fin_lancamentos:\n%\n\nMONTAR A LISTA do que seria removido: % linhas em % s\nAMOSTRA: apagar % linhas levou % s  →  estimativa para tudo (%): % s',
    total, tamanho, previstos, coalesce(gatilhos, '(nenhum)'), coalesce(fks, '(nenhuma)'), n_lista, round(t_lista, 2),
    n_amostra, round(t_amostra, 2), n_lista, round(t_amostra * n_lista / greatest(n_amostra, 1), 1);
END
$diag$;
