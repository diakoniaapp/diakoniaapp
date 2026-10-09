-- DESFAZER o modelo "encargos como atributos da obrigação" (migration 20261008200000). Um comando só (transação única).
-- 1) DESINCORPORA: para cada lançamento pago com juros/multa/complemento/ajuste, recria os lançamentos de encargo (categorias Juros/Multas; as de
--    complemento e ajuste usam a categoria do próprio documento), tira o valor do encargo de `valor` do documento e zera os campos — o inverso exato
--    da incorporação. 2) Devolve a função fin_liquidar e a view vw_fin_obrigacoes anteriores (que leem os encargos como lançamentos).
-- As colunas juros/multa/complemento/ajuste/motivo_diferenca ficam na tabela (inofensivas; todas zeradas).
DO $desfazer$
DECLARE p RECORD; t text; v numeric; cat uuid; n int := 0;
BEGIN
  FOR p IN SELECT * FROM public.fin_lancamentos WHERE componente = 'principal' AND (juros > 0 OR multa > 0 OR complemento > 0 OR ajuste > 0) LOOP
    FOREACH t IN ARRAY ARRAY['juros', 'multa', 'complemento', 'ajuste'] LOOP
      EXECUTE format('SELECT %I FROM public.fin_lancamentos WHERE id = $1', t) INTO v USING p.id;
      CONTINUE WHEN v IS NULL OR v <= 0;
      cat := CASE t WHEN 'juros' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Juros' AND tipo = 'saida' LIMIT 1)
                    WHEN 'multa' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Multas' AND tipo = 'saida' LIMIT 1)
                    ELSE p.categoria_id END;
      IF cat IS NULL THEN RAISE EXCEPTION 'Categoria de % não encontrada — nada foi desfeito.', t; END IF;
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, descricao, categoria_id, centro_custo_id, projeto_id,
        fornecedor_id, pessoa_id, forma_pagamento, observacoes, origem, valor_variavel, obrigacao_id, liquidacao_id, componente)
      VALUES (p.conta_id, 'saida', p.status, p.data_pagamento, p.data_pagamento, v, initcap(t) || ' — ' || COALESCE(p.descricao, 'pagamento'), cat, p.centro_custo_id, p.projeto_id,
        p.fornecedor_id, p.pessoa_id, p.forma_pagamento, p.motivo_diferenca, 'liquidacao', false, COALESCE(p.obrigacao_id, p.id), p.liquidacao_id, t);
      n := n + 1;
    END LOOP;
    UPDATE public.fin_lancamentos SET valor = valor - juros - multa - complemento - ajuste, juros = 0, multa = 0, complemento = 0, ajuste = 0 WHERE id = p.id;
  END LOOP;
  RAISE NOTICE 'Encargos recriados como lançamentos: %', n;
END
$desfazer$;

