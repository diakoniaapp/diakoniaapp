-- Item 5 da "PRIORIDADE MÁXIMA" (22/09/2026): cada conta financeira passa a
-- declarar quais operações aceita. Hoje (medido: `fin_contas` não tem
-- nenhuma coluna assim — só `tipo`, que é rótulo, não regra) TODA conta
-- aceita lançar qualquer coisa: nada impede, por exemplo, lançar uma
-- despesa direto numa conta de Aplicação que deveria só receber
-- transferência.
--
-- Três flags, não quatro: o pedido original listava "Receitas / Despesas /
-- Entradas e Saídas / Transferências", mas "Entradas e Saídas" descreve a
-- MESMA coisa que "Receitas + Despesas" já cobre (entrada=receita,
-- saída=despesa) — os dois exemplos dados (Conta Envelope = Receitas+
-- Despesas+Transferências; Conta Banco = Entradas e Saídas+Transferências)
-- confirmam que é o mesmo par com nome diferente. Uma 4ª coluna redundante
-- só criaria um jeito de essas duas ficarem contraditórias entre si.
--
-- Default true nas três — não muda o comportamento de nenhuma conta já
-- cadastrada até alguém entrar e desmarcar algo de propósito.
ALTER TABLE fin_contas
  ADD COLUMN IF NOT EXISTS aceita_receitas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_despesas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aceita_transferencias boolean NOT NULL DEFAULT true;
