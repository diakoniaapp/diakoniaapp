-- ─── Data de emissão do documento no lançamento (22/10/2026) ─────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela (22/10/2026): "considere ter um campo data da emissão + data de vencimento + data de pagamento". O lançamento já tinha vencimento (`data`), pagamento (`data_pagamento`) e
-- competência (`data_competencia`); faltava a EMISSÃO — quando a nota, o boleto ou a fatura foi emitido. O leitor de documentos já extrai esse dia, mas ele só servia para casar o documento
-- com o lançamento e se perdia. Agora fica guardado, opcional, e a pessoa pode corrigi-lo.
--
-- O que esta migration faz — e só isto:
--   · coluna `fin_lancamentos.data_emissao date NULL` (sem default, sem NOT NULL: lançamento sem documento, ou antigo, continua sem emissão).
-- Não mexe em nenhum valor existente, em saldo, em vencimento, pagamento ou competência, e não preenche nada retroativamente (o preenchimento vem da leitura do documento, na tela).
-- Reverter: docs/DATA_EMISSAO_ROLLBACK.sql. Ensaio: docs/DATA_EMISSAO_ENSAIO.mjs.

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS data_emissao date;

COMMENT ON COLUMN public.fin_lancamentos.data_emissao IS
  'Quando o documento (nota fiscal, boleto, fatura) foi EMITIDO. Opcional. Diferente de `data` (vencimento), `data_pagamento` (quando o banco movimentou) e `data_competencia` (a que mês o gasto pertence).';
