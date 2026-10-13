-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1B da Quitação (migrations 20261014140000 e 20261014150000) contra os dados REAIS — a OFERTA, a quitação por terceiro, "registrar NF já quitada" e as visões ────────
-- PRÉ-REQUISITOS: a Fase 1A aplicada (QUITACAO_APLICAR.sql) e o status novo aplicado (QUITACAO_1B_M0_APLICAR.sql, que sozinho só acrescenta um valor ao enum).
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda as duas migrations e confere que (1) nenhum lançamento mudou e vw_fin_ciclo e vw_fin_obrigacoes devolvem o MESMO resultado
-- de antes para o que já existe; (2) a OFERTA com prova suficiente EXTINGUE a obrigação (status `quitado_terceiro`) sem mexer em NENHUM saldo e sem criar entrada, transferência ou vínculo; (3) a extinção
-- é DEDUZIDA: anexar a prova extingue, remover desfaz, o Administrador aprovando o Relatado extingue; (4) conferir NÃO troca o status; (5) a obrigação extinta chega a Pronta, vai ao malote, fica
-- congelada e reabre com rastro; (6) a nota que o app não tinha nasce JUNTO com a quitação; (7) vw_fin_obrigacoes mostra "quitada por terceiro" em vez de "em aberto". Tudo desfeito no fim.
-- Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_entradas_antes bigint; n_vinc_antes bigint; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_entradas_depois bigint; n_vinc_depois bigint; h_saldos_depois text;
  conta uuid; emit uuid; pessoa_ok uuid; pessoa_adm uuid; cat uuid; centro uuid; cnpj_emit text; base43 text; chave text; dv int;
  l1 uuid; l2 uuid; l3 uuid; lnf uuid; q1 uuid; q2 uuid; q3 uuid; ev bigint; dess bigint; envio uuid; capturada bigint; mudou int; ano_m int; mes_m int; aprovados bigint;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'fin_lancamento_status' AND e.enumlabel = 'quitado_terceiro') THEN
    RAISE EXCEPTION 'O status "quitado_terceiro" ainda não existe: rode docs/QUITACAO_1B_M0_APLICAR.sql (sozinho, antes deste ensaio).';
  END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
  SELECT count(*) INTO n_vinc_antes FROM public.fin_extrato_vinculos;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  rel := format('ANTES: %s lançamentos; %s saídas no ciclo; %s obrigações; %s entradas; %s vínculos bancários.', n_lanc_antes, n_ciclo_antes, n_obr_antes, n_entradas_antes, n_vinc_antes);

  -- ── as duas migrations inteiras ──
  -- comando 1 de 32 das migrations
  EXECUTE $m1$DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita'));
END $$;$m1$;
  -- comando 2 de 32 das migrations
  EXECUTE $m2$CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar(p_obrigacao uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; qid uuid; inten text; deve boolean := false; a jsonb;
BEGIN
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND OR l.tipo::text <> 'saida' THEN RETURN false; END IF;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RETURN false; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RETURN l.status::text = 'quitado_terceiro'; END IF;
  SELECT q.id, q.intencao INTO qid, inten FROM public.fin_quitacoes q WHERE q.obrigacao_id = l.id;
  IF FOUND AND inten = 'oferta' THEN
    a := public.fin_quitacao_avaliar(public.fin_quitacao_entrada(qid));
    deve := COALESCE((a->>'suficiente')::boolean, false);
  END IF;
  IF deve AND l.status::text = 'previsto' THEN
    PERFORM set_config('qibrj.sync', 'on', true);
    UPDATE public.fin_lancamentos SET status = 'quitado_terceiro' WHERE id = l.id;
    PERFORM set_config('qibrj.sync', '', true);
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, motivo, por)
    VALUES (qid, l.id, 'extinta_por_oferta', jsonb_build_object('nivel', a->>'nivel', 'grau_conjunto', a->>'grau_conjunto'), 'A prova da oferta é suficiente: a obrigação se extingue, sem caixa e sem banco.', (SELECT auth.uid()));
    RETURN true;
  ELSIF NOT deve AND l.status::text = 'quitado_terceiro' THEN
    PERFORM set_config('qibrj.sync', 'on', true);
    UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = l.id;
    PERFORM set_config('qibrj.sync', '', true);
    INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, motivo, por)
    VALUES (qid, l.id, 'extincao_desfeita', CASE WHEN qid IS NULL THEN 'A quitação foi removida.' ELSE 'A prova deixou de ser suficiente (ou a intenção deixou de ser oferta).' END, (SELECT auth.uid()));
    RETURN false;
  END IF;
  RETURN deve;
END
$fn$;$m2$;
  -- comando 3 de 32 das migrations
  EXECUTE $m3$CREATE OR REPLACE FUNCTION public.fin_quitacao_sincronizar_todas() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE r record; mudou int := 0; antes text; depois text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RETURN 0; END IF;
  FOR r IN SELECT q.obrigacao_id AS id FROM public.fin_quitacoes q WHERE q.intencao = 'oferta'
           UNION SELECT l.id FROM public.fin_lancamentos l WHERE l.status::text = 'quitado_terceiro' LOOP
    SELECT status::text INTO antes FROM public.fin_lancamentos WHERE id = r.id;
    BEGIN
      PERFORM public.fin_quitacao_sincronizar(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Não consegui sincronizar a obrigação %: %', r.id, SQLERRM;   -- ex.: período fechado; fica visível em vw_fin_quitacao_dessincronizadas
    END;
    SELECT status::text INTO depois FROM public.fin_lancamentos WHERE id = r.id;
    IF antes IS DISTINCT FROM depois THEN mudou := mudou + 1; END IF;
  END LOOP;
  RETURN mudou;
END
$fn$;$m3$;
  -- comando 4 de 32 das migrations
  EXECUTE $m4$CREATE OR REPLACE FUNCTION public.fin_lanc_quitado_terceiro_integridade() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'O status "quitado por terceiro" só nasce de uma quitação do tipo oferta com prova suficiente: registre a quitação, não o lançamento.';
  END IF;
  IF NEW.status::text = OLD.status::text THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('qibrj.sync', true), '') = 'on' THEN RETURN NEW; END IF;
  IF NEW.status::text = 'quitado_terceiro' THEN
    RAISE EXCEPTION 'A obrigação só fica "quitada por terceiro" quando existe uma quitação do tipo oferta com prova suficiente: registre a quitação, não o status.';
  END IF;
  RAISE EXCEPTION 'Esta despesa foi quitada por um terceiro (oferta): o pagamento não passou pelo banco nem pelo caixa da igreja. Para mudar, corrija ou remova a quitação (com motivo). Conferir não troca o status.';
