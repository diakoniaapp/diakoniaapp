-- Conta neutra para compras pagas por terceiros — PASSO 1 de 2: o tipo "nao_aplicavel" da conta (14/10/2026).
-- Um valor novo de enum não pode ser usado na MESMA transação em que nasce: por isso este passo é um comando só, e o passo 2 vem depois.
-- Não altera nenhuma linha. Rollback: o Postgres não remove valor de enum; o valor sem uso é inofensivo (ver docs/CONTA_NEUTRA_ROLLBACK.sql).

ALTER TYPE public.fin_conta_tipo ADD VALUE IF NOT EXISTS 'nao_aplicavel';
