-- ROLLBACK — devolve ao banco a possibilidade de gravar origem 'importado_omie' e arquivos 'omie-*'.
-- Não altera nenhum lançamento: só remove os dois gatilhos e a função.
DROP TRIGGER IF EXISTS fin_lanc_bloqueia_omie ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_import_arquivos_bloqueia_omie ON public.fin_import_arquivos;
DROP FUNCTION IF EXISTS public.fin_bloqueia_importacao_omie();
