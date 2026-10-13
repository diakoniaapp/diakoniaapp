-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1C-c da Quitação (migration 20261015110000) contra os dados REAIS — OS BLOQUEIOS do malote e do fechamento ──────────────────────────────────────────────────────────
-- PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- Dentro de uma transação que será desfeita: roda a migration e confere que (1) nada existente mudou; (2) com a vigência DESLIGADA (o estado de hoje) nenhum malote nem fechamento é recusado,
-- mesmo com despesa A esclarecer; (3) com a vigência LIGADA a despesa A esclarecer/Formalizar do mês recusa o malote e o fechamento, com a mensagem em português; (4) resolvida a pendência, passam;
-- (5) o fechamento carimba TAMBÉM a oferta (quitado por terceiro) e ela fica travada no período; (6) para o que já era carimbado (realizado e conciliado) o resultado é IDÊNTICO ao da função antiga:
-- o ensaio fecha um mês REAL e compara o conjunto carimbado com o que a regra antiga carimbaria. Tudo desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text; h_saldos_depois text;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; cat uuid; centro uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; q1 uuid; q2 uuid; envio uuid; fech uuid; vig_antes date;
  esperados bigint; carimbados bigint; mes_real int; ano_real int; ini_real date; fim_real date; n_oferta_real bigint;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 1B ainda não foi aplicada: rode docs/QUITACAO_1B_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'A Fase 1C-a ainda não foi aplicada: rode docs/QUITACAO_1C_A_APLICAR.sql antes deste ensaio.'; END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, fechamento_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_antes, h_q_antes FROM public.vw_fin_quitacao;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  SELECT vigencia INTO vig_antes FROM public.fin_quitacao_parametros;
  rel := format('ANTES: %s lançamentos; %s saídas no ciclo; %s obrigações; %s quitações; vigência %s.', n_lanc_antes, n_ciclo_antes, n_obr_antes, n_q_antes, COALESCE(vig_antes::text, 'DESLIGADA'));

  -- ── a migration inteira ──
  -- comando 1 de 5 da migration
  EXECUTE $m1$CREATE OR REPLACE FUNCTION public.fin_quitacao_bloqueios(p_ini date, p_fim date) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT count(*)::int FROM public.vw_fin_quitacao q WHERE q.bloqueia_fechamento AND q.data_despesa BETWEEN p_ini AND p_fim;
