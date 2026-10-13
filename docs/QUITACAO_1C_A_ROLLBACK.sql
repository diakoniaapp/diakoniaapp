-- DESFAZER a Fase 1C-a (migration 20261015100000). As Fases 1A e 1B continuam como estão.
-- 1) a vw_fin_quitacao volta a olhar só o lançamento-raiz (a regra da 1A). As duas colunas novas (reembolsado, saldo_a_reembolsar) PERMANECEM na visão — o PostgreSQL não deixa tirar coluna de uma
--    visão da qual outras dependem — e passam a ser apenas informativas;
-- 2) remove fin_liquidar_reembolso. Reembolsos JÁ PAGOS continuam pagos (são liquidações comuns, com o saldo das contas já refletido); a partir daqui a liquidação comum volta a ser a única via,
--    e a guarda da 1A volta a recusar o pagamento ao fornecedor — ou seja, um reembolso que sobrou parcial só se paga reativando a 1C-a;
-- 3) o evento reembolso_pago continua aceito no histórico (o histórico só acrescenta).
CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
WITH base AS (
  SELECT q.id AS quitacao_id, q.obrigacao_id, q.responsavel_tipo, q.responsavel_pessoa_id, q.responsavel_fornecedor_id, q.intencao, q.pago_em, q.declarado_em,
         q.condicao, q.pede_recibo, q.registrado_por, q.registrado_em,
         l.data AS data_despesa, l.status::text AS status_despesa, COALESCE(l.valor_original, l.valor) AS valor_obrigacao,
         g.pago_total, g.em_aberto,
         public.fin_quitacao_entrada(q.id) AS entrada, public.fin_quitacao_aprovacoes(q.id) AS aprovacoes
    FROM public.fin_quitacoes q
    JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(sum(x.valor) FILTER (WHERE x.status::text IN ('realizado', 'conciliado')), 0) AS pago_total,
             COALESCE(sum(x.valor) FILTER (WHERE x.status::text = 'previsto'), 0) AS em_aberto
        FROM public.fin_lancamentos x
       WHERE x.tipo::text = 'saida' AND (x.id = q.obrigacao_id OR x.obrigacao_id = q.obrigacao_id)) g
),
avaliadas AS (SELECT b.*, public.fin_quitacao_avaliar(b.entrada) AS a FROM base b),
resolvidas AS (
  SELECT v.*, public.fin_quitacao_resultado(jsonb_build_object(
           'responsavel', v.responsavel_tipo, 'intencao', v.intencao, 'suficiente', (v.a->>'suficiente')::boolean,
           'aprovacao', v.aprovacoes->>'reembolso',
           'paga', v.status_despesa IN ('realizado', 'conciliado'))) AS r
    FROM avaliadas v
)
SELECT v.quitacao_id, v.obrigacao_id, v.responsavel_tipo, v.responsavel_pessoa_id, v.responsavel_fornecedor_id, v.intencao, v.pago_em, v.declarado_em,
       v.condicao, v.pede_recibo, v.registrado_por, v.registrado_em, v.data_despesa, v.valor_obrigacao,
       v.entrada->>'grau_responsavel' AS grau_responsavel, v.entrada->>'grau_intencao' AS grau_intencao, v.a->>'grau_conjunto' AS grau_conjunto,
       v.a->>'nivel' AS nivel_risco, (v.a->>'suficiente')::boolean AS suficiente, (v.a->>'exige_aprovacao_administrador')::boolean AS exige_aprovacao_administrador,
       v.a->>'motivo' AS motivo_insuficiencia, v.a->'moduladores' AS moduladores,
       v.aprovacoes->>'reembolso' AS aprovacao_reembolso, v.aprovacoes->>'relatado' AS aprovacao_relatado,
       v.r->>'resultado' AS resultado, v.r->>'credor_atual' AS credor_atual, v.r->>'fila' AS fila,
       (p.vigencia IS NOT NULL AND (v.r->>'fila') IN ('a_esclarecer', 'formalizar') AND v.data_despesa >= p.vigencia) AS bloqueia_fechamento,
       -- colunas novas (só no fim): só o reembolso tem pagamento à pessoa; nas demais intenções não se aplicam
       CASE WHEN v.intencao = 'reembolso' THEN v.pago_total END AS reembolsado,
       CASE WHEN v.intencao = 'reembolso' THEN v.em_aberto END AS saldo_a_reembolsar
  FROM resolvidas v
 CROSS JOIN public.fin_quitacao_parametros p;

GRANT SELECT ON public.vw_fin_quitacao TO authenticated;

DROP FUNCTION IF EXISTS public.fin_liquidar_reembolso(uuid, uuid, date, public.fin_forma_pagamento, numeric, text, text, text);
