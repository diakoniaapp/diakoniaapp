-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- Roda a limpeza das duplicatas de recorrência CONTRA OS DADOS REAIS dentro de uma transação que será desfeita, e confere: (1) as 6 linhas saem e só elas;
-- (2) os 3 boletos passam para o pagamento verdadeiro; (3) o saldo da conta sobe exatamente o valor das 3 despesas duplicadas (R$ 1.424,72);
-- (4) o ROLLBACK devolve tudo como estava (linhas e anexos). Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE

  -- 3 PREVISTOS repetidos: Carreta 13/10, ABC 13/10 e Prefeitura 1/3 de 06/09 (a parcela 1/3 já foi paga em 30/09)
  previstos uuid[] := ARRAY['602556cf-1e7c-4fab-a3d3-637862f1a765', 'd75efaaf-5a6e-45c5-ab3f-527879819639', 'a30974d3-8f68-4462-b134-5f69bcfe5881']::uuid[];
  -- 3 PAGAMENTOS marcados à mão em 09/10 (sem data de pagamento, sem liquidação) — o pagamento de verdade é o de 10/10, liquidado em 11/10
  fantasmas uuid[] := ARRAY['51bbaeb9-279f-481c-9c5f-e6482bfa859c', '0b78ca8f-230d-46ba-9cad-2ac386cba2de', 'ce3b9de9-8efc-4ae8-88e6-f8c8fe2efede']::uuid[];
  pagos uuid[]     := ARRAY['788dd2f3-301b-484f-9126-7bd33a537e6c', 'cc8ad665-606b-4f9f-96d8-4edcbb7afebd', 'be714ddb-e64e-4af4-bfa1-a318eb5ff362']::uuid[];
  alvos uuid[]; i int; n int; apagados int;
  lote_nome constant text := 'recorrencias-duplicadas-20261013';
  rel text := ''; ok boolean := true;
  total_antes bigint; total_depois bigint; anexos_antes bigint; anexos_depois bigint; anexos_pagos bigint;
  saldo_antes numeric; saldo_depois numeric; conta uuid; h_antes text; h_depois text; ha_antes text; ha_depois text;
