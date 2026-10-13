-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela e do ensaio TUDO OK.
-- CORTE da série do Título de Capitalização na janela de 12 meses. A série "sem fim" foi gerada até dez/2099 (legado: data final 2099-12-31); o sistema mantém só 12 meses
-- à frente e renova sozinho. Apaga os 866 previstos depois de 13/10/2027, guarda o backup em fin_limpeza_backup e acerta "gerado até" para 03/10/2027 (senão o app
-- nunca renovaria). Os previstos até 03/10/2027 ficam. Se algo mudou desde o levantamento, aborta SEM alterar nada. Para desfazer: docs/CORTE_JANELA_TITULO_ROLLBACK.sql.
CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
  id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)

DO $corte$
DECLARE
  alvos uuid[]; n bigint; esperado constant bigint := 866; apagados bigint;
  lote_nome constant text := 'titulo-janela-12-meses-20261013';
BEGIN
  -- os alvos: os previstos da série do Título DEPOIS da janela de 12 meses (13/10/2027). O legado gravou "sem fim" como 2099-12-31 e a série foi gerada até dez/2099.
  SELECT array_agg(l.id) INTO alvos FROM public.fin_lancamentos l
   WHERE l.recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid AND l.status = 'previsto' AND l.data > '2027-10-13'::date;
  n := coalesce(array_length(alvos, 1), 0);
  IF n = 0 AND EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE NOTICE 'Corte já aplicado: nada a fazer.'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_recorrencias WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid AND ativo AND coalesce(tipo_recorrencia, 'continua') = 'continua' AND (data_fim IS NULL OR data_fim >= '2090-01-01'::date)) THEN
    RAISE EXCEPTION 'ABORTADO: a recorrência do Título não é mais uma série contínua sem fim (ativa). Nada foi alterado.'; END IF;
  IF n <> esperado THEN RAISE EXCEPTION 'ABORTADO: esperava % previstos além da janela e encontrei %. Nada foi alterado.', esperado, n; END IF;

  -- guarda: nenhum alvo foi pago, tem observação, anexo, filha ou vínculo; e a série mantém o previsto de 03/10/2027 (o que fica)
  SELECT count(*) INTO n FROM public.fin_lancamentos l
   WHERE l.id = ANY(alvos) AND l.liquidacao_id IS NULL AND l.observacoes IS NULL AND (l.obrigacao_id IS NULL OR l.obrigacao_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> l.id AND (f.lancamento_pai_id = l.id OR f.obrigacao_id = l.id));
  IF n <> esperado THEN RAISE EXCEPTION 'ABORTADO: algum previsto além da janela mudou (pago, com anexo ou observação). Nada foi alterado.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid AND data = '2027-10-03'::date) THEN RAISE EXCEPTION 'ABORTADO: a série não tem o previsto de 03/10/2027 que deveria ficar. Nada foi alterado.'; END IF;

  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_lancamentos', to_jsonb(l) FROM public.fin_lancamentos l WHERE l.id = ANY(alvos);
  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_recorrencias', to_jsonb(r) FROM public.fin_recorrencias r WHERE r.id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  DELETE FROM public.fin_lancamentos WHERE id = ANY(alvos);
  GET DIAGNOSTICS apagados = ROW_COUNT;
  IF apagados <> esperado THEN RAISE EXCEPTION 'ABORTADO: apagou % linhas em vez de % (a transação inteira é desfeita).', apagados, esperado; END IF;
  -- o marcador "gerado até" volta a dizer a verdade: sem isso o app acharia a janela cheia até 2099 e NUNCA renovaria a série
  UPDATE public.fin_recorrencias SET ultimo_gerado_ate = '2027-10-03'::date WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  RAISE NOTICE 'Corte aplicado: % previstos além da janela removidos; backup no lote %.', apagados, lote_nome;
END
$corte$;
