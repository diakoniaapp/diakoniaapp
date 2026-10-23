-- ─── O e-mail diário traz o Pix de QUEM VAI RECEBER o reembolso — 23/10/2026 ────────────────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: na seção "Reembolsos a pagar" do envio diário, o meio de pagamento tem de ser o de quem vai receber (o terceiro que quitou a despesa), e nunca o do prestador/fornecedor da nota —
-- pagar o fornecedor outra vez é justamente o erro que a política de compras por terceiros existe para evitar. Também tem de estar claro de qual conta o reembolso deve sair.
--
-- Medido no código: `resumo_diario_dados()` já deixa o reembolso FORA da lista de pagar (NOT EXISTS em vw_fin_quitacao com intencao = 'reembolso'), então o Pix do fornecedor nunca aparece ali.
-- Faltava só levar à lista de reembolsos a chave de quem recebe. Esta migration troca UMA função de leitura (`resumo_reembolsos_a_pagar`), acrescentando ao JSON de cada linha:
--   chave_pix / tipo_chave_pix = a chave de quem recebe, pela MESMA ordem da Declaração do Terceiro (20261015150000) e do diálogo "Pagar reembolso":
--     · pessoa  → o favorecido ligado a ela (fin_fornecedores.pessoa_id) com chave; senão a chave avulsa da pessoa (fin_pessoa_pix);
--     · empresa/entidade → a chave do próprio cadastro de favorecido (fin_fornecedores do responsável);
--   nulas quando não há chave (quem recebe em espécie, com recibo assinado, ou por TED): o e-mail avisa em vez de inventar.
-- Nada além disso muda: mesmas linhas, mesmos campos, mesmas regras de conta prevista. Só service_role executa. Reverter: reaplicar 20261022230000_reembolsos_a_pagar_nos_resumos.sql.

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
             pix.chave_pix,
             pix.tipo_chave_pix,
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
        LEFT JOIN LATERAL (
          -- a chave é de QUEM RECEBE; o fornecedor da nota (f) não entra aqui
          SELECT k.chave_pix, k.tipo_chave_pix
            FROM (
              SELECT 1 AS ordem, NULLIF(btrim(fp.chave_pix), '') AS chave_pix, fp.tipo_chave_pix::text AS tipo_chave_pix
                FROM fin_fornecedores fp
               WHERE q.responsavel_tipo = 'pessoa' AND fp.pessoa_id = q.responsavel_pessoa_id
              UNION ALL
              SELECT 2, NULLIF(btrim(pp.chave_pix), ''), pp.tipo_chave_pix::text
                FROM fin_pessoa_pix pp
               WHERE q.responsavel_tipo = 'pessoa' AND pp.pessoa_id = q.responsavel_pessoa_id
              UNION ALL
              SELECT 1, NULLIF(btrim(rf.chave_pix), ''), rf.tipo_chave_pix::text
               WHERE q.responsavel_tipo <> 'pessoa'
            ) k
           WHERE k.chave_pix IS NOT NULL
           ORDER BY k.ordem
           LIMIT 1
        ) pix ON true
       WHERE q.fila = 'reembolso_a_pagar'
    ) x;
$$;

REVOKE ALL ON FUNCTION public.resumo_reembolsos_a_pagar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_reembolsos_a_pagar() TO service_role;
