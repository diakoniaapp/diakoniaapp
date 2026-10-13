-- DESFAZER a migration 20261013140000. Remove o gatilho da auditoria de conta; MANTÉM a tabela fin_conta_alteracoes (o registro das trocas já feitas não se perde).
-- As marcas [ofx:FITID] acrescentadas às despesas liquidadas pelo extrato PODEM FICAR: são as mesmas que as telas já gravam e correspondem a liquidações reais.
-- Se mesmo assim quiser retirá-las (as despesas voltam a "conferida sem vínculo"; os vínculos ficam FECHADOS na tabela, não apagados), rode também:
--   UPDATE public.fin_lancamentos l SET observacoes = nullif(btrim(replace(l.observacoes, '[ofx:' || q.ofx_fitid || ']', '')), '')
--     FROM public.fin_liquidacoes q WHERE l.liquidacao_id = q.id AND q.ofx_fitid IS NOT NULL AND l.observacoes LIKE '%[ofx:' || q.ofx_fitid || ']%';
DROP TRIGGER IF EXISTS fin_lanc_conta_auditada ON public.fin_lancamentos;
DROP FUNCTION IF EXISTS public.fin_lanc_audita_conta();
-- SÓ se quiser apagar o registro das trocas (NÃO recomendado): DROP TABLE IF EXISTS public.fin_conta_alteracoes;
