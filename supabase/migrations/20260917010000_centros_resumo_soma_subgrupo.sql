-- ─── Resumo de centro de custo soma o gasto dos subgrupos no pai ─────────
--
-- Defeito: `vw_fin_centros_resumo` (gasto_90d, recebido_90d, gasto_mes,
-- qtd_lancamentos_90d, ultima_movimentacao) comparava
-- `l.centro_custo_id = cc.id` na igualdade exata — o mesmo defeito que
-- `vw_fin_orcamento_vs_real` já recebeu na migration
-- 20260917000000_orcamento_vs_real_soma_subgrupo.sql, só que aqui é a
-- view que alimenta o RANKING de /financas/centros, a aba "Por tipo" e
-- FinancasInsights.tsx (a mesma sessão já corrigiu o lado client desses
-- dois pra não sumir com o gasto do subgrupo, mas a origem do número —
-- esta view — continuava contando só o centro exato).
--
-- Medido ao vivo antes de aplicar: "Min. Administração" aparecia com
-- gasto_90d = 0 no ranking, com "8 lançamento(s) nos últimos 90d" do
-- lado — o print que a Telma mandou perguntando "onde encontro essa
-- tela" já mostrava esse sintoma, sem ninguém ainda ter notado o defeito
-- por trás. O dinheiro de verdade estava em "Administração · Patrimônio"
-- e "· Pessoal", filhos por `centro_pai_id`.
--
-- CREATE OR REPLACE VIEW: mesmas colunas, mesmo nome, mesma ordem — só
-- as 5 subconsultas de soma/contagem mudaram, de "= cc.id" pra "= cc.id
-- OU é filho de cc.id".
CREATE OR REPLACE VIEW vw_fin_centros_resumo AS
SELECT
  id,
  nome,
  vinculo_tipo,
  vinculo_id,
  vinculo_nome,
  centro_pai_id,
  cor,
  ativo,
  COALESCE((
    SELECT sum(l.valor)
    FROM fin_lancamentos l
    WHERE (l.centro_custo_id = cc.id OR l.centro_custo_id IN (SELECT id FROM fin_centros_custo WHERE centro_pai_id = cc.id))
      AND l.tipo = 'saida'
      AND l.status IN ('realizado', 'conciliado')
      AND l.data >= (CURRENT_DATE - interval '90 days')
  ), 0::numeric) AS gasto_90d,
  COALESCE((
    SELECT sum(l.valor)
    FROM fin_lancamentos l
    WHERE (l.centro_custo_id = cc.id OR l.centro_custo_id IN (SELECT id FROM fin_centros_custo WHERE centro_pai_id = cc.id))
      AND l.tipo = 'entrada'
      AND l.status IN ('realizado', 'conciliado')
      AND l.data >= (CURRENT_DATE - interval '90 days')
  ), 0::numeric) AS recebido_90d,
  COALESCE((
    SELECT sum(l.valor)
    FROM fin_lancamentos l
    WHERE (l.centro_custo_id = cc.id OR l.centro_custo_id IN (SELECT id FROM fin_centros_custo WHERE centro_pai_id = cc.id))
      AND l.tipo = 'saida'
      AND l.status IN ('realizado', 'conciliado')
      AND l.data >= date_trunc('month', CURRENT_DATE)
  ), 0::numeric) AS gasto_mes,
  COALESCE((
    SELECT count(l.id)
    FROM fin_lancamentos l
    WHERE (l.centro_custo_id = cc.id OR l.centro_custo_id IN (SELECT id FROM fin_centros_custo WHERE centro_pai_id = cc.id))
      AND l.data >= (CURRENT_DATE - interval '90 days')
  ), 0::bigint)::integer AS qtd_lancamentos_90d,
  (
    SELECT max(l.data)
    FROM fin_lancamentos l
    WHERE l.centro_custo_id = cc.id OR l.centro_custo_id IN (SELECT id FROM fin_centros_custo WHERE centro_pai_id = cc.id)
  ) AS ultima_movimentacao
FROM fin_centros_custo cc
WHERE ativo;
