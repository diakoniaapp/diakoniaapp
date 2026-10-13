-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- Roda a limpeza do Título de Capitalização CONTRA OS DADOS REAIS dentro de uma transação que será desfeita: confere que saem exatamente os 878 previstos do dia 02,
-- que cada mês continua com UM previsto (o do dia 03) e que o ROLLBACK devolve tudo como estava. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  alvos uuid[]; n bigint; esperado constant bigint := 878; apagados bigint;
  lote_nome constant text := 'titulo-capitalizacao-20261013';
  rel text := ''; ok boolean := true;
  total_antes bigint; total_depois bigint; meses_dup bigint; meses_total bigint; da_serie_antes bigint; da_serie_depois bigint; h_antes text; h_depois text; t0 timestamptz := clock_timestamp();
BEGIN
  SELECT count(*) INTO total_antes FROM public.fin_lancamentos;
  SELECT count(*) INTO da_serie_antes FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_competencia, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid) t;
  rel := format('ANTES: %s lançamentos (%s da série do Título).', total_antes, da_serie_antes);

  CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
    id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)
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

  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT count(*) INTO da_serie_depois FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  SELECT count(*) FILTER (WHERE c > 1), count(*) INTO meses_dup, meses_total FROM (
    SELECT date_trunc('month', data_competencia) m, count(*) c FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid GROUP BY 1) x;
  rel := rel || format(' DEPOIS: %s lançamentos (-%s); a série ficou com %s linhas em %s meses, %s meses ainda com mais de uma; a limpeza levou %s s.', total_depois, total_antes - total_depois, da_serie_depois, meses_total, meses_dup, round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1));
  IF total_antes - total_depois <> esperado THEN ok := false; rel := rel || ' FALHOU: não saíram exatamente 878 linhas.'; END IF;
  IF meses_dup <> 0 THEN ok := false; rel := rel || ' FALHOU: sobrou mês com mais de um previsto.'; END IF;

  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_competencia, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid) t;
  IF total_depois <> total_antes OR h_depois IS DISTINCT FROM h_antes THEN ok := false; rel := rel || ' FALHOU: o rollback não devolveu tudo como estava.'; ELSE rel := rel || ' O rollback devolve a série exatamente como estava.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
