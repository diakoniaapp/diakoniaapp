-- ENSAIO: roda tudo e DESFAZ (ROLLBACK). O resultado em uma linha mostra o que a limpeza faria. NADA fica gravado.
-- ─── Limpeza dos lançamentos PREVISTOS de recorrência além de 12 meses ───────────────────────────────────────────
-- Medido em 08/10/2026: 29.917 previstos de recorrência, 29.460 deles a mais de 12 meses de hoje (até dez/2099), todos criados em
-- 06–07/10 pelo gerador do app, que tratou `data_fim = 2099-12-31` (marcador de "sem fim" do legado) como data final real. São 69% de
-- todos os lançamentos do sistema. Esta limpeza apaga SÓ o que sobra além do horizonte de 12 meses:
--   · status = 'previsto' e origem = 'recorrencia' (nunca realizado/conciliado, nunca lançamento manual/importado);
--   · não é parcela de parcelamento (parcela_numero IS NULL) e a recorrência é contínua SEM data final real;
--   · sem anexo, rateio, folha, fiscal, estoque nem arrecadação ligados;
--   · antes de apagar, copia tudo para `fin_lancamentos_previstos_backup_20261008` (dá para restaurar).
-- Depois: a data final 2099 das 34 recorrências vira NULL ("sem data final") e `ultimo_gerado_ate` volta ao último previsto que sobrou.
-- Os saldos NÃO mudam (previsto não entra em `saldo_atual`); o script confere isso e aborta se algum saldo mudar.
-- Aplicar DEPOIS da migration 20261008150000 (gatilho de saldo ignora previstos): sem ela, cada linha apagada recalcula o saldo da conta.

BEGIN;

CREATE TEMP TABLE _saldos_antes ON COMMIT DROP AS SELECT id, saldo_atual FROM public.fin_contas;
CREATE TEMP TABLE _antes ON COMMIT DROP AS
  SELECT count(*) AS lancamentos,
         count(*) FILTER (WHERE origem = 'recorrencia' AND status = 'previsto') AS previstos_rec
    FROM public.fin_lancamentos;

CREATE TEMP TABLE _limpa ON COMMIT DROP AS
SELECT l.id
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

-- cópia de segurança (só quem tem acesso total ao banco lê: RLS ligada, sem política)
CREATE TABLE IF NOT EXISTS public.fin_lancamentos_previstos_backup_20261008 AS
  SELECT * FROM public.fin_lancamentos WHERE false;
ALTER TABLE public.fin_lancamentos_previstos_backup_20261008 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_lancamentos_previstos_backup_20261008 FROM anon, authenticated;
INSERT INTO public.fin_lancamentos_previstos_backup_20261008
  SELECT l.* FROM public.fin_lancamentos l JOIN _limpa USING (id)
   WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos_previstos_backup_20261008 b WHERE b.id = l.id);

DELETE FROM public.fin_lancamentos WHERE id IN (SELECT id FROM _limpa);

-- as recorrências "sem fim" deixam de carregar 2099-12-31 e `ultimo_gerado_ate` volta ao último previsto que sobrou
UPDATE public.fin_recorrencias r
   SET data_fim = CASE WHEN r.data_fim >= DATE '2090-01-01' THEN NULL ELSE r.data_fim END,
       ultimo_gerado_ate = (SELECT max(l.data) FROM public.fin_lancamentos l
                             WHERE l.recorrencia_id = r.id AND l.origem = 'recorrencia' AND l.status = 'previsto')
 WHERE r.tipo_recorrencia IS DISTINCT FROM 'parcelamento'
   AND (r.data_fim >= DATE '2090-01-01' OR r.ultimo_gerado_ate > ((now() AT TIME ZONE 'America/Sao_Paulo')::date + interval '13 months')::date);

-- saldo não pode ter mudado
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual;
  IF n > 0 THEN RAISE EXCEPTION 'O saldo de % conta(s) mudou — abortando (nada foi apagado)', n; END IF;
END $$;

-- o resultado, numa linha só
SELECT jsonb_build_object(
  'lancamentos_antes',       (SELECT lancamentos FROM _antes),
  'previstos_rec_antes',     (SELECT previstos_rec FROM _antes),
  'apagados',                (SELECT count(*) FROM _limpa),
  'lancamentos_depois',      (SELECT count(*) FROM public.fin_lancamentos),
  'previstos_rec_depois',    (SELECT count(*) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto'),
  'previstos_rec_mais_distante', (SELECT max(data) FROM public.fin_lancamentos WHERE origem = 'recorrencia' AND status = 'previsto'),
  'recorrencias_com_data_fim_2099_depois', (SELECT count(*) FROM public.fin_recorrencias WHERE data_fim >= DATE '2090-01-01'),
  'backup_linhas',           (SELECT count(*) FROM public.fin_lancamentos_previstos_backup_20261008),
  'saldos_alterados',        (SELECT count(*) FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual)
) AS resultado;

ROLLBACK;
