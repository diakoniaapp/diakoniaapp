-- ─── Orçamento vs. real soma o gasto dos subgrupos no centro pai ─────────
--
-- Defeito: `vw_fin_orcamento_vs_real.valor_real` comparava
-- `l.centro_custo_id = o.centro_custo_id` na igualdade exata — um
-- orçamento definido no centro PAI (ex.: "Min. Administração") nunca
-- somava o gasto de verdade, porque a Fase 3 (20260912200500) manda o
-- dinheiro real pros SUBGRUPOS ("Administração · Patrimônio" etc.), não
-- pro pai. Até 16/09/2026 isso não aparecia porque só existiam os 5
-- subgrupos de Administração e nenhum orçamento tinha sido criado ainda
-- em cima do pai; virou visível na mesma sessão em que o subgrupo
-- contábil foi generalizado pra qualquer ministério (17/09/2026,
-- CentroCustoForm.tsx) — a Telma perguntou diretamente "o cálculo de
-- quanto esse ministério já gastou pode não estar somando os subgrupos
-- dele", e a resposta medida foi: não estava.
--
-- Mesmo defeito, mesma correção, que `agruparAdministracao()` em
-- prestacaoContasService.ts já recebeu nesta sessão pro relatório
-- oficial — aqui é a view que alimenta os alertas de orçamento
-- ("acima_orcamento"/"orcamento_atencao" em fin_alertas_centros()) e a
-- tela /financas/orcamento.
--
-- Alternativa descartada: mudar `fin_orcamentos` pra guardar uma lista
-- de centros por linha. Desnecessário — a relação `centro_pai_id` já
-- existe em `fin_centros_custo`; um orçamento no pai já soma o pai +
-- filhos por essa mesma relação, sem duplicar dado nenhum.
--
-- CREATE OR REPLACE VIEW: mesmas colunas, mesmo nome, mesma ordem — só a
-- subconsulta de soma mudou.
CREATE OR REPLACE VIEW vw_fin_orcamento_vs_real AS
WITH mes_atual AS (
  SELECT
    EXTRACT(year FROM CURRENT_DATE)::integer AS ano,
    EXTRACT(month FROM CURRENT_DATE)::integer AS mes,
    date_trunc('month', CURRENT_DATE)::date AS ini,
    (date_trunc('month', CURRENT_DATE) + interval '1 mon -1 days')::date AS fim
)
SELECT
  o.id,
  o.ano,
  o.mes,
  o.centro_custo_id,
  o.categoria_id,
  cc.nome AS centro_nome,
  o.valor_planejado,
  COALESCE((
    SELECT sum(l.valor)
    FROM fin_lancamentos l, mes_atual m
    WHERE (
        l.centro_custo_id = o.centro_custo_id
        OR l.centro_custo_id IN (
          SELECT id FROM fin_centros_custo WHERE centro_pai_id = o.centro_custo_id
        )
      )
      AND (o.categoria_id IS NULL OR l.categoria_id = o.categoria_id)
      AND l.tipo = 'saida'
      AND l.status IN ('realizado', 'conciliado')
      AND l.data >= m.ini AND l.data <= m.fim
  ), 0::numeric) AS valor_real,
  CASE
    WHEN o.valor_planejado = 0::numeric THEN 0::numeric
    ELSE round(100.0 * COALESCE((
      SELECT sum(l.valor)
      FROM fin_lancamentos l, mes_atual m
      WHERE (
          l.centro_custo_id = o.centro_custo_id
          OR l.centro_custo_id IN (
            SELECT id FROM fin_centros_custo WHERE centro_pai_id = o.centro_custo_id
          )
        )
        AND (o.categoria_id IS NULL OR l.categoria_id = o.categoria_id)
        AND l.tipo = 'saida'
        AND l.status IN ('realizado', 'conciliado')
        AND l.data >= m.ini AND l.data <= m.fim
    ), 0::numeric) / o.valor_planejado, 1)
  END AS percentual_consumido
FROM fin_orcamentos o
JOIN fin_centros_custo cc ON cc.id = o.centro_custo_id
CROSS JOIN mes_atual ma
WHERE (o.mes IS NULL OR o.mes = ma.mes) AND o.ano = ma.ano;
