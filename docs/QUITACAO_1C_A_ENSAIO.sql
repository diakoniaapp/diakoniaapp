-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1C-a da Quitação (migration 20261015100000) contra os dados REAIS — PAGAR O REEMBOLSO ───────────────────────────────────────────────────────────────────────────────────
-- PRÉ-REQUISITOS: Fase 1A aplicada (QUITACAO_APLICAR.sql), status novo (QUITACAO_1B_M0_APLICAR.sql) e Fase 1B aplicada (QUITACAO_1B_APLICAR.sql).
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda a migration e confere que (1) nenhum lançamento, nenhum saldo e nenhuma linha de vw_fin_ciclo, vw_fin_obrigacoes ou
-- vw_fin_quitacao (as colunas que já existiam) mudou; (2) o reembolso só se paga depois de APROVADO; (3) a liquidação comum continua recusada; (4) o pagamento PARCIAL deixa o saldo na fila e a quitação
-- NÃO vira "Reembolsada" cedo; (5) o pagamento do saldo a conclui; (6) o dinheiro saiu UMA vez (saldo da conta cai exatamente o valor), sem criar entrada, transferência ou vínculo; (7) cada pagamento
-- fica no histórico com usuário, valor e conta. Tudo desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text; h_saldos_depois text;
  n_entradas_antes bigint; n_entradas_depois bigint; n_vinc_antes bigint; n_vinc_depois bigint; n_liq_antes bigint; n_liq_depois bigint;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; cat uuid; centro uuid; l1 uuid; l2 uuid; q1 uuid; q2 uuid; ev bigint; saldo_conta_antes numeric; saldo_conta_depois numeric; filho record;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 1B ainda não foi aplicada: rode docs/QUITACAO_1B_APLICAR.sql antes deste ensaio.'; END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_antes, h_q_antes FROM public.vw_fin_quitacao;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
  SELECT count(*) INTO n_vinc_antes FROM public.fin_extrato_vinculos;
  SELECT count(*) INTO n_liq_antes FROM public.fin_liquidacoes;
  rel := format('ANTES: %s lançamentos; %s saídas no ciclo; %s obrigações; %s quitações; %s liquidações.', n_lanc_antes, n_ciclo_antes, n_obr_antes, n_q_antes, n_liq_antes);

  -- ── a migration inteira ──
  -- comando 1 de 8 da migration
  EXECUTE $m1$DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago'));
