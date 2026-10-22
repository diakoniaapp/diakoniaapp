-- Reverte a migration 20261022100000_fin_lancamentos_data_emissao.sql (22/10/2026): tira a coluna. As datas de emissão já gravadas se perdem (é o preço do rollback); vencimento, pagamento e
-- competência não são tocados. O app que lê `data_emissao` só deve ser desfeito junto — sem a coluna, salvar um lançamento COM emissão preenchida falha com um aviso claro.
ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS data_emissao;