$fn$;$m1$;
  -- comando 2 de 5 da migration
  EXECUTE $m2$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_bloqueios(date, date) FROM PUBLIC, anon;$m2$;
  -- comando 3 de 5 da migration
  EXECUTE $m3$GRANT EXECUTE ON FUNCTION public.fin_quitacao_bloqueios(date, date) TO authenticated;$m3$;
  -- comando 4 de 5 da migration
  EXECUTE $m4$CREATE OR REPLACE FUNCTION public.fin_enviar_malote(p_ano int, p_mes int, p_dossies int DEFAULT 0, p_pendencias int DEFAULT 0, p_observacao text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ini date; fim date; envio uuid; n int; bloqueios int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar o envio do malote.';
  END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_ano NOT BETWEEN 2020 AND 2099 THEN RAISE EXCEPTION 'Período inválido: %/%.', p_mes, p_ano; END IF;
  ini := make_date(p_ano, p_mes, 1); fim := (ini + interval '1 month' - interval '1 day')::date;

  bloqueios := public.fin_quitacao_bloqueios(ini, fim);
  IF bloqueios > 0 THEN
    RAISE EXCEPTION 'Há % despesa(s) de %/% com quitação por terceiro sem resposta (A esclarecer ou Formalizar). Resolva-as antes de enviar o malote: quem pagou? qual era a intenção? falta o documento assinado?',
      bloqueios, lpad(p_mes::text, 2, '0'), p_ano;
  END IF;

  INSERT INTO public.fin_malote_envios (ano, mes, dossies, pendencias_documentos, observacao, enviado_por)
  VALUES (p_ano, p_mes, GREATEST(COALESCE(p_dossies, 0), 0), GREATEST(COALESCE(p_pendencias, 0), 0), p_observacao, (SELECT auth.uid()))
  RETURNING id INTO envio;

  INSERT INTO public.fin_malote_itens (envio_id, lancamento_id, obrigacao_id, ano, mes, valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, incluido_por)
  SELECT envio, l.id, COALESCE(l.obrigacao_id, l.id), p_ano, p_mes, l.valor, l.data, l.categoria_id, l.centro_custo_id, l.fornecedor_id, l.pessoa_id, (SELECT auth.uid())
    FROM public.vw_fin_ciclo v
    JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
   WHERE v.estado = 'pronta_para_malote'
     AND ((l.data_pagamento BETWEEN ini AND fim) OR (l.data_pagamento IS NULL AND l.data BETWEEN ini AND fim))
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE public.fin_malote_envios SET despesas = n WHERE id = envio;
  RETURN envio;
END
$fn$;$m4$;
  -- comando 5 de 5 da migration
  EXECUTE $m5$CREATE OR REPLACE FUNCTION public.fin_fechar_periodo(p_fechamento_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_fech record;
  v_data_inicio date;
  v_data_fim date;
  v_saldo_inicial numeric(14,2);
  v_movimento numeric(14,2);
  v_bloqueios int;
BEGIN
  SELECT * INTO v_fech FROM public.fin_fechamentos_periodo WHERE id = p_fechamento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento não encontrado'; END IF;
  IF v_fech.status NOT IN ('aberto', 'em_revisao') THEN
    RAISE EXCEPTION 'Período já está %', v_fech.status;
  END IF;

  v_data_inicio := make_date(v_fech.ano_inicio, v_fech.mes_inicio, 1);
  v_data_fim := (v_data_inicio + (v_fech.qtd_meses || ' months')::interval - interval '1 day')::date;

  v_bloqueios := public.fin_quitacao_bloqueios(v_data_inicio, v_data_fim);
  IF v_bloqueios > 0 THEN
    RAISE EXCEPTION 'Há % despesa(s) do período com quitação por terceiro sem resposta (A esclarecer ou Formalizar). Resolva-as antes de fechar: quem pagou? qual era a intenção? falta o documento assinado?', v_bloqueios;
  END IF;

  UPDATE public.fin_lancamentos
    SET fechamento_id = p_fechamento_id
    WHERE data BETWEEN v_data_inicio AND v_data_fim
      AND status::text IN ('realizado', 'conciliado', 'quitado_terceiro')
      AND fechamento_id IS NULL;

  SELECT coalesce(sum(saldo_inicial), 0) INTO v_saldo_inicial FROM public.fin_contas;
  SELECT coalesce(sum(CASE WHEN tipo = 'entrada' THEN valor ELSE -valor END), 0) INTO v_movimento
    FROM public.fin_lancamentos
    WHERE data <= v_data_fim AND status IN ('realizado', 'conciliado');

  UPDATE public.fin_fechamentos_periodo
    SET status = 'fechado', fechado_em = now(), fechado_por = auth.uid(),
        saldo_final = v_saldo_inicial + v_movimento
    WHERE id = p_fechamento_id;
END
$fn$;$m5$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, fechamento_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF h_ciclo_depois IS DISTINCT FROM h_ciclo_antes OR n_ciclo_depois <> n_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou.'; END IF;
  IF h_obr_depois IS DISTINCT FROM h_obr_antes OR n_obr_depois <> n_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou.'; END IF;
  IF h_q_depois IS DISTINCT FROM h_q_antes OR n_q_depois <> n_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou.';
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

    -- janeiro/2098 e fevereiro/2098: meses que não existem na vida real, só para o teste
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', DATE '2098-01-15', 100, 'ENSAIO 1C-c a esclarecer', emit, 'manual', cat, centro) RETURNING id INTO l1;
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf.pdf');
    q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_x, NULL, 'nao_declarada', current_date - 5, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
    SELECT fila INTO st FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
    IF st = 'a_esclarecer' THEN rel := rel || ' Fixture: a despesa de jan/2098 está A esclarecer.'; ELSE ok := false; rel := rel || format(' FALHOU na montagem: fila=%s.', st); END IF;

    -- C1: vigência DESLIGADA (o estado de hoje): nada bloqueia, nem o malote nem o fechamento
    UPDATE public.fin_quitacao_parametros SET vigencia = NULL;
    BEGIN
      envio := public.fin_enviar_malote(2098, 1, 0, 0, 'ENSAIO');
      INSERT INTO public.fin_fechamentos_periodo (ano_inicio, mes_inicio, qtd_meses) VALUES (2098, 1, 1) RETURNING id INTO fech;
      PERFORM public.fin_fechar_periodo(fech);
      rel := rel || ' C1 ok (vigência desligada: o malote foi enviado e o período fechado, mesmo com despesa A esclarecer — nada bloqueia sem ativação consciente).';
      PERFORM public.fin_reabrir_periodo(fech, 'ENSAIO');
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU C1: ' || SQLERRM; END;

    -- C2: vigência LIGADA: a despesa A esclarecer do mês recusa o malote e o fechamento
    PERFORM public.fin_quitacao_parametros_alterar(jsonb_build_object('vigencia', '2098-01-01'), 'ENSAIO');
    BEGIN
      PERFORM public.fin_enviar_malote(2098, 1, 0, 0, 'ENSAIO');
      ok := false; rel := rel || ' FALHOU C2a: o malote foi enviado com despesa A esclarecer e a vigência ligada.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%sem resposta%' THEN rel := rel || ' C2a ok (com a vigência ligada, o malote do mês é recusado: a mensagem diz o que resolver).'; ELSE ok := false; rel := rel || ' FALHOU C2a: ' || SQLERRM; END IF;
    END;
    BEGIN
      PERFORM public.fin_fechar_periodo(fech);
      ok := false; rel := rel || ' FALHOU C2b: o período foi fechado com despesa A esclarecer e a vigência ligada.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%sem resposta%' THEN rel := rel || ' C2b ok (o fechamento também é recusado).'; ELSE ok := false; rel := rel || ' FALHOU C2b: ' || SQLERRM; END IF;
    END;
    SELECT public.fin_quitacao_bloqueios(DATE '2098-01-01', DATE '2098-01-31') INTO n;
    IF n = 1 THEN rel := rel || ' C2c ok (fin_quitacao_bloqueios conta 1 despesa bloqueando em jan/2098).'; ELSE ok := false; rel := rel || format(' FALHOU C2c: %s bloqueios (esperado 1).', n); END IF;

    -- C3: o mês sem pendência passa (fevereiro/2098 não tem nada)
    BEGIN
      PERFORM public.fin_enviar_malote(2098, 2, 0, 0, 'ENSAIO');
      rel := rel || ' C3 ok (o mês sem pendência segue enviando normalmente).';
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU C3: ' || SQLERRM; END;

    -- C4: "Reembolso a pagar" e "Investigar" NÃO bloqueiam (só avisam)
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', DATE '2098-02-10', 80, 'ENSAIO 1C-c investigar', emit, 'manual', cat, centro) RETURNING id INTO l4;
      PERFORM public.fin_registrar_quitacao(l4, 'nao_localizado', NULL, NULL, 'nao_se_aplica', NULL, NULL, NULL, NULL, NULL, false, 'ENSAIO');
      SELECT public.fin_quitacao_bloqueios(DATE '2098-02-01', DATE '2098-02-28') INTO n;
      IF n = 0 THEN rel := rel || ' C4 ok ("Investigar" não bloqueia: aparece como atenção).'; ELSE ok := false; rel := rel || format(' FALHOU C4: %s bloqueios por Investigar.', n); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU C4: ' || SQLERRM; END;

    -- C5: resolvida a pendência (a quitação removida, com motivo), passa; e a OFERTA extinta é carimbada e TRAVADA pelo período fechado
    BEGIN
      PERFORM public.fin_remover_quitacao(q1, 'ENSAIO: registrada por engano');
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', DATE '2098-01-20', 150, 'ENSAIO 1C-c oferta', emit, 'manual', cat, centro) RETURNING id INTO l2;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l2, 'nota_fiscal', 'nf.pdf'), (l2, 'prova_pagamento_terceiro', 'p.pdf'), (l2, 'declaracao_terceiro', 'd.pdf');
      q2 := public.fin_registrar_quitacao(l2, 'pessoa', pessoa_x, NULL, 'oferta', current_date - 5, current_date - 4, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l2;
      IF st <> 'quitado_terceiro' THEN ok := false; rel := rel || format(' FALHOU C5 (montagem): a oferta Formal não extinguiu (status %s).', st); END IF;
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'realizado', DATE '2098-01-25', 40, 'ENSAIO 1C-c paga', emit, 'manual', cat, centro) RETURNING id INTO l3;
      PERFORM public.fin_fechar_periodo(fech);
      SELECT count(*) INTO n FROM public.fin_lancamentos WHERE id IN (l2, l3) AND fechamento_id = fech;
      SELECT count(*) INTO carimbados FROM public.fin_lancamentos WHERE id = l4 AND fechamento_id IS NOT NULL;
      IF n = 2 AND carimbados = 0 THEN rel := rel || ' C5a ok (resolvida a pendência o período fechou; a oferta E a despesa paga foram carimbadas; a despesa ainda em aberto, não).';
      ELSE ok := false; rel := rel || format(' FALHOU C5a: carimbadas %s de 2; a em aberto carimbada=%s.', n, carimbados); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU C5: ' || SQLERRM; END;
    BEGIN
      PERFORM public.fin_remover_quitacao(q2, 'ENSAIO: tentar desfazer a oferta de um período fechado');
      ok := false; rel := rel || ' FALHOU C6: a oferta de um período fechado foi desfeita.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%período%' THEN rel := rel || ' C6 ok (a oferta de um período fechado fica travada: só reabrindo o período).'; ELSE ok := false; rel := rel || ' FALHOU C6: ' || SQLERRM; END IF;
    END;

    -- C7: para o que JÁ era carimbado (realizado e conciliado) o resultado é idêntico ao da função antiga. Fecha um mês REAL e compara com o que a regra antiga carimbaria.
    SELECT EXTRACT(year FROM max(data))::int, EXTRACT(month FROM max(data))::int INTO ano_real, mes_real FROM public.fin_lancamentos WHERE status::text IN ('realizado', 'conciliado') AND data < date_trunc('month', current_date) AND fechamento_id IS NULL;
    IF ano_real IS NULL THEN rel := rel || ' (C7 de fora: nenhum mês real sem fechamento para comparar).';
    ELSE
      ini_real := make_date(ano_real, mes_real, 1); fim_real := (ini_real + interval '1 month' - interval '1 day')::date;
      IF EXISTS (SELECT 1 FROM public.fin_fechamentos_periodo WHERE ano_inicio = ano_real AND mes_inicio = mes_real AND qtd_meses = 1) THEN rel := rel || ' (C7 de fora: o mês real já tem fechamento).';
      ELSE
        SELECT count(*) INTO esperados FROM public.fin_lancamentos WHERE data BETWEEN ini_real AND fim_real AND status::text IN ('realizado', 'conciliado') AND fechamento_id IS NULL;
        SELECT count(*) INTO n_oferta_real FROM public.fin_lancamentos WHERE data BETWEEN ini_real AND fim_real AND status::text = 'quitado_terceiro' AND fechamento_id IS NULL;
        UPDATE public.fin_quitacao_parametros SET vigencia = NULL;
        INSERT INTO public.fin_fechamentos_periodo (ano_inicio, mes_inicio, qtd_meses) VALUES (ano_real, mes_real, 1) RETURNING id INTO fech;
        PERFORM public.fin_fechar_periodo(fech);
        SELECT count(*) INTO carimbados FROM public.fin_lancamentos WHERE fechamento_id = fech AND status::text IN ('realizado', 'conciliado');
        SELECT count(*) INTO n FROM public.fin_lancamentos WHERE fechamento_id = fech AND status::text = 'quitado_terceiro';
        IF carimbados = esperados AND n = n_oferta_real THEN rel := rel || format(' C7 ok (fechei %s/%s de verdade: a função nova carimbou os MESMOS %s lançamentos pagos que a regra antiga carimbaria, e %s oferta(s)).', lpad(mes_real::text, 2, '0'), ano_real, esperados, n);
        ELSE ok := false; rel := rel || format(' FALHOU C7: carimbados %s (esperado %s); ofertas %s (esperado %s).', carimbados, esperados, n, n_oferta_real); END IF;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
