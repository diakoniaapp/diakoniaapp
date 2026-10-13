-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261013110000 (D2 + D5: a view `vw_fin_ciclo`, o estado oficial da despesa) contra os dados REAIS ──────────────────────
-- Cria a view dentro de uma transação que será desfeita e confere: (1) ela devolve UMA linha por saída (fora de transferências), sem repetir nem perder; (2) nenhum
-- estado vem vazio; (3) as contagens por estado e por conferência (vínculo / manual / histórico); (4) nada nas tabelas mudou. O relatório lista os números para você
-- comparar com o que o aplicativo mostra. Se algo divergir, a mensagem diz FALHOU e você NÃO aplica.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true;
  n_base bigint; n_view bigint; n_dup bigint; n_nulos bigint; n_lanc_antes bigint; n_lanc_depois bigint;
  por_estado text; por_conf text; em_aberto_atrasadas bigint;
BEGIN
  SELECT count(*) INTO n_lanc_antes FROM public.fin_lancamentos;
  SELECT count(*) INTO n_base FROM public.fin_lancamentos WHERE tipo = 'saida' AND origem <> 'transferencia';

  -- ── a migration inteira ──
  -- comando 1 da migration
  EXECUTE $m1$CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
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
  FROM decididos d;$m1$;
  -- comando 2 da migration
  EXECUTE $m2$COMMENT ON VIEW public.vw_fin_ciclo IS 'O estado de cada despesa (saída, fora de transferências): prevista, em_aberto (com atraso_dias), pagamento_realizado, aguardando_conciliacao, conciliada, pronta_para_malote ou cancelada. Espelho SQL de lib/cicloDaDespesa.ts. Conciliada = vínculo com o banco; conferencia = vinculo | manual | historico. Documento é da obrigação (grupo); comprovante é da linha. security_invoker: vale a RLS de fin_lancamentos.';$m2$;
  -- comando 3 da migration
  EXECUTE $m3$GRANT SELECT ON public.vw_fin_ciclo TO authenticated;$m3$;

  SELECT count(*) INTO n_view FROM public.vw_fin_ciclo;
  SELECT count(*) INTO n_dup FROM (SELECT lancamento_id FROM public.vw_fin_ciclo GROUP BY lancamento_id HAVING count(*) > 1) x;
  SELECT count(*) INTO n_nulos FROM public.vw_fin_ciclo WHERE estado IS NULL;
  SELECT string_agg(estado || '=' || n, ', ' ORDER BY estado) INTO por_estado FROM (SELECT estado, count(*) n FROM public.vw_fin_ciclo GROUP BY estado) s;
  SELECT string_agg(COALESCE(conferencia, 'sem') || '=' || n, ', ' ORDER BY conferencia) INTO por_conf FROM (SELECT conferencia, count(*) n FROM public.vw_fin_ciclo WHERE estado NOT IN ('prevista', 'em_aberto', 'cancelada') GROUP BY conferencia) s;
  SELECT count(*) INTO em_aberto_atrasadas FROM public.vw_fin_ciclo WHERE estado = 'em_aberto' AND atraso_dias > 0;
  SELECT count(*) INTO n_lanc_depois FROM public.fin_lancamentos;

  rel := format('%s saídas (fora de transferências) → a view devolve %s linhas. Por estado: %s. Pagas por conferência: %s. Em Aberto atrasadas: %s.', n_base, n_view, por_estado, por_conf, em_aberto_atrasadas);
  IF n_view <> n_base THEN ok := false; rel := rel || ' FALHOU: a view não devolve uma linha por saída.'; END IF;
  IF n_dup > 0 THEN ok := false; rel := rel || format(' FALHOU: %s lançamentos repetidos na view.', n_dup); END IF;
  IF n_nulos > 0 THEN ok := false; rel := rel || format(' FALHOU: %s linhas sem estado.', n_nulos); END IF;
  IF n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: o total de lançamentos mudou.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
