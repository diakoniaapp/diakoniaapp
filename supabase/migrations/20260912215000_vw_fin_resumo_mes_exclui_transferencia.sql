-- ─── vw_fin_resumo_mes: transferência entre contas inflava entradas/saídas ──
--
-- Achado ao vivo (12/09/2026), comparando o Painel (/financas) com a nova
-- tela de Prestação de Contas: "Entradas do mês R$ 4.222,00" e "Saídas do
-- mês R$ 2.000,00" em produção, mas a única saída real do mês é uma
-- transferência interna (Bradesco → Caixinha Administrativo) — não existe
-- despesa nenhuma realizada em setembro.
--
-- Causa: `criarTransferencia()` (finService.ts) grava DOIS lançamentos por
-- transferência — uma saída na conta de origem, uma entrada na de destino,
-- ambos com `origem = 'transferencia'` — para que o SALDO de cada conta
-- individual fique certo (di isso ela precisa mesmo). `vw_fin_resumo_mes`
-- soma entradas_mes/saidas_mes de TODAS as contas juntas sem excluir esse
-- par, e dinheiro só mudando de bolso (de uma conta da igreja para outra)
-- passa a contar como entrada E como saída de verdade — infla os dois
-- lados, embora o saldo_total continue certo (as duas pontas se cancelam
-- ali, porque soma saldo_atual por conta, não fluxo).
--
-- Corrigido: entradas_mes/saidas_mes agora excluem `origem = 'transferencia'`.
-- saldo_total e previstas_mes não mudam — não tinham o problema.
--
-- `CREATE OR REPLACE VIEW` só aceita coluna nova no fim (CLAUDE.md §6.3) —
-- esta migration não mexe na lista de colunas, só no WHERE de duas delas.

CREATE OR REPLACE VIEW public.vw_fin_resumo_mes AS  WITH mes_atual AS (
         SELECT date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date AS ini,
            (date_trunc('month'::text, CURRENT_DATE::timestamp with time zone) + '1 mon -1 days'::interval)::date AS fim
        )
 SELECT ( SELECT COALESCE(sum(fin_contas.saldo_atual), 0::numeric) AS "coalesce"
           FROM fin_contas
          WHERE fin_contas.ativo) AS saldo_total,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'entrada'::fin_movimento_tipo AND l.origem <> 'transferencia' AND l.data >= m.ini AND l.data <= m.fim AND (l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status]))) AS entradas_mes,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'saida'::fin_movimento_tipo AND l.origem <> 'transferencia' AND l.data >= m.ini AND l.data <= m.fim AND (l.status = ANY (ARRAY['realizado'::fin_lancamento_status, 'conciliado'::fin_lancamento_status]))) AS saidas_mes,
    ( SELECT COALESCE(sum(l.valor), 0::numeric) AS "coalesce"
           FROM fin_lancamentos l,
            mes_atual m
          WHERE l.tipo = 'saida'::fin_movimento_tipo AND l.status = 'previsto'::fin_lancamento_status AND l.data >= CURRENT_DATE AND l.data <= m.fim) AS previstas_mes;
