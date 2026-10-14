-- ROLLBACK — devolve ao banco a possibilidade de gravar "aguardando_aprovacao".
-- Não apaga nem altera nenhum lançamento: só remove a restrição.
ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS fin_lancamentos_sem_aprovacao_legada;
