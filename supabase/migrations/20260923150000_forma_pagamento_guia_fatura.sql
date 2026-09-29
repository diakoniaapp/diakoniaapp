-- ─── fin_forma_pagamento — acrescenta "guia" e "fatura" ─────────────────
--
-- Pedido dela (23/09/2026): "preciso classificar corretamente despesas
-- pagas por Guias governamentais (ISS, FGTS, INSS, DARF, DAE, tributos,
-- taxas) e Faturas recorrentes (cartão de crédito, telefonia, internet,
-- energia, fornecedores que faturam mensalmente) sem usar 'Outro'".
--
-- `ALTER TYPE ... ADD VALUE` não roda na mesma transação em que o valor é
-- usado (§6.3 do CLAUDE.md, mesmo precedente de
-- `20260923120000_forma_pagamento_cheque.sql`) — as duas linhas abaixo só
-- ACRESCENTAM o valor, nenhuma USA (não há UPDATE/INSERT/comparação com
-- 'guia'/'fatura' aqui), por isso cabem na mesma migration sem violar a
-- regra. Quem lê e escreve os dois valores novos (FORMA_LABEL, tipos
-- TypeScript, ícones) é código de aplicação — nenhuma migration a mais
-- precisa: `fin_contas.formas_entrada_permitidas`/`formas_saida_permitidas`
-- já são `fin_forma_pagamento[]` com `NULL = sem restrição`, então as 5
-- contas de produção já aceitam os dois valores novos automaticamente,
-- sem backfill nenhum (mesma lógica que já valia pra "cheque").
ALTER TYPE public.fin_forma_pagamento ADD VALUE 'guia';
ALTER TYPE public.fin_forma_pagamento ADD VALUE 'fatura';
