-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela e do ensaio TUDO OK.
-- LIMPEZA do Título de Capitalização Bradesco: a série tem DOIS previstos por mês (dia 02 e dia 03) de nov/2026 a dez/2099. A recorrência vence no dia 3;
-- os previstos do dia 02 (878) sobraram de uma geração anterior. Guarda o backup em fin_limpeza_backup e apaga SÓ eles; os do dia 03 ficam.
-- Se qualquer um mudou desde o levantamento, aborta SEM alterar nada. Para desfazer: docs/LIMPEZA_TITULO_CAPITALIZACAO_ROLLBACK.sql.
CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
  id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)

DO $limpeza$
DECLARE
  alvos uuid[]; n bigint; esperado constant bigint := 878; apagados bigint;
  lote_nome constant text := 'titulo-capitalizacao-20261013';
BEGIN
  -- os alvos: os previstos do DIA 02 da série do Título (o dia certo é o 03: dia_vencimento da recorrência; o 02 sobrou de uma geração anterior)
  SELECT array_agg(l.id) INTO alvos FROM public.fin_lancamentos l
   WHERE l.recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid AND l.status = 'previsto' AND extract(day FROM l.data) = 2;
  n := coalesce(array_length(alvos, 1), 0);
  IF n = 0 AND EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE NOTICE 'Limpeza já aplicada: nada a fazer.'; RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_recorrencias WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid AND dia_vencimento = 3) THEN RAISE EXCEPTION 'ABORTADO: a recorrência do Título não vence mais no dia 3. Nada foi alterado.'; END IF;
  IF n <> esperado THEN RAISE EXCEPTION 'ABORTADO: esperava % previstos do dia 02 e encontrei %. Nada foi alterado.', esperado, n; END IF;

  -- guarda: nenhum alvo foi pago, tem observação, anexo, filha ou vínculo — e TODO alvo tem a irmã do dia 03 (mesmo mês de competência) que fica
  SELECT count(*) INTO n FROM public.fin_lancamentos l
   WHERE l.id = ANY(alvos) AND l.liquidacao_id IS NULL AND l.observacoes IS NULL AND (l.obrigacao_id IS NULL OR l.obrigacao_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> l.id AND (f.lancamento_pai_id = l.id OR f.obrigacao_id = l.id))
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos o WHERE o.recorrencia_id = l.recorrencia_id AND o.status = 'previsto' AND extract(day FROM o.data) = 3
                    AND date_trunc('month', o.data_competencia) = date_trunc('month', l.data_competencia));
  IF n <> esperado THEN RAISE EXCEPTION 'ABORTADO: algum previsto do dia 02 mudou (pago, com anexo ou observação) ou ficaria sem a irmã do dia 03. Nada foi alterado.'; END IF;

  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_lancamentos', to_jsonb(l) FROM public.fin_lancamentos l WHERE l.id = ANY(alvos);
  DELETE FROM public.fin_lancamentos WHERE id = ANY(alvos);
  GET DIAGNOSTICS apagados = ROW_COUNT;
  IF apagados <> esperado THEN RAISE EXCEPTION 'ABORTADO: apagou % linhas em vez de % (a transação inteira é desfeita).', apagados, esperado; END IF;
  RAISE NOTICE 'Limpeza aplicada: % previstos do dia 02 removidos; backup no lote %.', apagados, lote_nome;
END
$limpeza$;
