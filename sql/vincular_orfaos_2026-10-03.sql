-- ─── Vincular os PDFs órfãos de alta confiança — NÃO EXECUTADO ───────────
--
-- ATENÇÃO: este script só existe pra ser REVISADO. Ele grava em produção.
-- Foi preparado em 03/10/2026 e fica parado até a Telma aprovar o relatório
-- (decisão dela: "apresentar o relatório ANTES de efetivar a gravação").
--
-- O que faz: liga a um lançamento existente cada um dos 18 PDFs que o leitor
-- casou com confiança >= 85% (CNPJ + valor + data, ou valor líquido de cupom
-- com desconto). Os arquivos JÁ ESTÃO no bucket `fin-comprovantes` — nada é
-- enviado, movido ou apagado; só se cria a linha em `fin_lancamento_anexos`
-- apontando pro caminho que já existe. Preserva todo o material (pedido dela).
--
-- Validação independente: dos 13 vínculos que caem em agosto, os 13 batem com
-- um arquivo de nome real do arquivo da tesouraria (valor + dia); 0
-- contradições. Os outros 5 são de setembro (sem fonte independente).
--
-- FORA deste script, de propósito:
--   · 2 arquivos que são CÓPIAS EXATAS (mesmo hash) de anexos que o lançamento
--     já tem (Ágata R$ 53,00 e Mundial R$ 61,92) — ligar de novo duplicaria;
--   · os 10 casos da fila de revisão (60–84% e os de leitura corrigida);
--   · as 6 NF-e de compra parcelada no cartão (1 documento -> N parcelas);
--   · o Del Castilho R$ 255,30 (não tem lançamento).
--
-- Garantias: só insere se (a) o lançamento existe, (b) o arquivo existe no
-- storage e (c) nenhum anexo já aponta pra esse caminho — rodar duas vezes não
-- duplica. Esperado: "inseridos = 18" e "total_anexos = 20" (2 que já havia + 18).
--
-- `enviado_em` preserva a data original do envio (14, 15 e 24/09), não a de hoje.
-- `nome` é descritivo: o nome original dos arquivos se perdeu no envio (virou
-- timestamp.pdf).
--
-- PRÉ-REQUISITO: a migration 20261002200000 (tipos de documento, agora com RPA,
-- RPS e DPS). O bloco abaixo a repete de forma idempotente, por segurança — e a
-- lista de tipos TEM que ser idêntica à da migration: se este bloco recriasse a
-- constraint com uma lista MENOR, tiraria os tipos novos.

BEGIN;

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.fin_lancamento_anexos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.fin_lancamento_anexos
  ADD CONSTRAINT fin_lancamento_anexos_tipo_check
  CHECK (tipo IN ('nota_fiscal','boleto','comprovante','fatura','contrato','xml','rpa','rps','dps','outro','documento'));

