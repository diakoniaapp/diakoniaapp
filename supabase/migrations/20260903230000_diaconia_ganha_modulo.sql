-- ═══════════════════════════════════════════════════════════════════════════
-- Diaconia ganha módulo
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O painel do ministério é genérico (área, escalas) — a bancada de "quem é
-- assistido" só faz sentido pra quem tem esse tipo de trabalho. `modulo` já
-- resolve isso pra EBD/arrecadação/PGM/acolhimento: o painel liga a seção
-- certa olhando o módulo, não o nome do ministério. Diaconia entra na mesma
-- fileira, em vez de o front-end comparar `ministerio.nome === 'Diaconia...'`.

BEGIN;

ALTER TABLE public.ministerios DROP CONSTRAINT IF EXISTS ministerios_modulo_conhecido;
ALTER TABLE public.ministerios ADD CONSTRAINT ministerios_modulo_conhecido
  CHECK (modulo IS NULL OR modulo IN ('ebd','arrecadacao','pgm','acolhimento','diaconia'));

UPDATE public.ministerios SET modulo = 'diaconia' WHERE nome = 'Diaconia e Ação Social';

COMMIT;
