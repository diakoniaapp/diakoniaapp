-- ═══════════════════════════════════════════════════════════════════════════
-- Cada ministério com a sua bancada
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O QUE A MEDIÇÃO MOSTROU ────────────────────────────────────────────────
--
-- O painel de ministério é o mesmo formulário para os onze: Áreas, Quem
-- serve, Escalas e Checklist. Mas os onze não são onze variações do mesmo.
-- Medido em 02/09/2026:
--
--   Comunhão/Integração  42 voluntários, 6 escalas, só eventos de culto.
--                        É o ÚNICO que usa o motor de escala como ele foi
--                        feito.
--   Oração               duas áreas, e as duas são LIVES. Não há quem
--                        escalar; há transmissão que acontece ou não.
--   Comunicação          1 voluntário, 0 eventos, 0 escalas.
--
-- E três ministérios já têm um MÓDULO INTEIRO no sistema, que o painel deles
-- ignora:
--
--   Educação Cristã   área "Escola Bíblica Dominical" — e o módulo EBD tem
--                     8 classes, 87 matrículas ativas, 13 professores,
--                     14 aulas e R$ 7.204,14 de caixa.
--   Administração     áreas "Bazar" e "Cantina" — e existe o módulo `arr_*`
--                     com PDV, caixa, produtos, espaços e reservas.
--   Pastoral          área "Pequenos Grupos Multiplicadores" — e existe o
--                     módulo PGM.
--
-- A líder da Educação Cristã abre o painel dela e lê "3 áreas · 8
-- voluntários". Nem uma palavra sobre as 87 matrículas. O painel fala de
-- escala; o ministério dela funciona por chamada.
--
-- ── POR QUE UMA COLUNA, E NÃO UM `IF` NO CÓDIGO ────────────────────────────
--
-- A alternativa era a tela reconhecer o ministério pelo nome ou pelo id. Nome
-- muda (a igreja renomeia), id não se lê, e as duas amarram a igreja ao
-- código: ligar o Bazar ao painel da Administração viraria um commit.
--
-- Com a coluna, quem administra liga e desliga pelo cadastro. E a coluna diz
-- uma coisa só, verificável: "este ministério trabalha neste módulo".
--
-- ── POR QUE NÃO REUSAR `ministerios.tipo` ──────────────────────────────────
--
-- Ela existe, é `text`, e **os onze estão com o mesmo valor: 'operacional'**.
-- É a natureza do ministério, não a ferramenta dele. Empilhar dois
-- significados na mesma coluna é como este banco já se machucou antes —
-- `status` em `v_voluntarios_completo` querendo dizer duas coisas custou um
-- painel que anunciava "0 voluntários" para um ministério com 21.
--
-- ── SÓ A EDUCAÇÃO CRISTÃ, POR ENQUANTO ─────────────────────────────────────
--
-- A igreja pediu para começar por um e acertar o formato antes de repetir.
-- `arrecadacao` e `pgm` ficam aceitos pelo CHECK e sem ninguém marcado — o
-- dia em que a tela souber desenhá-los, é um UPDATE de uma linha.

BEGIN;

ALTER TABLE public.ministerios
  ADD COLUMN IF NOT EXISTS modulo text;

ALTER TABLE public.ministerios
  DROP CONSTRAINT IF EXISTS ministerios_modulo_conhecido;

ALTER TABLE public.ministerios
  ADD CONSTRAINT ministerios_modulo_conhecido
  CHECK (modulo IS NULL OR modulo IN ('ebd', 'arrecadacao', 'pgm'));

COMMENT ON COLUMN public.ministerios.modulo IS
  'Qual modulo do sistema este ministerio opera, e que a bancada dele mostra primeiro: ebd, arrecadacao ou pgm. NULL = so as secoes comuns (areas, quem serve, escalas, checklist). Nao confundir com `tipo`, que e a natureza do ministerio.';

-- Pelo NOME, e não pelo id: o id não se lê numa migration, e se a igreja tiver
-- renomeado o ministério, o UPDATE não casa e a coluna fica NULL — que é o
-- comportamento certo. Melhor não ligar do que ligar no ministério errado.
UPDATE public.ministerios
   SET modulo = 'ebd'
 WHERE ativo AND nome = 'Educação Cristã';

COMMIT;
