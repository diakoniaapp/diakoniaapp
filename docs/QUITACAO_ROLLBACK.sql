-- DESFAZER a Fase 1A da Quitação (migrations 20261014100000, 20261014110000 e 20261014120000).
-- Remove os gatilhos, as funções e as visões, e devolve a vw_fin_ciclo do D6 (a das migrations 20261013130000).
-- POR PADRÃO MANTÉM as tabelas (fin_quitacao_parametros, fin_quitacoes, fin_quitacao_eventos), as 3 colunas de fin_lancamentos e os tipos de anexo novos: o histórico não se perde.
-- ATENÇÃO: sem as guardas, uma obrigação com quitação por terceiro volta a poder ser marcada paga ao fornecedor pela via comum. Se houver quitações registradas, remova-as (ou
-- trate-as) antes de desfazer.
DROP TRIGGER IF EXISTS fin_lanc_quitacao_pagamento ON public.fin_lancamentos;
DROP TRIGGER IF EXISTS fin_lanc_quitacao_apagar ON public.fin_lancamentos;

-- a vw_fin_ciclo depende da vw_fin_quitacao: volta primeiro a do D6, depois sai a nova
DROP VIEW IF EXISTS public.vw_fin_ciclo;
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
   WHERE a.tipo <> 'comprovante'
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
                      AND (en.ano * 12 + en.mes) <  (f.ano_inicio * 12 + f.mes_inicio + f.qtd_meses) LIMIT 1), false) AS periodo_aprovado
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
    LEFT JOIN vinculos vc ON vc.lancamento_id = l.id
    LEFT JOIN envios en ON en.lancamento_id = l.id
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
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento,
       d.conferido_em, d.conferido_por, d.vinculo_origem, d.vinculo_fitid,
       d.envio_id, d.enviado_em, d.envio_ano, d.envio_mes
  FROM decididos d;
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;
DROP VIEW IF EXISTS public.vw_fin_quitacao;

DROP FUNCTION IF EXISTS public.fin_lanc_quitacao_bloqueia_pagamento();
DROP FUNCTION IF EXISTS public.fin_lanc_quitacao_protege_apagar();
DROP FUNCTION IF EXISTS public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.fin_alterar_quitacao(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.fin_remover_quitacao(uuid, text);
DROP FUNCTION IF EXISTS public.fin_decidir_quitacao(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.fin_quitacao_parametros_alterar(jsonb, text);
DROP FUNCTION IF EXISTS public.fin_quitacao_validar_campos(uuid, text, uuid, uuid, text, date, date);
DROP FUNCTION IF EXISTS public.fin_quitacao_entrada(uuid);
DROP FUNCTION IF EXISTS public.fin_quitacao_aprovacoes(uuid);
DROP FUNCTION IF EXISTS public.fin_quitacao_grau_conjunto(uuid);
DROP FUNCTION IF EXISTS public.fin_quitacao_resultado(jsonb);
DROP FUNCTION IF EXISTS public.fin_quitacao_avaliar(jsonb);
DROP FUNCTION IF EXISTS public.fin_quitacao_graus(text, text, text[]);
-- ficam (as tabelas e as CHECK dependem delas): fin_cnpj_valido, fin_nfe_chave_valida, fin_quitacao_registra_evento, fin_quitacao_eventos_imutavel

-- SÓ SE QUISER APAGAR TUDO, inclusive o histórico (irreversível — normalmente NÃO faça):
-- DROP TABLE IF EXISTS public.fin_quitacao_eventos;
-- DROP TABLE IF EXISTS public.fin_quitacoes;
-- DROP TABLE IF EXISTS public.fin_quitacao_parametros;
-- ALTER TABLE public.fin_lancamentos DROP COLUMN IF EXISTS comprador, DROP COLUMN IF EXISTS natureza_item, DROP COLUMN IF EXISTS nf_chave_acesso;
