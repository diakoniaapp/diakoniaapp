-- ═══════════════════════════════════════════════════════════════════════════
-- As escalas começam do zero
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A igreja disse, em 03/09/2026: as escalas que existem foram testes.
--
-- ── O QUE HAVIA ────────────────────────────────────────────────────────────
--
--   15 escalas, todas em status `planejada` — nenhuma confirmada, nenhuma
--      realizada. Ninguém foi avisado de nenhuma delas.
--   19 escalados, TODOS marcados `sugerido_automaticamente`, com score entre
--      33 e 90. Saíram do conselheiro do banco, `sugerir_voluntarios_escala`,
--      e alguém os aceitou na tela.
--    0 participantes.
--
--   Comunhão 11 · Celebrando a Transformação 2 · Diaconia 1 · Música 1
--   De 23/08 a 06/09.
--
-- ── POR QUE ISTO É SEGURO ──────────────────────────────────────────────────
--
-- `planejada` é o rascunho deste sistema: nada foi notificado, ninguém
-- confirmou presença, nenhuma escala virou histórico. O que sai é intenção,
-- não registro — e intenção de teste.
--
-- ── A ORDEM É A DAS TRÊS CHAVES QUE APONTAM PARA `escalas` ──────────────────
--
-- Levantadas antes de escrever: `escala_voluntarios.escala_id`,
-- `escala_participantes.escala_id` e `checklist_execucao.escala_id`. As três
-- saem antes, senão a última linha falha.
--
-- O que NÃO sai: os eventos da agenda, as áreas, os voluntários e a
-- disponibilidade de cada um. A escala é o que se monta com eles, e monta-se
-- de novo — agora pelo rodízio, que respeita o que a pessoa disse.

BEGIN;

DELETE FROM public.escala_voluntarios;
DELETE FROM public.escala_participantes;

-- Só a ligação com a escala; a execução do checklist em si não é escala.
UPDATE public.checklist_execucao SET escala_id = NULL WHERE escala_id IS NOT NULL;

DELETE FROM public.escalas;

COMMIT;
