-- APLICAR — aposentar o estado "aguardando_aprovacao" (ensaio em produção: TUDO OK em 14/10/2026, 13.939 lançamentos intactos).
-- Mesmo conteúdo da migration 20261016090000_fin_aposenta_aguardando_aprovacao.sql. Pode rodar duas vezes sem efeito colateral.
-- Rollback: docs/APOSENTA_APROVACAO_ROLLBACK.sql (uma linha).
DO $trava$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos WHERE status::text = 'aguardando_aprovacao') THEN
    RAISE EXCEPTION 'Há lançamentos "Aguardando aprovação": decida cada um (pague ou cancele) antes de aposentar o estado.';
  END IF;
END
$trava$;

ALTER TABLE public.fin_lancamentos DROP CONSTRAINT IF EXISTS fin_lancamentos_sem_aprovacao_legada;
ALTER TABLE public.fin_lancamentos
  ADD CONSTRAINT fin_lancamentos_sem_aprovacao_legada CHECK (status::text <> 'aguardando_aprovacao');

COMMENT ON CONSTRAINT fin_lancamentos_sem_aprovacao_legada ON public.fin_lancamentos IS
  'O estado aguardando_aprovacao foi aposentado em 14/10/2026 (ninguém o criava e aprovar era pagar). Aprovação de reembolso: fin_decidir_quitacao.';

-- conferência: deve devolver 1 linha com a restrição e 13939 lançamentos
SELECT conname AS restricao, pg_get_constraintdef(oid) AS definicao,
       (SELECT count(*) FROM public.fin_lancamentos) AS lancamentos
FROM pg_constraint WHERE conname = 'fin_lancamentos_sem_aprovacao_legada';
