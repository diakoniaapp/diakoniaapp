-- DESFAZER a migration 20261013120000 (D4). Remove os gatilhos e devolve a view vw_fin_ciclo anterior (a da migration 20261013110000).
-- POR PADRÃO MANTÉM a tabela fin_extrato_vinculos e as 3 colunas de conferência: o vínculo é patrimônio histórico e desligar os gatilhos não deve apagá-lo.
-- Sem os gatilhos, a tabela deixa de ser atualizada (a marca [ofx:…] em observacoes continua valendo e a view anterior a lê). Nenhum dado de lançamento muda.
DROP TRIGGER IF EXISTS fin_lanc_vinculos_inserir ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_vinculos_atualizar ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_vinculos_apagar ON public.fin_lancamentos;
DROP FUNCTION IF EXISTS public.fin_vinculos_apos_gravar();
DROP FUNCTION IF EXISTS public.fin_vinculos_antes_de_apagar();
DROP FUNCTION IF EXISTS public.fin_marcas_do_extrato(text);

-- a view precisa perder as 4 colunas novas: recria-se do zero
DROP VIEW IF EXISTS public.vw_fin_ciclo;
CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
-- o último dia coberto por um extrato importado, por conta (o PDF do Invest Fácil, `[ofx:PDF:…]`, não é extrato de conta corrente)
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC   -- o desempate só importa quando duas linhas do extrato têm a mesma data
),
-- grupos (obrigações) com ao menos um documento: qualquer anexo que não seja comprovante, em qualquer linha do grupo
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo <> 'comprovante'
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (l.observacoes ~ '\[ofx:[^\]]+\]') AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    CROSS JOIN hoje h
   WHERE l.tipo = 'saida' AND l.origem <> 'transferencia'
),
fatos AS (
  SELECT b.*,
         (b.status IN ('realizado', 'conciliado')) AS paga,
         CASE WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         -- conta com extrato: só o vínculo (ou o histórico) concilia; conta sem extrato: a conferência humana basta
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;

-- SÓ se realmente quiser apagar o histórico dos vínculos e a conferência (NÃO recomendado), descomente:
-- DROP TABLE IF EXISTS public.fin_extrato_vinculos;
-- ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS conferido_em, DROP COLUMN IF EXISTS conferido_por, DROP COLUMN IF EXISTS conferencia_nota;
