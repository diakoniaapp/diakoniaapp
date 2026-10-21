-- Reverte a migration 20261021150000_projeto_reserva_financeira.sql (21/10/2026): tira a coluna. A migration NÃO cria projeto, então não há projeto a apagar — os projetos dela ficam como estão
-- (só deixam de ter a marca de reserva). O app que lê `reserva_financeira` só deve ser desfeito junto: sem a coluna, a consulta do card "Reservado" devolve vazio e o card mostra só o Fundo Missionário.
ALTER TABLE public.fin_projetos DROP COLUMN IF EXISTS reserva_financeira;
