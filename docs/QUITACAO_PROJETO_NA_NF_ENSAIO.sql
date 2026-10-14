-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio do Projeto na "NF já quitada por terceiro" (migration 20261016110000) contra os dados REAIS ──────────────────────────────────────────
-- PRÉ-REQUISITO: Fase 1D-a aplicada.
-- Dentro de uma transação que será desfeita: (1) fotografa lançamentos (inclusive projeto_id), obrigações, quitações e saldos, roda a migration inteira e
-- confere que NADA existente mudou; (2) a assinatura antiga sai, a nova entra, a sondagem responde; (3) com um administrador real: a NF registrada COM
-- projeto grava o projeto na OBRIGAÇÃO (categoria e centro intactos) e a quitação não ganha coluna de projeto; (4) a chamada sem projeto segue valendo
-- (projeto nulo); (5) projeto inexistente é recusado e nada nasce; (6) com a nota, a prova do terceiro e a declaração anexadas, a oferta é extinta
-- (quitado_terceiro) e o projeto permanece; (7) nenhuma entrada nasce e o saldo de nenhuma conta muda.
-- Leia o fim da mensagem: "TUDO OK, pode aplicar" ou "HÁ FALHAS, NÃO aplique".
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; n bigint;
  n_lanc_antes bigint; h_lanc_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text; h_saldos_antes text; n_entradas_antes bigint;
  n_lanc_depois bigint; h_lanc_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text; h_saldos_depois text; n_entradas_depois bigint;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; cat uuid; centro uuid; proj uuid; l1 uuid; l2 uuid; x public.fin_lancamentos%ROWTYPE; n_lanc_falho bigint;
BEGIN
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)') IS NULL AND to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'A Fase 1D-a ainda não foi aplicada: rode docs/QUITACAO_1D_A_APLICAR.sql antes deste ensaio.';
  END IF;
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NOT NULL THEN
    rel := 'AVISO: esta migration JÁ está aplicada (a assinatura nova existe); o ensaio roda assim mesmo. ';
  END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, projeto_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text || nivel_risco || grau_conjunto, '|' ORDER BY quitacao_id)) INTO n_q_antes, h_q_antes FROM public.vw_fin_quitacao;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
  rel := rel || format('ANTES: %s lançamentos; %s obrigações; %s quitação(ões).', n_lanc_antes, n_obr_antes, n_q_antes);

  -- ── a migration inteira ──
  -- comando 1 de 9 da migration
  EXECUTE $m1$DO $pre$
DECLARE src text;
BEGIN
  -- já aplicada: rodar de novo só reescreve a mesma definição
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NOT NULL THEN RETURN; END IF;
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar a Fase 1D-a antes desta (a função de registrar a NF quitada ainda não tem a forma de pagamento do terceiro): rode docs/QUITACAO_1D_A_APLICAR.sql. Nada foi gravado.';
  END IF;
  -- a definição abaixo é a da 1D-a com três mudanças; se a VIVA não for mais aquela, não sobrescrever às cegas
  SELECT prosrc INTO src FROM pg_proc WHERE oid = to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)')::oid;
  IF position('INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes)' IN src) = 0 OR position('PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);' IN src) = 0 THEN
    RAISE EXCEPTION 'A definição viva de fin_registrar_nf_quitada_por_terceiro não é mais a da 1D-a (alguém a alterou depois): NÃO aplique esta migration sem revê-la. Nada foi gravado.';
  END IF;
