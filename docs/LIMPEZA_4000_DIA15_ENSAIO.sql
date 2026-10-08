-- ENSAIO (não grava nada) — termina SEMPRE com um erro de propósito: "ENSAIO CONCLUÍDO (nada foi gravado)" seguido do resultado.
-- É um comando só: o SQL Editor do Supabase não segura BEGIN/ROLLBACK nem tabela temporária entre comandos.
-- ─── Limpeza dos 12 previstos de R$ 4.000 do dia 15 (recorrência encerrada do Pastor Titular) ───────────────────────────
-- A recorrência "Lucio Paulo Paz Barreto — R$ 4.000, dia 15" (d4dbbbc6…) foi ENCERRADA em 08/10/2026 (data_fim = 2026-09-15): esse valor passou a ser o
-- adiantamento lançado na competência do Sustento, e o líquido vem do fechamento. Sobraram os 12 previstos já gerados, de 15/10/2026 a 15/09/2027 — obrigações
-- de R$ 4.000 que ninguém vai pagar. Este comando os remove.
-- Segurança (um comando só — qualquer verificação que falhe desfaz tudo):
--   · só age se encontrar EXATAMENTE 12 previstos dessa recorrência, de 15/10/2026 a 15/09/2027, de R$ 4.000,00, todos de origem 'recorrencia';
--   · não apaga nada com anexo, rateio, folha, fiscal, estoque, arrecadação, liquidação, filho, nem o que for a obrigação de uma competência do Sustento;
--   · copia as 12 linhas para fin_lancamentos_previstos_4000_backup_20261008 (RLS ligada, sem acesso do app) — o desfazer está em LIMPEZA_4000_DIA15_ROLLBACK.sql;
--   · confere que NENHUM saldo mudou, que os lançamentos reais (realizado/conciliado) não mudaram e que o total caiu exatamente 12.

DO $ensaio$
DECLARE
  v_rec uuid := 'd4dbbbc6-62d9-42bd-89df-ea01b234a4d9';
  resultado text; n int;
  n_antes bigint; n_depois bigint; n_saldo int; n_reais int; soma numeric;
