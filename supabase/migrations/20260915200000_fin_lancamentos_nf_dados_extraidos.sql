-- ─── fin_lancamentos.nf_dados_extraidos ───────────────────────────────────
--
-- Fase 3 do pedido da Telma (15/09/2026): "quero que exista um campo de
-- descrição, com os itens da nota... essa leitura tem que ser precisa e
-- não permitir edição, para ser fiel ao documento". O campo `descricao`
-- (texto livre) continua existindo e editável pra lançamentos manuais —
-- este campo novo guarda a leitura ESTRUTURADA da nota fiscal (fornecedor,
-- CNPJ, número do documento, itens com quantidade/unidade/valor), separada
-- do que a tesouraria digita ou ajusta depois. É o registro fiel ao
-- arquivo anexado (`comprovante_url`), sobrevivendo mesmo se `descricao`,
-- categoria ou centro de custo forem editados posteriormente.
--
-- Calibrado em cima de notas REAIS baixadas do Drive dela (SENDAS
-- DISTRIBUIDORA, PRODESC BENFICA EMBALAGENS) — `ocrService.ts` só
-- preenche isto quando a leitura vem de texto exato do PDF (`fonte:
-- "pdf_texto"`) E reconhece o formato "Consulta da NF-e" da Sefaz (itens
-- não vazios); nunca a partir de OCR aproximado.
ALTER TABLE fin_lancamentos
  ADD COLUMN nf_dados_extraidos jsonb;

COMMENT ON COLUMN fin_lancamentos.nf_dados_extraidos IS
  'Leitura estruturada da nota fiscal anexada (fornecedor, CNPJ, número, itens) -- só gravado quando a leitura veio de texto exato do PDF (fonte pdf_texto), nunca de OCR aproximado. Ver ocrService.ts (extrairItensDaNota) e LancamentoForm.tsx.';
