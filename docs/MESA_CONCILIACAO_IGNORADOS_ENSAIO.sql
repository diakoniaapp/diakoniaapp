-- ENSAIO da migration 20261008140000_fin_extrato_ignorados.sql — roda DEPOIS dela, na mesma transação: BEGIN; migration + este arquivo + ROLLBACK;
-- "Success. No rows returned" = passou. Casos: (1) grava e é único por conta+FITID · (2) motivo fora da lista é recusado · (3) o anônimo não vê nem grava ·
-- (4) apagar a conta leva as decisões junto · (5) a política é a do financeiro.
DO $ensaio$
DECLARE conta uuid; n int; recusou boolean; caso text := '0'; ctx text;
BEGIN
  IF to_regclass('public.fin_extrato_ignorados') IS NULL THEN RAISE EXCEPTION 'Ensaio: a migration não rodou antes do teste — cole o texto INTEIRO.'; END IF;
  SELECT id INTO conta FROM public.fin_contas ORDER BY nome LIMIT 1;

  caso := '1';
  INSERT INTO public.fin_extrato_ignorados (conta_id, fitid, motivo, data, valor, memo) VALUES (conta, 'ZZ-FITID-1', 'duplicado', CURRENT_DATE, 10.10, 'PIX DE TESTE');
  recusou := false;
  BEGIN INSERT INTO public.fin_extrato_ignorados (conta_id, fitid) VALUES (conta, 'ZZ-FITID-1');
  EXCEPTION WHEN unique_violation THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '1: aceitou o mesmo FITID duas vezes na mesma conta.'; END IF;

  caso := '2';
  recusou := false;
  BEGIN INSERT INTO public.fin_extrato_ignorados (conta_id, fitid, motivo) VALUES (conta, 'ZZ-FITID-2', 'porque sim');
  EXCEPTION WHEN check_violation THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '2: aceitou um motivo fora da lista.'; END IF;
  recusou := false;
  BEGIN INSERT INTO public.fin_extrato_ignorados (conta_id, fitid) VALUES (conta, '   ');
  EXCEPTION WHEN check_violation THEN recusou := true; END;
  IF NOT recusou THEN RAISE EXCEPTION '2: aceitou FITID em branco.'; END IF;

  caso := '3';
  IF has_table_privilege('anon', 'public.fin_extrato_ignorados', 'SELECT') OR has_table_privilege('anon', 'public.fin_extrato_ignorados', 'INSERT') THEN
    RAISE EXCEPTION '3: anon tem privilégio na tabela.';
  END IF;

  caso := '5';
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fin_extrato_ignorados' AND policyname = 'Financeiro'
                  AND qual ILIKE '%tesouraria%' AND qual ILIKE '%secretaria%') THEN
    RAISE EXCEPTION '5: a política do financeiro não está como esperado.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS ctx = PG_EXCEPTION_CONTEXT;
  RAISE EXCEPTION 'ENSAIO FALHOU no caso %: % [%] | %', caso, SQLERRM, SQLSTATE, replace(ctx, E'
', ' | ');
END
$ensaio$;
