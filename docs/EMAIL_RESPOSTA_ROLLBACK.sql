-- Reverte 20261027120000_email_resposta_da_igreja.sql (os e-mails voltam a sair sem Reply-To; o app esconde o campo sozinho).
ALTER TABLE public.identidade_igreja DROP COLUMN IF EXISTS email_resposta;
