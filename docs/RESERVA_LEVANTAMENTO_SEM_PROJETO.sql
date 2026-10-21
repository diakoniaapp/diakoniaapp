-- Levantamento (SÓ LEITURA, nada é gravado) — 21/10/2026: quanto das RECEITAS da Juventude e de Famílias está só no Centro de Custo, sem Projeto.
-- É o dinheiro que, hoje, ficaria FORA da reserva dos projetos "Retiro Juventude 2027" / "Retiro Famílias 2027".
--
-- Como usar: cole no editor SQL do Supabase e rode um comando por vez (são independentes). Para outro período, troque a data em `desde`.
-- Critério: receita (entrada) realizada ou conciliada — o mesmo que a reserva contaria —, fora transferência entre contas, com centro de custo cujo nome tem "juvent" ou "famil"
-- (ou subcentro de um centro assim) e SEM projeto.

-- 1) Resumo: por centro e por categoria
WITH desde AS (SELECT DATE '2026-01-01' AS d),
centros AS (
  SELECT c.id, c.nome FROM public.fin_centros_custo c
   WHERE c.nome ILIKE '%juvent%' OR c.nome ILIKE '%famil%'
      OR EXISTS (SELECT 1 FROM public.fin_centros_custo p WHERE p.id = c.centro_pai_id AND (p.nome ILIKE '%juvent%' OR p.nome ILIKE '%famil%'))
)
SELECT ce.nome AS centro,
       coalesce(cat.nome, '(sem categoria)') AS categoria,
       count(*) AS receitas,
       sum(l.valor) AS total,
       min(coalesce(l.data_pagamento, l.data)) AS primeira,
       max(coalesce(l.data_pagamento, l.data)) AS ultima
  FROM public.fin_lancamentos l
  JOIN centros ce ON ce.id = l.centro_custo_id
  LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
 WHERE l.tipo = 'entrada'
   AND l.status IN ('realizado', 'conciliado')
   AND l.origem IS DISTINCT FROM 'transferencia'
   AND l.projeto_id IS NULL
   AND coalesce(l.data_pagamento, l.data) >= (SELECT d FROM desde)
 GROUP BY ce.nome, cat.nome
 ORDER BY ce.nome, total DESC;

-- 2) A lista, linha a linha (para conferir antes de classificar com o projeto)
WITH desde AS (SELECT DATE '2026-01-01' AS d),
centros AS (
  SELECT c.id, c.nome FROM public.fin_centros_custo c
   WHERE c.nome ILIKE '%juvent%' OR c.nome ILIKE '%famil%'
      OR EXISTS (SELECT 1 FROM public.fin_centros_custo p WHERE p.id = c.centro_pai_id AND (p.nome ILIKE '%juvent%' OR p.nome ILIKE '%famil%'))
)
SELECT coalesce(l.data_pagamento, l.data) AS dia, ce.nome AS centro, coalesce(cat.nome, '(sem categoria)') AS categoria, l.valor,
       coalesce(l.descricao, '') AS descricao, l.id
  FROM public.fin_lancamentos l
  JOIN centros ce ON ce.id = l.centro_custo_id
  LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
 WHERE l.tipo = 'entrada'
   AND l.status IN ('realizado', 'conciliado')
   AND l.origem IS DISTINCT FROM 'transferencia'
   AND l.projeto_id IS NULL
   AND coalesce(l.data_pagamento, l.data) >= (SELECT d FROM desde)
 ORDER BY ce.nome, dia DESC;