BEGIN
  -- fotografia do que NÃO pode mudar
  CREATE TEMP TABLE _saldos_antes ON COMMIT DROP AS SELECT id, saldo_atual FROM public.fin_contas;
  CREATE TEMP TABLE _reais_antes ON COMMIT DROP AS
    SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
      FROM public.fin_lancamentos WHERE status <> 'previsto' GROUP BY conta_id;
  SELECT count(*) INTO n_antes FROM public.fin_lancamentos;

  -- o que será removido
  CREATE TEMP TABLE _alvo ON COMMIT DROP AS
  SELECT l.id, l.data, l.valor FROM public.fin_lancamentos l
   WHERE l.recorrencia_id = v_rec AND l.status = 'previsto' AND l.origem = 'recorrencia' AND l.data > DATE '2026-09-15'
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.sustento_pagamentos x WHERE x.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.sustento_competencias x WHERE x.obrigacao_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id OR x.lancamento_pai_id = l.id)
     AND l.liquidacao_id IS NULL;

  -- a trava: exatamente os 12 revisados
  SELECT count(*), coalesce(sum(valor), 0) INTO n, soma FROM _alvo;
  IF n <> 12 OR soma <> 48000.00 THEN RAISE EXCEPTION 'Encontrei % previstos somando % (esperado 12 somando 48.000,00) — abortando', n, soma; END IF;
  IF EXISTS (SELECT 1 FROM _alvo WHERE valor <> 4000.00) THEN RAISE EXCEPTION 'Algum previsto não é de R$ 4.000,00 — abortando'; END IF;
  IF (SELECT min(data) FROM _alvo) <> DATE '2026-10-15' OR (SELECT max(data) FROM _alvo) <> DATE '2027-09-15' THEN
    RAISE EXCEPTION 'As datas dos previstos (% a %) não são as revisadas (15/10/2026 a 15/09/2027) — abortando', (SELECT min(data) FROM _alvo), (SELECT max(data) FROM _alvo);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_recorrencias WHERE id = v_rec AND data_fim = DATE '2026-09-15') THEN
    RAISE EXCEPTION 'A recorrência não está encerrada em 15/09/2026 — abortando';
  END IF;

  -- backup (RLS ligada, sem política: só quem tem acesso total ao banco lê)
  CREATE TABLE IF NOT EXISTS public.fin_lancamentos_previstos_4000_backup_20261008 AS SELECT * FROM public.fin_lancamentos WHERE false;
  ALTER TABLE public.fin_lancamentos_previstos_4000_backup_20261008 ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.fin_lancamentos_previstos_4000_backup_20261008 FROM anon, authenticated;
  INSERT INTO public.fin_lancamentos_previstos_4000_backup_20261008
    SELECT l.* FROM public.fin_lancamentos l JOIN _alvo USING (id)
     WHERE NOT EXISTS (SELECT 1 FROM public.fin_lancamentos_previstos_4000_backup_20261008 b WHERE b.id = l.id);

  DELETE FROM public.fin_lancamentos WHERE id IN (SELECT id FROM _alvo);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 12 THEN RAISE EXCEPTION 'Removi % lançamentos (esperado 12) — abortando', n; END IF;

  -- verificações
  SELECT count(*) INTO n_saldo FROM public.fin_contas c JOIN _saldos_antes s USING (id) WHERE c.saldo_atual IS DISTINCT FROM s.saldo_atual;
  IF n_saldo > 0 THEN RAISE EXCEPTION 'O saldo de % conta(s) mudou — abortando', n_saldo; END IF;
  SELECT count(*) INTO n_reais FROM (
    SELECT conta_id, count(*) AS n, coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) AS soma
      FROM public.fin_lancamentos WHERE status <> 'previsto' GROUP BY conta_id) d
    FULL JOIN _reais_antes a USING (conta_id)
   WHERE d.n IS DISTINCT FROM a.n OR d.soma IS DISTINCT FROM a.soma;
  IF n_reais > 0 THEN RAISE EXCEPTION 'Lançamentos realizados/conciliados mudaram em % conta(s) — abortando', n_reais; END IF;
  SELECT count(*) INTO n_depois FROM public.fin_lancamentos;
  IF n_depois <> n_antes - 12 THEN RAISE EXCEPTION 'Total de lançamentos % difere do esperado % — abortando', n_depois, n_antes - 12; END IF;

  resultado := jsonb_pretty(jsonb_build_object(
    'removidos', 12, 'valor_removido', 48000.00,
    'lancamentos', jsonb_build_object('antes', n_antes, 'depois', n_depois),
    'recorrencia', (SELECT jsonb_build_object('descricao', descricao, 'valor', valor, 'dia', dia_vencimento, 'data_fim', data_fim) FROM public.fin_recorrencias WHERE id = v_rec),
    'previstos_que_restam_da_recorrencia', (SELECT count(*) FROM public.fin_lancamentos WHERE recorrencia_id = v_rec AND status = 'previsto'),
    'lancamento_conciliado_da_recorrencia_intacto', (SELECT count(*) FROM public.fin_lancamentos WHERE recorrencia_id = v_rec AND status = 'conciliado'),
    'obrigacoes_atrasadas_depois', (SELECT jsonb_build_object('quantidade', count(*), 'valor', coalesce(sum(valor), 0)) FROM public.fin_lancamentos
        WHERE status = 'previsto' AND tipo = 'saida' AND data < (now() AT TIME ZONE 'America/Sao_Paulo')::date),
    'saldos_por_conta', (SELECT jsonb_agg(jsonb_build_object('conta', c.nome, 'antes', s.saldo_atual, 'depois', c.saldo_atual, 'mudou', c.saldo_atual IS DISTINCT FROM s.saldo_atual) ORDER BY c.nome)
                           FROM public.fin_contas c JOIN _saldos_antes s USING (id)),
    'sustento_setembro_do_titular', (SELECT jsonb_build_object('saldo_a_pagar', saldo_a_pagar) FROM public.vw_sustento_conta_corrente WHERE competencia = DATE '2026-09-01' AND tipo = 'pastor_titular'),
    'backup_linhas', (SELECT count(*) FROM public.fin_lancamentos_previstos_4000_backup_20261008),
    'verificacoes', 'todas passaram (se alguma falhasse, o comando teria abortado com erro)'));

  RAISE EXCEPTION E'ENSAIO CONCLUÍDO (nada foi gravado)\n%', resultado;
END
$ensaio$;
