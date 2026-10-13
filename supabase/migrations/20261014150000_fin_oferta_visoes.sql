-- ─── Fase 1B (3/3): as VISÕES que enxergam a oferta — vw_fin_ciclo (estado da despesa) e vw_fin_obrigacoes (situação da obrigação) ───────────────────────────
-- Depende de 20261014130000 e 20261014140000. Nenhum dado é alterado; para as despesas que existem hoje o resultado das duas visões fica IDÊNTICO (o ensaio prova).
--
-- vw_fin_ciclo (D2/D5/D6 + Quitação): `quitado_terceiro` conta como "situação paga". Como não há banco nem caixa, a obrigação não espera extrato: nasce em "Pagamento Realizado"
-- (rótulo "Quitada por terceiro"), vai a CONFERIDA quando a Tesouraria confere (só carimba conferido_em/conferido_por; o status não muda) e chega a PRONTA com nota + classificação + conferência —
-- o comprovante do pagamento NÃO se aplica (a igreja não pagou; a prova está na quitação, e o grau Relatado aparece como selo). Enviada e Arquivada funcionam como sempre.
-- vw_fin_obrigacoes: ganha a situação `quitada_por_terceiro` e o saldo pendente passa a descontar o que o terceiro pagou. SEM isso, uma oferta apareceria como obrigação EM ABERTO (o fantasma que o
-- novo status existe para evitar). Colunas novas só no fim.
-- Reversível: docs/QUITACAO_1B_ROLLBACK.sql devolve as duas visões à versão anterior.

CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC
),
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo NOT IN ('comprovante', 'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro')
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
vinculos AS (
  SELECT DISTINCT ON (lancamento_id) lancamento_id, origem, fitid
    FROM public.fin_extrato_vinculos
   WHERE desfeito_em IS NULL AND lancamento_id IS NOT NULL
   ORDER BY lancamento_id, vinculado_em
),
envios AS (
  SELECT DISTINCT ON (i.lancamento_id) i.lancamento_id, i.envio_id, e.enviado_em, i.ano, i.mes
    FROM public.fin_malote_itens i
    JOIN public.fin_malote_envios e ON e.id = i.envio_id
   WHERE i.reaberto_em IS NULL AND i.lancamento_id IS NOT NULL
   ORDER BY i.lancamento_id, e.enviado_em DESC
),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (vc.lancamento_id IS NOT NULL) AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje,
         l.conferido_em, l.conferido_por, vc.origem AS vinculo_origem, vc.fitid AS vinculo_fitid,
         en.envio_id, en.enviado_em, en.ano AS envio_ano, en.mes AS envio_mes,
         COALESCE((SELECT true FROM public.fin_fechamentos_periodo f
                    WHERE f.status = 'aprovado' AND en.ano IS NOT NULL
                      AND (en.ano * 12 + en.mes) >= (f.ano_inicio * 12 + f.mes_inicio)
                      AND (en.ano * 12 + en.mes) <  (f.ano_inicio * 12 + f.mes_inicio + f.qtd_meses) LIMIT 1), false) AS periodo_aprovado,
         qv.quitacao_id, qv.responsavel_tipo AS q_responsavel, qv.intencao AS q_intencao, qv.grau_conjunto AS q_grau, qv.nivel_risco AS q_nivel,
         qv.fila AS q_fila, qv.resultado AS q_resultado, qv.credor_atual AS q_credor, qv.bloqueia_fechamento AS q_bloqueia,
         (qv.quitacao_id IS NOT NULL AND qv.responsavel_tipo <> 'nao_localizado') AS terceiro_quitou,
         (l.status::text = 'quitado_terceiro') AS quitado
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    LEFT JOIN envios en ON en.lancamento_id = l.id
    LEFT JOIN public.vw_fin_quitacao qv ON qv.obrigacao_id = COALESCE(l.obrigacao_id, l.id)
    CROSS JOIN hoje h
   WHERE l.tipo = 'saida' AND l.origem <> 'transferencia'
),
fatos AS (
  SELECT b.*,
         (b.status IN ('realizado', 'conciliado', 'quitado_terceiro')) AS paga,
         CASE WHEN b.quitado THEN CASE WHEN b.conferido_em IS NOT NULL THEN 'manual' END   -- quitada por terceiro: não há extrato; só a conferência humana a confirma
              WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         COALESCE(CASE WHEN f.quitado THEN f.conferencia IS NOT NULL
                       WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         -- ENVIADA e ARQUIVADA: nada regride sozinho depois do envio (os fatos podem mudar; o estado só sai daqui por reabertura explícita)
         WHEN d.envio_id IS NOT NULL AND d.paga THEN CASE WHEN d.periodo_aprovado THEN 'arquivada' ELSE 'enviada' END
         -- um terceiro já pagou o fornecedor: não há mais "a vencer" — a obrigação está em análise/dívida com o terceiro, e isso pede ação
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje OR d.terceiro_quitou THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN d.quitado THEN 'pagamento_realizado'     -- quitada por terceiro: não espera o banco; o que falta é a conferência
                WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa OR d.quitado) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid,
       d.envio_id, d.enviado_em, d.envio_ano, d.envio_mes,
       d.quitacao_id,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_responsavel IS NOT NULL THEN d.q_responsavel WHEN d.paga THEN 'igreja' ELSE 'ninguem_ainda' END AS responsavel,
       COALESCE(d.q_intencao, 'nao_se_aplica') AS intencao,
       d.q_grau AS grau_conjunto,
       d.q_nivel AS nivel_risco,
       d.q_fila AS fila,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_resultado IS NOT NULL THEN d.q_resultado WHEN d.paga THEN 'pago_pela_igreja' ELSE 'em_aberto' END AS resultado,
       CASE WHEN d.status = 'cancelado' THEN NULL WHEN d.q_credor IS NOT NULL THEN d.q_credor WHEN d.paga THEN 'nenhum' ELSE 'emitente' END AS credor_atual,
       COALESCE(d.q_bloqueia, false) AS bloqueia_fechamento
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;

-- ── vw_fin_obrigacoes: a oferta não é "em aberto" ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_fin_obrigacoes WITH (security_invoker = true) AS
WITH base AS (
  SELECT COALESCE(l.obrigacao_id, l.id) AS grupo_id, l.*
    FROM public.fin_lancamentos l
   WHERE l.tipo = 'saida' AND l.origem IS DISTINCT FROM 'transferencia'
),
agg AS (
  SELECT grupo_id AS obrigacao_id,
         COALESCE(MAX(valor_original) FILTER (WHERE componente = 'principal'),
                  SUM(valor - juros - multa - complemento - ajuste + desconto) FILTER (WHERE componente = 'principal' AND status <> 'cancelado'), 0) AS valor_original,
         COALESCE(SUM(valor - juros - multa - complemento - ajuste) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0) AS pago_principal,
         COALESCE(SUM(desconto) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)                                    AS desconto,
         COALESCE(SUM(juros)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'juros'       AND status IN ('realizado','conciliado')), 0)                                AS juros,
         COALESCE(SUM(multa)       FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'multa'       AND status IN ('realizado','conciliado')), 0)                                AS multa,
         COALESCE(SUM(complemento) FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'complemento' AND status IN ('realizado','conciliado')), 0)                                AS complemento,
         COALESCE(SUM(ajuste)      FILTER (WHERE componente = 'principal' AND status IN ('realizado','conciliado')), 0)
           + COALESCE(SUM(valor) FILTER (WHERE componente = 'ajuste'      AND status IN ('realizado','conciliado')), 0)                                AS ajuste,
         MIN(data) FILTER (WHERE componente = 'principal' AND status = 'previsto')                                                                      AS vencimento_pendente,
         MIN(data) FILTER (WHERE componente = 'principal')                                                                                              AS vencimento,
         BOOL_AND(status = 'cancelado')                                                                                                                 AS tudo_cancelado,
         MAX(data_pagamento)                                                                                                                            AS ultimo_pagamento,
         (ARRAY_AGG(id ORDER BY data) FILTER (WHERE componente = 'principal' AND status = 'previsto'))[1]                                               AS id_pendente,
         COALESCE(SUM(valor) FILTER (WHERE componente = 'principal' AND status = 'quitado_terceiro'), 0)                                                AS quitado_terceiro
    FROM base GROUP BY grupo_id
)
SELECT a.obrigacao_id,
       a.valor_original, a.pago_principal, a.desconto, a.juros, a.multa, a.complemento, a.ajuste,
       GREATEST(a.valor_original - a.pago_principal - a.desconto - a.quitado_terceiro, 0)  AS saldo_pendente,
       a.pago_principal + a.juros + a.multa + a.complemento + a.ajuste                     AS total_pago,
       CASE
         WHEN a.tudo_cancelado THEN 'cancelado'
         WHEN a.quitado_terceiro > 0 THEN 'quitada_por_terceiro'     -- a obrigação foi extinta por um terceiro (oferta): não é "em aberto" nem "paga pela igreja"
         WHEN a.pago_principal = 0 AND a.juros + a.multa + a.complemento + a.ajuste = 0
              THEN CASE WHEN COALESCE(a.vencimento_pendente, a.vencimento) < CURRENT_DATE THEN 'em_aberto' ELSE 'previsto' END
         WHEN a.valor_original - a.pago_principal - a.desconto > 0.009                      THEN 'pago_parcialmente'
         WHEN a.desconto + a.juros + a.multa + a.complemento + a.ajuste > 0                 THEN 'pago_com_diferenca'
         ELSE 'pago_integralmente'
       END                                                                                 AS situacao,
       a.vencimento_pendente, a.vencimento, a.ultimo_pagamento, a.id_pendente,
       COALESCE(a.ultimo_pagamento, a.vencimento_pendente, a.vencimento)                   AS referencia,
       r.descricao, r.fornecedor_id, r.categoria_id, r.centro_custo_id, r.conta_id,
       a.quitado_terceiro
  FROM agg a
  LEFT JOIN public.fin_lancamentos r ON r.id = a.obrigacao_id;
GRANT SELECT ON public.vw_fin_obrigacoes TO authenticated;
COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, quitada_por_terceiro (oferta: sem caixa, sem banco) e cancelado. Juros, multa, complemento, ajuste e desconto são CAMPOS do lançamento do documento. security_invoker: vale a RLS de fin_lancamentos.';
