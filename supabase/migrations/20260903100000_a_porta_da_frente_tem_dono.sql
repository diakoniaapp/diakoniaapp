-- ═══════════════════════════════════════════════════════════════════════════
-- A porta da frente tem dono
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE A COMUNHÃO FAZ, MEDIDO ANTES DE ESCREVER ─────────────────────────
--
-- "Comunhão, Integração e Crescimento" é a maior equipe da igreja — 45
-- voluntários em duas áreas, Recepção (25) e Introdução (20) — e o seu painel
-- não mostrava nada do trabalho dela. Mostrava áreas, equipe, escala e
-- checklist: o mesmo que o painel de qualquer outro.
--
-- O que ela faz tem tabela no banco desde sempre, e nenhuma tela do
-- ministério abria:
--
--   acolhimento_tarefas    12 tarefas, 12 ABERTAS, 12 VENCIDAS.
--                          Atraso máximo: 32 dias.
--   visita_historico       293 linhas, mas 273 são "cadastro" — ruído da
--                          importação. Atos de acolhimento de verdade são 20,
--                          e o último foi em 28/08.
--   3 visitantes ativos    Isadora e Matheus desde 12/08, Sonia desde 24/08.
--                          As 12 tarefas vencidas são as deles.
--
-- ── E O CRESCIMENTO, QUE É A OUTRA METADE DO NOME ──────────────────────────
--
-- Integrar não é cadastrar. Medido nos que entraram nos últimos 12 meses:
--
--   38 novos      28 em classe de EBD · 2 em PGM · 1 servindo em área
--    8 deles      sem NENHUM dos três — quatro chegaram em agosto
--   30 congregados  21 em EBD · 2 em PGM · ZERO servindo
--
-- Nenhum congregado desta igreja serve em área nenhuma. É um número que só
-- aparece quando alguém pergunta, e ninguém tinha onde perguntar.
--
-- ── O QUE ESTA MIGRATION FAZ ───────────────────────────────────────────────
--
-- Abre a quarta bancada. `ministerios.modulo` aceitava ebd, arrecadacao e pgm;
-- passa a aceitar `acolhimento`, e a Comunhão recebe o dela — como a Educação
-- Cristã recebeu 'ebd' e a Pastoral recebeu 'pgm' em 20260902100000.
--
-- A partir daqui é `lidero_ministerio_do_modulo('acolhimento')` que responde
-- por esse recorte, igual aos outros três.

BEGIN;

ALTER TABLE public.ministerios DROP CONSTRAINT IF EXISTS ministerios_modulo_conhecido;

ALTER TABLE public.ministerios ADD CONSTRAINT ministerios_modulo_conhecido
  CHECK (modulo IS NULL OR modulo = ANY (ARRAY['ebd', 'arrecadacao', 'pgm', 'acolhimento']));

-- Pelo nome, e não por id: o id muda entre bancos, o nome é o que a igreja
-- escreveu. Se não casar, não altera nada — e a bancada simplesmente não
-- aparece, em vez de aparecer no ministério errado.
UPDATE public.ministerios
   SET modulo = 'acolhimento'
 WHERE nome LIKE 'Comunh%' AND modulo IS NULL;

COMMIT;
