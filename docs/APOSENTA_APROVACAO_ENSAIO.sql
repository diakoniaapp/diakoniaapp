-- ENSAIO — aposentar o estado "aguardando_aprovacao" (nada fica gravado: termina em ROLLBACK).
-- Rode TUDO no editor SQL do Supabase e cole o resultado da última linha (a tabela "resultado").
BEGIN;

CREATE TEMP TABLE resultado (passo text, ok boolean, detalhe text) ON COMMIT DROP;

DO $ens$
DECLARE antes bigint; id1 uuid; falhou boolean := false; msg text;
BEGIN
  SELECT count(*) INTO antes FROM public.fin_lancamentos;

  -- 1) a trava de pré-requisito: hoje não há nenhum lançamento nesse estado
  INSERT INTO resultado VALUES ('0. lançamentos "aguardando" antes', (SELECT count(*) FROM public.fin_lancamentos WHERE status::text = 'aguardando_aprovacao') = 0,
    (SELECT count(*)::text FROM public.fin_lancamentos WHERE status::text = 'aguardando_aprovacao'));

  -- 2) aplica a restrição (o corpo da migration)
  ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS fin_lancamentos_sem_aprovacao_legada;
  ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_sem_aprovacao_legada CHECK (status::text <> 'aguardando_aprovacao');
  INSERT INTO resultado VALUES ('1. restrição criada', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_sem_aprovacao_legada'), NULL);

  -- 3) tentar voltar um lançamento previsto para "aguardando_aprovacao" tem de ser recusado
  SELECT id INTO id1 FROM public.fin_lancamentos WHERE status::text = 'previsto' AND tipo::text = 'saida' LIMIT 1;
  BEGIN
    UPDATE public.fin_lancamentos SET status = 'aguardando_aprovacao' WHERE id = id1;
  EXCEPTION WHEN check_violation THEN falhou := true; msg := SQLERRM;
  END;
  INSERT INTO resultado VALUES ('2. gravar "aguardando" é recusado', falhou, msg);

  -- 4) os estados de verdade continuam gravando (previsto -> realizado -> previsto, dentro da transação)
  UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = id1;
  INSERT INTO resultado VALUES ('3. os outros estados seguem valendo', (SELECT status::text FROM public.fin_lancamentos WHERE id = id1) = 'previsto', NULL);

  -- 5) nada mudou nos dados
  INSERT INTO resultado VALUES ('4. nenhuma linha criada ou apagada', (SELECT count(*) FROM public.fin_lancamentos) = antes, antes::text);
END
$ens$;

SELECT passo, ok, detalhe FROM resultado ORDER BY passo;
ROLLBACK;
