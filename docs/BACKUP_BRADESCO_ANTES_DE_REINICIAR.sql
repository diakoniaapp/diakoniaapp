-- BACKUP — GRAVA APENAS CÓPIAS (tabelas novas com sufixo _bkp_20261008); não altera nenhum dado existente. Um comando só; aborta se as cópias já existirem (não sobrescreve).
-- Rode ANTES de excluir o histórico do Bradesco pelo app para reiniciar a conciliação.
-- ─── O que guarda ─────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Cópia exata (todas as colunas) de, no dia 08/10/2026:
--   · fin_lancamentos das contas Bradesco (corrente) e Caixa de Aplicação  → fin_lancamentos_bkp_20261008
--   · fin_lancamento_anexos desses lançamentos (a linha do anexo; o arquivo no storage não é apagado por este backup) → fin_lancamento_anexos_bkp_20261008
--   · fin_lancamento_rateio desses lançamentos                                → fin_lancamento_rateio_bkp_20261008
--   · sustento_pagamentos (vínculos do Sustento com lançamentos)               → sustento_pagamentos_bkp_20261008
-- As cópias ficam com RLS ligada e SEM política: o app não enxerga; só o SQL Editor. Para conferir: SELECT count(*) FROM public.fin_lancamentos_bkp_20261008;
-- Para restaurar algo: INSERT INTO public.fin_lancamentos SELECT * FROM public.fin_lancamentos_bkp_20261008 WHERE id IN (...) — as linhas voltam com os mesmos ids
-- (restaure as DUAS pernas de uma transferência juntas). Quando o novo ciclo estiver conferido, apague as cópias com DROP TABLE.
DO $backup$
DECLARE
  contas uuid[];
  n_l bigint; n_a bigint; n_r bigint; n_s bigint;
BEGIN
  IF to_regclass('public.fin_lancamentos_bkp_20261008') IS NOT NULL THEN
    RAISE EXCEPTION 'As cópias de 08/10/2026 já existem — nada foi feito (não sobrescrevo backup).';
  END IF;
  SELECT array_agg(id) INTO contas FROM public.fin_contas WHERE nome ILIKE 'bradesco%' OR nome ILIKE '%aplica%';
  IF contas IS NULL THEN RAISE EXCEPTION 'Não achei as contas Bradesco / Aplicação.'; END IF;

  CREATE TABLE public.fin_lancamentos_bkp_20261008 AS SELECT * FROM public.fin_lancamentos WHERE conta_id = ANY (contas);
  CREATE TABLE public.fin_lancamento_anexos_bkp_20261008 AS SELECT * FROM public.fin_lancamento_anexos WHERE lancamento_id IN (SELECT id FROM public.fin_lancamentos_bkp_20261008);
  CREATE TABLE public.fin_lancamento_rateio_bkp_20261008 AS SELECT * FROM public.fin_lancamento_rateio WHERE lancamento_id IN (SELECT id FROM public.fin_lancamentos_bkp_20261008);
  CREATE TABLE public.sustento_pagamentos_bkp_20261008 AS SELECT * FROM public.sustento_pagamentos;

  ALTER TABLE public.fin_lancamentos_bkp_20261008 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.fin_lancamento_anexos_bkp_20261008 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.fin_lancamento_rateio_bkp_20261008 ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.sustento_pagamentos_bkp_20261008 ENABLE ROW LEVEL SECURITY;

  SELECT count(*) INTO n_l FROM public.fin_lancamentos_bkp_20261008;
  SELECT count(*) INTO n_a FROM public.fin_lancamento_anexos_bkp_20261008;
  SELECT count(*) INTO n_r FROM public.fin_lancamento_rateio_bkp_20261008;
  SELECT count(*) INTO n_s FROM public.sustento_pagamentos_bkp_20261008;
  IF n_l <> (SELECT count(*) FROM public.fin_lancamentos WHERE conta_id = ANY (contas)) THEN
    RAISE EXCEPTION 'A cópia de lançamentos não tem o mesmo total do original — nada foi mantido.';
  END IF;
  RAISE NOTICE 'Backup feito: % lançamentos, % anexos, % rateios, % vínculos do Sustento.', n_l, n_a, n_r, n_s;
END
$backup$;
