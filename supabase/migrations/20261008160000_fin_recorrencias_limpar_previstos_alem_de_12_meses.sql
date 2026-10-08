-- ─── Limpeza dos lançamentos PREVISTOS de recorrência além de 12 meses ───────────────────────────────────────────
-- Medido em 08/10/2026: ~29.900 previstos de recorrência, 29.460 deles a mais de 12 meses de hoje (até dez/2099), todos criados em
-- 06–07/10 pelo gerador do app, que tratou `data_fim = 2099-12-31` (marcador de "sem fim" do legado) como data final real. São ~69% de
-- todos os lançamentos do sistema. Esta limpeza apaga SÓ o que sobra além do horizonte de 12 meses:
--   · status = 'previsto' e origem = 'recorrencia' (nunca realizado/conciliado, nunca lançamento manual/importado);
--   · não é parcela de parcelamento (parcela_numero IS NULL) e a recorrência é contínua SEM data final real;
--   · sem anexo, rateio, folha, fiscal, estoque nem arrecadação ligados.
-- Segurança (tudo na MESMA transação — qualquer falha desfaz tudo):
--   0. exige a migration 20261008150000 já aplicada (senão cada linha apagada recalcularia o saldo da conta);
--   1. copia as linhas para `fin_lancamentos_previstos_backup_20261008` e as recorrências para `fin_recorrencias_backup_20261008`
--      (RLS ligada, sem acesso do app) — dá para restaurar (ver docs/LIMPEZA_RECORRENCIAS_ROLLBACK.sql);
--   2. trava: aborta se a limpeza passar de 35.000 linhas;
--   3. confere que NENHUM saldo mudou, que nenhum lançamento não-previsto mudou (quantidade e soma por conta) e que o total
--      bateu com o previsto — se algo diferir, ABORTA.
-- Depois: a data final 2099 das recorrências sem fim vira NULL ("sem data final") e `ultimo_gerado_ate` volta ao último previsto que sobrou.

BEGIN;

-- 0. precondição: o gatilho de saldo já ignora previstos
DO $$
BEGIN
  IF position('old.status in' in pg_get_functiondef('public.fin_atualiza_saldo()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Aplique ANTES a migration 20261008150000_fin_saldo_so_quando_o_saldo_muda.sql (o gatilho de saldo ainda recalcula a conta a cada linha)';
  END IF;
END $$;

-- fotografia do que NÃO pode mudar
CREATE TEMP TABLE _saldos_antes ON COMMIT DROP AS SELECT id, saldo_atual FROM public.fin_contas;
CREATE TEMP TABLE _reais_antes ON COMMIT DROP AS
  SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
    FROM public.fin_lancamentos WHERE status <> 'previsto' GROUP BY conta_id;
CREATE TEMP TABLE _total_antes ON COMMIT DROP AS SELECT count(*) AS n FROM public.fin_lancamentos;

-- o que será removido
CREATE TEMP TABLE _limpa ON COMMIT DROP AS
SELECT l.id, l.conta_id, l.recorrencia_id
  FROM public.fin_lancamentos l
 WHERE l.origem = 'recorrencia'
   AND l.status = 'previsto'
   AND l.data > ((now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '12 months')::date
   AND l.parcela_numero IS NULL
   AND l.recorrencia_id IN (
         SELECT r.id FROM public.fin_recorrencias r
          WHERE r.tipo_recorrencia IS DISTINCT FROM 'parcelamento'
            AND (r.data_fim IS NULL OR r.data_fim >= DATE '2090-01-01'))
   AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos x WHERE x.lancamento_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = l.id)
   AND NOT EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = l.id);

-- trava de segurança: o esperado são ~29.460; muito além disso, algo mudou desde a medição
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM _limpa;
  IF n > 35000 THEN RAISE EXCEPTION 'A limpeza apagaria % lançamentos (esperado ~29.460) — abortando', n; END IF;
END $$;

-- o resumo ANTES de apagar (o que a tesouraria vai revisar)
CREATE TEMP TABLE _resumo ON COMMIT DROP AS
SELECT jsonb_build_object(
  'lancamentos_antes', (SELECT n FROM _total_antes),
  'removidos', (SELECT count(*) FROM _limpa),
  'permanecem', (SELECT n FROM _total_antes) - (SELECT count(*) FROM _limpa),
  'recorrencias_total', (SELECT count(*) FROM public.fin_recorrencias),
  'recorrencias_afetadas', (SELECT count(DISTINCT recorrencia_id) FROM _limpa),
  'por_conta', (SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'conta'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object(
               'conta', c.nome,
               'lancamentos_antes',  (SELECT count(*) FROM public.fin_lancamentos l WHERE l.conta_id = c.id),
               'removidos',          (SELECT count(*) FROM _limpa k WHERE k.conta_id = c.id),
               'lancamentos_depois', (SELECT count(*) FROM public.fin_lancamentos l WHERE l.conta_id = c.id) - (SELECT count(*) FROM _limpa k WHERE k.conta_id = c.id),
               'previstos_recorrencia_depois', (SELECT count(*) FROM public.fin_lancamentos l WHERE l.conta_id = c.id AND l.origem = 'recorrencia' AND l.status = 'previsto') - (SELECT count(*) FROM _limpa k WHERE k.conta_id = c.id)
             ) AS x
        FROM public.fin_contas c) s),
  'por_tipo_recorrencia', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'tipo', t.tipo, 'frequencia', t.freq, 'recorrencias', t.n, 'afetadas', t.afetadas, 'removidos', t.rem)), '[]'::jsonb) FROM (
      SELECT r.tipo_recorrencia::text AS tipo, r.frequencia::text AS freq, count(*) AS n,
             count(*) FILTER (WHERE k.n > 0) AS afetadas, coalesce(sum(k.n), 0) AS rem
        FROM public.fin_recorrencias r
        LEFT JOIN (SELECT recorrencia_id, count(*) AS n FROM _limpa GROUP BY 1) k ON k.recorrencia_id = r.id
       GROUP BY 1, 2) t),
  'por_recorrencia', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'recorrencia', r.descricao, 'removidos', k.n,
        'ficam', (SELECT count(*) FROM public.fin_lancamentos l WHERE l.recorrencia_id = r.id AND l.status = 'previsto') - k.n) ORDER BY k.n DESC), '[]'::jsonb)
      FROM public.fin_recorrencias r JOIN (SELECT recorrencia_id, count(*) AS n FROM _limpa GROUP BY 1) k ON k.recorrencia_id = r.id)
) AS j;

