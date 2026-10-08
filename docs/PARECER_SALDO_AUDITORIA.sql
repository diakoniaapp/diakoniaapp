-- SÓ LEITURA — não grava nada. Um comando só; devolve uma tabela.
-- ─── Auditoria do saldo_atual de todas as contas + definição de fin_recalc_saldo_conta que está NO BANCO ──────────────────────────────────
-- 1) Uma linha por conta: saldo_atual guardado × saldo_inicial + Σ(realizado/conciliado) calculado agora. Diferença ≠ 0 é o rastro da corrida
--    descrita em docs/PARECER_SALDO_CONCORRENCIA.md (ou de qualquer outro defeito de saldo) — e se corrige sozinha no próximo lançamento da conta.
-- 2) A linha final traz o texto da função que está em produção e diz se ela já trava a linha da conta antes de somar (o repositório tem o corpo
--    SEM o travamento; esta linha confirma que o banco não difere do repositório).
WITH calculado AS (
  SELECT c.id, c.nome, c.saldo_atual AS guardado,
         c.saldo_inicial + coalesce((SELECT sum(CASE WHEN l.tipo = 'entrada' THEN l.valor ELSE -l.valor END)
                                       FROM public.fin_lancamentos l WHERE l.conta_id = c.id AND l.status IN ('realizado', 'conciliado')), 0) AS devido
    FROM public.fin_contas c
)
SELECT ordem, secao, conta, guardado, devido, diferenca, detalhe FROM (
  SELECT 1 AS ordem, 'conta' AS secao, nome AS conta, guardado, devido, guardado - devido AS diferenca,
         CASE WHEN abs(guardado - devido) < 0.005 THEN 'OK' ELSE 'DIVERGE — o próximo lançamento da conta recalcula; ou rode SELECT public.fin_recalc_saldo_conta(''' || id::text || ''')' END AS detalhe
    FROM calculado
  UNION ALL
  SELECT 2, 'resumo', count(*) FILTER (WHERE abs(guardado - devido) >= 0.005) || ' conta(s) divergente(s) de ' || count(*), NULL, NULL, sum(guardado - devido), ''
    FROM calculado
  UNION ALL
  SELECT 3, 'função no banco',
         CASE WHEN lower(pg_get_functiondef(p.oid)) ~ 'for (no key )?update' THEN 'JÁ TRAVA a conta antes de somar' ELSE 'NÃO trava a conta (como no repositório)' END,
         NULL, NULL, NULL, pg_get_functiondef(p.oid)
    FROM pg_proc p WHERE p.proname = 'fin_recalc_saldo_conta' AND p.pronamespace = 'public'::regnamespace
) t
ORDER BY ordem, abs(coalesce(diferenca, 0)) DESC, conta;
