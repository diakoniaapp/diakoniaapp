-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1C-d da Quitação (migration 20261015120000) contra os dados REAIS — OS PRAZOS DERIVADOS e o realinhamento diário ──────────────────────────────────────────────────────
-- PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- Dentro de uma transação que será desfeita: roda a migration e confere que (1) nada existente mudou; (2) os três prazos nascem das datas e dos parâmetros (formalização, esclarecimento, reembolso) e a
-- situação sai certa (vencido, vence em até 7 dias, no prazo); (3) o realinhamento diário DESFAZ a extinção de uma oferta cujo prazo de formalização venceu, sem ninguém abrir tela e sem erro; (4) a API
-- (usuário autenticado) NÃO consegue chamar o realinhamento; (5) o job `quitacao-sincronizar` fica agendado (se o pg_cron existir). Tudo desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text; h_saldos_depois text;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; pessoa_ok uuid; cat uuid; centro uuid; l1 uuid; l2 uuid; l3 uuid; q1 uuid; q2 uuid; q3 uuid; mudou int; ev bigint; jobs bigint; emit_ok uuid; cnpj_emit text; base43 text; chave text; dv int;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 1B ainda não foi aplicada: rode docs/QUITACAO_1B_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'A Fase 1C-a ainda não foi aplicada: rode docs/QUITACAO_1C_A_APLICAR.sql antes deste ensaio.'; END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_antes, h_q_antes FROM public.vw_fin_quitacao;
  rel := format('ANTES: %s lançamentos; %s saídas no ciclo; %s obrigações; %s quitações.', n_lanc_antes, n_ciclo_antes, n_obr_antes, n_q_antes);

  -- ── a migration inteira ──
  -- comando 1 de 6 da migration
  EXECUTE $m1$CREATE OR REPLACE VIEW public.vw_fin_quitacao_prazos WITH (security_invoker = true) AS
WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d),
abertos AS (
  SELECT q.quitacao_id, q.obrigacao_id, q.fila, q.resultado, q.intencao, q.valor_obrigacao, q.saldo_a_reembolsar, q.grau_conjunto,
         (q.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date + p.prazo_formalizacao_dias AS limite_formalizacao,
         q.data_despesa + p.prazo_esclarecimento_dias AS limite_esclarecimento,
         (SELECT (max(e.em) AT TIME ZONE 'America/Sao_Paulo')::date + p.prazo_reembolso_dias
            FROM public.fin_quitacao_eventos e
           WHERE e.quitacao_id = q.quitacao_id AND e.evento = 'aprovacao_reembolso' AND e.decisao = 'aprovada') AS limite_reembolso
    FROM public.vw_fin_quitacao q CROSS JOIN public.fin_quitacao_parametros p
),
linhas AS (
  SELECT a.quitacao_id, a.obrigacao_id, 'formalizacao'::text AS prazo, a.limite_formalizacao AS limite, a.valor_obrigacao AS valor
    FROM abertos a WHERE a.intencao = 'oferta' AND a.grau_conjunto = 'relatado' AND (a.fila = 'formalizar' OR a.resultado = 'extinta_como_oferta')
  UNION ALL
  SELECT a.quitacao_id, a.obrigacao_id, 'esclarecimento', a.limite_esclarecimento, a.valor_obrigacao FROM abertos a WHERE a.fila = 'a_esclarecer'
  UNION ALL
  SELECT a.quitacao_id, a.obrigacao_id, 'reembolso', a.limite_reembolso, COALESCE(a.saldo_a_reembolsar, a.valor_obrigacao) FROM abertos a WHERE a.fila = 'reembolso_a_pagar' AND a.limite_reembolso IS NOT NULL
)
SELECT l.quitacao_id, l.obrigacao_id, l.prazo, l.limite, (l.limite - h.d) AS dias_restantes,
       CASE WHEN l.limite < h.d THEN 'vencido' WHEN l.limite - h.d <= 7 THEN 'vence_em_7_dias' ELSE 'no_prazo' END AS situacao,
       l.valor
  FROM linhas l CROSS JOIN hoje h;$m1$;
  -- comando 2 de 6 da migration
  EXECUTE $m2$GRANT SELECT ON public.vw_fin_quitacao_prazos TO authenticated;$m2$;
  -- comando 3 de 6 da migration
  EXECUTE $m3$COMMENT ON VIEW public.vw_fin_quitacao_prazos IS 'Os prazos abertos da Política (formalização, esclarecimento, reembolso a pagar), DERIVADOS das datas da quitação e dos parâmetros: limite, dias restantes e situação (vencido, vence em até 7 dias, no prazo). Nada aqui é digitado.';$m3$;
  -- comando 4 de 6 da migration
  EXECUTE $m4$CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar_agendada() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record; mudou int := 0; antes text; depois text;
BEGIN
  FOR r IN SELECT q.obrigacao_id AS id FROM public.fin_quitacoes q WHERE q.intencao = 'oferta'
           UNION SELECT l.id FROM public.fin_lancamentos l WHERE l.status::text = 'quitado_terceiro' LOOP
    SELECT status::text INTO antes FROM public.fin_lancamentos WHERE id = r.id;
    BEGIN
      PERFORM public.fin_quitacao_sincronizar(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Sincronismo agendado: não consegui sincronizar a obrigação %: %', r.id, SQLERRM;   -- ex.: período fechado; fica em vw_fin_quitacao_dessincronizadas
    END;
    SELECT status::text INTO depois FROM public.fin_lancamentos WHERE id = r.id;
    IF antes IS DISTINCT FROM depois THEN mudou := mudou + 1; END IF;
  END LOOP;
  RETURN mudou;
END
$fn$;$m4$;
  -- comando 5 de 6 da migration
  EXECUTE $m5$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_agendada() FROM PUBLIC, anon, authenticated;$m5$;
  -- comando 6 de 6 da migration
  EXECUTE $m6$DO $cron$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('quitacao-sincronizar', '0 12 * * *', 'SELECT public.fin_quitacao_sincronizar_agendada()');
  ELSE
    RAISE NOTICE 'pg_cron não está instalado: o realinhamento diário não foi agendado (a Mesa continua realinhando ao abrir).';
  END IF;
END
$cron$;$m6$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF h_ciclo_depois IS DISTINCT FROM h_ciclo_antes OR n_ciclo_depois <> n_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou.'; END IF;
  IF h_obr_depois IS DISTINCT FROM h_obr_antes OR n_obr_depois <> n_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou.'; END IF;
  IF h_q_depois IS DISTINCT FROM h_q_antes OR n_q_depois <> n_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou.';
  ELSE rel := rel || ' Depois da migration: tudo o que já existia segue IDÊNTICO.'; END IF;

  -- o job diário
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM cron.job WHERE jobname = ''quitacao-sincronizar''' INTO jobs;
    IF jobs = 1 THEN rel := rel || ' J ok (o job quitacao-sincronizar ficou agendado, uma vez, todo dia às 09:00 de Brasília).'; ELSE ok := false; rel := rel || format(' FALHOU J: %s job(s) quitacao-sincronizar.', jobs); END IF;
  ELSE rel := rel || ' (J de fora: pg_cron não está instalado neste banco.)'; END IF;

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
    SELECT m.id INTO pessoa_ok FROM public.membros m
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.pessoa_id = m.id) AND NOT EXISTS (SELECT 1 FROM unnest(m.funcoes_ministeriais) fn WHERE fn::text <> 'membro') ORDER BY m.id LIMIT 1;
    UPDATE public.fin_quitacao_parametros SET prazo_formalizacao_dias = 30, prazo_esclarecimento_dias = 30, prazo_reembolso_dias = 10;

    -- P1: A ESCLARECER há 40 dias da nota ⇒ o prazo de esclarecimento (30 dias) venceu há 10
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 40, 100, 'ENSAIO 1C-d esclarecer', emit, 'manual', cat, centro) RETURNING id INTO l1;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf.pdf');
      q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_x, NULL, 'nao_declarada', current_date - 41, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao_prazos WHERE quitacao_id = q1 AND prazo = 'esclarecimento';
      IF v.situacao = 'vencido' AND v.dias_restantes = -10 THEN rel := rel || ' P1 ok (A esclarecer há 40 dias: prazo de esclarecimento VENCIDO há 10 dias).';
      ELSE ok := false; rel := rel || format(' FALHOU P1: situação=%s dias=%s.', v.situacao, v.dias_restantes); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P1: ' || SQLERRM; END;

    -- P2: REEMBOLSO aprovado hoje ⇒ 10 dias para pagar (no prazo); com o prazo em 5 dias passa a "vence em até 7 dias"
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 3, 600, 'ENSAIO 1C-d reembolso', emit, 'manual', cat, centro) RETURNING id INTO l2;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l2, 'nota_fiscal', 'nf.pdf'), (l2, 'prova_pagamento_terceiro', 'p.pdf'), (l2, 'pedido_reembolso', 'r.pdf');
      q2 := public.fin_registrar_quitacao(l2, 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 2, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      PERFORM public.fin_decidir_quitacao(q2, 'reembolso', 'aprovada', 'ENSAIO');
      SELECT * INTO v FROM public.vw_fin_quitacao_prazos WHERE quitacao_id = q2 AND prazo = 'reembolso';
      IF v.situacao = 'no_prazo' AND v.dias_restantes = 10 THEN rel := rel || ' P2a ok (reembolso aprovado hoje: 10 dias para pagar, no prazo).'; ELSE ok := false; rel := rel || format(' FALHOU P2a: situação=%s dias=%s.', v.situacao, v.dias_restantes); END IF;
      UPDATE public.fin_quitacao_parametros SET prazo_reembolso_dias = 5;
      SELECT * INTO v FROM public.vw_fin_quitacao_prazos WHERE quitacao_id = q2 AND prazo = 'reembolso';
      IF v.situacao = 'vence_em_7_dias' AND v.dias_restantes = 5 THEN rel := rel || ' P2b ok (com o prazo em 5 dias: vence em até 7 dias).'; ELSE ok := false; rel := rel || format(' FALHOU P2b: situação=%s dias=%s.', v.situacao, v.dias_restantes); END IF;
      UPDATE public.fin_quitacao_parametros SET prazo_reembolso_dias = 10;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P2: ' || SQLERRM; END;

    -- P3: OFERTA Relatada (risco baixo) ⇒ extinta, com 30 dias para formalizar; depois que o prazo VENCE o realinhamento diário desfaz a extinção SEM ninguém abrir tela
    SELECT id, regexp_replace(cnpj_cpf, 'D', '', 'g') INTO emit_ok, cnpj_emit FROM public.fin_fornecedores WHERE public.fin_cnpj_valido(cnpj_cpf) ORDER BY id LIMIT 1;
    IF emit_ok IS NOT NULL THEN
      base43 := '332610' || cnpj_emit || '55001000012345112345678';
      FOR dv IN 0..9 LOOP IF public.fin_nfe_chave_valida(base43 || dv::text) THEN chave := base43 || dv::text; EXIT; END IF; END LOOP;
    END IF;
    IF pessoa_ok IS NULL OR emit_ok IS NULL OR chave IS NULL THEN rel := rel || ' (P3 de fora: falta uma pessoa fora do circuito e sem função ministerial, ou um emitente com CNPJ válido, no cadastro.)';
    ELSE
      BEGIN
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, nf_chave_acesso) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO 1C-d oferta', emit_ok, 'manual', cat, centro, chave) RETURNING id INTO l3;
        INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l3, 'nota_fiscal', 'nf.pdf');
        q3 := public.fin_registrar_quitacao(l3, 'pessoa', pessoa_ok, NULL, 'oferta', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l3;
        SELECT * INTO v FROM public.vw_fin_quitacao_prazos WHERE quitacao_id = q3 AND prazo = 'formalizacao';
        IF st = 'quitado_terceiro' AND v.situacao = 'no_prazo' AND v.dias_restantes = 30 THEN rel := rel || ' P3a ok (oferta Relatada extinta; 30 dias para formalizar, no prazo).';
        ELSE ok := false; rel := rel || format(' FALHOU P3a: status=%s situação=%s dias=%s.', st, v.situacao, v.dias_restantes); END IF;
        -- o tempo passa: o registro fica com 40 dias
        PERFORM set_config('qibrj.motivo', 'ENSAIO: o tempo passou', true);
        UPDATE public.fin_quitacoes SET registrado_em = now() - interval '40 days' WHERE id = q3;
        PERFORM set_config('qibrj.motivo', '', true);
        SELECT * INTO v FROM public.vw_fin_quitacao_prazos WHERE quitacao_id = q3 AND prazo = 'formalizacao';
        IF v.situacao = 'vencido' THEN rel := rel || ' P3b ok (passados 40 dias: prazo de formalização VENCIDO).'; ELSE ok := false; rel := rel || format(' FALHOU P3b: situação=%s.', v.situacao); END IF;
        -- o relógio (sem usuário): o realinhamento diário percebe sozinho
        PERFORM set_config('request.jwt.claim.sub', '', true);
        PERFORM set_config('request.jwt.claims', '', true);
        mudou := public.fin_quitacao_sincronizar_agendada();
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l3;
        SELECT count(*) INTO ev FROM public.fin_quitacao_eventos WHERE quitacao_id = q3 AND evento = 'extincao_desfeita';
        IF st = 'previsto' AND ev = 1 AND mudou >= 1 THEN rel := rel || ' P3c ok (o realinhamento diário, sem usuário e sem tela aberta, desfez a extinção da oferta com prazo vencido e deixou o evento).';
        ELSE ok := false; rel := rel || format(' FALHOU P3c: status=%s eventos=%s mudou=%s.', st, ev, mudou); END IF;
        PERFORM set_config('request.jwt.claim.sub', uid::text, true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P3: ' || SQLERRM; END;
    END IF;

    -- P4: a API (usuário autenticado) NÃO chama o realinhamento do relógio
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.fin_quitacao_sincronizar_agendada();
      RESET ROLE;
      ok := false; rel := rel || ' FALHOU P4: um usuário autenticado chamou o realinhamento do relógio.';
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM ILIKE '%permission denied%' OR SQLERRM ILIKE '%permissão negada%' THEN rel := rel || ' P4 ok (a API não consegue chamar o realinhamento do relógio).'; ELSE ok := false; rel := rel || ' FALHOU P4: ' || SQLERRM; END IF;
    END;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
