-- ─── Os e-mails diário e semanal dizem até quando o saldo reflete o banco — 22/10/2026 ───────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: o saldo do Bradesco e o da conta Investimento que saem nos e-mails precisam informar a data da última atualização, pois o saldo do DiakoniaApp só acompanha o banco até onde alguém
-- importou e conciliou o extrato (OFX no Bradesco, PDF do Invest Fácil na Investimento) e não reflete a conta real da igreja.
--
-- O que muda: UMA função nova, só de leitura — `resumo_ultimo_extrato_das_contas()` — que devolve, por conta ativa:
--   · ultimo_movimento   = o dia da linha mais recente do banco que já está na conta (lançamento realizado/conciliado com marca `[ofx:…]`, inclusive `[ofx:PDF:…]`);
--   · ultima_conciliacao = quando alguém ligou a última linha do banco a um lançamento (maior `vinculado_em` dos vínculos ativos de `fin_extrato_vinculos`).
-- Nenhuma tabela, coluna, dado ou função existente é tocada (nem `resumo_semanal_digest` nem `resumo_diario_dados`): as Edge Functions chamam esta função à parte e juntam o resultado. Se ela não existir,
-- os e-mails saem do mesmo jeito, sem a data (e com a nota geral de que o saldo pode não refletir o banco).
-- Só a Edge Function (service_role) a executa. Reverter: DROP FUNCTION public.resumo_ultimo_extrato_das_contas();

CREATE OR REPLACE FUNCTION public.resumo_ultimo_extrato_das_contas()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'nome', c.nome,
           'saldo', c.saldo_atual,
           'ultimo_movimento', m.ultimo_movimento,
           'ultima_conciliacao', v.ultima_conciliacao
         ) ORDER BY c.ordem, c.nome), '[]'::jsonb)
    FROM fin_contas c
    LEFT JOIN LATERAL (
      SELECT max(COALESCE(l.data_pagamento, l.data)) AS ultimo_movimento
        FROM fin_lancamentos l
       WHERE l.conta_id = c.id AND l.observacoes LIKE '%[ofx:%' AND l.status::text IN ('realizado', 'conciliado')
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT max(x.vinculado_em) AS ultima_conciliacao
        FROM fin_extrato_vinculos x
       WHERE x.conta_id = c.id AND x.desfeito_em IS NULL
    ) v ON true
   WHERE c.ativo;
$$;

REVOKE ALL ON FUNCTION public.resumo_ultimo_extrato_das_contas() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_ultimo_extrato_das_contas() TO service_role;