END $pre$;$m1$;
  -- comando 2 de 9 da migration
  EXECUTE $m2$CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text, p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text, p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text, p_projeto uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE novo uuid; hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; forn public.fin_fornecedores%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar uma nota quitada por terceiro.';
  END IF;
  IF p_responsavel NOT IN ('pessoa', 'empresa', 'entidade', 'nao_localizado') THEN RAISE EXCEPTION 'Informe quem pagou a nota (pessoa, empresa, entidade ou não localizado).'; END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor da nota.'; END IF;
  IF p_data IS NULL OR p_data > hoje THEN RAISE EXCEPTION 'A data da nota é obrigatória e não pode ser futura.'; END IF;
  IF p_conta IS NULL OR NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta) THEN RAISE EXCEPTION 'Escolha a conta em que a obrigação ficará registrada (a oferta não mexe nela).'; END IF;
  SELECT * INTO forn FROM public.fin_fornecedores WHERE id = p_fornecedor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escolha o fornecedor que emitiu a nota.'; END IF;
  IF p_projeto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.fin_projetos WHERE id = p_projeto) THEN RAISE EXCEPTION 'O projeto escolhido não existe mais (pode ter sido excluído): escolha outro ou deixe sem projeto.'; END IF;
  IF p_chave IS NOT NULL AND btrim(p_chave) <> '' AND NOT public.fin_nfe_chave_valida(btrim(p_chave)) THEN RAISE EXCEPTION 'A chave de acesso da nota não confere (44 dígitos, só números, com o dígito verificador correto).'; END IF;
  IF p_documento_numero IS NOT NULL AND btrim(p_documento_numero) <> '' AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = p_fornecedor AND x.documento_numero = btrim(p_documento_numero) AND x.tipo::text = 'saida' AND abs(x.valor - p_valor) < 0.005) THEN
    RAISE EXCEPTION 'Já existe uma despesa deste fornecedor com a nota nº % e este valor: não se registra duas vezes a mesma nota.', btrim(p_documento_numero);
  END IF;

  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes, projeto_id)
  VALUES (p_conta, 'saida', 'previsto', p_data, p_valor, COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), 'Nota de ' || forn.nome), NULLIF(btrim(COALESCE(p_documento_numero, '')), ''), p_fornecedor, p_categoria, p_centro,
          NULLIF(btrim(COALESCE(p_chave, '')), ''), 'nf_quitada_por_terceiro', 'Registrada já quitada por terceiro (a nota o aplicativo ainda não tinha).', p_projeto)
  RETURNING id INTO novo;

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);
  RETURN novo;