CREATE OR REPLACE FUNCTION public.fin_liquidar(
  p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor_total numeric,
  p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  liq uuid; it jsonb; en jsonb; l public.fin_lancamentos%ROWTYPE; ref public.fin_lancamentos%ROWTYPE;
  v_pago numeric; v_desc numeric; v_saldo numeric; v_orig numeric; v_raiz uuid; v_total numeric := 0; n int;
  v_cat uuid; v_tipo text; v_valor numeric;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN RAISE EXCEPTION 'Informe ao menos um documento a pagar.'; END IF;

  INSERT INTO public.fin_liquidacoes (conta_id, data_pagamento, forma_pagamento, valor_total, comprovante_url, ofx_fitid, observacoes)
  VALUES (p_conta_id, p_data, p_forma, p_valor_total, p_comprovante_url, p_ofx_fitid, p_observacoes)
  RETURNING id INTO liq;

  -- documentos: baixa total ou parcial, com desconto
  FOR it IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    SELECT * INTO l FROM public.fin_lancamentos WHERE id = (it->>'lancamento_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento % não encontrado.', it->>'lancamento_id'; END IF;
    IF l.tipo <> 'saida' OR l.status <> 'previsto' THEN RAISE EXCEPTION 'O lançamento % não está previsto para pagamento (status %).', l.id, l.status; END IF;
    v_pago := (it->>'valor_pago')::numeric; v_desc := COALESCE((it->>'desconto')::numeric, 0);
    IF v_pago IS NULL OR v_pago <= 0 THEN RAISE EXCEPTION 'Valor pago inválido para o lançamento %.', l.id; END IF;
    v_saldo := l.valor - v_pago - v_desc;
    IF v_saldo < -0.004 THEN RAISE EXCEPTION 'Pago (%) + desconto (%) passa do valor da obrigação (%): o que passa é juros, multa ou complemento — informe como encargo.', v_pago, v_desc, l.valor; END IF;
    v_orig := COALESCE(l.valor_original, l.valor); v_raiz := COALESCE(l.obrigacao_id, l.id);

    IF v_saldo > 0.004 THEN  -- baixa parcial: o que falta continua previsto, com a mesma classificação e o mesmo vencimento
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_competencia, valor, valor_original, descricao, categoria_id,
        centro_custo_id, projeto_id, fornecedor_id, pessoa_id, forma_pagamento, documento_numero, observacoes, origem, campanha_missionaria,
        valor_variavel, obrigacao_id, componente)
      VALUES (l.conta_id, 'saida', 'previsto', l.data, l.data_competencia, round(v_saldo, 2), v_orig, l.descricao, l.categoria_id,
        l.centro_custo_id, l.projeto_id, l.fornecedor_id, l.pessoa_id, l.forma_pagamento, l.documento_numero, l.observacoes, l.origem, l.campanha_missionaria,
        l.valor_variavel, v_raiz, 'principal');
      -- (recorrencia_id/parcela_* NÃO são copiados: o gerador de recorrências continua vendo o mês como já gerado pelo lançamento pago)
    END IF;

    UPDATE public.fin_lancamentos
       SET status = 'realizado', data_pagamento = p_data, valor = round(v_pago, 2), desconto = round(v_desc, 2),
           valor_original = v_orig, obrigacao_id = v_raiz, liquidacao_id = liq, componente = 'principal',
           conta_id = p_conta_id,
           forma_pagamento = COALESCE(p_forma, forma_pagamento), comprovante_url = COALESCE(p_comprovante_url, comprovante_url)
     WHERE id = l.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Não consegui gravar a baixa do lançamento % (permissão?).', l.id; END IF;
    v_total := v_total + round(v_pago, 2);
  END LOOP;

  -- encargos: juros, multa, complemento, ajuste — viram DESPESAS ligadas à mesma obrigação, centro e fornecedor
  FOR en IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    v_tipo := en->>'tipo'; v_valor := round((en->>'valor')::numeric, 2);
    IF v_tipo NOT IN ('juros', 'multa', 'complemento', 'ajuste') THEN RAISE EXCEPTION 'Tipo de encargo desconhecido: %.', v_tipo; END IF;
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'Valor de % inválido.', v_tipo; END IF;
    IF v_tipo = 'ajuste' AND COALESCE(btrim(en->>'motivo'), '') = '' THEN RAISE EXCEPTION 'Ajuste manual exige o motivo da diferença.'; END IF;
    SELECT * INTO ref FROM public.fin_lancamentos WHERE id = (en->>'lancamento_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Obrigação de referência do % não encontrada.', v_tipo; END IF;
    v_cat := CASE v_tipo
      WHEN 'juros' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Juros'  AND tipo = 'saida' LIMIT 1)
      WHEN 'multa' THEN (SELECT id FROM public.fin_categorias WHERE nome = 'Multas' AND tipo = 'saida' LIMIT 1)
      ELSE ref.categoria_id END;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Categoria de % não encontrada no plano de contas.', v_tipo; END IF;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, descricao, categoria_id, centro_custo_id, projeto_id,
      fornecedor_id, pessoa_id, forma_pagamento, observacoes, origem, valor_variavel, obrigacao_id, liquidacao_id, componente)
    VALUES (p_conta_id, 'saida', 'realizado', p_data, p_data, v_valor,
      initcap(v_tipo) || ' — ' || COALESCE(ref.descricao, 'pagamento'), v_cat, ref.centro_custo_id, ref.projeto_id,
      ref.fornecedor_id, ref.pessoa_id, p_forma, NULLIF(btrim(en->>'motivo'), ''), 'liquidacao', false, COALESCE(ref.obrigacao_id, ref.id), liq, v_tipo);
    v_total := v_total + v_valor;
  END LOOP;

  IF abs(v_total - round(p_valor_total, 2)) > 0.004 THEN
    RAISE EXCEPTION 'Documentos + encargos somam % e o pagamento foi de %: explique a diferença (% ).', v_total, round(p_valor_total, 2), round(p_valor_total, 2) - v_total;
  END IF;
  RETURN liq;
END
$fn$;

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
