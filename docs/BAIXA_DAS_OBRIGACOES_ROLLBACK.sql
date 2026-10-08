-- ─── DESFAZER a baixa das 12 obrigações (um comando só, atômico) (só use se a baixa tiver sido aplicada e algo estiver errado) ───────────
-- Usa a cópia `fin_lancamentos_baixa_backup_20261008` criada pela baixa: restaura os 12 duplicados apagados, devolve as 12 obrigações ao
-- estado de antes (previstas, sem liquidação) e apaga as 12 liquidações criadas. Os saldos não mudam (o valor volta a ser contado uma só vez).

DO $desfazer$
DECLARE cols text; n int; resultado text;
BEGIN
  SELECT string_agg(quote_ident(b.column_name), ', ' ORDER BY b.ordinal_position) INTO cols
    FROM information_schema.columns b
    JOIN information_schema.columns l ON l.table_schema = 'public' AND l.table_name = 'fin_lancamentos' AND l.column_name = b.column_name
   WHERE b.table_schema = 'public' AND b.table_name = 'fin_lancamentos_baixa_backup_20261008';
  -- 1. as obrigações voltam a ser previstas (antes de reinserir os duplicados, para o valor não ser contado duas vezes)
  UPDATE public.fin_lancamentos o
     SET status = b.status, data_pagamento = b.data_pagamento, valor_original = b.valor_original, obrigacao_id = b.obrigacao_id,
         liquidacao_id = NULL, componente = b.componente, forma_pagamento = b.forma_pagamento, comprovante_url = b.comprovante_url,
         projeto_id = b.projeto_id, fornecedor_id = b.fornecedor_id, pessoa_id = b.pessoa_id, observacoes = b.observacoes
    FROM public.fin_lancamentos_baixa_backup_20261008 b
   WHERE b.papel = 'obrigacao' AND b.id = o.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Obrigações devolvidas a previstas: %', n;
  -- 2. as liquidações criadas pela baixa saem
  DELETE FROM public.fin_liquidacoes WHERE observacoes LIKE 'Baixa da obrigação ligada ao pagamento já conciliado do OFX%';
  -- 3. os duplicados voltam (só os que ainda não existem)
  EXECUTE format(
    'INSERT INTO public.fin_lancamentos (%1$s) SELECT %1$s FROM public.fin_lancamentos_baixa_backup_20261008 b
      WHERE b.papel = ''duplicado'' AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = b.id)', cols);
  -- 4. o pagamento de sustento que a baixa religou à obrigação (PIX de 15/09 do Pastor Titular, N1136D) volta ao lançamento original
  UPDATE public.sustento_pagamentos
     SET lancamento_id = 'aff731e7-8a1f-42d2-be8b-da0dbf4cee25'
   WHERE lancamento_id = '009c50dd-2dbb-40ab-8917-7b96b49acb0e'
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE id = 'aff731e7-8a1f-42d2-be8b-da0dbf4cee25');

  resultado := jsonb_build_object(
    'obrigacoes_previstas_de_novo', (SELECT count(*) FROM public.fin_lancamentos l JOIN public.fin_lancamentos_baixa_backup_20261008 b ON b.id = l.id AND b.papel = 'obrigacao' WHERE l.status = 'previsto'),
    'duplicados_restaurados',       (SELECT count(*) FROM public.fin_lancamentos l JOIN public.fin_lancamentos_baixa_backup_20261008 b ON b.id = l.id AND b.papel = 'duplicado'))::text;
  RAISE NOTICE 'BAIXA DESFEITA: %', resultado;
END
$desfazer$;