WITH v(lancamento_id, url, tipo, nome, enviado_em) AS (VALUES
    ('fd01c259-cd7c-4783-a23a-7b8f4b151407', '0a932409-4082-43c3-8c77-1a0c6808cfd1/1789356095700.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 13/08/2026 R$ 52,74 (recuperado do envio de 14/09).pdf', '2026-09-14T03:21:34.960Z'),  -- 100% Caixinha 13/08/2026 R$ 52,74
    ('7ad66ace-1665-49b7-9e19-10a3b5dfc552', '278157c9-959e-410b-990f-dcd0b1ec7846/1789432525353.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 18/08/2026 R$ 45,94 (recuperado do envio de 15/09).pdf', '2026-09-15T00:35:24.740Z'),  -- 97% valor líquido (total - desconto)
    ('6d9ef4b2-ed51-43aa-9b5c-a7d480fb6e75', '480729b8-0d77-4d97-a93a-d1302614c576/1789433361499.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 25/08/2026 R$ 86,13 (recuperado do envio de 15/09).pdf', '2026-09-15T00:49:21.767Z'),  -- 97% valor líquido: 94,45 - 8,32
    ('141a5cb2-26d1-4ab6-a02d-0da83091e078', '50cd95ec-f220-4b9f-8406-3c7708253839/1789354525442.pdf', 'nota_fiscal', 'NFC-e Sendas Distribuidora S.A. 03/08/2026 R$ 29,90 (recuperado do envio de 14/09).pdf', '2026-09-14T02:55:24.840Z'),  -- 100% (leitura por OCR)
    ('c07c0a7e-101d-4f44-a0b4-8e8a8c4b7c08', '703fcb3e-c46b-4e2f-bc96-3dec987cf2d9/1789353624253.pdf', 'nota_fiscal', 'NFC-e Prodesc Benfica Embalagens LTD 05/09/2026 R$ 117,90 (recuperado do envio de 14/09).pdf', '2026-09-14T02:40:23.579Z'),  -- 100% setembro
    ('58f8995b-87d6-4939-bcd0-152566b050d6', '892b43a3-43e5-4fa9-b826-93cdb0a1d005/1789434690270.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 04/08/2026 R$ 32,77 (recuperado do envio de 15/09).pdf', '2026-09-15T01:11:30.445Z'),  -- 97% valor líquido: 33,78 - 1,01
    ('9664914d-47ab-48fc-baea-a49d6b972be5', '9205cb4f-e613-43df-87ad-a909c07b41f9/1789356186157.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 15/08/2026 R$ 39,95 (recuperado do envio de 14/09).pdf', '2026-09-14T03:23:05.500Z'),  -- 100% (leitura por OCR)
    ('01870c54-8931-48b9-8c78-c3c40db46dc5', 'a13a91bd-21fe-474c-b924-422b9ef93e24/1789434914352.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 04/08/2026 R$ 172,52 (recuperado do envio de 15/09).pdf', '2026-09-15T01:15:14.741Z'),  -- 97% valor líquido
    ('4d378c44-62d5-48e1-8b94-cf778539718a', 'a3952968-698d-4431-9887-b40d19209956/1789353456659.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 05/09/2026 R$ 108,90 (recuperado do envio de 14/09).pdf', '2026-09-14T02:37:36.564Z'),  -- 100% setembro
    ('fabe829b-ca90-4d48-864e-a33256f86bd7', 'ce3b7b50-b69a-4c39-b74c-eb05d42430ce/1789433587795.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 26/08/2026 R$ 25,92 (recuperado do envio de 15/09).pdf', '2026-09-15T00:53:08.078Z'),  -- 97% valor líquido
    ('c0f17e88-b886-41a1-bbab-193caa9a69e7', 'cfd90d68-49c9-41c9-82e2-f03e2e4045f2/1790212420382.pdf', 'boleto', 'Boleto Freecolor Comercio de Tintas, 23/09/2026 R$ 299,90 (recuperado do envio de 24/09).pdf', '2026-09-24T01:13:40.906Z'),  -- 100% Bradesco setembro
    ('8589c34f-0e4f-4697-add1-6e2ce25d0334', 'd6d30fdc-238c-46a1-a14a-3e5a50c990df/1789433053293.pdf', 'nota_fiscal', 'NFC-e Agata Com. Prod. de Hig. e Des 21/08/2026 R$ 94,00 (recuperado do envio de 15/09).pdf', '2026-09-15T00:44:13.868Z'),  -- 100%
    ('2c318585-690b-4ef4-b99f-bead9df03077', 'e29c5347-2b4e-419f-8750-b083b50367e1/1789356634646.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 18/08/2026 R$ 104,75 (recuperado do envio de 14/09).pdf', '2026-09-14T03:30:34.498Z'),  -- 97% valor líquido
    ('0442ec79-6120-4f2c-98ef-587f97036c1e', 'e95f780e-5767-4692-b72c-d32de0e61d71/1789435082094.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 11/08/2026 R$ 147,63 (recuperado do envio de 15/09).pdf', '2026-09-15T01:18:02.250Z'),  -- 97% valor líquido
    ('217d12ba-2acf-4930-ace9-099ce876f065', 'tmp/1789353891602.pdf', 'nota_fiscal', 'NFC-e Supermercado Mundial LTDA 09/09/2026 R$ 31,78 (recuperado do envio de 14/09).pdf', '2026-09-14T02:44:51.399Z'),  -- 97% setembro, valor líquido
    ('938efd2e-3d00-43d2-b3ac-24ed336d0c0f', 'tmp/1789355742874.pdf', 'nota_fiscal', 'NFC-e Fer- Fix 390 Comercial Comerci 12/08/2026 R$ 14,00 (recuperado do envio de 14/09).pdf', '2026-09-14T03:15:42.271Z'),  -- 100%
    ('9eca5a3a-87c2-45aa-bb78-eefe0951a0b2', 'tmp/1789355840094.pdf', 'nota_fiscal', 'NFC-e Fer- Fix 390 Comercial Comerci 12/08/2026 R$ 13,00 (recuperado do envio de 14/09).pdf', '2026-09-14T03:17:19.375Z'),  -- 100%
    ('1d4a2d9c-510f-41c0-91f9-a5e56108cf8f', 'tmp/1789422670089.pdf', 'nota_fiscal', 'NF-e Jafi Decoracoes LTDA 05/09/2026 R$ 89,50 (recuperado do envio de 14/09).pdf', '2026-09-14T21:51:09.627Z')   -- 100% setembro
)
INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url, nome, enviado_em)
SELECT v.lancamento_id::uuid, v.tipo, v.url, v.nome, v.enviado_em::timestamptz
FROM v
WHERE EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = v.lancamento_id::uuid)
  AND EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'fin-comprovantes' AND o.name = v.url)
  AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a WHERE a.url = v.url);

-- Conferência ANTES de confirmar: inseridos = 18 e total_anexos = 20.
-- Se não for isso, troque COMMIT por ROLLBACK.
SELECT
  (SELECT count(*) FROM public.fin_lancamento_anexos WHERE nome LIKE '%recuperado do envio%') AS inseridos,
  (SELECT count(*) FROM public.fin_lancamento_anexos) AS total_anexos;

COMMIT;
