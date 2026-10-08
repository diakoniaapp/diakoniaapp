-- DESFAZER o índice único das transferências do Invest Fácil (docs/INVEST_FACIL_INDICE_UNICO_APLICAR.sql). Um comando só.
-- ─── O que isto faz e o que NÃO faz ───────────────────────────────────────────────────────────────────────────────────────
-- Remove APENAS o índice `fin_lancamentos_invest_pdf_chave_uq`. Nenhum lançamento, saldo ou marca é tocado: o índice não guardava dado, só
-- fiscalizava. Sem ele, a Mesa volta a se proteger só pela conferência feita imediatamente antes de gravar (a janela da corrida entre duas abas
-- reabre, mas a reimportação do mesmo PDF continua segura: a linha já registrada sai como "Transferência já registrada").
-- Instantâneo (soltar um índice leva milissegundos) e seguro de repetir. O código do app não precisa mudar: o tratamento do erro 23505 simplesmente
-- deixa de ser acionado.
-- Se, depois de desfazer, aparecerem transferências em dobro (duas abas), a auditoria docs/INVEST_FACIL_INDICE_UNICO_AUDITORIA.sql as lista na linha
-- "CONFLITO" e o "Desfazer" da Mesa apaga o par repetido.
DO $rollback$
BEGIN
  PERFORM set_config('lock_timeout', '5s', true);
  DROP INDEX IF EXISTS public.fin_lancamentos_invest_pdf_chave_uq;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'fin_lancamentos_invest_pdf_chave_uq') THEN
    RAISE EXCEPTION 'O índice continua existindo — nada foi desfeito.';
  END IF;
END
$rollback$;
