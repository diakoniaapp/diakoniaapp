-- APLICAÇÃO DEFINITIVA — só depois do "pode aplicar" dela. GRAVA (cria UMA view; NENHUM dado existente muda).
-- Idêntico a supabase/migrations/20261013110000_fin_ciclo_da_despesa_view.sql. Pode rodar mais de uma vez. Para desfazer: docs/CICLO_DA_DESPESA_ROLLBACK.sql.
-- ─── D2 + D5: a leitura OFICIAL do estado da despesa — `vw_fin_ciclo` ────────────────────────────────────────────────────────────────────────
-- Decisões dela (13/10/2026): a despesa é a obrigação e o seu estado é DERIVADO de fatos, num só lugar. Hoje o estado é calculado só no aplicativo
-- (`lib/cicloDaDespesa.ts`); relatórios, o Pacote Contábil e qualquer consulta direta não têm como lê-lo. Esta view é o espelho em SQL da mesma regra:
--
--   Prevista → Em Aberto → Pagamento Realizado → Aguardando Conciliação → Conciliada → Pronta para Malote      (Enviada e Arquivada chegam com o D6)
--
--   · Em Aberto começa NO DIA do vencimento; depois dele continua Em Aberto, com `atraso_dias` > 0 ("atrasada" NÃO é estado — é o indicador visual).
--   · Conciliada = há VÍNCULO com a linha do banco (a marca [ofx:…] em `observacoes`). Conferida = status `conciliado` SEM vínculo: `manual`, ou `historico`
--     quando veio do Omie (`origem = 'importado_omie'`, nunca teve extrato). Em conta COM extrato só o vínculo — ou o histórico, aceito como está —
--     concilia; em conta SEM extrato a conferência humana basta (Q4).
--   · Pronta para Malote = conciliada (ou conferida, onde não há extrato) + documento + comprovante + categoria e centro. A liquidação é "estar paga".
--     Tarifas bancárias, IOF, juros e encargos bancários dispensam documento e comprovante (o extrato é o comprovante) — a mesma lista da lib.
--   · O DOCUMENTO é da obrigação (vale o de qualquer linha do grupo, `COALESCE(obrigacao_id, id)`); o COMPROVANTE é do pagamento (só o da própria linha).
--
-- Só saídas, e sem as pernas de transferência entre contas. NÃO altera nenhum dado: é uma view (security_invoker: vale a RLS de fin_lancamentos).
-- Reversível: DROP VIEW public.vw_fin_ciclo (docs/CICLO_DA_DESPESA_ROLLBACK.sql).
CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
-- o último dia coberto por um extrato importado, por conta (o PDF do Invest Fácil, `[ofx:PDF:…]`, não é extrato de conta corrente)
ultimo AS (
  SELECT DISTINCT ON (conta_id) conta_id, COALESCE(data_pagamento, data) AS dia
    FROM public.fin_lancamentos
   WHERE observacoes LIKE '%[ofx:%' AND observacoes NOT LIKE '%[ofx:PDF:%'
   ORDER BY conta_id, data DESC, COALESCE(data_pagamento, data) DESC   -- o desempate só importa quando duas linhas do extrato têm a mesma data
),
-- grupos (obrigações) com ao menos um documento: qualquer anexo que não seja comprovante, em qualquer linha do grupo
docs AS (
  SELECT DISTINCT COALESCE(l.obrigacao_id, l.id) AS grupo
    FROM public.fin_lancamento_anexos a
    JOIN public.fin_lancamentos l ON l.id = a.lancamento_id
   WHERE a.tipo <> 'comprovante'
),
comprovantes AS (SELECT DISTINCT lancamento_id FROM public.fin_lancamento_anexos WHERE tipo = 'comprovante'),
base AS (
  SELECT l.id, COALESCE(l.obrigacao_id, l.id) AS obrigacao_id, l.conta_id, l.status::text AS status, l.data, l.data_pagamento, l.origem,
         (l.observacoes ~ '\[ofx:[^\]]+\]') AS tem_vinculo,
         (c.tipo::text = 'banco') AS tem_extrato,
         (lower(btrim(regexp_replace(translate(COALESCE(cat.nome, ''),
            'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç', 'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'), '\s+', ' ', 'g')))
            IN ('tarifas bancarias', 'tarifa bancaria', 'iof', 'juros', 'encargos bancarios')) AS dispensa,
         (d.grupo IS NOT NULL) AS tem_documento,
         (l.comprovante_url IS NOT NULL OR cm.lancamento_id IS NOT NULL) AS tem_comprovante,
         (l.categoria_id IS NOT NULL AND l.centro_custo_id IS NOT NULL) AS tem_classificacao,
         u.dia AS ultimo_extrato, h.d AS hoje
    FROM public.fin_lancamentos l
    JOIN public.fin_contas c ON c.id = l.conta_id
    LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
    LEFT JOIN docs d ON d.grupo = COALESCE(l.obrigacao_id, l.id)
    LEFT JOIN comprovantes cm ON cm.lancamento_id = l.id
    LEFT JOIN ultimo u ON u.conta_id = l.conta_id
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
         -- conta com extrato: só o vínculo (ou o histórico) concilia; conta sem extrato: a conferência humana basta
         COALESCE(CASE WHEN f.tem_extrato THEN f.conferencia IN ('vinculo', 'historico') ELSE f.conferencia IS NOT NULL END, false) AS conciliada
    FROM fatos f
)
SELECT d.id AS lancamento_id, d.obrigacao_id, d.conta_id, d.data,
       CASE
         WHEN d.status = 'cancelado' THEN 'cancelada'
         WHEN NOT d.paga THEN CASE WHEN d.data <= d.hoje THEN 'em_aberto' ELSE 'prevista' END
         WHEN NOT d.conciliada THEN
           CASE WHEN NOT d.tem_extrato OR (d.ultimo_extrato IS NOT NULL AND d.ultimo_extrato >= COALESCE(d.data_pagamento, d.data))
                THEN 'aguardando_conciliacao' ELSE 'pagamento_realizado' END
         WHEN d.tem_classificacao AND (d.tem_documento OR d.dispensa) AND (d.tem_comprovante OR d.dispensa) THEN 'pronta_para_malote'
         ELSE 'conciliada'
       END AS estado,
       CASE WHEN d.status <> 'cancelado' AND NOT d.paga AND d.data <= d.hoje THEN d.hoje - d.data END AS atraso_dias,
       d.conferencia, d.tem_vinculo, d.tem_documento, d.tem_comprovante, d.tem_classificacao, d.dispensa AS dispensa_documento
  FROM decididos d;

COMMENT ON VIEW public.vw_fin_ciclo IS 'O estado de cada despesa (saída, fora de transferências): prevista, em_aberto (com atraso_dias), pagamento_realizado, aguardando_conciliacao, conciliada, pronta_para_malote ou cancelada. Espelho SQL de lib/cicloDaDespesa.ts. Conciliada = vínculo com o banco; conferencia = vinculo | manual | historico. Documento é da obrigação (grupo); comprovante é da linha. security_invoker: vale a RLS de fin_lancamentos.';
GRANT SELECT ON public.vw_fin_ciclo TO authenticated;
