-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela e do ensaio TUDO OK.
-- LIMPEZA das duplicatas de recorrência de 13/10/2026. Faz, tudo ou nada:
--   1) guarda em fin_limpeza_backup as 6 linhas e os anexos que vão mexer;
--   2) apaga 3 PREVISTOS repetidos (Carreta 13/10, ABC 13/10, Prefeitura 1/3 de 06/09);
--   3) passa os 3 boletos das despesas marcadas à mão em 09/10 para o pagamento verdadeiro de 10/10 e apaga essas 3 despesas
--      (Precisão R$ 984,72, Elevador R$ 350,00, Iguaçu Psique R$ 90,00 — a mesma despesa contada duas vezes em outubro).
-- Se qualquer despesa mudou desde o levantamento, aborta SEM alterar nada. Para desfazer: docs/LIMPEZA_DUPLICATAS_RECORRENCIA_ROLLBACK.sql.
CREATE TABLE IF NOT EXISTS public.fin_limpeza_backup (
  id bigserial PRIMARY KEY, lote text NOT NULL, tabela text NOT NULL, linha jsonb NOT NULL, removido_em timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.fin_limpeza_backup ENABLE ROW LEVEL SECURITY;   -- sem política: só o banco lê e escreve (patrimônio da limpeza, nunca apagado)
COMMENT ON TABLE public.fin_limpeza_backup IS 'Linhas removidas por limpezas pontuais de dados, em JSON, para desfazer. Nunca apagar.';

DO $limpeza$
DECLARE

  -- 3 PREVISTOS repetidos: Carreta 13/10, ABC 13/10 e Prefeitura 1/3 de 06/09 (a parcela 1/3 já foi paga em 30/09)
  previstos uuid[] := ARRAY['602556cf-1e7c-4fab-a3d3-637862f1a765', 'd75efaaf-5a6e-45c5-ab3f-527879819639', 'a30974d3-8f68-4462-b134-5f69bcfe5881']::uuid[];
  -- 3 PAGAMENTOS marcados à mão em 09/10 (sem data de pagamento, sem liquidação) — o pagamento de verdade é o de 10/10, liquidado em 11/10
  fantasmas uuid[] := ARRAY['51bbaeb9-279f-481c-9c5f-e6482bfa859c', '0b78ca8f-230d-46ba-9cad-2ac386cba2de', 'ce3b9de9-8efc-4ae8-88e6-f8c8fe2efede']::uuid[];
  pagos uuid[]     := ARRAY['788dd2f3-301b-484f-9126-7bd33a537e6c', 'cc8ad665-606b-4f9f-96d8-4edcbb7afebd', 'be714ddb-e64e-4af4-bfa1-a318eb5ff362']::uuid[];
  alvos uuid[]; i int; n int; apagados int;
  lote_nome constant text := 'recorrencias-duplicadas-20261013';
BEGIN
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
  RAISE NOTICE 'Limpeza aplicada: 3 previstos e 3 despesas duplicadas removidos; backup no lote %.', lote_nome;
END
$limpeza$;
