-- ─── Formas por conta — os 3 exemplos que ela mesma deu ─────────────────
--
-- Fase 12 (23/09/2026). Ela deu os 3 exemplos completos (Envelopes,
-- Bradesco, Caixa de Aplicação) — aplico exatamente o que ela descreveu,
-- nada inventado. "Caixinha Administrativo" e "Cartão de Crédito" ficam
-- de fora de propósito: ela não deu exemplo pra nenhuma das duas, e
-- `NULL` (sem restrição) é o comportamento seguro até ela decidir.
--
-- Padrão de PAGAMENTO só foi dado explicitamente pra nenhuma conta nos
-- exemplos — deixei `forma_saida_padrao` vazio nas três, exceto Caixa de
-- Aplicação, onde só existe UMA forma permitida (transferência): não é
-- uma preferência inventada, é a única opção válida.
UPDATE public.fin_contas SET
  formas_entrada_permitidas = ARRAY['dinheiro','cheque','outro']::fin_forma_pagamento[],
  formas_saida_permitidas   = ARRAY['dinheiro','outro']::fin_forma_pagamento[],
  forma_entrada_padrao      = 'dinheiro'
WHERE nome = 'Caixa de Envelopes';

UPDATE public.fin_contas SET
  formas_entrada_permitidas = ARRAY['pix','transferencia','cheque','dinheiro']::fin_forma_pagamento[],
  formas_saida_permitidas   = ARRAY['pix','transferencia','boleto']::fin_forma_pagamento[],
  forma_entrada_padrao      = 'pix'
WHERE nome = 'Bradesco';

UPDATE public.fin_contas SET
  formas_entrada_permitidas = ARRAY['transferencia']::fin_forma_pagamento[],
  formas_saida_permitidas   = ARRAY['transferencia']::fin_forma_pagamento[],
  forma_entrada_padrao      = 'transferencia',
  forma_saida_padrao        = 'transferencia'
WHERE nome = 'Caixa de Aplicação';