END
$function$;$m2$;
  -- comando 3 de 9 da migration
  EXECUTE $m3$DROP FUNCTION IF EXISTS public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text);$m3$;
  -- comando 4 de 9 da migration
  EXECUTE $m4$REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text, uuid) FROM PUBLIC, anon;$m4$;
  -- comando 5 de 9 da migration
  EXECUTE $m5$GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text, uuid) TO authenticated;$m5$;
  -- comando 6 de 9 da migration
  EXECUTE $m6$CREATE OR REPLACE FUNCTION public.fin_nf_quitada_aceita_projeto() RETURNS boolean
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $$ SELECT true $$;$m6$;
  -- comando 7 de 9 da migration
  EXECUTE $m7$COMMENT ON FUNCTION public.fin_nf_quitada_aceita_projeto() IS 'Sondagem do aplicativo: existe enquanto fin_registrar_nf_quitada_por_terceiro aceita p_projeto. O rollback a remove. Não lê nem grava nada.';$m7$;
  -- comando 8 de 9 da migration
  EXECUTE $m8$REVOKE EXECUTE ON FUNCTION public.fin_nf_quitada_aceita_projeto() FROM PUBLIC, anon;$m8$;
  -- comando 9 de 9 da migration
  EXECUTE $m9$GRANT EXECUTE ON FUNCTION public.fin_nf_quitada_aceita_projeto() TO authenticated;$m9$;

  -- ── depois: nada existente mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, projeto_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text || nivel_risco || grau_conjunto, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF h_obr_depois IS DISTINCT FROM h_obr_antes OR n_obr_depois <> n_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou.'; END IF;
  IF h_q_depois IS DISTINCT FROM h_q_antes OR n_q_depois <> n_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou.';
  ELSE rel := rel || format(' Depois da migration: os %s lançamentos (com o projeto de cada um), as %s obrigações e as %s quitação(ões) seguem IDÊNTICOS.', n_lanc_depois, n_obr_depois, n_q_depois); END IF;

  -- ── a assinatura e a sondagem ──
  IF to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text,uuid)') IS NOT NULL AND to_regprocedure('public.fin_registrar_nf_quitada_por_terceiro(uuid,uuid,date,numeric,text,text,text,uuid,uuid,text,text,text,uuid,uuid,text,date,date,text,boolean,text,text)') IS NULL AND public.fin_nf_quitada_aceita_projeto() THEN
    rel := rel || ' S1 ok (só a assinatura nova existe — sem ambiguidade para o PostgREST — e a sondagem responde).';
  ELSE ok := false; rel := rel || ' FALHOU S1: assinaturas ou sondagem fora do esperado.'; END IF;

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
    SELECT id INTO centro FROM public.fin_centros_custo WHERE ativo ORDER BY id LIMIT 1;
    SELECT m.id INTO pessoa_x FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm ORDER BY m.id LIMIT 1;
    INSERT INTO public.fin_projetos (nome, status, missionario) VALUES ('ENSAIO projeto na NF', 'ativo', false) RETURNING id INTO proj;

    -- P1: com projeto — o projeto vai para a OBRIGAÇÃO, ao lado de categoria e centro
    BEGIN
      l1 := public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 3, 250, 'ENSAIO projeto NF', 'NF-ENSAIO-PRJ-1', NULL, cat, centro, 'consumo', 'cnpj_igreja',
              'pessoa', pessoa_x, NULL, 'oferta', current_date - 4, current_date - 3, NULL, false, 'ENSAIO', 'pix', proj);
      SELECT * INTO x FROM public.fin_lancamentos WHERE id = l1;
      IF x.projeto_id = proj AND x.categoria_id = cat AND x.centro_custo_id IS NOT DISTINCT FROM centro THEN
        rel := rel || ' P1 ok (a NF registrada com projeto grava o projeto na obrigação; categoria e centro intactos).';
      ELSE ok := false; rel := rel || format(' FALHOU P1: projeto=%s categoria=%s centro=%s.', x.projeto_id, x.categoria_id, x.centro_custo_id); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P1: ' || SQLERRM; END;

    -- P2: o projeto NÃO faz parte da quitação
    SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'fin_quitacoes' AND column_name ILIKE '%projeto%';
    IF n = 0 THEN rel := rel || ' P2 ok (a quitação não tem projeto: ele é dimensão da obrigação).';
    ELSE ok := false; rel := rel || ' FALHOU P2: fin_quitacoes tem coluna de projeto.'; END IF;

    -- P3: a chamada sem projeto (como o aplicativo de hoje faz) segue valendo
    BEGIN
      l2 := public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 3, 251, 'ENSAIO sem projeto', 'NF-ENSAIO-PRJ-2', NULL, cat, centro, 'consumo', 'cnpj_igreja',
              'pessoa', pessoa_x, NULL, 'oferta', current_date - 4, current_date - 3, NULL, false, 'ENSAIO', 'pix');
      IF (SELECT projeto_id IS NULL FROM public.fin_lancamentos WHERE id = l2) THEN rel := rel || ' P3 ok (sem projeto continua valendo: projeto nulo).';
      ELSE ok := false; rel := rel || ' FALHOU P3: nasceu com projeto sem ninguém escolher.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P3: ' || SQLERRM; END;

    -- P4: projeto inexistente é recusado, e nada nasce
    SELECT count(*) INTO n_lanc_falho FROM public.fin_lancamentos;
    BEGIN
      PERFORM public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 3, 252, 'ENSAIO projeto falso', 'NF-ENSAIO-PRJ-3', NULL, cat, centro, 'consumo', 'cnpj_igreja',
              'pessoa', pessoa_x, NULL, 'oferta', current_date - 4, current_date - 3, NULL, false, 'ENSAIO', 'pix', gen_random_uuid());
      ok := false; rel := rel || ' FALHOU P4: aceitou um projeto que não existe.';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
      IF (SELECT count(*) FROM public.fin_lancamentos) = n_lanc_falho THEN rel := rel || format(' P4 ok (projeto inexistente é recusado — "%s" — e nada nasceu).', msg);
      ELSE ok := false; rel := rel || ' FALHOU P4: recusou mas deixou lançamento.'; END IF;
    END;

    -- P5: anexadas a nota, a prova do terceiro e a declaração, a oferta é extinta e o projeto permanece
    BEGIN
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf.pdf'), (l1, 'prova_pagamento_terceiro', 'p.pdf'), (l1, 'declaracao_terceiro', 'd.pdf');
      PERFORM public.fin_quitacao_sincronizar(l1);
      SELECT * INTO x FROM public.fin_lancamentos WHERE id = l1;
      IF x.status::text = 'quitado_terceiro' AND x.projeto_id = proj THEN
        rel := rel || ' P5 ok (com a prova completa a oferta vira quitado_terceiro e continua no projeto — é o que o relatório do projeto lê).';
      ELSE ok := false; rel := rel || format(' FALHOU P5: status=%s projeto=%s.', x.status, x.projeto_id); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU P5: ' || SQLERRM; END;

    -- garantias finais
    SELECT count(*) INTO n_entradas_depois FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_depois FROM public.fin_contas;
    IF n_entradas_depois <> n_entradas_antes THEN ok := false; rel := rel || ' FALHOU: nasceu uma entrada.'; END IF;
    IF h_saldos_depois IS DISTINCT FROM h_saldos_antes THEN ok := false; rel := rel || ' FALHOU: o saldo de alguma conta mudou.';
    ELSE rel := rel || ' GARANTIA: nenhuma entrada nasceu e o saldo de TODAS as contas ficou idêntico.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