-- cópias de segurança (só quem tem acesso total ao banco lê: RLS ligada, sem política)
CREATE TABLE IF NOT EXISTS public.fin_lancamentos_previstos_backup_20261008 AS SELECT * FROM public.fin_lancamentos WHERE false;
ALTER TABLE public.fin_lancamentos_previstos_backup_20261008 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_lancamentos_previstos_backup_20261008 FROM anon, authenticated;
INSERT INTO public.fin_lancamentos_previstos_backup_20261008
  SELECT l.* FROM public.fin_lancamentos l JOIN _limpa USING (id)
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos_previstos_backup_20261008 b WHERE b.id = l.id);

CREATE TABLE IF NOT EXISTS public.fin_recorrencias_backup_20261008 AS SELECT * FROM public.fin_recorrencias WHERE false;
ALTER TABLE public.fin_recorrencias_backup_20261008 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_recorrencias_backup_20261008 FROM anon, authenticated;
INSERT INTO public.fin_recorrencias_backup_20261008
  SELECT r.* FROM public.fin_recorrencias r
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_recorrencias_backup_20261008 b WHERE b.id = r.id);

DELETE FROM public.fin_lancamentos WHERE id IN (SELECT id FROM _limpa);

-- as recorrências "sem fim" deixam de carregar 2099-12-31 e `ultimo_gerado_ate` volta ao último previsto que sobrou
UPDATE public.fin_recorrencias r
   SET data_fim = CASE WHEN r.data_fim >= DATE '2090-01-01' THEN NULL ELSE r.data_fim END,
       ultimo_gerado_ate = (SELECT max(l.data) FROM public.fin_lancamentos l
                             WHERE l.recorrencia_id = r.id AND l.origem = 'recorrencia' AND l.status = 'previsto')
 WHERE r.tipo_recorrencia IS DISTINCT FROM 'parcelamento'
   AND (r.data_fim >= DATE '2090-01-01' OR r.ultimo_gerado_ate > ((now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '13 months')::date);

-- verificações: qualquer diferença ABORTA e desfaz tudo
DO $$
DECLARE n_saldo int; n_reais int; n_total bigint; esperado bigint;
BEGIN
  SELECT count(*) INTO n_saldo FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual;
  IF n_saldo > 0 THEN RAISE EXCEPTION 'O saldo de % conta(s) mudou — abortando (nada foi apagado)', n_saldo; END IF;

  SELECT count(*) INTO n_reais FROM (
    SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
      FROM public.fin_lancamentos WHERE status <> 'previsto' GROUP BY conta_id) d
    FULL JOIN _reais_antes a USING (conta_id)
   WHERE d.n IS DISTINCT FROM a.n OR d.soma IS DISTINCT FROM a.soma;
  IF n_reais > 0 THEN RAISE EXCEPTION 'Lançamentos realizados/conciliados mudaram em % conta(s) — abortando', n_reais; END IF;

  SELECT count(*) INTO n_total FROM public.fin_lancamentos;
  SELECT (SELECT n FROM _total_antes) - (SELECT count(*) FROM _limpa) INTO esperado;
  IF n_total <> esperado THEN RAISE EXCEPTION 'Total de lançamentos % difere do esperado % — abortando', n_total, esperado; END IF;
END $$;

-- o resultado, numa linha só (abra o JSON: "antes" é o resumo; "depois" e "verificacao" são conferências feitas depois de apagar)
SELECT jsonb_pretty(jsonb_build_object(
  'resumo', (SELECT j FROM _resumo),
  'depois', jsonb_build_object(
      'lancamentos', (SELECT count(*) FROM public.fin_lancamentos),
      'previstos_recorrencia', (SELECT count(*) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto'),
      'previsto_mais_distante', (SELECT max(data) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto'),
      'recorrencias_com_data_fim_2099', (SELECT count(*) FROM public.fin_recorrencias WHERE data_fim >= DATE '2090-01-01')),
  'backup', jsonb_build_object(
      'lancamentos', (SELECT count(*) FROM public.fin_lancamentos_previstos_backup_20261008),
      'recorrencias', (SELECT count(*) FROM public.fin_recorrencias_backup_20261008)),
  'verificacao', jsonb_build_object(
      'saldos_alterados', (SELECT count(*) FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual),
      'resultado', 'todas as verificações passaram')
)) AS resultado;

COMMIT;
