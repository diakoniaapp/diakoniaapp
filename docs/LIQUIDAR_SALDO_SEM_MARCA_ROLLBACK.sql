-- ROLLBACK — saldo pendente sem a marca do extrato (migration 20261016120000). Devolve a fin_liquidar VIVA ao trecho original (`l.observacoes` no saldo
-- pendente) e remove a função auxiliar. ATENÇÃO: com isso, o pagamento PARCIAL de uma despesa que tem marca [ofx:…] volta a ser recusado pelo banco.
-- Não altera dado nenhum. Pode rodar mais de uma vez.
DO $rb$
DECLARE
  fn regprocedure := to_regprocedure('public.fin_liquidar(uuid,date,public.fin_forma_pagamento,numeric,jsonb,jsonb,text,text,text)');
  def text;
  antes  CONSTANT text := 'l.documento_numero, l.observacoes, l.origem';
  depois CONSTANT text := 'l.documento_numero, public.fin_sem_marcas_do_extrato(l.observacoes), l.origem';
BEGIN
  IF fn IS NULL THEN RAISE EXCEPTION 'fin_liquidar não existe com a assinatura esperada. Nada foi alterado.'; END IF;
  def := pg_get_functiondef(fn);
  IF position(depois IN def) = 0 THEN RAISE NOTICE 'fin_liquidar já está na forma original: nada a desfazer.'; RETURN; END IF;
  EXECUTE replace(def, depois, antes);
END
$rb$;
DROP FUNCTION IF EXISTS public.fin_sem_marcas_do_extrato(text);
