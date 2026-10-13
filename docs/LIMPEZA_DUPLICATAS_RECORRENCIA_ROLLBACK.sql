-- DESFAZER a limpeza das duplicatas de recorrência de 13/10/2026: recria as 6 despesas a partir do backup (fin_limpeza_backup) e devolve os 3 boletos
-- à despesa de origem. Pode rodar mais de uma vez. Detalhe: as linhas recriadas ganham de novo o id de obrigação próprio (o gatilho das linhas novas).
DO $rb$
DECLARE
  lote_nome constant text := 'recorrencias-duplicadas-20261013';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE EXCEPTION 'Não há backup deste lote: nada a desfazer.'; END IF;
  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  UPDATE public.fin_lancamento_anexos a SET lancamento_id = (b.linha->>'lancamento_id')::uuid
    FROM public.fin_limpeza_backup b WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamento_anexos' AND a.id = (b.linha->>'id')::uuid;
  RAISE NOTICE 'Limpeza desfeita a partir do lote %.', lote_nome;
END
$rb$;