END $$;$m1$;
  -- comando 2 de 8 da migration
  EXECUTE $m2$CREATE OR REPLACE VIEW public.vw_fin_quitacao WITH (security_invoker = true) AS
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
           'paga', v.status_despesa IN ('realizado', 'conciliado') AND v.em_aberto < 0.005)) AS r
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
       CASE WHEN v.intencao = 'reembolso' THEN v.pago_total END AS reembolsado,
       CASE WHEN v.intencao = 'reembolso' THEN v.em_aberto END AS saldo_a_reembolsar
  FROM resolvidas v
 CROSS JOIN public.fin_quitacao_parametros p;$m2$;
  -- comando 3 de 8 da migration
  EXECUTE $m3$GRANT SELECT ON public.vw_fin_quitacao TO authenticated;$m3$;
  -- comando 4 de 8 da migration
  EXECUTE $m4$COMMENT ON VIEW public.vw_fin_quitacao IS 'A quitação registrada e tudo o que dela se DERIVA: graus de prova (dos anexos), nível de risco, suficiência, aprovação vigente, resultado, credor atual, fila, bloqueio de fechamento e, no reembolso, quanto já foi pago à pessoa e quanto falta. Nada aqui é digitado.';$m4$;
  -- comando 5 de 8 da migration
  EXECUTE $m5$CREATE OR REPLACE FUNCTION public.fin_liquidar_reembolso(
  p_quitacao uuid, p_conta_id uuid, p_data date, p_forma public.fin_forma_pagamento, p_valor numeric,
  p_comprovante_url text DEFAULT NULL, p_ofx_fitid text DEFAULT NULL, p_observacoes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; v record; x public.fin_lancamentos%ROWTYPE; liq uuid; valor numeric := round(p_valor, 2);
  hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; uid uuid := (SELECT auth.uid());
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para pagar um reembolso.';
  END IF;
  IF valor IS NULL OR valor <= 0 THEN RAISE EXCEPTION 'Informe o valor a reembolsar.'; END IF;
  IF p_data IS NULL OR p_data > hoje THEN RAISE EXCEPTION 'A data do pagamento é obrigatória e não pode ser futura.'; END IF;
  IF p_conta_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_id) THEN RAISE EXCEPTION 'Escolha a conta de onde o reembolso sai.'; END IF;

  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  IF q.intencao <> 'reembolso' THEN RAISE EXCEPTION 'Esta quitação não é um reembolso: não há o que pagar à pessoa (oferta extingue a conta sem pagamento).'; END IF;
  IF q.responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Não se sabe quem pagou a nota: não há a quem reembolsar.'; END IF;

  SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q.id;
  IF v.resultado IS DISTINCT FROM 'divida_com_terceiro' THEN
    RAISE EXCEPTION '%', CASE v.resultado
      WHEN 'reembolsada' THEN 'Este reembolso já foi pago por inteiro.'
      WHEN 'reembolso_em_analise' THEN 'O reembolso ainda não foi aprovado: aprove-o antes de pagar (aprovar não paga).'
      WHEN 'a_formalizar' THEN 'A prova ainda não é suficiente para pagar: ' || COALESCE(v.motivo_insuficiencia, 'anexe o Pedido de Reembolso e o comprovante do pagamento do terceiro.')
      WHEN 'a_esclarecer' THEN 'O reembolso foi recusado ou a intenção não está esclarecida: não há o que pagar.'
      ELSE 'Esta quitação não está em condições de ser paga (situação: ' || COALESCE(v.resultado, '—') || ').' END;
  END IF;
  IF valor > v.saldo_a_reembolsar + 0.004 THEN
    RAISE EXCEPTION 'O valor (%) passa do que falta reembolsar (%). Reembolso não leva juros, multa nem complemento.', valor, v.saldo_a_reembolsar;
  END IF;

  SELECT * INTO x FROM public.fin_lancamentos
   WHERE tipo::text = 'saida' AND status::text = 'previsto' AND (id = q.obrigacao_id OR obrigacao_id = q.obrigacao_id)
   ORDER BY (id = q.obrigacao_id) DESC, data LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não há parcela em aberto nesta obrigação: o reembolso já está pago.'; END IF;

  PERFORM set_config('qibrj.reembolso', 'on', true);
  liq := public.fin_liquidar(p_conta_id, p_data, p_forma, valor,
           jsonb_build_array(jsonb_build_object('lancamento_id', x.id, 'valor_pago', valor, 'desconto', 0)), '[]'::jsonb,
           p_comprovante_url, p_ofx_fitid, p_observacoes);
  PERFORM set_config('qibrj.reembolso', '', true);

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, 'reembolso_pago',
          jsonb_build_object('liquidacao_id', liq, 'valor', valor, 'conta_id', p_conta_id, 'data', p_data, 'saldo_depois', round(v.saldo_a_reembolsar - valor, 2)),
          NULLIF(btrim(COALESCE(p_observacoes, '')), ''), uid);
  RETURN liq;
