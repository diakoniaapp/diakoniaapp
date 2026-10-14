-- ROLLBACK — data do pagamento lida do comprovante (migration 20261016130000).
-- NÃO apaga o histórico: a tabela vira fin_data_pagamento_decisoes_arquivo (só leitura) e o aplicativo, que procura o nome original,
-- deixa de gravar decisões sozinho. A sugestão da data na tela continua funcionando (é leitura do arquivo, sem banco); só a auditoria para.
-- Nenhum lançamento é alterado. Pode rodar mais de uma vez.
DO $rb$ BEGIN
  IF to_regclass('public.fin_data_pagamento_decisoes') IS NULL THEN RAISE NOTICE 'Nada a desfazer: a tabela já não está ativa.'; RETURN; END IF;
  DROP TRIGGER IF EXISTS fin_dpd_carimbo ON public.fin_data_pagamento_decisoes;
  DROP POLICY IF EXISTS fin_dpd_inclusao ON public.fin_data_pagamento_decisoes;
  REVOKE INSERT ON public.fin_data_pagamento_decisoes FROM authenticated;
  ALTER TABLE public.fin_data_pagamento_decisoes RENAME TO fin_data_pagamento_decisoes_arquivo;
END $rb$;
DROP FUNCTION IF EXISTS public.fin_dpd_carimbo();
NOTIFY pgrst, 'reload schema';
-- Para remover DE VEZ (perde o histórico), só com decisão explícita:
--   DROP TABLE IF EXISTS public.fin_data_pagamento_decisoes_arquivo;
