-- ─── Apagar uma conta deixa de exigir apagar o que ela fez ─────────────────
--
-- A Telma quis remover contas de teste e a exclusão foi barrada. O motivo era
-- legítimo e o remédio, exagerado.
--
-- Dezenove chaves estrangeiras apontavam para `auth.users` como RESTRICT: o
-- banco recusava apagar a conta enquanto houvesse qualquer linha citando-a.
-- Duas dessas linhas eram, no caso concreto:
--
--   consentimento.registrado_por ... 1 aceite de LGPD registrado pela conta
--   log_exclusoes.usuario_id ....... 170 registros de exclusões feitas em
--                                    maio/junho, na fase de importação
--
-- O RESTRICT protegia a coisa certa — esses registros não podem sumir — mas
-- pelo meio errado. Ele preservava o registro impedindo a exclusão da conta,
-- e o efeito prático era uma conta de teste presa para sempre.
--
-- ── DEZOITO DAS DEZENOVE ACEITAM NULO ──────────────────────────────────────
--
-- Conferido coluna a coluna: só `arr_reservas.solicitada_por` é obrigatória —
-- uma reserva sem quem a pediu não é uma reserva. Essa continua RESTRICT, e
-- quem tiver reservas no nome segue impossível de apagar. É a exceção certa.
--
-- Nas outras dezoito, `ON DELETE SET NULL`. O registro permanece inteiro; o
-- que se perde é o apontador para uma conta que deixou de existir. No aceite
-- de LGPD isso significa manter QUEM consentiu, o quê, quando e sob qual
-- versão do texto — e perder apenas quem digitou. Trocar o registro inteiro
-- por isso seria o negócio ruim.
--
-- Doze chaves para `auth.users` neste mesmo banco já eram SET NULL. Esta
-- migration não inventa convenção: estende a que já existia às que ficaram
-- de fora.
--
-- ── EFEITO NA TELA ─────────────────────────────────────────────────────────
--
-- `revogar_acesso()` já tentava apagar e caía para "bloquear" quando uma
-- chave segurava. Ela não muda. O que muda é que agora a tentativa dá certo
-- na maioria dos casos, e "Bloqueado" volta a ser o que devia ter sido desde
-- o começo: a exceção, para quem tem reserva no nome.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname,
           c.conrelid::regclass::text AS tabela,
           a.attname::text            AS coluna
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype   = 'f'
       AND c.confrelid = 'auth.users'::regclass
       AND c.connamespace::regnamespace::text = 'public'
       AND c.confdeltype = 'a'        -- hoje RESTRICT
       AND NOT a.attnotnull           -- e a coluna aceita nulo
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',
      r.tabela, r.conname, r.coluna);
    RAISE NOTICE 'SET NULL: %.%', r.tabela, r.coluna;
  END LOOP;
END $$;

COMMENT ON CONSTRAINT consentimento_registrado_por_fkey ON public.consentimento IS
  'SET NULL desde 20/08/2026. O aceite de LGPD sobrevive a exclusao da conta de quem o registrou: o que importa no registro e quem consentiu, o que, quando e sob qual versao do texto.';

COMMENT ON CONSTRAINT log_exclusoes_usuario_id_fkey ON public.log_exclusoes IS
  'SET NULL desde 20/08/2026. O log de exclusoes sobrevive a exclusao da conta de quem apagou — o registro do que saiu do banco vale mais que o apontador para a conta.';
