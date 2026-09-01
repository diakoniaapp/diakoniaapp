-- ═══════════════════════════════════════════════════════════════════════════
-- A Escola Bíblica Dominical volta ao calendário
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Correção de DADO, não de esquema. Registrada como migration porque o defeito
-- que ela conserta tem explicação, e explicação sem lugar se perde.
--
-- ── O DEFEITO ──────────────────────────────────────────────────────────────
--
-- A série da EBD tinha regra semanal aos domingos com fim em 2026-01-04 — o
-- MESMO dia em que começa. Uma série assim gera uma ocorrência só: a EBD
-- apareceu no calendário em 4 de janeiro e nunca mais, o ano inteiro.
--
-- Não é que a escola tenha parado. Medido em `ebd_aulas`: 14 aulas em 7
-- domingos distintos — 07, 14, 21 e 28 de junho, e 16, 23 e 30 de agosto. A
-- escola funciona; o que não funcionava era a linha dela na agenda.
--
-- ── DE ONDE VEIO ───────────────────────────────────────────────────────────
--
-- Do editor de recorrência: clicar em "Em" preenchia a data final com HOJE,
-- que numa criação é quase sempre o próprio dia do evento. Corrigido na
-- migration de código que acompanha este dia — o campo passou a sugerir três
-- meses adiante, e a tela avisa quando o fim é anterior ou igual ao começo.
--
-- Sem essa correção, este UPDATE seria remendo: o próximo evento recorrente
-- nasceria com o mesmo defeito.
--
-- ── POR QUE 27/12/2026 ─────────────────────────────────────────────────────
--
-- Não é escolha arbitrária. É a convenção que a própria igreja aplicou a todas
-- as outras séries: cada uma termina no último dia-da-semana correspondente
-- dentro do ano.
--
--   Culto da Manhã ....... 27/12/2026  (domingo)
--   Culto da Noite ....... 27/12/2026  (domingo)
--   Aulas de música ...... 29/12/2026  (terça)
--   Ensaio, Lives ........ 31/12/2026  (quinta)
--   PGO Mães Unidas ...... 26/12/2026  (sábado)
--
-- A EBD é dominical como os dois cultos, e recebe a mesma data que eles.
--
-- Consequência: a série passa a gerar todos os domingos de 04/01 a 27/12,
-- inclusive os que já passaram. Isso é verdade — a EBD aconteceu.

BEGIN;

UPDATE public.eventos
   SET recorrencia_regra = jsonb_set(recorrencia_regra, '{fim,data}', '"2026-12-27"'),
       updated_at = now()
 WHERE titulo LIKE 'Escola Bíblica Dominical%'
   AND recorrencia_regra->'fim'->>'data' = '2026-01-04';

COMMIT;