BEGIN
  alvos := previstos || fantasmas;
  SELECT count(*) INTO total_antes FROM public.fin_lancamentos;
  SELECT count(*) INTO anexos_antes FROM public.fin_lancamento_anexos;
  SELECT conta_id INTO conta FROM public.fin_lancamentos WHERE id = fantasmas[1];
  SELECT saldo_atual INTO saldo_antes FROM public.fin_contas WHERE id = conta;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE id = ANY(alvos)) t;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO ha_antes FROM (SELECT id, lancamento_id, url FROM public.fin_lancamento_anexos WHERE lancamento_id = ANY(fantasmas || pagos)) t;
  rel := format('ANTES: %s lançamentos, %s anexos; saldo da conta %s.', total_antes, anexos_antes, saldo_antes);

  -- ── a tabela de backup e a limpeza ──
  CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
    id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)
  COMMENT ON TABLE public.fin_limpeza_backup IS 'Linhas removidas por limpezas pontuais de dados, em JSON, para desfazer. Nunca apagar.';
  alvos := previstos || fantasmas;
  -- já aplicado? (as linhas somem e o backup fica)
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE id = ANY(alvos);
  IF n = 0 AND EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE NOTICE 'Limpeza já aplicada: nada a fazer.'; RETURN; END IF;
  IF n <> 6 THEN RAISE EXCEPTION 'ABORTADO: esperava encontrar as 6 despesas e encontrei %. Nada foi alterado.', n; END IF;

  -- guarda 1: os 3 previstos continuam previstos, sem pagamento, sem anexo, sem filhas, e a OCORRÊNCIA DELES já tem outra linha na mesma recorrência
  SELECT count(*) INTO n FROM public.fin_lancamentos l
   WHERE l.id = ANY(previstos) AND l.status = 'previsto' AND l.liquidacao_id IS NULL AND l.observacoes IS NULL AND l.recorrencia_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = l.id)
     AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos f WHERE f.id <> l.id AND (f.lancamento_pai_id = l.id OR f.obrigacao_id = l.id))
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos o WHERE o.id <> l.id AND o.recorrencia_id = l.recorrencia_id AND date_trunc('month', o.data_competencia) = date_trunc('month', l.data_competencia));
  IF n <> 3 THEN RAISE EXCEPTION 'ABORTADO: algum dos 3 previstos mudou (pago, com anexo, ou sem a outra ocorrência do mês). Nada foi alterado.'; END IF;

  -- guarda 2: cada pagamento de 09/10 ainda é "realizado" SEM data de pagamento nem liquidação, e tem um par: mesma recorrência, mesmo valor, mês de competência igual, já LIQUIDADO
  FOR i IN 1..3 LOOP
    SELECT count(*) INTO n FROM public.fin_lancamentos f
      JOIN public.fin_lancamentos p ON p.id = pagos[i] AND p.recorrencia_id = f.recorrencia_id AND p.valor = f.valor AND p.liquidacao_id IS NOT NULL
       AND date_trunc('month', p.data_competencia) = date_trunc('month', f.data_competencia)
     WHERE f.id = fantasmas[i] AND f.status = 'realizado' AND f.liquidacao_id IS NULL AND f.data_pagamento IS NULL AND f.observacoes IS NULL;
    IF n <> 1 THEN RAISE EXCEPTION 'ABORTADO: o par % não confere (a despesa marcada à mão ou o pagamento liquidado mudou). Nada foi alterado.', i; END IF;
  END LOOP;

  -- o backup das linhas ANTES de mexer (uma tabela que a API não lê nem escreve)
  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_lancamentos', to_jsonb(l) FROM public.fin_lancamentos l WHERE l.id = ANY(alvos);
  INSERT INTO public.fin_limpeza_backup (lote, tabela, linha) SELECT lote_nome, 'fin_lancamento_anexos', to_jsonb(a) FROM public.fin_lancamento_anexos a WHERE a.lancamento_id = ANY(fantasmas);

  -- os boletos anexados à despesa marcada à mão passam para o pagamento de verdade (nada se perde); depois saem as 6 linhas
  FOR i IN 1..3 LOOP UPDATE public.fin_lancamento_anexos SET lancamento_id = pagos[i] WHERE lancamento_id = fantasmas[i]; END LOOP;
  DELETE FROM public.fin_lancamentos WHERE id = ANY(alvos);
  GET DIAGNOSTICS apagados = ROW_COUNT;
  IF apagados <> 6 THEN RAISE EXCEPTION 'ABORTADO: apagou % linhas em vez de 6 (a transação inteira é desfeita).', apagados; END IF;

  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT count(*) INTO anexos_depois FROM public.fin_lancamento_anexos;
  SELECT count(*) INTO anexos_pagos FROM public.fin_lancamento_anexos WHERE lancamento_id = ANY(pagos);
  SELECT saldo_atual INTO saldo_depois FROM public.fin_contas WHERE id = conta;
  rel := rel || format(' DEPOIS: %s lançamentos (-%s), %s anexos (os mesmos), %s anexos nos pagamentos verdadeiros; saldo %s (%s).', total_depois, total_antes - total_depois, anexos_depois, anexos_pagos, saldo_depois, saldo_depois - saldo_antes);
  IF total_antes - total_depois <> 6 THEN ok := false; rel := rel || ' FALHOU: não saíram exatamente 6 linhas.'; END IF;
  IF anexos_depois <> anexos_antes THEN ok := false; rel := rel || ' FALHOU: algum anexo se perdeu.'; END IF;
  IF saldo_depois - saldo_antes <> 1424.72 THEN ok := false; rel := rel || ' FALHOU: o saldo não subiu R$ 1.424,72 (pode haver outro efeito no saldo).'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE id = ANY(alvos)) THEN ok := false; rel := rel || ' FALHOU: sobrou alguma das 6.'; END IF;

  -- ── o ROLLBACK devolve tudo ──
  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  UPDATE public.fin_lancamento_anexos a SET lancamento_id = (b.linha->>'lancamento_id')::uuid
    FROM public.fin_limpeza_backup b WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamento_anexos' AND a.id = (b.linha->>'id')::uuid;
  SELECT count(*) INTO total_depois FROM public.fin_lancamentos;
  SELECT saldo_atual INTO saldo_depois FROM public.fin_contas WHERE id = conta;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO h_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, recorrencia_id, liquidacao_id FROM public.fin_lancamentos WHERE id = ANY(alvos)) t;
  SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY id), '')) INTO ha_depois FROM (SELECT id, lancamento_id, url FROM public.fin_lancamento_anexos WHERE lancamento_id = ANY(fantasmas || pagos)) t;
  IF total_depois <> total_antes OR h_depois IS DISTINCT FROM h_antes OR ha_depois IS DISTINCT FROM ha_antes OR saldo_depois <> saldo_antes
    THEN ok := false; rel := rel || ' FALHOU: o rollback não devolveu tudo como estava.'; ELSE rel := rel || ' O rollback devolve linhas, anexos e saldo exatamente como estavam.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