END
$fn$;$m5$;
  -- comando 6 de 8 da migration
  EXECUTE $m6$REVOKE EXECUTE ON FUNCTION public.fin_liquidar_reembolso(uuid, uuid, date, public.fin_forma_pagamento, numeric, text, text, text) FROM PUBLIC, anon;$m6$;
  -- comando 7 de 8 da migration
  EXECUTE $m7$GRANT EXECUTE ON FUNCTION public.fin_liquidar_reembolso(uuid, uuid, date, public.fin_forma_pagamento, numeric, text, text, text) TO authenticated;$m7$;
  -- comando 8 de 8 da migration
  EXECUTE $m8$COMMENT ON FUNCTION public.fin_liquidar_reembolso IS 'Paga (total ou parcialmente) o reembolso APROVADO de uma quitação, à pessoa/empresa/entidade que pagou o fornecedor. Casca sobre fin_liquidar: não cria entrada, transferência nem saída fictícia.';$m8$;

  -- ── depois: nada mudou para o que já existia ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF n_lanc_depois <> n_lanc_antes OR h_lanc_depois IS DISTINCT FROM h_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF n_ciclo_depois <> n_ciclo_antes OR h_ciclo_depois IS DISTINCT FROM h_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou de resultado para despesas que já existiam.'; END IF;
  IF n_obr_depois <> n_obr_antes OR h_obr_depois IS DISTINCT FROM h_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou de resultado.'; END IF;
  IF n_q_depois <> n_q_antes OR h_q_depois IS DISTINCT FROM h_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou de resultado para quitações que já existiam.';
  ELSE rel := rel || format(' Depois da migration: os %s lançamentos, as %s saídas do ciclo, as %s obrigações e as %s quitações seguem IDÊNTICOS.', n_lanc_depois, n_ciclo_depois, n_obr_depois, n_q_depois); END IF;

  -- ── o teste ao vivo, com um administrador real (desfeito no fim) ──
  SELECT ur.user_id INTO uid FROM public.user_roles ur JOIN public.profiles pr ON pr.id = ur.user_id WHERE ur.role::text = 'admin' AND pr.pessoa_id IS NOT NULL LIMIT 1;
  IF uid IS NULL THEN SELECT user_id INTO uid FROM public.user_roles WHERE role::text = 'admin' LIMIT 1; END IF;
  IF uid IS NULL THEN
    rel := rel || ' (nenhum administrador encontrado: o teste ao vivo ficou de fora).';
  ELSE
    PERFORM set_config('request.jwt.claim.sub', uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    SELECT pessoa_id INTO pessoa_adm FROM public.profiles WHERE id = uid;
    SELECT id INTO conta FROM public.fin_contas ORDER BY id LIMIT 1;
    SELECT id INTO emit FROM public.fin_fornecedores ORDER BY id LIMIT 1;
    SELECT id INTO cat FROM public.fin_categorias WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;
    SELECT id INTO centro FROM public.fin_centros_custo ORDER BY id LIMIT 1;
    SELECT m.id INTO pessoa_x FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm ORDER BY m.id LIMIT 1;

    -- uma nota de R$ 600 (acima do teto 1: só o Administrador aprova), paga por uma pessoa que pede REEMBOLSO, com a prova Formal (comprovante do terceiro + Pedido de Reembolso)
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 3, 600, 'ENSAIO 1C-a reembolso', emit, 'manual', cat, centro) RETURNING id INTO l1;
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf.pdf'), (l1, 'prova_pagamento_terceiro', 'p.pdf'), (l1, 'pedido_reembolso', 'r.pdf');
    q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 2, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
    SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT count(*) INTO n_vinc_antes FROM public.fin_extrato_vinculos;
    SELECT count(*) INTO n_liq_antes FROM public.fin_liquidacoes;
    SELECT saldo_atual INTO saldo_conta_antes FROM public.fin_contas WHERE id = conta;

    -- R1: sem aprovação, não se paga (aprovar é um ato; pagar é outro)
    BEGIN
      PERFORM public.fin_liquidar_reembolso(q1, conta, current_date, NULL, 100, NULL, NULL, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU R1: pagou um reembolso que ninguém aprovou.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%aprov%' THEN rel := rel || ' R1 ok (reembolso não aprovado não se paga).'; ELSE ok := false; rel := rel || ' FALHOU R1: ' || SQLERRM; END IF;
    END;

    -- R2: aprovado ⇒ dívida com o terceiro, saldo a reembolsar = o valor inteiro
    BEGIN
      PERFORM public.fin_decidir_quitacao(q1, 'reembolso', 'aprovada', 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      IF v.resultado = 'divida_com_terceiro' AND v.fila = 'reembolso_a_pagar' AND v.saldo_a_reembolsar = 600 AND v.reembolsado = 0 THEN rel := rel || ' R2 ok (aprovado: dívida com o terceiro, falta reembolsar 600,00).';
      ELSE ok := false; rel := rel || format(' FALHOU R2: resultado=%s fila=%s saldo=%s pago=%s.', v.resultado, v.fila, v.saldo_a_reembolsar, v.reembolsado); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU R2: ' || SQLERRM; END;

    -- R3: a liquidação comum continua recusada (senão o fornecedor seria pago de novo)
    BEGIN
      PERFORM public.fin_liquidar(conta, current_date, NULL, 600, jsonb_build_array(jsonb_build_object('lancamento_id', l1, 'valor_pago', 600, 'desconto', 0)));
      ok := false; rel := rel || ' FALHOU R3: a liquidação comum pagou uma conta que um terceiro já pagou.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%terceiro%' THEN rel := rel || ' R3 ok (a liquidação comum segue recusada).'; ELSE ok := false; rel := rel || ' FALHOU R3: ' || SQLERRM; END IF;
    END;

    -- R4: o valor não passa do saldo (reembolso não leva juros nem complemento)
    BEGIN
      PERFORM public.fin_liquidar_reembolso(q1, conta, current_date, NULL, 650, NULL, NULL, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU R4: pagou mais do que o reembolso.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%passa do que falta%' THEN rel := rel || ' R4 ok (valor acima do saldo é recusado).'; ELSE ok := false; rel := rel || ' FALHOU R4: ' || SQLERRM; END IF;
    END;

    -- R5: pagamento PARCIAL de 200: o saldo de 400 fica na fila; a quitação NÃO vira "Reembolsada"
    BEGIN
      PERFORM public.fin_liquidar_reembolso(q1, conta, current_date, NULL, 200, NULL, NULL, 'ENSAIO parcial');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      SELECT count(*), COALESCE(sum(valor), 0) INTO n, saldo_conta_depois FROM public.fin_lancamentos WHERE obrigacao_id = l1 AND id <> l1 AND status::text = 'previsto';
      IF v.resultado = 'divida_com_terceiro' AND v.fila = 'reembolso_a_pagar' AND v.reembolsado = 200 AND v.saldo_a_reembolsar = 400 AND n = 1 AND saldo_conta_depois = 400 THEN
        rel := rel || ' R5 ok (parcial: pago 200,00, falta 400,00 na fila; a quitação NÃO virou Reembolsada cedo).';
      ELSE ok := false; rel := rel || format(' FALHOU R5: resultado=%s fila=%s pago=%s saldo=%s parcelas abertas=%s.', v.resultado, v.fila, v.reembolsado, v.saldo_a_reembolsar, n); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU R5: ' || SQLERRM; END;

    -- R6: pagar o que falta conclui: Reembolsada, fila vazia, credor nenhum
    BEGIN
      PERFORM public.fin_liquidar_reembolso(q1, conta, current_date, NULL, 400, NULL, NULL, 'ENSAIO final');
      SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
      IF v.resultado = 'reembolsada' AND v.fila IS NULL AND v.credor_atual = 'nenhum' AND v.reembolsado = 600 AND v.saldo_a_reembolsar = 0 THEN rel := rel || ' R6 ok (saldo pago: Reembolsada, fila vazia, credor nenhum).';
      ELSE ok := false; rel := rel || format(' FALHOU R6: resultado=%s fila=%s pago=%s saldo=%s.', v.resultado, v.fila, v.reembolsado, v.saldo_a_reembolsar); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU R6: ' || SQLERRM; END;

    -- R7: pagar de novo é recusado
    BEGIN
      PERFORM public.fin_liquidar_reembolso(q1, conta, current_date, NULL, 1, NULL, NULL, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU R7: pagou um reembolso já quitado.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%por inteiro%' THEN rel := rel || ' R7 ok (reembolso já pago não se paga de novo).'; ELSE ok := false; rel := rel || ' FALHOU R7: ' || SQLERRM; END IF;
    END;

    -- R8: o histórico guarda cada pagamento (quem, quanto, conta)
    SELECT count(*) INTO ev FROM public.fin_quitacao_eventos WHERE quitacao_id = q1 AND evento = 'reembolso_pago' AND por = uid AND (para->>'conta_id')::uuid = conta;
    IF ev = 2 THEN rel := rel || ' R8 ok (2 pagamentos no histórico, com usuário e conta).'; ELSE ok := false; rel := rel || format(' FALHOU R8: %s evento(s) de pagamento.', ev); END IF;

    -- R9: quem não é reembolso não se paga como reembolso ("Não localizado" não tem a quem pagar)
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 3, 50, 'ENSAIO 1C-a não localizado', emit, 'manual', cat, centro) RETURNING id INTO l2;
      q2 := public.fin_registrar_quitacao(l2, 'nao_localizado', NULL, NULL, 'nao_se_aplica', NULL, NULL, NULL, NULL, NULL, false, 'ENSAIO');
      PERFORM public.fin_liquidar_reembolso(q2, conta, current_date, NULL, 50, NULL, NULL, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU R9: pagou reembolso de uma quitação sem reembolso.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%reembolso%' THEN rel := rel || ' R9 ok (quitação que não é reembolso não é paga por aqui).'; ELSE ok := false; rel := rel || ' FALHOU R9: ' || SQLERRM; END IF;
    END;

    -- ── as garantias finais: o dinheiro saiu UMA vez, e nada fictício nasceu ──
    SELECT saldo_atual INTO saldo_conta_depois FROM public.fin_contas WHERE id = conta;
    SELECT count(*) INTO n_entradas_depois FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT count(*) INTO n_vinc_depois FROM public.fin_extrato_vinculos;
    SELECT count(*) INTO n_liq_depois FROM public.fin_liquidacoes;
    IF saldo_conta_antes - saldo_conta_depois = 600 THEN rel := rel || ' GARANTIA: o saldo da conta caiu exatamente 600,00 (uma saída, a do reembolso).'; ELSE ok := false; rel := rel || format(' FALHOU: o saldo da conta caiu %s (esperado 600,00).', saldo_conta_antes - saldo_conta_depois); END IF;
    IF n_entradas_depois <> n_entradas_antes OR n_vinc_depois <> n_vinc_antes THEN ok := false; rel := rel || ' FALHOU: nasceu entrada ou vínculo bancário.'; ELSE rel := rel || ' GARANTIA: nenhuma entrada, transferência ou vínculo bancário foi criado.'; END IF;
    IF n_liq_depois - n_liq_antes <> 2 THEN ok := false; rel := rel || format(' FALHOU: %s liquidações criadas (esperado 2).', n_liq_depois - n_liq_antes); END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
