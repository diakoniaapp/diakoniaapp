-- SÓ LEITURA — não grava nada. Um comando só. Rode DEPOIS de aplicar o índice único do Invest Fácil e a correção de fin_recalc_saldo_conta.
-- Cada linha tem de terminar em OK. (A auditoria do extrato com OFX+PDF é feita na tela /financas/auditoria-extrato; esta aqui confere o banco.)
SELECT ordem, item, resultado, detalhe FROM (
  SELECT 1 AS ordem, 'índice único do Invest Fácil' AS item,
         CASE WHEN EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                            WHERE c.relname = 'fin_lancamentos_invest_pdf_chave_uq' AND c.relnamespace = 'public'::regnamespace AND i.indisvalid AND i.indisunique)
              THEN 'OK' ELSE 'FALTA' END AS resultado,
         'existe, é válido e é único' AS detalhe
  UNION ALL
  SELECT 2, 'chaves do Invest Fácil repetidas na mesma conta',
         CASE WHEN n = 0 THEN 'OK' ELSE 'CONFLITO' END, n::text || ' conflito(s)'
    FROM (SELECT count(*) AS n FROM (
            SELECT x.conta_id, x.chave
              FROM (SELECT conta_id, substring(observacoes from '\[invest-pdf:([^\]]+)\]') AS chave
                      FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:%') x
             WHERE x.chave IS NOT NULL GROUP BY x.conta_id, x.chave HAVING count(*) > 1) g) d0
  UNION ALL
  SELECT 3, 'fin_recalc_saldo_conta trava a conta antes de somar',
         CASE WHEN lower(pg_get_functiondef(p.oid)) ~ 'for (no key )?update' THEN 'OK' ELSE 'NÃO TRAVA' END,
         CASE WHEN lower(pg_get_functiondef(p.oid)) ~ 'for (no key )?update' THEN 'JÁ TRAVA' ELSE 'a função ainda é a antiga' END
    FROM pg_proc p WHERE p.proname = 'fin_recalc_saldo_conta' AND p.pronamespace = 'public'::regnamespace
  UNION ALL
  SELECT 4, 'contas com saldo_atual diferente do calculado',
         CASE WHEN count(*) FILTER (WHERE abs(guardado - devido) >= 0.005) = 0 THEN 'OK' ELSE 'DIVERGE' END,
         count(*) FILTER (WHERE abs(guardado - devido) >= 0.005) || ' de ' || count(*) || ' conta(s)'
    FROM (SELECT c.saldo_atual AS guardado,
                 c.saldo_inicial + coalesce((SELECT sum(CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END)
                                               FROM public.fin_lancamentos l WHERE l.conta_id = c.id AND l.status IN ('realizado', 'conciliado')), 0) AS devido
            FROM public.fin_contas c) s
  UNION ALL
  SELECT 5, 'transferências do Invest Fácil já gravadas (lançamentos com a marca)', 'INFO', count(*)::text || ' linha(s) — 2 por transferência'
    FROM public.fin_lancamentos WHERE observacoes LIKE '%[invest-pdf:%'
) t ORDER BY ordem;
