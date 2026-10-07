-- ─── ENSAIO FUNCIONAL da liquidação — roda DEPOIS do SQL da modelagem, na MESMA transação, e desfaz tudo ────────
--
-- Cola-se: BEGIN; + MODELAGEM_LIQUIDACAO_CENTRAL_PAGAMENTOS.sql + este arquivo + ROLLBACK;
-- (o script `scripts/copiar-ensaio-liquidacao.ps1` já monta isso). "Success. No rows returned" = TODOS os casos passaram.
-- Qualquer divergência dá RAISE EXCEPTION dizendo o caso e o que veio. Nada fica gravado: os lançamentos "TESTE LIQ" nascem
-- e somem com o ROLLBACK.
--
-- Casos: (1) parcial · (2) juros + multa + saldo da conta · (3) pago a maior SEM explicação é recusado · (4) desconto ·
--        (5) dois documentos num pagamento · (6) ajuste sem motivo é recusado · (7) lançamento antigo = pago integralmente

DO $ensaio$
DECLARE
  uid uuid; conta uuid; cat uuid; cat_juros uuid; l1 uuid; l2 uuid; l3 uuid; liq uuid; o record; n int; recusou boolean;
  s0 numeric; s1 numeric; pf public.fin_forma_pagamento := NULL;
BEGIN
  -- o SQL Editor roda sem usuário logado: simula um administrador para a checagem de permissão da função
  SELECT user_id INTO uid FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'Ensaio: não achei nenhum usuário admin em user_roles.'; END IF;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  SELECT id INTO conta FROM public.fin_contas ORDER BY created_at LIMIT 1;
  SELECT id INTO cat FROM public.fin_categorias WHERE tipo = 'saida' AND ativo ORDER BY (nome = 'Energia Elétrica') DESC, nome LIMIT 1;
  SELECT id INTO cat_juros FROM public.fin_categorias WHERE nome = 'Juros' AND tipo = 'saida' LIMIT 1;
  IF conta IS NULL OR cat IS NULL THEN RAISE EXCEPTION 'Ensaio: sem conta ou categoria de saída para testar.'; END IF;
  IF cat_juros IS NULL THEN RAISE EXCEPTION 'Ensaio: a categoria "Juros" (saída) NÃO existe no banco — precisa ser criada antes da migration.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_categorias WHERE nome = 'Multas' AND tipo = 'saida') THEN
    RAISE EXCEPTION 'Ensaio: a categoria "Multas" (saída) NÃO existe no banco — precisa ser criada antes da migration.';
  END IF;

  -- ── caso 1: parcial — documento 1.538,00, pago 1.418,00 ───────────────────────────────────────────────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE - 3, 1538, 'TESTE LIQ 1', cat, false) RETURNING id INTO l1;
  liq := public.fin_liquidar(conta, CURRENT_DATE, pf, 1418, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'valor_pago', 1418)));
  SELECT * INTO o FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l1;
  IF o.situacao <> 'pago_parcialmente' OR o.valor_original <> 1538 OR o.pago_principal <> 1418 OR o.saldo_pendente <> 120 THEN
    RAISE EXCEPTION 'Caso 1 (parcial) falhou: %', row_to_json(o);
  END IF;
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE obrigacao_id = l1 AND status = 'previsto' AND valor = 120 AND componente = 'principal';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 1: esperava 1 saldo previsto de 120,00; achei %', n; END IF;

  -- ── caso 2: juros 80 + multa 40 (documento 1.418,00, pago 1.538,00) e o saldo da conta cai 1.538,00 ───────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 1418, 'TESTE LIQ 2', cat, false) RETURNING id INTO l2;
  SELECT saldo_atual INTO s0 FROM public.fin_contas WHERE id = conta;
  liq := public.fin_liquidar(conta, CURRENT_DATE, pf, 1538,
    jsonb_build_array(jsonb_build_object('lancamento_id', l2, 'valor_pago', 1418)),
    jsonb_build_array(jsonb_build_object('tipo', 'juros', 'valor', 80, 'lancamento_id', l2),
                      jsonb_build_object('tipo', 'multa', 'valor', 40, 'lancamento_id', l2)));
  SELECT * INTO o FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l2;
  IF o.situacao <> 'pago_com_diferenca' OR o.juros <> 80 OR o.multa <> 40 OR o.total_pago <> 1538 OR o.saldo_pendente <> 0 THEN
    RAISE EXCEPTION 'Caso 2 (juros+multa) falhou: %', row_to_json(o);
  END IF;
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE liquidacao_id = liq AND componente = 'juros' AND categoria_id = cat_juros AND valor = 80 AND status = 'realizado';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 2: o lançamento de juros não nasceu como esperado (achei %)', n; END IF;
  SELECT saldo_atual INTO s1 FROM public.fin_contas WHERE id = conta;
  IF round(s0 - s1, 2) <> 1538 THEN RAISE EXCEPTION 'Caso 2: o saldo da conta deveria cair 1538,00 e caiu % (gatilho de saldo?)', round(s0 - s1, 2); END IF;

  -- ── caso 3: pago a maior SEM explicar a diferença → a função RECUSA ─────────────────────────────────────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 1418, 'TESTE LIQ 3', cat, false) RETURNING id INTO l3;
  recusou := false;
  BEGIN
    PERFORM public.fin_liquidar(conta, CURRENT_DATE, pf, 1538, jsonb_build_array(jsonb_build_object('lancamento_id', l3, 'valor_pago', 1418)));
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'Caso 3: liquidou R$ 1.538,00 para um documento de R$ 1.418,00 sem explicar a diferença.'; END IF;
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE id = l3 AND status = 'previsto';
  IF n <> 1 THEN RAISE EXCEPTION 'Caso 3: a recusa deveria deixar o lançamento previsto.'; END IF;

  -- ── caso 4: desconto — documento 1.418,00, pago 1.350,00, desconto 68,00 ─────────────────────────────────
  PERFORM public.fin_liquidar(conta, CURRENT_DATE, pf, 1350, jsonb_build_array(jsonb_build_object('lancamento_id', l3, 'valor_pago', 1350, 'desconto', 68)));
  SELECT * INTO o FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l3;
  IF o.situacao <> 'pago_com_diferenca' OR o.valor_original <> 1418 OR o.pago_principal <> 1350 OR o.desconto <> 68 OR o.saldo_pendente <> 0 THEN
    RAISE EXCEPTION 'Caso 4 (desconto) falhou: %', row_to_json(o);
  END IF;

  -- ── caso 5: dois documentos num pagamento (1.418,00 + 120,00 = 1.538,00) ─────────────────────────────────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 1418, 'TESTE LIQ 5A', cat, false) RETURNING id INTO l1;
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 120, 'TESTE LIQ 5B', cat, false) RETURNING id INTO l2;
  liq := public.fin_liquidar(conta, CURRENT_DATE, pf, 1538, jsonb_build_array(
    jsonb_build_object('lancamento_id', l1, 'valor_pago', 1418), jsonb_build_object('lancamento_id', l2, 'valor_pago', 120)));
  SELECT count(*) INTO n FROM public.fin_lancamentos WHERE liquidacao_id = liq AND status = 'realizado';
  IF n <> 2 THEN RAISE EXCEPTION 'Caso 5: esperava 2 lançamentos na mesma liquidação; achei %', n; END IF;
  IF (SELECT valor_total FROM public.fin_liquidacoes WHERE id = liq) <> 1538 THEN RAISE EXCEPTION 'Caso 5: a liquidação deveria guardar 1538,00.'; END IF;
  IF (SELECT count(*) FROM public.vw_fin_obrigacoes WHERE obrigacao_id IN (l1, l2) AND situacao = 'pago_integralmente') <> 2 THEN
    RAISE EXCEPTION 'Caso 5: os dois documentos deveriam estar pagos integralmente.';
  END IF;

  -- ── caso 6: ajuste manual SEM motivo é recusado ─────────────────────────────────────────────────────────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'previsto', CURRENT_DATE, 100, 'TESTE LIQ 6', cat, false) RETURNING id INTO l1;
  recusou := false;
  BEGIN
    PERFORM public.fin_liquidar(conta, CURRENT_DATE, pf, 110, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'valor_pago', 100)),
      jsonb_build_array(jsonb_build_object('tipo', 'ajuste', 'valor', 10, 'lancamento_id', l1)));
  EXCEPTION WHEN OTHERS THEN recusou := true;
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'Caso 6: aceitou ajuste manual sem motivo.'; END IF;

  -- ── caso 7: lançamento ANTIGO (sem nenhuma coluna nova) lê como pago integralmente, sem diferença ───────
  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, descricao, categoria_id, valor_variavel)
  VALUES (conta, 'saida', 'realizado', CURRENT_DATE, CURRENT_DATE, 500, 'TESTE LIQ 7', cat, false) RETURNING id INTO l1;
  SELECT * INTO o FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l1;
  IF o.situacao <> 'pago_integralmente' OR o.valor_original <> 500 OR o.total_pago <> 500 OR o.saldo_pendente <> 0 THEN
    RAISE EXCEPTION 'Caso 7 (lançamento antigo) falhou: %', row_to_json(o);
  END IF;
END
$ensaio$;
