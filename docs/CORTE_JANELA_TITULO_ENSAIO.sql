-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- Roda o corte da série do Título na janela de 12 meses CONTRA OS DADOS REAIS dentro de uma transação que será desfeita: confere que saem exatamente os 866 previstos
-- depois de 13/10/2027, que a série termina em 03/10/2027 com "gerado até" igual, e que o ROLLBACK devolve tudo. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  alvos uuid[]; n bigint; esperado constant bigint := 866; apagados bigint;
  lote_nome constant text := 'titulo-janela-12-meses-20261013';
  rel text := ''; ok boolean := true;
  total_antes bigint; total_depois bigint; ultima date; gerado date; gerado_antes date; h_antes text; h_depois text; t0 timestamptz := clock_timestamp();
BEGIN
  SELECT count(*) INTO total_antes FROM public.fin_lancamentos;
  SELECT ultimo_gerado_ate INTO gerado_antes FROM public.fin_recorrencias WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_competencia, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid) t;
  rel := format('ANTES: %s lançamentos; "gerado até" = %s.', total_antes, gerado_antes);

  CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
    id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)
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

  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT max(data) INTO ultima FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  SELECT ultimo_gerado_ate INTO gerado FROM public.fin_recorrencias WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  rel := rel || format(' DEPOIS: %s lançamentos (-%s); a série vai até %s e "gerado até" = %s; a limpeza levou %s s.', total_depois, total_antes - total_depois, ultima, gerado, round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1));
  IF total_antes - total_depois <> esperado THEN ok := false; rel := rel || ' FALHOU: não saíram exatamente 866 linhas.'; END IF;
  IF ultima <> '2027-10-03'::date OR gerado <> '2027-10-03'::date THEN ok := false; rel := rel || ' FALHOU: a série não termina em 03/10/2027 ou o "gerado até" não bate.'; END IF;

  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  UPDATE public.fin_recorrencias r SET ultimo_gerado_ate = (b.linha->>'ultimo_gerado_ate')::date
    FROM public.fin_limpeza_backup b WHERE b.lote = lote_nome AND b.tabela = 'fin_recorrencias' AND r.id = (b.linha->>'id')::uuid;
  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT ultimo_gerado_ate INTO gerado FROM public.fin_recorrencias WHERE id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_competencia, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE recorrencia_id = '38c1abed-ae19-4855-9ca7-5cee2382b842'::uuid) t;
  IF total_depois <> total_antes OR h_depois IS DISTINCT FROM h_antes OR gerado IS DISTINCT FROM gerado_antes THEN ok := false; rel := rel || ' FALHOU: o rollback não devolveu tudo como estava.'; ELSE rel := rel || ' O rollback devolve a série e o "gerado até" exatamente como estavam.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