END
$fn$;$m4$;
  -- comando 5 de 32 das migrations
  EXECUTE $m5$DROP TRIGGER IF EXISTS fin_lanc_quitado_terceiro_novo ON public.fin_lancamentos;$m5$;
  -- comando 6 de 32 das migrations
  EXECUTE $m6$CREATE TRIGGER fin_lanc_quitado_terceiro_novo BEFORE INSERT ON public.fin_lancamentos
  FOR EACH ROW WHEN (NEW.status::text = 'quitado_terceiro') EXECUTE FUNCTION public.fin_lanc_quitado_terceiro_integridade();$m6$;
  -- comando 7 de 32 das migrations
  EXECUTE $m7$DROP TRIGGER IF EXISTS fin_lanc_quitado_terceiro_muda ON public.fin_lancamentos;$m7$;
  -- comando 8 de 32 das migrations
  EXECUTE $m8$CREATE TRIGGER fin_lanc_quitado_terceiro_muda BEFORE UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.status::text = 'quitado_terceiro' OR NEW.status::text = 'quitado_terceiro') EXECUTE FUNCTION public.fin_lanc_quitado_terceiro_integridade();$m8$;
  -- comando 9 de 32 das migrations
  EXECUTE $m9$CREATE OR REPLACE FUNCTION public.fin_lanc_congela_enviada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE it record; campos text[] := '{}';
BEGIN
  SELECT i.ano, i.mes INTO it FROM public.fin_malote_itens i WHERE i.lancamento_id = OLD.id AND i.reaberto_em IS NULL LIMIT 1;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e não pode ser excluída. Para isso, um Administrador ou a Tesouraria precisa reabri-la, com motivo.', lpad(it.mes::text, 2, '0'), it.ano;
  END IF;

  IF OLD.valor IS DISTINCT FROM NEW.valor THEN campos := array_append(campos, 'valor'); END IF;
  IF OLD.data IS DISTINCT FROM NEW.data THEN campos := array_append(campos, 'data (vencimento)'); END IF;
  IF OLD.categoria_id IS DISTINCT FROM NEW.categoria_id THEN campos := array_append(campos, 'categoria'); END IF;
  IF OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id THEN campos := array_append(campos, 'centro de custo'); END IF;
  IF OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id THEN campos := array_append(campos, 'favorecido'); END IF;
  IF OLD.tipo IS DISTINCT FROM NEW.tipo THEN campos := array_append(campos, 'tipo'); END IF;
  IF OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro') THEN campos := array_append(campos, 'situação do pagamento'); END IF;
  IF array_length(campos, 1) IS NULL THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade (Malote %/%) e está congelada: não se altera %. Para mudar, um Administrador ou a Tesouraria precisa reabri-la, com motivo. (Continua permitido: conciliar, vincular o extrato, conferir, anexar documento ou comprovante complementar e acrescentar observações.)',
    lpad(it.mes::text, 2, '0'), it.ano, array_to_string(campos, ', ');
END
$fn$;$m9$;
  -- comando 10 de 32 das migrations
  EXECUTE $m10$DROP TRIGGER IF EXISTS fin_lanc_congela_atualizar ON public.fin_lancamentos;$m10$;
  -- comando 11 de 32 das migrations
  EXECUTE $m11$CREATE TRIGGER fin_lanc_congela_atualizar BEFORE UPDATE OF valor, data, categoria_id, centro_custo_id, fornecedor_id, pessoa_id, tipo, status ON public.fin_lancamentos
  FOR EACH ROW WHEN (OLD.valor IS DISTINCT FROM NEW.valor OR OLD.data IS DISTINCT FROM NEW.data OR OLD.categoria_id IS DISTINCT FROM NEW.categoria_id
                     OR OLD.centro_custo_id IS DISTINCT FROM NEW.centro_custo_id OR OLD.fornecedor_id IS DISTINCT FROM NEW.fornecedor_id
                     OR OLD.pessoa_id IS DISTINCT FROM NEW.pessoa_id OR OLD.tipo IS DISTINCT FROM NEW.tipo
                     OR (OLD.status::text IN ('realizado', 'conciliado', 'quitado_terceiro') AND NEW.status::text NOT IN ('realizado', 'conciliado', 'quitado_terceiro')))
  EXECUTE FUNCTION public.fin_lanc_congela_enviada();$m11$;
  -- comando 12 de 32 das migrations
  EXECUTE $m12$CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(
  p_lancamento uuid, p_responsavel text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date,
  p_natureza_item text DEFAULT NULL, p_comprador text DEFAULT NULL, p_condicao text DEFAULT NULL, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE; novo uuid; v_nat text; v_comp text;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar a quitação de uma despesa.';
  END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_lancamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'Só uma despesa (saída) tem quitação.'; END IF;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'Esta despesa não está em aberto (situação: %). A quitação por terceiro só se registra em despesa ainda a pagar.', l.status; END IF;
  IF COALESCE(l.obrigacao_id, l.id) <> l.id THEN RAISE EXCEPTION 'Registre a quitação na obrigação principal, não numa das suas parcelas.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id AND x.id <> l.id AND x.status::text IN ('realizado', 'conciliado')) THEN
    RAISE EXCEPTION 'Esta obrigação já teve pagamento parcial; nesta entrega a quitação por terceiro só vale para obrigação ainda sem baixa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = l.id) THEN RAISE EXCEPTION 'Esta obrigação já tem uma quitação registrada: altere ou remova a existente.'; END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em);

  IF p_responsavel <> 'nao_localizado' THEN
    v_nat := COALESCE(p_natureza_item, l.natureza_item); v_comp := COALESCE(p_comprador, l.comprador);
    IF v_nat IS NULL THEN RAISE EXCEPTION 'Informe a natureza do item (consumo, estoque, bem durável ou serviço).'; END IF;
    IF v_nat NOT IN ('consumo', 'estoque', 'duravel', 'servico') THEN RAISE EXCEPTION 'Natureza do item inválida: %.', v_nat; END IF;
    IF v_comp IS NULL THEN RAISE EXCEPTION 'Informe se a igreja é a compradora por documento fiscal no CNPJ dela ou por contratação prévia.'; END IF;
    IF v_comp NOT IN ('cnpj_igreja', 'contratacao_previa') THEN RAISE EXCEPTION 'Comprador inválido: %.', v_comp; END IF;
    IF v_nat IS DISTINCT FROM l.natureza_item OR v_comp IS DISTINCT FROM l.comprador THEN
      UPDATE public.fin_lancamentos SET natureza_item = v_nat, comprador = v_comp WHERE id = l.id;
    END IF;
  END IF;

  PERFORM set_config('qibrj.motivo', COALESCE(p_motivo, ''), true);
  INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, pago_em, declarado_em, condicao, pede_recibo)
  VALUES (l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em, NULLIF(btrim(COALESCE(p_condicao, '')), ''), COALESCE(p_pede_recibo, false))
  RETURNING id INTO novo;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- oferta com prova suficiente ⇒ a obrigação se extingue
  RETURN novo;
