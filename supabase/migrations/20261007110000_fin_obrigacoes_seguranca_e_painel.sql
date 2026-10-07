-- ─── Liquidação: fecha a view `vw_fin_obrigacoes` para quem não está logado e a completa para o painel ───────
--
-- 1) SEGURANÇA (achado em 06/10/2026, ao preparar o painel): a view criada pela migration 20261007100000 foi
--    criada SEM `security_invoker`. Medido: uma requisição com a chave pública (sem login) devolvia linhas da view
--    — id da obrigação e valores. A tabela `fin_liquidacoes` respondeu vazio (a RLS vale); a view não, porque view
--    comum roda com os direitos de quem a criou e ignora a RLS. O projeto já padronizou `security_invoker = true`
--    nas views financeiras (migration 20260805130000). Aqui: `security_invoker` + REVOKE de anon.
--    O que ficou exposto: valores e ids de obrigações de saída — nenhum nome, descrição ou favorecido.
--
-- 2) PAINEL: as colunas que a Central de Pagamentos precisa. `CREATE OR REPLACE VIEW` só aceita colunas novas no
--    fim; como a view acabou de nascer e nada a usa ainda, ela é recriada (DROP + CREATE) com:
--      · `ajuste` separado de `complemento` (relatório "contas com diferença manual");
--      · `id_pendente` — o lançamento previsto que continua aberto (o saldo da baixa parcial);
--      · `referencia` — o dia que posiciona a obrigação no período (último pagamento, senão vencimento);
--      · descrição, favorecido, categoria, centro e conta da obrigação.
--
-- 3) A função `fin_liquidar` deixa de ser executável por anon/PUBLIC (já recusava sem usuário; agora nem chega).

DROP VIEW IF EXISTS public.vw_fin_obrigacoes;

CREATE VIEW public.vw_fin_obrigacoes WITH (security_invoker = true) AS
WITH base AS (
  SELECT COALESCE(l.obrigacao_id, l.id) AS grupo_id, l.*
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
),
agg AS (
  SELECT grupo_id AS obrigacao_id,
         COALESCE(MAX(valor_original) FILTER (WHERE componente = 'principal'),
                  SUM(valor + desconto) FILTER (WHERE componente = 'principal' AND status <> 'cancelado'), 0)       AS valor_original,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'principal'   AND status IN ('realizado','conciliado')), 0) AS pago_principal,
         COALESCE(SUM(desconto) FILTER (WHERE componente = 'principal'   AND status IN ('realizado','conciliado')), 0) AS desconto,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'juros'       AND status IN ('realizado','conciliado')), 0) AS juros,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'multa'       AND status IN ('realizado','conciliado')), 0) AS multa,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'complemento' AND status IN ('realizado','conciliado')), 0) AS complemento,
         COALESCE(SUM(valor)    FILTER (WHERE componente = 'ajuste'      AND status IN ('realizado','conciliado')), 0) AS ajuste,
         MIN(data) FILTER (WHERE componente = 'principal' AND status = 'previsto')                                    AS vencimento_pendente,
         MIN(data) FILTER (WHERE componente = 'principal')                                                            AS vencimento,
         BOOL_AND(status = 'cancelado')                                                                               AS tudo_cancelado,
         MAX(data_pagamento)                                                                                          AS ultimo_pagamento,
         (ARRAY_AGG(id ORDER BY data) FILTER (WHERE componente = 'principal' AND status = 'previsto'))[1]             AS id_pendente
    FROM base GROUP BY grupo_id
)
SELECT a.obrigacao_id,
       a.valor_original, a.pago_principal, a.desconto, a.juros, a.multa, a.complemento, a.ajuste,
       GREATEST(a.valor_original - a.pago_principal - a.desconto, 0)                       AS saldo_pendente,
       a.pago_principal + a.juros + a.multa + a.complemento + a.ajuste                     AS total_pago,
       CASE
         WHEN a.tudo_cancelado THEN 'cancelado'
         WHEN a.pago_principal = 0 AND a.juros + a.multa + a.complemento + a.ajuste = 0
              THEN CASE WHEN COALESCE(a.vencimento_pendente, a.vencimento) < CURRENT_DATE THEN 'em_aberto' ELSE 'previsto' END
         WHEN a.valor_original - a.pago_principal - a.desconto > 0.009                      THEN 'pago_parcialmente'
         WHEN a.desconto + a.juros + a.multa + a.complemento + a.ajuste > 0                 THEN 'pago_com_diferenca'
         ELSE 'pago_integralmente'
       END                                                                                 AS situacao,
       a.vencimento_pendente, a.vencimento, a.ultimo_pagamento, a.id_pendente,
       COALESCE(a.ultimo_pagamento, a.vencimento_pendente, a.vencimento)                   AS referencia,
       r.descricao, r.fornecedor_id, r.categoria_id, r.centro_custo_id, r.conta_id
  FROM agg a
  LEFT JOIN public.fin_lancamentos r ON r.id = a.obrigacao_id;

COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar, calculada dos lançamentos: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, cancelado. Lançamento antigo = obrigação própria, sem diferença. security_invoker: vale a RLS de fin_lancamentos.';

REVOKE ALL ON public.vw_fin_obrigacoes FROM PUBLIC, anon;
GRANT SELECT ON public.vw_fin_obrigacoes TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fin_liquidar(uuid, date, public.fin_forma_pagamento, numeric, jsonb, jsonb, text, text, text) TO authenticated;
