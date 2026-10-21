-- Reverte a migration 20261021150000_projeto_reserva_financeira.sql (21/10/2026). Dois comandos independentes — rode o 1 e depois o 2.
--
-- 1) apaga os dois projetos criados pela migration, mas SÓ se ninguém os usou (nenhum lançamento com o projeto). Apagar um projeto solta o vínculo dos lançamentos (ON DELETE SET NULL) e
--    perderia a classificação deles — por isso, se já houver lançamento, o projeto FICA e o resultado mostra 0.
DELETE FROM public.fin_projetos p
 WHERE p.nome IN ('Retiro Juventude 2027', 'Retiro Famílias 2027')
   AND p.reserva_financeira
   AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.projeto_id = p.id);

-- 2) tira a coluna. O app que lê `reserva_financeira` só deve ser desfeito junto (sem a coluna, a consulta do card "Reservado" falha e o card some).
ALTER TABLE public.fin_projetos DROP COLUMN IF EXISTS reserva_financeira;
