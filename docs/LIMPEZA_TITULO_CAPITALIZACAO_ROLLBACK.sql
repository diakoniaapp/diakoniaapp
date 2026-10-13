-- DESFAZER a limpeza do Título de Capitalização: recria os 878 previstos do dia 02 a partir do backup (fin_limpeza_backup). Pode rodar mais de uma vez.
-- Detalhe: as linhas recriadas ganham de novo o id de obrigação próprio (o gatilho das linhas novas).
DO $rb$
DECLARE
  lote_nome constant text := 'titulo-capitalizacao-20261013';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_limpeza_backup WHERE lote = lote_nome) THEN RAISE EXCEPTION 'Não há backup deste lote: nada a desfazer.'; END IF;
  INSERT INTO public.fin_lancamentos
    SELECT (jsonb_populate_record(NULL::public.fin_lancamentos, b.linha)).* FROM public.fin_limpeza_backup b
     WHERE b.lote = lote_nome AND b.tabela = 'fin_lancamentos' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = (b.linha->>'id')::uuid);
  RAISE NOTICE 'Limpeza desfeita a partir do lote %.', lote_nome;
END
$rb$;
