-- ─── Os resumos diário e semanal mostram QUEM VAI RECEBER o reembolso, não só o fornecedor — 22/10/2026 ──────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: quando um terceiro quitou a despesa (Política de Compras por Terceiros) e o reembolso está aprovado, a obrigação da igreja é com QUEM PAGOU. A Tesouraria precisa ver, na hora:
--   Lúcio · Quitou: Leandro · Valor: R$ 500,00 · Conta prevista para pagamento: Caixinha Administrativa.
-- Hoje o e-mail diário NÃO lista reembolso nenhum (a obrigação sai da lista de pagar assim que há reembolso) e o semanal só diz "N reembolsos, R$ X". Esta função dá a lista.
--
-- O que muda: UMA função nova, só de leitura — `resumo_reembolsos_a_pagar()` — com uma linha por reembolso na fila `reembolso_a_pagar` de `vw_fin_quitacao` (aprovado e com saldo a pagar):
--   quem_recebe  = o terceiro que pagou (pessoa em `membros` ou empresa/entidade em `fin_fornecedores`);   quitou = o fornecedor da obrigação;   valor = o SALDO a reembolsar (mesma conta do bloco
--   "Reembolsos" do resumo semanal: COALESCE(saldo_a_reembolsar, valor_obrigacao));   conta_prevista = a conta da despesa — a parcela ainda em aberto, se houver, senão a raiz — exceto a conta
--   estrutural das ofertas (id fixo ...a1; não é conta financeira): nesse caso vem nula e o e-mail diz "a definir ao pagar";   ultimo_envio = quando a obrigação já saiu num resumo diário.
-- É a MESMA conta que o diálogo "Pagar reembolso" sugere (a da despesa). Nenhuma tabela, coluna, dado ou função existente é tocada. Só a Edge Function (service_role) a executa.
-- Depende de `resumo_diario_enviados` (20261022210000). Reverter: DROP FUNCTION public.resumo_reembolsos_a_pagar();

CREATE OR REPLACE FUNCTION public.resumo_reembolsos_a_pagar()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.data_despesa, x.quem_recebe NULLS LAST, x.obrigacao_id), '[]'::jsonb)
    FROM (
      SELECT q.obrigacao_id,
             COALESCE(m.nome_completo, rf.nome) AS quem_recebe,
             q.responsavel_tipo AS tipo_de_quem_recebe,
             f.nome AS quitou,
             l.descricao,
             COALESCE(q.saldo_a_reembolsar, q.valor_obrigacao) AS valor,
             q.valor_obrigacao,
             q.data_despesa,
             conta.nome AS conta_prevista,
             (SELECT max(e.enviado_em) FROM resumo_diario_enviados e WHERE e.lancamento_id = q.obrigacao_id) AS ultimo_envio
        FROM vw_fin_quitacao q
        JOIN fin_lancamentos l ON l.id = q.obrigacao_id
        LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
        LEFT JOIN membros m ON m.id = q.responsavel_pessoa_id
        LEFT JOIN fin_fornecedores rf ON rf.id = q.responsavel_fornecedor_id
        LEFT JOIN LATERAL (
          SELECT c.nome
            FROM fin_contas c
           WHERE c.id = COALESCE(
                   (SELECT p.conta_id FROM fin_lancamentos p
                     WHERE p.obrigacao_id = q.obrigacao_id AND p.id <> q.obrigacao_id AND p.status::text = 'previsto'
                       AND p.conta_id <> '00000000-0000-4000-8000-0000000000a1'::uuid
                     ORDER BY p.data LIMIT 1),
                   CASE WHEN l.conta_id <> '00000000-0000-4000-8000-0000000000a1'::uuid THEN l.conta_id END)
        ) conta ON true
       WHERE q.fila = 'reembolso_a_pagar'
    ) x;
$$;

REVOKE ALL ON FUNCTION public.resumo_reembolsos_a_pagar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_reembolsos_a_pagar() TO service_role;
