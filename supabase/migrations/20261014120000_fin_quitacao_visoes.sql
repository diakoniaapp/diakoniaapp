-- ─── Fase 1A (3/3): as VISÕES da Quitação — o que se deriva dos fatos (grau, nível, suficiência, resultado, credor, fila) e a vw_fin_ciclo ampliada ────────────
-- Depende de 20261014100000 e 20261014110000. Nenhum dado é alterado.
--
-- `vw_fin_quitacao`: uma linha por quitação registrada, com TUDO o que se deriva dela: o grau de prova de cada fato e do conjunto (nascem dos anexos), o nível de risco da Matriz,
-- a suficiência, a decisão de aprovação vigente, o resultado, o credor atual, a fila e se ela bloqueia o fechamento (só com a vigência ligada e para despesas a partir dela).
--
-- `vw_fin_ciclo` (a visão do estado da despesa, D2/D5/D6) ganha COLUNAS NOVAS SÓ NO FIM (regra do CREATE OR REPLACE VIEW): quitacao_id, responsavel, intencao, grau_conjunto,
-- nivel_risco, fila, resultado, credor_atual, bloqueia_fechamento. As colunas e os estados que já existiam NÃO mudam, com DUAS exceções deliberadas, ambas só para despesa
-- que tem quitação por terceiro (hoje nenhuma: o resultado atual de todas as 4.037 saídas fica idêntico — o ensaio prova):
--   · uma obrigação cujo fornecedor já foi pago por um terceiro é "Em aberto" mesmo antes do vencimento (a dívida com o fornecedor acabou; o que há é a decisão sobre o terceiro);
--   · as provas da quitação (declaracao_terceiro, pedido_reembolso, prova_pagamento_terceiro) NÃO contam como "documento original" da despesa.
-- Igreja e Ninguém ainda não têm linha em fin_quitacoes: a vw_fin_ciclo os DEDUZ (paga ⇒ Igreja; não paga ⇒ Ninguém ainda).
-- Reversível: docs/QUITACAO_ROLLBACK.sql devolve a vw_fin_ciclo do D6.

CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
WITH base AS (
  SELECT q.id AS quitacao_id, q.obrigacao_id, q.responsavel_tipo, q.responsavel_pessoa_id, q.responsavel_fornecedor_id, q.intencao, q.pago_em, q.declarado_em,
         q.condicao, q.pede_recibo, q.registrado_por, q.registrado_em,
         l.data AS data_despesa, l.status::text AS status_despesa, COALESCE(l.valor_original, l.valor) AS valor_obrigacao,
         public.fin_quitacao_entrada(q.id) AS entrada, public.fin_quitacao_aprovacoes(q.id) AS aprovacoes
    FROM public.fin_quitacoes q
    JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
),
avaliadas AS (SELECT b.*, public.fin_quitacao_avaliar(b.entrada) AS a FROM base b),
resolvidas AS (
  SELECT v.*, public.fin_quitacao_resultado(jsonb_build_object(
           'responsavel', v.responsavel_tipo, 'intencao', v.intencao, 'suficiente', (v.a->>'suficiente')::boolean,
           'aprovacao', v.aprovacoes->>'reembolso', 'paga', v.status_despesa IN ('realizado', 'conciliado'))) AS r
    FROM avaliadas v
)
SELECT v.quitacao_id, v.obrigacao_id, v.responsavel_tipo, v.responsavel_pessoa_id, v.responsavel_fornecedor_id, v.intencao, v.pago_em, v.declarado_em,
       v.condicao, v.pede_recibo, v.registrado_por, v.registrado_em, v.data_despesa, v.valor_obrigacao,
       v.entrada->>'grau_responsavel' AS grau_responsavel, v.entrada->>'grau_intencao' AS grau_intencao, v.a->>'grau_conjunto' AS grau_conjunto,
       v.a->>'nivel' AS nivel_risco, (v.a->>'suficiente')::boolean AS suficiente, (v.a->>'exige_aprovacao_administrador')::boolean AS exige_aprovacao_administrador,
       v.a->>'motivo' AS motivo_insuficiencia, v.a->'moduladores' AS moduladores,
       v.aprovacoes->>'reembolso' AS aprovacao_reembolso, v.aprovacoes->>'relatado' AS aprovacao_relatado,
       v.r->>'resultado' AS resultado, v.r->>'credor_atual' AS credor_atual, v.r->>'fila' AS fila,
       (p.vigencia IS NOT NULL AND (v.r->>'fila') IN ('a_esclarecer', 'formalizar') AND v.data_despesa >= p.vigencia) AS bloqueia_fechamento
  FROM resolvidas v
 CROSS JOIN public.fin_quitacao_parametros p;
GRANT SELECT ON public.vw_fin_quitacao TO authenticated;
COMMENT ON VIEW public.vw_fin_quitacao IS 'A quitação registrada e tudo o que dela se DERIVA: graus de prova (dos anexos), nível de risco, suficiência, aprovação vigente, resultado, credor atual, fila e bloqueio de fechamento. Nada aqui é digitado.';

-- ── vw_fin_ciclo (D6) + as colunas da quitação no fim ───────────────────────────────────────────────────────────────────────────────────────
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
         (qv.quitacao_id IS NOT NULL AND qv.responsavel_tipo <> 'nao_localizado') AS terceiro_quitou
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
         (b.status IN ('realizado', 'conciliado')) AS paga,
         CASE WHEN b.status IN ('realizado', 'conciliado') THEN
           CASE WHEN b.tem_vinculo THEN 'vinculo'
                WHEN b.status = 'conciliado' THEN CASE WHEN b.origem = 'importado_omie' THEN 'historico' ELSE 'manual' END
           END
         END AS conferencia
    FROM base b
),
decididos AS (
  SELECT f.*,
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
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
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid,
       d.envio_id, d.enviado_em, d.envio_ano, d.envio_mes,
       -- a Quitação (colunas novas, só no fim). Igreja e Ninguém ainda não têm linha: deduzem-se do pagamento.
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
