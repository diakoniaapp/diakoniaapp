-- ─── Fase 1 (Quitação): VALIDAÇÃO DO HISTÓRICO — SOMENTE LEITURA ────────────────────────────────────────────────────────
-- Este script NÃO altera nada: só SELECT. Cole no SQL Editor do Supabase e rode inteiro; devolve UMA tabela (secao, item, valor, detalhe).
-- Guarde o resultado: é a linha de base para comparar depois da migration (os números de V1, V2 e V3 devem continuar idênticos).
-- Referência medida em 13/10/2026: 15.661 lançamentos · 5.774 saídas em vw_fin_ciclo (585 Prontas, 14 Em Aberto) · 336 vínculos · 0 envios.

WITH
v1 AS (
  SELECT 'V1 lançamentos por tipo/status' AS secao, tipo::text || ' / ' || status::text AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.fin_lancamentos GROUP BY tipo, status
),
v2 AS (
  SELECT 'V2 saldo das contas' AS secao, c.nome AS item, c.saldo_atual::text AS valor,
         'esperado ' || (c.saldo_inicial + COALESCE((SELECT sum(CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END)
                                                    FROM public.fin_lancamentos l
                                                   WHERE l.conta_id = c.id AND l.status IN ('realizado', 'conciliado')), 0))::text AS detalhe
    FROM public.fin_contas c
),
v3 AS (
  SELECT 'V3 estados do ciclo (vw_fin_ciclo)' AS secao, estado AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.vw_fin_ciclo GROUP BY estado
),
v4 AS (
  SELECT 'V4 saídas que parecem pagas por terceiro' AS secao,
         to_char(COALESCE(l.data_pagamento, l.data), 'YYYY-MM-DD') || ' · ' || l.status::text AS item,
         l.valor::text AS valor,
         left(COALESCE(l.descricao, '') || ' | ' || COALESCE(l.observacoes, ''), 140) AS detalhe
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
     AND (COALESCE(l.descricao, '') || ' ' || COALESCE(l.observacoes, '')) ~* '(reembols|adiant|pago pel|paga pel|pago por|cart[aã]o pessoal|ofertad|doad|cortesia|ressarc)'
   ORDER BY COALESCE(l.data_pagamento, l.data) DESC
   LIMIT 60
),
v4n AS (
  SELECT 'V4 total de candidatas' AS secao, 'saídas com esse texto' AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
     AND (COALESCE(l.descricao, '') || ' ' || COALESCE(l.observacoes, '')) ~* '(reembols|adiant|pago pel|paga pel|pago por|cart[aã]o pessoal|ofertad|doad|cortesia|ressarc)'
),
v5 AS (
  -- padrão fictício: uma ENTRADA em categoria de oferta/doação e uma SAÍDA (ou transferência) de mesmo valor em até 3 dias
  SELECT 'V5 padrão fictício (entrada + saída de mesmo valor)' AS secao,
         to_char(e.data, 'YYYY-MM-DD') || ' / ' || to_char(s.data, 'YYYY-MM-DD') AS item, e.valor::text AS valor,
         left('entrada: ' || COALESCE(e.descricao, '') || ' [' || COALESCE(ce.nome, '-') || '] → saída: ' || COALESCE(s.descricao, '') || ' (' || COALESCE(s.origem, '') || ')', 160) AS detalhe
    FROM public.fin_lancamentos e
    JOIN public.fin_lancamentos s ON s.tipo = 'saida' AND s.valor = e.valor AND abs(s.data - e.data) <= 3 AND s.id <> e.id
    LEFT JOIN public.fin_categorias ce ON ce.id = e.categoria_id
   WHERE e.tipo = 'entrada' AND e.status IN ('realizado', 'conciliado') AND s.status IN ('realizado', 'conciliado')
     AND (COALESCE(ce.nome, '') ~* '(oferta|doa[cç]|dízimo|dizimo)' OR COALESCE(e.descricao, '') ~* '(reembols|oferta|doa[cç])')
     AND (s.origem = 'transferencia' OR COALESCE(s.descricao, '') ~* '(reembols|oferta|doa[cç]|transfer)')
   ORDER BY e.data DESC
   LIMIT 60
),
v6 AS (
  SELECT 'V6 previstas com mais de 90 dias' AS secao, to_char(l.data, 'YYYY-MM-DD') AS item, l.valor::text AS valor,
         left(COALESCE(f.nome, p.nome_completo, '') || ' | ' || COALESCE(l.descricao, ''), 140) AS detalhe
    FROM public.fin_lancamentos l
    LEFT JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id
    LEFT JOIN public.membros p ON p.id = l.pessoa_id
   WHERE l.tipo = 'saida' AND l.status = 'previsto' AND l.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90
   ORDER BY l.data
   LIMIT 60
),
v6n AS (
  SELECT 'V6 total' AS secao, 'previstas com mais de 90 dias' AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.status = 'previsto' AND l.data < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90
),
v7 AS (
  -- as 17 NFs do escritório, pelo número do documento
  SELECT 'V7 as 17 NFs do escritório' AS secao, COALESCE(l.documento_numero, '-') || ' · ' || l.status::text AS item, l.valor::text AS valor,
         left(to_char(l.data, 'YYYY-MM-DD') || ' | ' || COALESCE(f.nome, '(sem fornecedor)') || ' | ' || COALESCE(l.descricao, ''), 160) AS detalhe
    FROM public.fin_lancamentos l
    LEFT JOIN public.fin_fornecedores f ON f.id = l.fornecedor_id
   WHERE l.documento_numero IN ('6942','344169','64','66','31606','3763','9922','53836','1621752','1047','7392','230048','230334','24553','166376','25597','184')
   ORDER BY l.documento_numero
),
v8 AS (
  SELECT 'V8 outros conceitos de reembolso' AS secao, 'arr_movimentos tipo ' || tipo::text AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.arr_movimentos WHERE tipo::text IN ('reembolso_pessoa', 'abate_compra_cnpj') GROUP BY tipo
  UNION ALL
  SELECT 'V8 outros conceitos de reembolso', 'fin_solicitacoes', count(*)::text, '' FROM public.fin_solicitacoes
),
v9 AS (
  SELECT 'V9 objetos que filtram realizado' AS secao, 'view ' || viewname AS item, '' AS valor, '' AS detalhe
    FROM pg_views WHERE schemaname = 'public' AND definition ILIKE '%realizado%'
  UNION ALL
  SELECT 'V9 objetos que filtram realizado', 'função ' || p.proname, '', ''
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ILIKE '%realizado%'
),
v10 AS (
  SELECT 'V10 gatilhos em fin_lancamentos' AS secao, tgname AS item, '' AS valor, left(pg_get_triggerdef(oid), 140) AS detalhe
    FROM pg_trigger WHERE tgrelid = 'public.fin_lancamentos'::regclass AND NOT tgisinternal
),
v11 AS (
  SELECT 'V11 usuários do financeiro' AS secao,
         COALESCE(pr.nome, '(sem nome)') || ' · ' || string_agg(DISTINCT ur.role::text, ',') AS item,
         CASE WHEN pr.pessoa_id IS NULL THEN 'sem pessoa_id' ELSE 'com pessoa_id' END AS valor, '' AS detalhe
    FROM public.user_roles ur
    JOIN public.profiles pr ON pr.id = ur.user_id
   WHERE ur.role::text IN ('admin', 'diakonia', 'secretaria', 'tesouraria')
   GROUP BY pr.nome, pr.pessoa_id
),
v12 AS (
  SELECT 'V12 fornecedores por tipo' AS secao, COALESCE(tipo, '(nulo)') AS item, count(*)::text AS valor,
         'com CNPJ/CPF: ' || count(*) FILTER (WHERE length(regexp_replace(COALESCE(cnpj_cpf, ''), '\D', '', 'g')) IN (11, 14))::text AS detalhe
    FROM public.fin_fornecedores GROUP BY tipo
),
v13 AS (
  SELECT 'V13 tipos de anexo' AS secao, tipo AS item, count(*)::text AS valor, '' AS detalhe
    FROM public.fin_lancamento_anexos GROUP BY tipo
)
SELECT * FROM v1 UNION ALL SELECT * FROM v2 UNION ALL SELECT * FROM v3 UNION ALL SELECT * FROM v4n UNION ALL SELECT * FROM v4
UNION ALL SELECT * FROM v5 UNION ALL SELECT * FROM v6n UNION ALL SELECT * FROM v6 UNION ALL SELECT * FROM v7 UNION ALL SELECT * FROM v8
UNION ALL SELECT * FROM v9 UNION ALL SELECT * FROM v10 UNION ALL SELECT * FROM v11 UNION ALL SELECT * FROM v12 UNION ALL SELECT * FROM v13
ORDER BY 1, 2;