END
$fn$;$m12$;
  -- comando 13 de 32 das migrations
  EXECUTE $m13$CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; k text; permitidas text[] := ARRAY['responsavel_tipo', 'responsavel_pessoa_id', 'responsavel_fornecedor_id', 'intencao', 'pago_em', 'declarado_em', 'condicao', 'pede_recibo'];
        n_tipo text; n_pessoa uuid; n_forn uuid; n_int text; n_pago date; n_decl date; n_cond text; n_recibo boolean;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para alterar a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da alteração (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os campos a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Campo não alterável: %.', k; END IF;
  END LOOP;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se altera mais.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: a quitação só muda com a reabertura (Administrador ou Tesouraria, com motivo).'; END IF;

  n_tipo  := COALESCE(p_patch->>'responsavel_tipo', q.responsavel_tipo);
  n_pessoa := CASE WHEN p_patch ? 'responsavel_pessoa_id' THEN NULLIF(p_patch->>'responsavel_pessoa_id', '')::uuid ELSE q.responsavel_pessoa_id END;
  n_forn  := CASE WHEN p_patch ? 'responsavel_fornecedor_id' THEN NULLIF(p_patch->>'responsavel_fornecedor_id', '')::uuid ELSE q.responsavel_fornecedor_id END;
  n_int   := COALESCE(p_patch->>'intencao', q.intencao);
  n_pago  := CASE WHEN p_patch ? 'pago_em' THEN NULLIF(p_patch->>'pago_em', '')::date ELSE q.pago_em END;
  n_decl  := CASE WHEN p_patch ? 'declarado_em' THEN NULLIF(p_patch->>'declarado_em', '')::date ELSE q.declarado_em END;
  n_cond  := CASE WHEN p_patch ? 'condicao' THEN NULLIF(btrim(COALESCE(p_patch->>'condicao', '')), '') ELSE q.condicao END;
  n_recibo := CASE WHEN p_patch ? 'pede_recibo' THEN COALESCE((p_patch->>'pede_recibo')::boolean, false) ELSE q.pede_recibo END;
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- a mudança pode extinguir a oferta ou desfazer a extinção
END
$fn$;$m13$;
  -- comando 14 de 32 das migrations
  EXECUTE $m14$CREATE OR REPLACE FUNCTION public.fin_remover_quitacao(p_quitacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para remover a quitação.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da remoção (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id FOR UPDATE;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): a quitação não se remove mais. Para mudar algo, reabra a despesa.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: a quitação só se remove com a reabertura (Administrador ou Tesouraria, com motivo).'; END IF;
  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  DELETE FROM public.fin_quitacoes WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- sem quitação, a oferta deixa de estar extinta: a obrigação volta a ficar em aberto
END
$fn$;$m14$;
  -- comando 15 de 32 das migrations
  EXECUTE $m15$CREATE OR REPLACE FUNCTION public.fin_decidir_quitacao(p_quitacao uuid, p_tipo text, p_decisao text, p_motivo text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; par public.fin_quitacao_parametros%ROWTYPE; a jsonb; uid uuid := (SELECT auth.uid());
        valor numeric; eh_admin boolean; pessoa_aprovador uuid;
BEGIN
  eh_admin := has_any_role(uid, ARRAY['admin'::app_role]);
  IF NOT (eh_admin OR has_any_role(uid, ARRAY['tesouraria'::app_role])) THEN RAISE EXCEPTION 'Só o Administrador e a Tesouraria decidem sobre a quitação.'; END IF;
  IF p_tipo NOT IN ('reembolso', 'relatado') THEN RAISE EXCEPTION 'Tipo de decisão inválido: % (use reembolso ou relatado).', p_tipo; END IF;
  IF p_decisao NOT IN ('aprovada', 'recusada') THEN RAISE EXCEPTION 'Decisão inválida: % (use aprovada ou recusada).', p_decisao; END IF;
  IF p_decisao = 'recusada' AND (p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5) THEN RAISE EXCEPTION 'Recusar exige o motivo (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO par FROM public.fin_quitacao_parametros LIMIT 1;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não há o que decidir.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: só a reabertura permite uma nova decisão.'; END IF;
  a := public.fin_quitacao_avaliar(public.fin_quitacao_entrada(q.id));
  valor := COALESCE(l.valor_original, l.valor);

  IF p_tipo = 'reembolso' THEN
    IF q.intencao <> 'reembolso' THEN RAISE EXCEPTION 'Esta quitação não é um reembolso.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'suficiente')::boolean THEN
      RAISE EXCEPTION 'Não dá para aprovar: %', COALESCE(a->>'motivo', 'a prova ainda não é suficiente.');
    END IF;
    IF valor > par.teto_1 AND NOT eh_admin THEN RAISE EXCEPTION 'Reembolso acima de R$ % só o Administrador aprova.', par.teto_1; END IF;
    SELECT pr.pessoa_id INTO pessoa_aprovador FROM public.profiles pr WHERE pr.id = uid;
    IF pessoa_aprovador IS NOT NULL AND q.responsavel_pessoa_id IS NOT DISTINCT FROM pessoa_aprovador THEN
      RAISE EXCEPTION 'Ninguém aprova o próprio reembolso: peça a outra pessoa.';
    END IF;
  ELSE
    IF NOT eh_admin THEN RAISE EXCEPTION 'Só o Administrador aprova o grau Relatado.'; END IF;
    IF p_decisao = 'aprovada' AND NOT (a->>'exige_aprovacao_administrador')::boolean THEN
      RAISE EXCEPTION 'Esta quitação não precisa da aprovação do Administrador (%).', COALESCE(a->>'motivo', 'a prova já é suficiente ou não pode ser aceita como Relatado');
    END IF;
  END IF;

  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, decisao, para, motivo, por)
  VALUES (q.id, q.obrigacao_id, CASE p_tipo WHEN 'reembolso' THEN 'aprovacao_reembolso' ELSE 'aprovacao_relatado' END, p_decisao,
          jsonb_build_object('nivel', a->>'nivel', 'grau_conjunto', a->>'grau_conjunto', 'valor', valor), NULLIF(btrim(COALESCE(p_motivo, '')), ''), uid);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- aprovar o Relatado pode extinguir a oferta
END
$fn$;$m15$;
  -- comando 16 de 32 das migrations
  EXECUTE $m16$CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE k text; antes jsonb; depois jsonb; permitidas text[] := ARRAY['vigencia', 'teto_1', 'prazo_declaracao_dias', 'teto_anual_terceiro', 'qtd_relatadas_trimestre', 'prazo_formalizacao_dias', 'prazo_esclarecimento_dias', 'prazo_reembolso_dias', 'limite_capitalizacao'];
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'Só o Administrador altera os parâmetros da Política.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo da mudança (pelo menos 5 caracteres).'; END IF;
  IF jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'A alteração deve ser um objeto com os parâmetros a mudar.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(permitidas)) THEN RAISE EXCEPTION 'Parâmetro desconhecido: %.', k; END IF;
  END LOOP;
  SELECT to_jsonb(p) INTO antes FROM public.fin_quitacao_parametros p;
  UPDATE public.fin_quitacao_parametros SET
    vigencia = CASE WHEN p_patch ? 'vigencia' THEN NULLIF(p_patch->>'vigencia', '')::date ELSE vigencia END,
    teto_1 = COALESCE((p_patch->>'teto_1')::numeric, teto_1),
    prazo_declaracao_dias = COALESCE((p_patch->>'prazo_declaracao_dias')::int, prazo_declaracao_dias),
    teto_anual_terceiro = COALESCE((p_patch->>'teto_anual_terceiro')::numeric, teto_anual_terceiro),
    qtd_relatadas_trimestre = COALESCE((p_patch->>'qtd_relatadas_trimestre')::int, qtd_relatadas_trimestre),
    prazo_formalizacao_dias = COALESCE((p_patch->>'prazo_formalizacao_dias')::int, prazo_formalizacao_dias),
    prazo_esclarecimento_dias = COALESCE((p_patch->>'prazo_esclarecimento_dias')::int, prazo_esclarecimento_dias),
    prazo_reembolso_dias = COALESCE((p_patch->>'prazo_reembolso_dias')::int, prazo_reembolso_dias),
    limite_capitalizacao = CASE WHEN p_patch ? 'limite_capitalizacao' THEN NULLIF(p_patch->>'limite_capitalizacao', '')::numeric ELSE limite_capitalizacao END,
    atualizado_em = now(), atualizado_por = (SELECT auth.uid())
  WHERE id;
  SELECT to_jsonb(p) INTO depois FROM public.fin_quitacao_parametros p;
  INSERT INTO public.fin_quitacao_eventos (evento, de, para, motivo, por) VALUES ('parametros', antes, depois, btrim(p_motivo), (SELECT auth.uid()));
  PERFORM public.fin_quitacao_sincronizar_todas();      -- um novo teto, prazo ou limite pode mudar quais ofertas a prova sustenta
END
$fn$;$m16$;
  -- comando 17 de 32 das migrations
  EXECUTE $m17$CREATE OR REPLACE FUNCTION public.fin_anexo_sincroniza_quitacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE alvos uuid[] := '{}'; id_ uuid; raiz uuid;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN alvos := alvos || NEW.lancamento_id; END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') THEN alvos := alvos || OLD.lancamento_id; END IF;
  FOREACH id_ IN ARRAY alvos LOOP
    SELECT COALESCE(l.obrigacao_id, l.id) INTO raiz FROM public.fin_lancamentos l WHERE l.id = id_;
    IF raiz IS NOT NULL AND (EXISTS (SELECT 1 FROM public.fin_quitacoes q WHERE q.obrigacao_id = raiz AND q.intencao = 'oferta')
                             OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id = raiz AND x.status::text = 'quitado_terceiro')) THEN
      BEGIN
        PERFORM public.fin_quitacao_sincronizar(raiz);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Anexo gravado, mas não consegui sincronizar a quitação da obrigação %: %', raiz, SQLERRM;
      END;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$fn$;$m17$;
  -- comando 18 de 32 das migrations
  EXECUTE $m18$DROP TRIGGER IF EXISTS fin_anexo_quitacao ON public.fin_lancamento_anexos;$m18$;
  -- comando 19 de 32 das migrations
  EXECUTE $m19$CREATE TRIGGER fin_anexo_quitacao AFTER INSERT OR DELETE OR UPDATE OF tipo, lancamento_id ON public.fin_lancamento_anexos
  FOR EACH ROW EXECUTE FUNCTION public.fin_anexo_sincroniza_quitacao();$m19$;
  -- comando 20 de 32 das migrations
  EXECUTE $m20$CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(
  p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text,
  p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text,
  p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date,
  p_condicao text DEFAULT NULL, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
  IF p_chave IS NOT NULL AND btrim(p_chave) <> '' AND NOT public.fin_nfe_chave_valida(btrim(p_chave)) THEN RAISE EXCEPTION 'A chave de acesso da nota não confere (44 dígitos, só números, com o dígito verificador correto).'; END IF;
  IF p_documento_numero IS NOT NULL AND btrim(p_documento_numero) <> '' AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = p_fornecedor AND x.documento_numero = btrim(p_documento_numero) AND x.tipo::text = 'saida' AND abs(x.valor - p_valor) < 0.005) THEN
    RAISE EXCEPTION 'Já existe uma despesa deste fornecedor com a nota nº % e este valor: não se registra duas vezes a mesma nota.', btrim(p_documento_numero);
  END IF;

  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes)
  VALUES (p_conta, 'saida', 'previsto', p_data, p_valor, COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), 'Nota de ' || forn.nome), NULLIF(btrim(COALESCE(p_documento_numero, '')), ''), p_fornecedor, p_categoria, p_centro,
          NULLIF(btrim(COALESCE(p_chave, '')), ''), 'nf_quitada_por_terceiro', 'Registrada já quitada por terceiro (a nota o aplicativo ainda não tinha).')
  RETURNING id INTO novo;

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo);
  RETURN novo;
