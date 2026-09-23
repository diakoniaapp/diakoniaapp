-- Forma de pagamento padrão da "Caixa de Envelopes" para lançamentos de
-- entrada (23/09/2026, pedido da Telma: "defina a forma de pagamento
-- (inicial) sempre Dinheiro (caixa envelopes)").
--
-- Medido antes de mudar: das 5 contas cadastradas, só Bradesco e Caixa de
-- Envelopes aceitam receita (`aceita_receitas = true`). Bradesco já tinha
-- `forma_entrada_padrao = 'pix'`; Caixa de Envelopes estava com o campo
-- nulo — por isso o Select "Forma de pagamento" em LancamentoForm.tsx
-- abria em branco ao lançar uma oferta ali, mesmo quase toda entrada de
-- envelope sendo dinheiro.
--
-- Não precisa de mudança de código: LancamentoForm.tsx já lê
-- `contaAtual.forma_entrada_padrao` num useEffect (linha ~187) e
-- pré-seleciona a forma ao escolher a conta, sem travar — quem lança
-- ainda pode trocar. Isto só preenche o dado que faltava.
update fin_contas
   set forma_entrada_padrao = 'dinheiro'
 where id = '41cdfb4d-c706-4d00-bb24-40eb57d97909' -- Caixa de Envelopes
   and forma_entrada_padrao is null;
