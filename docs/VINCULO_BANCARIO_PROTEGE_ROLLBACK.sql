-- Reverte a migration 20261022150000_fin_vinculo_bancario_protege.sql (22/10/2026): tira o gatilho de proteção e a função de desvincular. Não mexe em nenhum lançamento nem em vínculo.
-- As linhas de trilha já gravadas com o campo 'vinculo_extrato' FICAM (a trilha é imutável); por isso a restrição do campo continua aceitando esse valor — não é revertida.
DROP TRIGGER IF EXISTS fin_lanc_protege_vinculo ON public.fin_lancamentos;
DROP FUNCTION IF EXISTS public.fin_lanc_protege_vinculo();
DROP FUNCTION IF EXISTS public.fin_desvincular_do_extrato(uuid, text);
