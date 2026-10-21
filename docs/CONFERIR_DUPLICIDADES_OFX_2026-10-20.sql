-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONFERÊNCIA (SÓ LEITURA) — movimentos do Bradesco lançados duas vezes pelo OFX de 20/10/2026
-- Não altera nada. Cole no SQL Editor do Supabase e rode.
--
-- O que procura: lançamentos criados HOJE pela conciliação do OFX (origem importado_ofx) que têm um "gêmeo" mais antigo —
-- mesma conta, mesmo sentido, mesmo valor e mesmo dia do movimento — já gravado em 08–14/10 com OUTRO identificador do banco.
-- O pareamento é 1 para 1 (o 1º de hoje com o 1º antigo, o 2º com o 2º…), para dois PIX de R$ 20 no mesmo dia não casarem com o mesmo.
-- Medido no navegador em 20/10 (19h40): 52 pares — 12 saídas (R$ 13.109,50) e 40 entradas (R$ 19.039,68).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- 1 · A lista dos pares (olhe com os olhos antes de qualquer decisão; os 16 de deslocamento isolado são os que pedem conferência)
WITH novos AS (
  SELECT l.id, l.conta_id, l.tipo, l.valor, l.data AS dia, l.created_at,
         substring(l.observacoes from '\[ofx:([A-Z0-9]+)\]') AS fitid,
         row_number() OVER (PARTITION BY l.conta_id, l.tipo, l.valor, l.data ORDER BY l.created_at, l.id) AS ordem
    FROM public.fin_lancamentos l
   WHERE l.origem = 'importado_ofx' AND l.created_at >= DATE '2026-10-20' AND l.observacoes ~ '\[ofx:'
), antigos AS (
  SELECT l.id, l.conta_id, l.tipo, l.valor, COALESCE(l.data_pagamento, l.data) AS dia, l.origem, l.status, l.created_at,
         substring(l.observacoes from '\[ofx:([A-Z0-9]+)\]') AS fitid,
         row_number() OVER (PARTITION BY l.conta_id, l.tipo, l.valor, COALESCE(l.data_pagamento, l.data) ORDER BY l.created_at, l.id) AS ordem
    FROM public.fin_lancamentos l
   WHERE l.created_at < DATE '2026-10-20' AND l.observacoes ~ '\[ofx:' AND l.status <> 'previsto' AND l.origem <> 'transferencia'
)
SELECT n.dia, n.tipo, n.valor,
       n.fitid AS fitid_de_hoje, a.fitid AS fitid_antigo,
       ('x' || lpad(substr(a.fitid, 2), 8, '0'))::bit(32)::int - ('x' || lpad(substr(n.fitid, 2), 8, '0'))::bit(32)::int AS deslocamento,
       a.origem AS origem_antiga, a.status AS status_antigo,
       n.id AS lancamento_de_hoje, a.id AS lancamento_antigo
  FROM novos n JOIN antigos a USING (conta_id, tipo, valor, dia, ordem)
 ORDER BY n.dia, n.valor DESC;

-- 2 · O total (esperado: 52 pares · 12 saídas = 13.109,50 · 40 entradas = 19.039,68)
WITH novos AS (
  SELECT l.id, l.conta_id, l.tipo, l.valor,
         row_number() OVER (PARTITION BY l.conta_id, l.tipo, l.valor, l.data ORDER BY l.created_at, l.id) AS ordem, l.data AS dia
    FROM public.fin_lancamentos l
   WHERE l.origem = 'importado_ofx' AND l.created_at >= DATE '2026-10-20' AND l.observacoes ~ '\[ofx:'
), antigos AS (
  SELECT l.conta_id, l.tipo, l.valor, COALESCE(l.data_pagamento, l.data) AS dia,
         row_number() OVER (PARTITION BY l.conta_id, l.tipo, l.valor, COALESCE(l.data_pagamento, l.data) ORDER BY l.created_at, l.id) AS ordem
    FROM public.fin_lancamentos l
   WHERE l.created_at < DATE '2026-10-20' AND l.observacoes ~ '\[ofx:' AND l.status <> 'previsto' AND l.origem <> 'transferencia'
)
SELECT n.tipo, count(*) AS pares, sum(n.valor) AS valor
  FROM novos n JOIN antigos a USING (conta_id, tipo, valor, dia, ordem)
 GROUP BY n.tipo ORDER BY n.tipo;
