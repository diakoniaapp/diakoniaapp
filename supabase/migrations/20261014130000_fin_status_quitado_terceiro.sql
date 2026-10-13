-- ─── Fase 1B (1/3): o status `quitado_terceiro` — a obrigação extinta por um terceiro, que nunca passou por banco nem caixa ──────────────────────────────────
-- Aprovado por ela em 13/10/2026 ("representa fatos econômicos que nunca passaram por banco nem caixa"). É a única forma que não cria dinheiro fictício e que "falha para o lado seguro":
-- o saldo (fin_recalc_saldo_conta soma só `realizado` e `conciliado`), o extrato, a conciliação, a previsão de caixa e a fila de contas a pagar (`previsto`) já ignoram qualquer outro status.
-- Esta migration SÓ acrescenta o valor ao enum. `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma transação em que o valor é usado: por isso ela vem SOZINHA, é aplicada primeiro,
-- e só depois as migrations 20261014140000 e 20261014150000. Inofensiva sozinha: nada passa a usar o valor até a próxima.
-- ATENÇÃO: o PostgreSQL não permite REMOVER um valor de enum. O rollback da Fase 1B desfaz todo o uso do valor, mas o valor continua existindo no tipo (sem efeito).
ALTER TYPE public.fin_lancamento_status ADD VALUE IF NOT EXISTS 'quitado_terceiro';
