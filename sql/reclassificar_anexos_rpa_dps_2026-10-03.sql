-- ─── Reclassificar 2 anexos "Outro" → RPA e DPS — NÃO EXECUTADO ──────────
--
-- Em 03/10/2026 a Telma anexou, pela tela de anexos, os documentos de dois
-- lançamentos antes de existirem os tipos RPA/RPS/DPS, e usou "Outro" para eles
-- (o comprovante de cada um foi anexado como "Comprovante", que já existia).
-- Agora que RPA, RPS e DPS são tipos nativos, estas duas linhas devem refletir
-- o que são — o dossiê e a Auditoria dependem do tipo.
--
-- ORDEM: rodar DEPOIS da migration 20261002200000 (que cria os tipos). Antes dela,
-- o banco recusa 'rpa' e 'dps'.
--
-- Só muda a coluna `tipo` das duas linhas, identificadas por id; nome, arquivo,
-- lançamento e `enviado_em` (que define a ordem das páginas do dossiê) ficam
-- como estão. Esperado: "atualizados = 2".

BEGIN;

UPDATE public.fin_lancamento_anexos SET tipo = 'rpa'
WHERE id = 'edb0a113-bfb0-415a-bc41-01fd19d38d1b'   -- 04.09.2026 - R$760,00 RPA ANA PATRICIA DA SILVA DE LIMA …
  AND tipo = 'outro';

UPDATE public.fin_lancamento_anexos SET tipo = 'dps'
WHERE id = '360beeb1-15f5-4623-bcd1-13b0744094a6'   -- 04.09.2026 - R$1.933,00 DPS TAYANE CLAUDIO.pdf
  AND tipo = 'outro';

SELECT count(*) AS atualizados
FROM public.fin_lancamento_anexos
WHERE id IN ('edb0a113-bfb0-415a-bc41-01fd19d38d1b', '360beeb1-15f5-4623-bcd1-13b0744094a6')
  AND tipo IN ('rpa', 'dps');

COMMIT;
