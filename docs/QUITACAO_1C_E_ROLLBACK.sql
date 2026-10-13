-- DESFAZER a Fase 1C-e (migration 20261015130000): remove as funções e as visões. O tipo de anexo "prova_cancelamento" e os eventos novos CONTINUAM aceitos (o histórico só acrescenta e um anexo
-- já enviado não some). Notas já canceladas continuam canceladas; regularizações já feitas continuam feitas (a tabela de backup é mantida se tiver linhas — é o que permite reverter à mão).
DROP FUNCTION IF EXISTS public.fin_regularizar_oferta_de_nf(uuid, uuid, text, uuid, uuid, date, date, text, text, text);
DROP FUNCTION IF EXISTS public.fin_desfazer_cancelamento(uuid, text);
DROP FUNCTION IF EXISTS public.fin_cancelar_obrigacao(uuid, text);
DROP VIEW IF EXISTS public.vw_fin_oferta_de_nf_candidatas;
DROP VIEW IF EXISTS public.vw_fin_canceladas;
DO $d$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fin_quitacao_regularizacoes) THEN DROP TABLE public.fin_quitacao_regularizacoes; END IF;
END $d$;