END
$fn$;$m20$;
  -- comando 21 de 32 das migrations
  EXECUTE $m21$CREATE OR REPLACE VIEW public.vw_fin_quitacao_dessincronizadas WITH (security_invoker = true) AS
SELECT q.quitacao_id, q.obrigacao_id, l.status::text AS status_atual,
       CASE WHEN q.intencao = 'oferta' AND q.suficiente THEN 'quitado_terceiro' ELSE 'previsto' END AS status_esperado
  FROM public.vw_fin_quitacao q
  JOIN public.fin_lancamentos l ON l.id = q.obrigacao_id
 WHERE l.status::text IN ('previsto', 'quitado_terceiro')
   AND NOT public.fin_despesa_enviada(l.id)
   AND l.status::text <> CASE WHEN q.intencao = 'oferta' AND q.suficiente THEN 'quitado_terceiro' ELSE 'previsto' END;$m21$;
  -- comando 22 de 32 das migrations
  EXECUTE $m22$GRANT SELECT ON public.vw_fin_quitacao_dessincronizadas TO authenticated;$m22$;
  -- comando 23 de 32 das migrations
  EXECUTE $m23$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar(uuid) FROM PUBLIC, anon;$m23$;
  -- comando 24 de 32 das migrations
  EXECUTE $m24$REVOKE EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_todas() FROM PUBLIC, anon;$m24$;
  -- comando 25 de 32 das migrations
  EXECUTE $m25$REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text) FROM PUBLIC, anon;$m25$;
  -- comando 26 de 32 das migrations
  EXECUTE $m26$GRANT EXECUTE ON FUNCTION public.fin_quitacao_sincronizar_todas() TO authenticated;$m26$;
  -- comando 27 de 32 das migrations
  EXECUTE $m27$GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text) TO authenticated;$m27$;
  -- comando 28 de 32 das migrations
  EXECUTE $m28$CREATE OR REPLACE VIEW public.vw_fin_ciclo WITH (security_invoker = true) AS
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
         WHEN d.envio_id IS NOT NULL AND d.paga THEN CASE WHEN d.periodo_aprovado THEN 'arquivada' ELSE 'enviada' END
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
  FROM decididos d;$m28$;
  -- comando 29 de 32 das migrations
  EXECUTE $m29$GRANT SELECT ON public.vw_fin_ciclo TO authenticated;$m29$;
  -- comando 30 de 32 das migrations
  EXECUTE $m30$CREATE OR REPLACE VIEW public.vw_fin_obrigacoes WITH (security_invoker = true) AS
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
  LEFT JOIN public.fin_lancamentos r ON r.id = a.obrigacao_id;$m30$;
  -- comando 31 de 32 das migrations
  EXECUTE $m31$GRANT SELECT ON public.vw_fin_obrigacoes TO authenticated;$m31$;
  -- comando 32 de 32 das migrations
  EXECUTE $m32$COMMENT ON VIEW public.vw_fin_obrigacoes IS 'Situação de cada obrigação a pagar: previsto, em_aberto, pago_parcialmente, pago_integralmente, pago_com_diferenca, quitada_por_terceiro (oferta: sem caixa, sem banco) e cancelado. Juros, multa, complemento, ajuste e desconto são CAMPOS do lançamento do documento. security_invoker: vale a RLS de fin_lancamentos.';$m32$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  IF n_lanc_depois <> n_lanc_antes OR h_lanc_depois IS DISTINCT FROM h_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF n_ciclo_depois <> n_ciclo_antes OR h_ciclo_depois IS DISTINCT FROM h_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou de resultado para despesas que já existiam.';
  ELSE rel := rel || format(' Depois das migrations: os %s lançamentos, as %s saídas do ciclo e as %s obrigações seguem IDÊNTICOS.', n_lanc_depois, n_ciclo_depois, n_obr_depois); END IF;
  IF n_obr_depois <> n_obr_antes OR h_obr_depois IS DISTINCT FROM h_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou de resultado para obrigações que já existiam.'; END IF;

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
    SELECT id INTO emit FROM public.fin_fornecedores WHERE public.fin_cnpj_valido(cnpj_cpf) ORDER BY id LIMIT 1;
    SELECT id INTO cat FROM public.fin_categorias WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;
    SELECT id INTO centro FROM public.fin_centros_custo ORDER BY id LIMIT 1;
    -- uma pessoa fora do circuito e sem função ministerial: o caso de risco BAIXO
    SELECT m.id INTO pessoa_ok FROM public.membros m
     WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.pessoa_id = m.id)
       AND NOT EXISTS (SELECT 1 FROM unnest(m.funcoes_ministeriais) fn WHERE fn::text <> 'membro') ORDER BY m.id LIMIT 1;
    -- uma chave de acesso VÁLIDA com o CNPJ do emitente (lastro Baixo)
    SELECT regexp_replace(cnpj_cpf, '\D', '', 'g') INTO cnpj_emit FROM public.fin_fornecedores WHERE id = emit;
    base43 := '332610' || cnpj_emit || '55001000012345112345678';
    FOR dv IN 0..9 LOOP IF public.fin_nfe_chave_valida(base43 || dv::text) THEN chave := base43 || dv::text; EXIT; END IF; END LOOP;
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;

    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, nf_chave_acesso) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO 1B oferta 1', emit, 'manual', cat, centro, chave) RETURNING id INTO l1;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, nf_chave_acesso) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO 1B oferta 2', emit, 'manual', cat, centro, chave) RETURNING id INTO l2;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, nf_chave_acesso) VALUES (conta, 'saida', 'previsto', current_date + 30, 100, 'ENSAIO 1B oferta 3', emit, 'manual', cat, centro, chave) RETURNING id INTO l3;
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf1.pdf'), (l2, 'nota_fiscal', 'nf2.pdf'), (l3, 'nota_fiscal', 'nf3.pdf');

    IF pessoa_ok IS NULL THEN
      rel := rel || ' (nenhuma pessoa fora do circuito e sem função ministerial no cadastro: os testes de oferta de risco baixo ficaram de fora).';
    ELSE
      -- O1: oferta, risco BAIXO, prova Relatada ⇒ a obrigação se EXTINGUE: status quitado_terceiro, nenhum saldo mexe, nenhuma entrada nasce
      BEGIN
        q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_ok, NULL, 'oferta', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
        SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
        SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_depois FROM public.fin_contas;
        SELECT count(*) INTO ev FROM public.fin_quitacao_eventos WHERE quitacao_id = q1 AND evento = 'extinta_por_oferta';
        IF st = 'quitado_terceiro' AND v.resultado = 'extinta_como_oferta' AND v.suficiente AND h_saldos_depois = h_saldos_antes AND ev = 1 THEN
          rel := rel || ' O1 ok (oferta de risco baixo extingue a obrigação; nenhum saldo mudou; ficou o evento com usuário e hora).';
        ELSE ok := false; rel := rel || format(' FALHOU O1: status=%s resultado=%s suficiente=%s saldos iguais=%s eventos=%s nível=%s.', st, v.resultado, v.suficiente, h_saldos_depois = h_saldos_antes, ev, v.nivel_risco); END IF;
        SELECT * INTO v FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l1;
        IF v.situacao = 'quitada_por_terceiro' AND v.saldo_pendente = 0 AND v.quitado_terceiro = 100 AND v.pago_principal = 0 THEN rel := rel || ' O1b ok (vw_fin_obrigacoes: quitada por terceiro, saldo pendente 0, nada pago pela igreja).';
        ELSE ok := false; rel := rel || format(' FALHOU O1b: situação=%s saldo pendente=%s pago=%s.', v.situacao, v.saldo_pendente, v.pago_principal); END IF;
        SELECT estado, responsavel, resultado INTO v FROM public.vw_fin_ciclo WHERE lancamento_id = l1;
        IF v.estado = 'pagamento_realizado' AND v.responsavel = 'pessoa' AND v.resultado = 'extinta_como_oferta' THEN rel := rel || ' O1c ok (ciclo: Pagamento realizado = Quitada por terceiro, sem esperar extrato).';
        ELSE ok := false; rel := rel || format(' FALHOU O1c: estado=%s responsável=%s.', v.estado, v.responsavel); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O1: ' || SQLERRM; END;

      -- O2: conferir só carimba (o status não troca) e leva a obrigação a PRONTA (nota + classificação + conferência; sem comprovante da igreja)
      BEGIN
        UPDATE public.fin_lancamentos SET conferido_em = now(), conferido_por = uid WHERE id = l1;
        SELECT estado INTO st FROM public.vw_fin_ciclo WHERE lancamento_id = l1;
        SELECT status::text INTO msg FROM public.fin_lancamentos WHERE id = l1;
        IF st = 'pronta_para_malote' AND msg = 'quitado_terceiro' THEN rel := rel || ' O2 ok (conferida ⇒ Pronta para malote; o status continua quitado por terceiro).';
        ELSE ok := false; rel := rel || format(' FALHOU O2: estado=%s status=%s.', st, msg); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O2: ' || SQLERRM; END;

      -- O3 a O5: a oferta nunca vira "paga", o status não se troca à mão e não nasce por INSERT
      BEGIN
        UPDATE public.fin_lancamentos SET status = 'conciliado' WHERE id = l1;
        ok := false; rel := rel || ' FALHOU O3: a obrigação quitada por terceiro virou conciliada (entraria no saldo).';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%terceiro%' THEN rel := rel || ' O3 ok (conciliar uma oferta é recusado).'; ELSE ok := false; rel := rel || ' FALHOU O3: ' || SQLERRM; END IF;
      END;
      BEGIN
        UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = l1;
        ok := false; rel := rel || ' FALHOU O4: o status foi trocado à mão.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%terceiro%' THEN rel := rel || ' O4 ok (trocar o status à mão é recusado).'; ELSE ok := false; rel := rel || ' FALHOU O4: ' || SQLERRM; END IF;
      END;
      BEGIN
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, origem) VALUES (conta, 'saida', 'quitado_terceiro', current_date, 1, 'ENSAIO direto', 'manual');
        ok := false; rel := rel || ' FALHOU O5: nasceu um lançamento direto quitado por terceiro.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%quitação%' THEN rel := rel || ' O5 ok (lançamento nascendo quitado é recusado).'; ELSE ok := false; rel := rel || ' FALHOU O5: ' || SQLERRM; END IF;
      END;

      -- O6: oferta de risco MÉDIO (destinação restrita) com prova Relatada não basta; o Administrador aprovando o Relatado a extingue
      BEGIN
        q2 := public.fin_registrar_quitacao(l2, 'pessoa', pessoa_ok, NULL, 'oferta', current_date - 1, current_date, 'consumo', 'cnpj_igreja', 'só para a EBD', false, 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l2;
        SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q2;
        IF st = 'previsto' AND v.fila = 'formalizar' AND v.exige_aprovacao_administrador THEN rel := rel || ' O6a ok (oferta de risco médio, só relatada: não extingue; fila Formalizar).';
        ELSE ok := false; rel := rel || format(' FALHOU O6a: status=%s fila=%s exige=%s nível=%s.', st, v.fila, v.exige_aprovacao_administrador, v.nivel_risco); END IF;
        PERFORM public.fin_decidir_quitacao(q2, 'relatado', 'aprovada', 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l2;
        IF st = 'quitado_terceiro' THEN rel := rel || ' O6b ok (o Administrador aprovou o Relatado: a obrigação se extingue).'; ELSE ok := false; rel := rel || format(' FALHOU O6b: status=%s.', st); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O6: ' || SQLERRM; END;
    END IF;

    -- O7: a extinção é DEDUZIDA dos anexos: terceiro no circuito ⇒ risco ALTO ⇒ só a prova Formal basta; anexar extingue, remover desfaz
    IF pessoa_adm IS NOT NULL THEN
      BEGIN
        q3 := public.fin_registrar_quitacao(l3, 'pessoa', pessoa_adm, NULL, 'oferta', current_date - 1, current_date, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l3;
        IF st <> 'previsto' THEN ok := false; rel := rel || ' FALHOU O7a: oferta de quem está no circuito foi aceita só relatada.'; END IF;
        INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l3, 'prova_pagamento_terceiro', 'p.pdf'), (l3, 'declaracao_terceiro', 'd.pdf');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l3;
        IF st = 'quitado_terceiro' THEN rel := rel || ' O7a ok (anexar a prova Formal extinguiu a oferta, sem ninguém "marcar" nada).'; ELSE ok := false; rel := rel || format(' FALHOU O7a: com a prova Formal o status ficou %s.', st); END IF;
        DELETE FROM public.fin_lancamento_anexos WHERE lancamento_id = l3 AND tipo = 'declaracao_terceiro';
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l3;
        SELECT count(*) INTO ev FROM public.fin_quitacao_eventos WHERE quitacao_id = q3 AND evento = 'extincao_desfeita';
        IF st = 'previsto' AND ev = 1 THEN rel := rel || ' O7b ok (removida a declaração, a extinção foi desfeita e ficou o evento).'; ELSE ok := false; rel := rel || format(' FALHOU O7b: status=%s eventos=%s.', st, ev); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O7: ' || SQLERRM; END;
    ELSE rel := rel || ' (O7 de fora: o administrador do teste não tem pessoa no cadastro).'; END IF;

    IF pessoa_ok IS NOT NULL THEN
      -- O8: mudar a intenção de oferta para reembolso desfaz a extinção. Voltar a oferta NÃO extingue sozinha: uma intenção mudada há pouco é risco Médio (a Matriz desconfia de quem muda de ideia),
      --     e o Relatado, nesse nível, só vale com a aprovação do Administrador.
      BEGIN
        PERFORM public.fin_alterar_quitacao(q1, jsonb_build_object('intencao', 'reembolso'), 'ENSAIO: era reembolso');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
        IF st <> 'previsto' THEN ok := false; rel := rel || format(' FALHOU O8a: depois de mudar para reembolso o status ficou %s.', st); END IF;
        PERFORM public.fin_alterar_quitacao(q1, jsonb_build_object('intencao', 'oferta'), 'ENSAIO: voltou a ser oferta');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
        SELECT * INTO v FROM public.vw_fin_quitacao WHERE quitacao_id = q1;
        IF st = 'previsto' AND v.exige_aprovacao_administrador AND v.nivel_risco = 'medio' THEN rel := rel || ' O8a ok (mudar a intenção desfaz a extinção; voltar a oferta, com a intenção mudada há pouco, é risco Médio e pede o Administrador).';
        ELSE ok := false; rel := rel || format(' FALHOU O8b: status=%s nível=%s exige=%s.', st, v.nivel_risco, v.exige_aprovacao_administrador); END IF;
        PERFORM public.fin_decidir_quitacao(q1, 'relatado', 'aprovada', 'ENSAIO');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
        IF st = 'quitado_terceiro' THEN rel := rel || ' O8b ok (aprovado o Relatado pelo Administrador, a obrigação se extingue de novo).'; ELSE ok := false; rel := rel || format(' FALHOU O8c: status=%s.', st); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O8: ' || SQLERRM; END;

      -- O9: o malote — a obrigação quitada por terceiro, Pronta, é capturada no mês; Enviada, fica CONGELADA; reabrir deixa o rastro
      BEGIN
        UPDATE public.fin_lancamentos SET conferido_em = now(), conferido_por = uid WHERE id = l2;
        ano_m := EXTRACT(year FROM current_date + 30)::int; mes_m := EXTRACT(month FROM current_date + 30)::int;
        envio := public.fin_enviar_malote(ano_m, mes_m, 0, 0, 'ENSAIO 1B');
        SELECT count(*) INTO capturada FROM public.fin_malote_itens WHERE envio_id = envio AND lancamento_id = l2;
        SELECT estado INTO st FROM public.vw_fin_ciclo WHERE lancamento_id = l2;
        IF capturada = 1 AND st = 'enviada' THEN rel := rel || ' O9a ok (a quitada por terceiro, Pronta, entrou no malote e ficou Enviada).'; ELSE ok := false; rel := rel || format(' FALHOU O9a: capturada=%s estado=%s.', capturada, st); END IF;
        BEGIN
          PERFORM public.fin_alterar_quitacao(q2, jsonb_build_object('pago_em', (current_date - 3)::text), 'ENSAIO: alterar depois de enviada');
          ok := false; rel := rel || ' FALHOU O9b: alterou a quitação de uma despesa enviada.';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM ILIKE '%enviada%' THEN rel := rel || ' O9b ok (quitação de despesa enviada não se altera).'; ELSE ok := false; rel := rel || ' FALHOU O9b: ' || SQLERRM; END IF;
        END;
        BEGIN
          UPDATE public.fin_lancamentos SET valor = valor + 1 WHERE id = l2;
          ok := false; rel := rel || ' FALHOU O9c: o valor de uma quitada enviada foi alterado.';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM ILIKE '%congelada%' THEN rel := rel || ' O9c ok (valor da quitada enviada: congelado).'; ELSE ok := false; rel := rel || ' FALHOU O9c: ' || SQLERRM; END IF;
        END;
        PERFORM public.fin_reabrir_despesa_enviada(l2, 'ENSAIO 1B — motivo de teste');
        SELECT estado INTO st FROM public.vw_fin_ciclo WHERE lancamento_id = l2;
        IF st = 'pronta_para_malote' THEN rel := rel || ' O9d ok (reaberta, volta a Pronta e fica o rastro).'; ELSE ok := false; rel := rel || format(' FALHOU O9d: estado=%s.', st); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O9: ' || SQLERRM; END;

      -- O10: remover a quitação devolve a obrigação a "em aberto" (a igreja volta a poder pagá-la) e a vw_fin_obrigacoes acompanha
      BEGIN
        -- a l1 também estava Pronta no mês e foi capturada pelo envio: para remover a quitação, primeiro a reabertura (a regra que o ensaio acabou de provar)
        IF public.fin_despesa_enviada(l1) THEN
          BEGIN
            PERFORM public.fin_remover_quitacao(q1, 'ENSAIO: tentativa sem reabrir');
            ok := false; rel := rel || ' FALHOU O10a: removeu a quitação de uma despesa enviada.';
          EXCEPTION WHEN OTHERS THEN
            IF SQLERRM ILIKE '%enviada%' THEN rel := rel || ' O10a ok (remover a quitação de despesa enviada exige a reabertura).'; ELSE ok := false; rel := rel || ' FALHOU O10a: ' || SQLERRM; END IF;
          END;
          PERFORM public.fin_reabrir_despesa_enviada(l1, 'ENSAIO 1B — reabrir para remover a quitação');
        END IF;
        PERFORM public.fin_remover_quitacao(q1, 'ENSAIO: registrada por engano');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
        SELECT * INTO v FROM public.vw_fin_obrigacoes WHERE obrigacao_id = l1;
        IF st = 'previsto' AND v.situacao IN ('previsto', 'em_aberto') AND v.saldo_pendente = 100 THEN rel := rel || ' O10 ok (sem quitação, a obrigação volta a estar em aberto com o saldo cheio).';
        ELSE ok := false; rel := rel || format(' FALHOU O10: status=%s situação=%s saldo=%s.', st, v.situacao, v.saldo_pendente); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O10: ' || SQLERRM; END;
    END IF;

    -- O11: a NOTA que o aplicativo não tinha nasce JUNTO com a quitação. Sem a nota anexada o risco é Alto: só a prova Formal extingue.
    IF pessoa_ok IS NOT NULL THEN
      BEGIN
        SELECT count(*) INTO n_lanc_depois FROM public.fin_lancamentos;
        lnf := public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 400, 137.28, 'ENSAIO NF', 'ENSAIO-NF-9', NULL, cat, centro, 'consumo', 'cnpj_igreja',
                 'pessoa', pessoa_ok, NULL, 'oferta', current_date - 399, current_date - 398, NULL, false, 'ENSAIO');
        SELECT count(*) INTO n FROM public.fin_lancamentos;
        SELECT origem, status::text INTO v FROM public.fin_lancamentos WHERE id = lnf;
        IF n = n_lanc_depois + 1 AND v.origem = 'nf_quitada_por_terceiro' AND v.status = 'previsto' AND EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = lnf) THEN
          rel := rel || ' O11a ok (a nota e a quitação nasceram juntas; sem nota anexada, a oferta relatada não extingue).';
        ELSE ok := false; rel := rel || format(' FALHOU O11a: lançamentos criados=%s origem=%s status=%s.', n - n_lanc_depois, v.origem, v.status); END IF;
        INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (lnf, 'nota_fiscal', 'nf.pdf'), (lnf, 'prova_pagamento_terceiro', 'p.pdf'), (lnf, 'declaracao_terceiro', 'd.pdf');
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = lnf;
        IF st = 'quitado_terceiro' THEN rel := rel || ' O11b ok (com a nota, a prova do pagamento e a declaração, a obrigação histórica se extingue).'; ELSE ok := false; rel := rel || format(' FALHOU O11b: status=%s.', st); END IF;
        BEGIN
          PERFORM public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 400, 137.28, 'ENSAIO NF', 'ENSAIO-NF-9', NULL, cat, centro, 'consumo', 'cnpj_igreja',
                   'pessoa', pessoa_ok, NULL, 'oferta', current_date - 399, current_date - 398, NULL, false, 'ENSAIO');
          ok := false; rel := rel || ' FALHOU O11c: registrou a mesma nota duas vezes.';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM ILIKE '%duas vezes%' THEN rel := rel || ' O11c ok (a mesma nota não se registra duas vezes).'; ELSE ok := false; rel := rel || ' FALHOU O11c: ' || SQLERRM; END IF;
        END;
        BEGIN
          PERFORM public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 400, 55, 'ENSAIO NF falha', 'ENSAIO-NF-10', NULL, cat, centro, 'consumo', 'cnpj_igreja',
                   'pessoa', NULL, NULL, 'oferta', current_date - 399, current_date - 398, NULL, false, 'ENSAIO');
          ok := false; rel := rel || ' FALHOU O11d: criou a nota apesar de a quitação ser inválida.';
        EXCEPTION WHEN OTHERS THEN
          SELECT count(*) INTO n FROM public.fin_lancamentos WHERE documento_numero = 'ENSAIO-NF-10';
          IF n = 0 THEN rel := rel || ' O11d ok (quitação inválida: a nota NÃO nasce — tudo ou nada).'; ELSE ok := false; rel := rel || ' FALHOU O11d: sobrou uma nota órfã.'; END IF;
        END;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O11: ' || SQLERRM; END;
    END IF;

    -- O12: o sincronismo geral e a rede de segurança; parâmetro novo sincroniza tudo
    BEGIN
      mudou := public.fin_quitacao_sincronizar_todas();
      SELECT count(*) INTO dess FROM public.vw_fin_quitacao_dessincronizadas;
      IF dess = 0 THEN rel := rel || format(' O12a ok (sincronismo geral rodou, %s mudança(s); nenhuma obrigação dessincronizada).', mudou); ELSE ok := false; rel := rel || format(' FALHOU O12a: %s obrigação(ões) dessincronizada(s).', dess); END IF;
      PERFORM public.fin_quitacao_parametros_alterar(jsonb_build_object('limite_capitalizacao', 1000), 'ENSAIO');
      rel := rel || ' O12b ok (alterar parâmetro sincroniza tudo sem erro).';
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU O12: ' || SQLERRM; END;

    -- ── as garantias finais ──
    SELECT count(*) INTO n_entradas_depois FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT count(*) INTO n_vinc_depois FROM public.fin_extrato_vinculos;
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_depois FROM public.fin_contas;
    IF n_entradas_depois <> n_entradas_antes OR n_vinc_depois <> n_vinc_antes THEN ok := false; rel := rel || ' FALHOU: nasceu entrada ou vínculo bancário durante o ensaio.';
    ELSE rel := rel || ' GARANTIA: nenhuma entrada, transferência ou vínculo bancário foi criado.'; END IF;
    IF h_saldos_depois IS DISTINCT FROM h_saldos_antes THEN ok := false; rel := rel || ' FALHOU: o saldo de alguma conta mudou.'; ELSE rel := rel || ' GARANTIA: o saldo de TODAS as contas ficou idêntico em todo o ensaio.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
