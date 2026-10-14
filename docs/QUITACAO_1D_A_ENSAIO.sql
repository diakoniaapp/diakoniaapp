-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1D-a da Quitação (migration 20261015150000) contra os dados REAIS — a Declaração do Terceiro gerada pelo sistema ───────────────────────────────────────────────────────────
-- PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- Dentro de uma transação que será desfeita: (1) fotografa o resultado de lançamentos, ciclo, obrigações e quitações (inclusive a que já existe), roda a migration e confere que NADA mudou (a 1D-a não muda
-- comportamento); (2) a forma de pagamento do terceiro é gravada, validada e alterável com motivo, e a chamada antiga de registrar (sem o parâmetro novo) segue funcionando; (3) a Declaração só se gera com a
-- forma de pagamento, e a de reembolso só com a chave PIX; (4) gerar é idempotente, numera DT-AAAA-NNNN e guarda o que gerou; (5) a via assinada grava a data da assinatura; (6) mudar o que o terceiro declarou
-- DESATUALIZA a via, e reclassificar centro ou categoria NÃO; a nova versão mantém o número; (7) o gerado não se altera nem se apaga; (8) os limites do reembolso se alteram só em ordem (Baixo ≤ Médio). Se algo divergir:
-- FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text; h_saldos_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text; h_saldos_depois text;
  conta uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; pessoa_y uuid; cat uuid; cat2 uuid; centro uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid;
  d1 uuid; d1b uuid; d3 uuid; an1 uuid; num1 text; est_real text; q_real uuid; n_entradas_antes bigint; n_entradas_depois bigint;
BEGIN
  IF to_regclass('public.fin_quitacoes') IS NULL THEN RAISE EXCEPTION 'A Fase 1A ainda não foi aplicada: rode docs/QUITACAO_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_quitacao_sincronizar(uuid)') IS NULL THEN RAISE EXCEPTION 'A Fase 1B ainda não foi aplicada: rode docs/QUITACAO_1B_APLICAR.sql antes deste ensaio.'; END IF;
  IF to_regprocedure('public.fin_liquidar_reembolso(uuid,uuid,date,public.fin_forma_pagamento,numeric,text,text,text)') IS NULL THEN RAISE EXCEPTION 'A Fase 1C-a ainda não foi aplicada: rode docs/QUITACAO_1C_A_APLICAR.sql antes deste ensaio.'; END IF;

  -- ── antes ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_antes, h_lanc_antes
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_antes, h_ciclo_antes FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_antes, h_obr_antes FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text || nivel_risco || grau_conjunto, '|' ORDER BY quitacao_id)) INTO n_q_antes, h_q_antes FROM public.vw_fin_quitacao;
  SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_antes FROM public.fin_contas;
  SELECT count(*) INTO n_entradas_antes FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
  SELECT id INTO q_real FROM public.fin_quitacoes ORDER BY registrado_em LIMIT 1;
  rel := format('ANTES: %s lançamentos; %s saídas no ciclo; %s obrigações; %s quitação(ões).', n_lanc_antes, n_ciclo_antes, n_obr_antes, n_q_antes);

  -- ── a migration inteira ──
  -- comando 1 de 41 da migration
  EXECUTE $m1$ALTER TABLE public.fin_quitacoes ADD COLUMN IF NOT EXISTS forma_pagamento_terceiro text;$m1$;
  -- comando 2 de 41 da migration
  EXECUTE $m2$DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_forma_pagamento_check') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_forma_pagamento_check
      CHECK (forma_pagamento_terceiro IS NULL OR forma_pagamento_terceiro IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_forma_coerente') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_forma_coerente CHECK (responsavel_tipo <> 'nao_localizado' OR forma_pagamento_terceiro IS NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_declaracao') THEN
    ALTER TABLE public.fin_quitacoes DROP CONSTRAINT fin_quitacoes_declaracao;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacoes_declaracao_data') THEN
    ALTER TABLE public.fin_quitacoes ADD CONSTRAINT fin_quitacoes_declaracao_data
      CHECK (declarado_em IS NULL OR intencao IN ('reembolso', 'oferta', 'compensacao_adiantamento'));
  END IF;
END $$;$m2$;
  -- comando 3 de 41 da migration
  EXECUTE $m3$COMMENT ON COLUMN public.fin_quitacoes.forma_pagamento_terceiro IS 'Como o TERCEIRO pagou o fornecedor: dinheiro, pix, cartao_credito, cartao_debito, transferencia ou outro. Impressa na Declaração do Terceiro. Nulo em "Não localizado" e nas quitações anteriores à Fase 1D.';$m3$;
  -- comando 4 de 41 da migration
  EXECUTE $m4$ALTER TABLE public.fin_quitacao_parametros
  ADD COLUMN IF NOT EXISTS reembolso_teto_baixo numeric(14,2) NOT NULL DEFAULT 300   CHECK (reembolso_teto_baixo > 0),
  ADD COLUMN IF NOT EXISTS reembolso_teto_medio numeric(14,2) NOT NULL DEFAULT 1500  CHECK (reembolso_teto_medio > 0);$m4$;
  -- comando 5 de 41 da migration
  EXECUTE $m5$DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_quitacao_parametros_reembolso_faixas') THEN
    ALTER TABLE public.fin_quitacao_parametros ADD CONSTRAINT fin_quitacao_parametros_reembolso_faixas CHECK (reembolso_teto_medio >= reembolso_teto_baixo);
  END IF;
END $$;$m5$;
  -- comando 6 de 41 da migration
  EXECUTE $m6$COMMENT ON COLUMN public.fin_quitacao_parametros.reembolso_teto_baixo IS 'Reembolso até este valor (inclusive) é nível Baixo na Matriz do reembolso (valor da nota).';$m6$;
  -- comando 7 de 41 da migration
  EXECUTE $m7$COMMENT ON COLUMN public.fin_quitacao_parametros.reembolso_teto_medio IS 'Reembolso até este valor (inclusive) é nível Médio; acima, Alto.';$m7$;
  -- comando 8 de 41 da migration
  EXECUTE $m8$DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta', 'declaracao_gerada', 'declaracao_assinada'));
END $$;$m8$;
  -- comando 9 de 41 da migration
  EXECUTE $m9$CREATE TABLE IF NOT EXISTS public.fin_declaracoes_terceiro (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano                       int  NOT NULL,
  seq                       int  NOT NULL,
  numero                    text NOT NULL,                                   -- DT-AAAA-NNNN: o mesmo número em todas as versões da mesma quitação
  versao                    int  NOT NULL CHECK (versao >= 1),
  quitacao_id               uuid NOT NULL,                                   -- sem FK: é história (a quitação pode ser removida)
  obrigacao_id              uuid NOT NULL,
  intencao                  text NOT NULL CHECK (intencao IN ('reembolso', 'oferta')),
  conteudo                  jsonb NOT NULL,                                  -- { declarado: {...}, informativo: {...} }; o hash cobre só "declarado"
  hash                      text NOT NULL,
  gerada_em                 timestamptz NOT NULL DEFAULT now(),
  gerada_por                uuid DEFAULT auth.uid(),
  assinada_anexo_id         uuid REFERENCES public.fin_lancamento_anexos(id) ON DELETE SET NULL,
  assinada_em               date,                                            -- a data escrita na via assinada
  assinatura_registrada_em  timestamptz,
  assinatura_registrada_por uuid,
  UNIQUE (quitacao_id, versao)
);$m9$;
  -- comando 10 de 41 da migration
  EXECUTE $m10$CREATE UNIQUE INDEX IF NOT EXISTS fin_declaracoes_terceiro_numero_idx ON public.fin_declaracoes_terceiro (ano, seq) WHERE versao = 1;$m10$;
  -- comando 11 de 41 da migration
  EXECUTE $m11$CREATE INDEX IF NOT EXISTS fin_declaracoes_terceiro_obrigacao_idx ON public.fin_declaracoes_terceiro (obrigacao_id);$m11$;
  -- comando 12 de 41 da migration
  EXECUTE $m12$COMMENT ON TABLE public.fin_declaracoes_terceiro IS 'Cada via gerada da Declaração do Terceiro: número, versão, conteúdo e hash (o que o terceiro assinou) e a via assinada. Só as funções escrevem; só a assinatura muda depois de gerada.';$m12$;
  -- comando 13 de 41 da migration
  EXECUTE $m13$CREATE OR REPLACE FUNCTION public.fin_declaracoes_terceiro_protege() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A Declaração do Terceiro gerada faz parte do histórico: não se apaga.'; END IF;
  IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.ano IS DISTINCT FROM OLD.ano OR NEW.seq IS DISTINCT FROM OLD.seq OR NEW.versao IS DISTINCT FROM OLD.versao
     OR NEW.quitacao_id IS DISTINCT FROM OLD.quitacao_id OR NEW.obrigacao_id IS DISTINCT FROM OLD.obrigacao_id OR NEW.intencao IS DISTINCT FROM OLD.intencao
     OR NEW.conteudo IS DISTINCT FROM OLD.conteudo OR NEW.hash IS DISTINCT FROM OLD.hash OR NEW.gerada_em IS DISTINCT FROM OLD.gerada_em OR NEW.gerada_por IS DISTINCT FROM OLD.gerada_por THEN
    RAISE EXCEPTION 'O que foi gerado na Declaração do Terceiro não se altera: gere uma nova versão.';
  END IF;
  RETURN NEW;
END
$fn$;$m13$;
  -- comando 14 de 41 da migration
  EXECUTE $m14$DROP TRIGGER IF EXISTS fin_declaracoes_terceiro_protege ON public.fin_declaracoes_terceiro;$m14$;
  -- comando 15 de 41 da migration
  EXECUTE $m15$CREATE TRIGGER fin_declaracoes_terceiro_protege BEFORE UPDATE OR DELETE ON public.fin_declaracoes_terceiro FOR EACH ROW EXECUTE FUNCTION public.fin_declaracoes_terceiro_protege();$m15$;
  -- comando 16 de 41 da migration
  EXECUTE $m16$ALTER TABLE public.fin_declaracoes_terceiro ENABLE ROW LEVEL SECURITY;$m16$;
  -- comando 17 de 41 da migration
  EXECUTE $m17$DROP POLICY IF EXISTS fin_declaracoes_terceiro_leitura ON public.fin_declaracoes_terceiro;$m17$;
  -- comando 18 de 41 da migration
  EXECUTE $m18$CREATE POLICY fin_declaracoes_terceiro_leitura ON public.fin_declaracoes_terceiro FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m18$;
  -- comando 19 de 41 da migration
  EXECUTE $m19$CREATE OR REPLACE FUNCTION public.fin_declaracao_conteudo(p_quitacao uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; forn public.fin_fornecedores%ROWTYPE; resp public.fin_fornecedores%ROWTYPE; m public.membros%ROWTYPE;
  d_nome text; d_doc text; pix text; pixtipo text; centro text; cat text;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  IF q.responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Só há Declaração do Terceiro quando se sabe quem pagou.'; END IF;
  IF q.intencao NOT IN ('reembolso', 'oferta') THEN RAISE EXCEPTION 'A Declaração do Terceiro existe para reembolso e oferta; a intenção desta quitação é "%".', q.intencao; END IF;
  IF q.forma_pagamento_terceiro IS NULL THEN RAISE EXCEPTION 'Informe a forma de pagamento usada pelo terceiro antes de gerar a Declaração.'; END IF;
  IF q.pago_em IS NULL THEN RAISE EXCEPTION 'Informe a data em que o terceiro pagou antes de gerar a Declaração.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  SELECT * INTO forn FROM public.fin_fornecedores WHERE id = l.fornecedor_id;
  IF q.responsavel_tipo = 'pessoa' THEN
    SELECT * INTO m FROM public.membros WHERE id = q.responsavel_pessoa_id;
    d_nome := m.nome_completo; d_doc := m.cpf;
  ELSE
    SELECT * INTO resp FROM public.fin_fornecedores WHERE id = q.responsavel_fornecedor_id;
    d_nome := resp.nome; d_doc := resp.cnpj_cpf;
  END IF;
  IF q.intencao = 'reembolso' THEN
    IF q.responsavel_tipo = 'pessoa' THEN
      SELECT f.chave_pix, f.tipo_chave_pix INTO pix, pixtipo FROM public.fin_fornecedores f WHERE f.pessoa_id = q.responsavel_pessoa_id AND f.chave_pix IS NOT NULL LIMIT 1;
      IF pix IS NULL THEN SELECT p.chave_pix, p.tipo_chave_pix INTO pix, pixtipo FROM public.fin_pessoa_pix p WHERE p.pessoa_id = q.responsavel_pessoa_id; END IF;
    ELSE
      pix := resp.chave_pix; pixtipo := resp.tipo_chave_pix;
    END IF;
  END IF;
  SELECT cc.nome INTO centro FROM public.fin_centros_custo cc WHERE cc.id = l.centro_custo_id;
  SELECT ct.nome INTO cat FROM public.fin_categorias ct WHERE ct.id = l.categoria_id;
  RETURN jsonb_build_object(
    'declarado', jsonb_build_object(
      'intencao', q.intencao, 'declarante_tipo', q.responsavel_tipo, 'declarante_id', COALESCE(q.responsavel_pessoa_id, q.responsavel_fornecedor_id), 'declarante_nome', d_nome, 'declarante_documento', d_doc,
      'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', forn.nome, 'fornecedor_documento', forn.cnpj_cpf,
      'nota_numero', l.documento_numero, 'nota_chave', l.nf_chave_acesso, 'nota_data', l.data, 'valor', COALESCE(l.valor_original, l.valor),
      'forma_pagamento', q.forma_pagamento_terceiro, 'data_pagamento', q.pago_em, 'chave_pix', pix, 'tipo_chave_pix', pixtipo),
    'informativo', jsonb_build_object('centro', centro, 'categoria', cat));
END
$fn$;$m19$;
  -- comando 20 de 41 da migration
  EXECUTE $m20$CREATE OR REPLACE FUNCTION public.fin_declaracao_hash(p_declarado jsonb) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $fn$ SELECT encode(sha256(convert_to(p_declarado::text, 'UTF8')), 'hex') $fn$;$m20$;
  -- comando 21 de 41 da migration
  EXECUTE $m21$CREATE OR REPLACE FUNCTION public.fin_gerar_declaracao_terceiro(p_quitacao uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; c jsonb; h text; ult public.fin_declaracoes_terceiro%ROWTYPE; novo uuid; v_ano int; v_seq int; v_num text; v_versao int;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para gerar a Declaração do Terceiro.';
  END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quitação não encontrada.'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = q.obrigacao_id;
  IF l.status::text NOT IN ('previsto', 'quitado_terceiro') THEN RAISE EXCEPTION 'A despesa já não está em aberto (situação: %): não se gera nova Declaração.', l.status; END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: só a reabertura permite nova Declaração.'; END IF;
  c := public.fin_declaracao_conteudo(q.id);
  h := public.fin_declaracao_hash(c->'declarado');
  SELECT * INTO ult FROM public.fin_declaracoes_terceiro WHERE quitacao_id = q.id ORDER BY versao DESC LIMIT 1;
  IF FOUND AND ult.hash = h THEN RETURN ult.id; END IF;                       -- o mesmo conteúdo: a mesma via (nada de versão repetida)
  IF FOUND THEN
    v_ano := ult.ano; v_seq := ult.seq; v_num := ult.numero; v_versao := ult.versao + 1;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('fin_declaracao_numero'));
    v_ano := EXTRACT(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
    SELECT COALESCE(max(seq), 0) + 1 INTO v_seq FROM public.fin_declaracoes_terceiro WHERE ano = v_ano;
    v_num := 'DT-' || v_ano::text || '-' || lpad(v_seq::text, 4, '0'); v_versao := 1;
  END IF;
  INSERT INTO public.fin_declaracoes_terceiro (ano, seq, numero, versao, quitacao_id, obrigacao_id, intencao, conteudo, hash)
  VALUES (v_ano, v_seq, v_num, v_versao, q.id, q.obrigacao_id, q.intencao, c, h) RETURNING id INTO novo;
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, por)
  VALUES (q.id, q.obrigacao_id, 'declaracao_gerada', jsonb_build_object('numero', v_num, 'versao', v_versao, 'intencao', q.intencao, 'codigo', left(h, 12)), (SELECT auth.uid()));
  RETURN novo;
END
$fn$;$m21$;
  -- comando 22 de 41 da migration
  EXECUTE $m22$CREATE OR REPLACE FUNCTION public.fin_declaracao_estado(p_quitacao uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE q public.fin_quitacoes%ROWTYPE; ult public.fin_declaracoes_terceiro%ROWTYPE; atual text;
BEGIN
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = p_quitacao;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO ult FROM public.fin_declaracoes_terceiro WHERE quitacao_id = q.id ORDER BY versao DESC LIMIT 1;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id
                WHERE COALESCE(x.obrigacao_id, x.id) = q.obrigacao_id AND a.tipo IN ('declaracao_terceiro', 'pedido_reembolso')) THEN RETURN 'externa'; END IF;
    RETURN 'sem_declaracao';
  END IF;
  BEGIN
    atual := public.fin_declaracao_hash((public.fin_declaracao_conteudo(q.id))->'declarado');
  EXCEPTION WHEN OTHERS THEN atual := NULL;                                   -- dado incompleto: a via gerada já não corresponde ao registro
  END;
  IF atual IS NULL OR atual <> ult.hash THEN RETURN 'desatualizada'; END IF;
  IF ult.assinada_anexo_id IS NULL THEN RETURN 'aguardando_assinatura'; END IF;
  RETURN 'assinada';
END
$fn$;$m22$;
  -- comando 23 de 41 da migration
  EXECUTE $m23$CREATE OR REPLACE FUNCTION public.fin_registrar_assinatura_declaracao(p_declaracao uuid, p_anexo uuid, p_data_assinatura date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE d public.fin_declaracoes_terceiro%ROWTYPE; q public.fin_quitacoes%ROWTYPE; a public.fin_lancamento_anexos%ROWTYPE; x public.fin_lancamentos%ROWTYPE; uid uuid := (SELECT auth.uid());
        hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para registrar a assinatura.'; END IF;
  SELECT * INTO d FROM public.fin_declaracoes_terceiro WHERE id = p_declaracao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Declaração não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_declaracoes_terceiro n WHERE n.quitacao_id = d.quitacao_id AND n.versao > d.versao) THEN RAISE EXCEPTION 'Há uma versão mais nova desta Declaração: a assinada deve ser a da versão mais nova.'; END IF;
  IF public.fin_declaracao_estado(d.quitacao_id) <> 'aguardando_assinatura' THEN
    RAISE EXCEPTION 'Esta via não está aguardando assinatura (estado: %). Se os dados mudaram, gere uma nova via e colha nova assinatura.', public.fin_declaracao_estado(d.quitacao_id);
  END IF;
  SELECT * INTO q FROM public.fin_quitacoes WHERE id = d.quitacao_id FOR UPDATE;
  SELECT * INTO a FROM public.fin_lancamento_anexos WHERE id = p_anexo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anexo não encontrado.'; END IF;
  IF a.tipo <> 'declaracao_terceiro' THEN RAISE EXCEPTION 'O anexo da via assinada deve ser do tipo "Declaração do terceiro".'; END IF;
  SELECT * INTO x FROM public.fin_lancamentos WHERE id = a.lancamento_id;
  IF COALESCE(x.obrigacao_id, x.id) <> d.obrigacao_id THEN RAISE EXCEPTION 'O anexo não pertence a esta obrigação.'; END IF;
  IF p_data_assinatura IS NULL OR p_data_assinatura > hoje THEN RAISE EXCEPTION 'A data da assinatura é obrigatória e não pode ser futura.'; END IF;
  IF p_data_assinatura < q.pago_em THEN RAISE EXCEPTION 'A assinatura não pode ser anterior ao pagamento do terceiro (%).', to_char(q.pago_em, 'DD/MM/YYYY'); END IF;
  UPDATE public.fin_declaracoes_terceiro SET assinada_anexo_id = p_anexo, assinada_em = p_data_assinatura, assinatura_registrada_em = now(), assinatura_registrada_por = uid WHERE id = d.id;
  PERFORM set_config('qibrj.motivo', 'Declaração do Terceiro ' || d.numero || ' (versão ' || d.versao || ') assinada em ' || to_char(p_data_assinatura, 'DD/MM/YYYY'), true);
  UPDATE public.fin_quitacoes SET declarado_em = p_data_assinatura WHERE id = q.id AND declarado_em IS DISTINCT FROM p_data_assinatura;
  PERFORM set_config('qibrj.motivo', '', true);
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, para, por)
  VALUES (q.id, q.obrigacao_id, 'declaracao_assinada', jsonb_build_object('numero', d.numero, 'versao', d.versao, 'assinada_em', p_data_assinatura, 'anexo', p_anexo), uid);
  BEGIN PERFORM public.fin_quitacao_sincronizar(d.obrigacao_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Assinatura gravada, mas não consegui sincronizar a obrigação %: %', d.obrigacao_id, SQLERRM; END;
END
$fn$;$m23$;
  -- comando 24 de 41 da migration
  EXECUTE $m24$CREATE OR REPLACE FUNCTION public.fin_registrar_quitacao(p_lancamento uuid, p_responsavel text, p_pessoa uuid, p_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_natureza_item text DEFAULT NULL::text, p_comprador text DEFAULT NULL::text, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF p_forma_pagamento_terceiro IS NOT NULL THEN
    IF p_forma_pagamento_terceiro NOT IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento do terceiro inválida: %.', p_forma_pagamento_terceiro; END IF;
    IF p_responsavel = 'nao_localizado' THEN RAISE EXCEPTION 'Quando não se sabe quem pagou, não há forma de pagamento do terceiro.'; END IF;
  END IF;

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
  INSERT INTO public.fin_quitacoes (obrigacao_id, responsavel_tipo, responsavel_pessoa_id, responsavel_fornecedor_id, intencao, pago_em, declarado_em, condicao, pede_recibo, forma_pagamento_terceiro)
  VALUES (l.id, p_responsavel, p_pessoa, p_fornecedor, p_intencao, p_pago_em, p_declarado_em, NULLIF(btrim(COALESCE(p_condicao, '')), ''), COALESCE(p_pede_recibo, false), p_forma_pagamento_terceiro)
  RETURNING id INTO novo;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- oferta com prova suficiente ⇒ a obrigação se extingue
  RETURN novo;
END
$function$;$m24$;
  -- comando 25 de 41 da migration
  EXECUTE $m25$DROP FUNCTION IF EXISTS public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text);$m25$;
  -- comando 26 de 41 da migration
  EXECUTE $m26$CREATE OR REPLACE FUNCTION public.fin_alterar_quitacao(p_quitacao uuid, p_patch jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q public.fin_quitacoes%ROWTYPE; l public.fin_lancamentos%ROWTYPE; k text; permitidas text[] := ARRAY['responsavel_tipo', 'responsavel_pessoa_id', 'responsavel_fornecedor_id', 'intencao', 'pago_em', 'declarado_em', 'condicao', 'pede_recibo', 'forma_pagamento_terceiro'];
        n_tipo text; n_pessoa uuid; n_forn uuid; n_int text; n_pago date; n_decl date; n_cond text; n_recibo boolean; n_forma text;
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
  n_forma := CASE WHEN p_patch ? 'forma_pagamento_terceiro' THEN NULLIF(btrim(COALESCE(p_patch->>'forma_pagamento_terceiro', '')), '') ELSE q.forma_pagamento_terceiro END;
  IF n_tipo = 'nao_localizado' THEN n_forma := NULL; END IF;
  IF n_forma IS NOT NULL AND n_forma NOT IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'transferencia', 'outro') THEN RAISE EXCEPTION 'Forma de pagamento do terceiro inválida: %.', n_forma; END IF;
  IF n_tipo IS DISTINCT FROM q.responsavel_tipo THEN
    IF NOT (p_patch ? 'responsavel_pessoa_id') AND n_tipo <> 'pessoa' THEN n_pessoa := NULL; END IF;
    IF NOT (p_patch ? 'responsavel_fornecedor_id') AND n_tipo NOT IN ('empresa', 'entidade') THEN n_forn := NULL; END IF;
  END IF;

  PERFORM public.fin_quitacao_validar_campos(l.id, n_tipo, n_pessoa, n_forn, n_int, n_pago, n_decl);

  PERFORM set_config('qibrj.motivo', btrim(p_motivo), true);
  UPDATE public.fin_quitacoes SET responsavel_tipo = n_tipo, responsavel_pessoa_id = n_pessoa, responsavel_fornecedor_id = n_forn, intencao = n_int,
         pago_em = n_pago, declarado_em = n_decl, condicao = n_cond, pede_recibo = n_recibo, forma_pagamento_terceiro = n_forma WHERE id = q.id;
  PERFORM set_config('qibrj.motivo', '', true);
  PERFORM public.fin_quitacao_sincronizar(l.id);        -- a mudança pode extinguir a oferta ou desfazer a extinção
END
$function$;$m26$;
  -- comando 27 de 41 da migration
  EXECUTE $m27$CREATE OR REPLACE FUNCTION public.fin_quitacao_parametros_alterar(p_patch jsonb, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE k text; antes jsonb; depois jsonb; permitidas text[] := ARRAY['vigencia', 'teto_1', 'prazo_declaracao_dias', 'teto_anual_terceiro', 'qtd_relatadas_trimestre', 'prazo_formalizacao_dias', 'prazo_esclarecimento_dias', 'prazo_reembolso_dias', 'limite_capitalizacao', 'reembolso_teto_baixo', 'reembolso_teto_medio'];
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
    reembolso_teto_baixo = COALESCE((p_patch->>'reembolso_teto_baixo')::numeric, reembolso_teto_baixo),
    reembolso_teto_medio = COALESCE((p_patch->>'reembolso_teto_medio')::numeric, reembolso_teto_medio),
    atualizado_em = now(), atualizado_por = (SELECT auth.uid())
  WHERE id;
  SELECT to_jsonb(p) INTO depois FROM public.fin_quitacao_parametros p;
  INSERT INTO public.fin_quitacao_eventos (evento, de, para, motivo, por) VALUES ('parametros', antes, depois, btrim(p_motivo), (SELECT auth.uid()));
  PERFORM public.fin_quitacao_sincronizar_todas();      -- um novo teto, prazo ou limite pode mudar quais ofertas a prova sustenta
END
$function$;$m27$;
  -- comando 28 de 41 da migration
  EXECUTE $m28$CREATE OR REPLACE FUNCTION public.fin_registrar_nf_quitada_por_terceiro(p_conta uuid, p_fornecedor uuid, p_data date, p_valor numeric, p_descricao text, p_documento_numero text, p_chave text, p_categoria uuid, p_centro uuid, p_natureza_item text, p_comprador text, p_responsavel text, p_pessoa uuid, p_responsavel_fornecedor uuid, p_intencao text, p_pago_em date, p_declarado_em date, p_condicao text DEFAULT NULL::text, p_pede_recibo boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forma_pagamento_terceiro text DEFAULT NULL::text)
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
  IF p_chave IS NOT NULL AND btrim(p_chave) <> '' AND NOT public.fin_nfe_chave_valida(btrim(p_chave)) THEN RAISE EXCEPTION 'A chave de acesso da nota não confere (44 dígitos, só números, com o dígito verificador correto).'; END IF;
  IF p_documento_numero IS NOT NULL AND btrim(p_documento_numero) <> '' AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos x WHERE x.fornecedor_id = p_fornecedor AND x.documento_numero = btrim(p_documento_numero) AND x.tipo::text = 'saida' AND abs(x.valor - p_valor) < 0.005) THEN
    RAISE EXCEPTION 'Já existe uma despesa deste fornecedor com a nota nº % e este valor: não se registra duas vezes a mesma nota.', btrim(p_documento_numero);
  END IF;

  INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, documento_numero, fornecedor_id, categoria_id, centro_custo_id, nf_chave_acesso, origem, observacoes)
  VALUES (p_conta, 'saida', 'previsto', p_data, p_valor, COALESCE(NULLIF(btrim(COALESCE(p_descricao, '')), ''), 'Nota de ' || forn.nome), NULLIF(btrim(COALESCE(p_documento_numero, '')), ''), p_fornecedor, p_categoria, p_centro,
          NULLIF(btrim(COALESCE(p_chave, '')), ''), 'nf_quitada_por_terceiro', 'Registrada já quitada por terceiro (a nota o aplicativo ainda não tinha).')
  RETURNING id INTO novo;

  PERFORM public.fin_registrar_quitacao(novo, p_responsavel, p_pessoa, p_responsavel_fornecedor, p_intencao, p_pago_em, p_declarado_em, p_natureza_item, p_comprador, p_condicao, p_pede_recibo, p_motivo, p_forma_pagamento_terceiro);
  RETURN novo;
END
$function$;$m28$;
  -- comando 29 de 41 da migration
  EXECUTE $m29$DROP FUNCTION IF EXISTS public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text);$m29$;
  -- comando 30 de 41 da migration
  EXECUTE $m30$REVOKE EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text, text) FROM PUBLIC, anon;$m30$;
  -- comando 31 de 41 da migration
  EXECUTE $m31$GRANT EXECUTE ON FUNCTION public.fin_registrar_quitacao(uuid, text, uuid, uuid, text, date, date, text, text, text, boolean, text, text) TO authenticated;$m31$;
  -- comando 32 de 41 da migration
  EXECUTE $m32$REVOKE EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text) FROM PUBLIC, anon;$m32$;
  -- comando 33 de 41 da migration
  EXECUTE $m33$GRANT EXECUTE ON FUNCTION public.fin_registrar_nf_quitada_por_terceiro(uuid, uuid, date, numeric, text, text, text, uuid, uuid, text, text, text, uuid, uuid, text, date, date, text, boolean, text, text) TO authenticated;$m33$;
  -- comando 34 de 41 da migration
  EXECUTE $m34$REVOKE EXECUTE ON FUNCTION public.fin_declaracao_conteudo(uuid) FROM PUBLIC, anon;$m34$;
  -- comando 35 de 41 da migration
  EXECUTE $m35$REVOKE EXECUTE ON FUNCTION public.fin_gerar_declaracao_terceiro(uuid) FROM PUBLIC, anon;$m35$;
  -- comando 36 de 41 da migration
  EXECUTE $m36$REVOKE EXECUTE ON FUNCTION public.fin_declaracao_estado(uuid) FROM PUBLIC, anon;$m36$;
  -- comando 37 de 41 da migration
  EXECUTE $m37$REVOKE EXECUTE ON FUNCTION public.fin_registrar_assinatura_declaracao(uuid, uuid, date) FROM PUBLIC, anon;$m37$;
  -- comando 38 de 41 da migration
  EXECUTE $m38$GRANT EXECUTE ON FUNCTION public.fin_declaracao_conteudo(uuid) TO authenticated;$m38$;
  -- comando 39 de 41 da migration
  EXECUTE $m39$GRANT EXECUTE ON FUNCTION public.fin_gerar_declaracao_terceiro(uuid) TO authenticated;$m39$;
  -- comando 40 de 41 da migration
  EXECUTE $m40$GRANT EXECUTE ON FUNCTION public.fin_declaracao_estado(uuid) TO authenticated;$m40$;
  -- comando 41 de 41 da migration
  EXECUTE $m41$GRANT EXECUTE ON FUNCTION public.fin_registrar_assinatura_declaracao(uuid, uuid, date) TO authenticated;$m41$;

  -- ── depois: nada mudou ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text || nivel_risco || grau_conjunto, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF h_ciclo_depois IS DISTINCT FROM h_ciclo_antes OR n_ciclo_depois <> n_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou.'; END IF;
  IF h_obr_depois IS DISTINCT FROM h_obr_antes OR n_obr_depois <> n_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou.'; END IF;
  IF h_q_depois IS DISTINCT FROM h_q_antes OR n_q_depois <> n_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou (nível, suficiência, fila ou resultado).';
  ELSE rel := rel || format(' Depois da migration: os %s lançamentos, as %s saídas do ciclo, as %s obrigações e as %s quitação(ões) (nível, suficiência, fila e resultado) seguem IDÊNTICOS: a 1D-a não muda comportamento.', n_lanc_depois, n_ciclo_depois, n_obr_depois, n_q_depois); END IF;
  IF q_real IS NOT NULL THEN
    est_real := public.fin_declaracao_estado(q_real);
    rel := rel || format(' A quitação que já existe aparece com a Declaração "%s" (externa = há um documento anexado fora do sistema).', est_real);
  END IF;

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
    SELECT id INTO cat2 FROM public.fin_categorias WHERE tipo::text = 'saida' AND id <> cat ORDER BY id LIMIT 1;
    SELECT id INTO centro FROM public.fin_centros_custo ORDER BY id LIMIT 1;
    -- duas pessoas sem cadastro de favorecido: uma com chave PIX (criada aqui), outra sem
    SELECT m.id INTO pessoa_x FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm AND NOT EXISTS (SELECT 1 FROM public.fin_fornecedores f WHERE f.pessoa_id = m.id) ORDER BY m.id LIMIT 1;
    SELECT m.id INTO pessoa_y FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm AND m.id <> pessoa_x AND NOT EXISTS (SELECT 1 FROM public.fin_fornecedores f WHERE f.pessoa_id = m.id) ORDER BY m.id LIMIT 1;
    DELETE FROM public.fin_pessoa_pix WHERE pessoa_id IN (pessoa_x, pessoa_y);
    INSERT INTO public.fin_pessoa_pix (pessoa_id, chave_pix, tipo_chave_pix) VALUES (pessoa_x, '11122233344', 'cpf');

    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, documento_numero) VALUES (conta, 'saida', 'previsto', current_date - 6, 600, 'ENSAIO 1D-a reembolso', emit, 'manual', cat, centro, 'NF-1') RETURNING id INTO l1;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, documento_numero) VALUES (conta, 'saida', 'previsto', current_date - 6, 80, 'ENSAIO 1D-a sem forma', emit, 'manual', cat, centro, 'NF-2') RETURNING id INTO l2;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, documento_numero) VALUES (conta, 'saida', 'previsto', current_date - 6, 90, 'ENSAIO 1D-a sem pix', emit, 'manual', cat, centro, 'NF-3') RETURNING id INTO l3;
    INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id, documento_numero) VALUES (conta, 'saida', 'previsto', current_date - 6, 70, 'ENSAIO 1D-a oferta sem pix', emit, 'manual', cat, centro, 'NF-4') RETURNING id INTO l4;
    INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'nota_fiscal', 'nf1.pdf'), (l2, 'nota_fiscal', 'nf2.pdf'), (l3, 'nota_fiscal', 'nf3.pdf'), (l4, 'nota_fiscal', 'nf4.pdf');

    -- A2/A3/A4: a forma de pagamento do terceiro é gravada e validada; a chamada ANTIGA (12 argumentos) segue funcionando
    BEGIN
      q1 := public.fin_registrar_quitacao(l1, 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO', 'dinheiro');
      SELECT forma_pagamento_terceiro INTO st FROM public.fin_quitacoes WHERE id = q1;
      IF st = 'dinheiro' THEN rel := rel || ' A2 ok (a forma de pagamento do terceiro foi gravada).'; ELSE ok := false; rel := rel || format(' FALHOU A2: forma=%s.', st); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A2: ' || SQLERRM; END;
    BEGIN
      PERFORM public.fin_registrar_quitacao(l2, 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO', 'cheque');
      ok := false; rel := rel || ' FALHOU A3a: aceitou uma forma de pagamento que não existe.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%forma de pagamento%' THEN rel := rel || ' A3a ok (forma inexistente é recusada).'; ELSE ok := false; rel := rel || ' FALHOU A3a: ' || SQLERRM; END IF;
    END;
    BEGIN
      PERFORM public.fin_registrar_quitacao(l2, 'nao_localizado', NULL, NULL, 'nao_se_aplica', NULL, NULL, NULL, NULL, NULL, false, 'ENSAIO', 'pix');
      ok := false; rel := rel || ' FALHOU A3b: "Não localizado" aceitou forma de pagamento.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%não se sabe quem pagou%' OR SQLERRM ILIKE '%nao_localizado%' THEN rel := rel || ' A3b ok ("Não localizado" não tem forma de pagamento).'; ELSE ok := false; rel := rel || ' FALHOU A3b: ' || SQLERRM; END IF;
    END;
    BEGIN
      q2 := public.fin_registrar_quitacao(l2, 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      SELECT forma_pagamento_terceiro INTO st FROM public.fin_quitacoes WHERE id = q2;
      IF st IS NULL THEN rel := rel || ' A4 ok (a chamada antiga, sem o parâmetro novo, continua funcionando).'; ELSE ok := false; rel := rel || ' FALHOU A4.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A4: ' || SQLERRM; END;

    -- A5: sem a forma de pagamento não se gera a Declaração
    BEGIN
      PERFORM public.fin_gerar_declaracao_terceiro(q2);
      ok := false; rel := rel || ' FALHOU A5: gerou a Declaração sem a forma de pagamento.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%forma de pagamento%' THEN rel := rel || ' A5 ok (sem a forma de pagamento não se gera a Declaração).'; ELSE ok := false; rel := rel || ' FALHOU A5: ' || SQLERRM; END IF;
    END;

    -- A6: gerar numera, guarda o que gerou, é idempotente
    BEGIN
      d1 := public.fin_gerar_declaracao_terceiro(q1);
      SELECT numero INTO num1 FROM public.fin_declaracoes_terceiro WHERE id = d1;
      d1b := public.fin_gerar_declaracao_terceiro(q1);
      SELECT count(*) INTO n FROM public.fin_declaracoes_terceiro WHERE quitacao_id = q1;
      IF num1 ~ '^DT-[0-9]{4}-[0-9]{4}$' AND d1 = d1b AND n = 1 AND public.fin_declaracao_estado(q1) = 'aguardando_assinatura'
         AND (SELECT count(*) FROM public.fin_quitacao_eventos WHERE quitacao_id = q1 AND evento = 'declaracao_gerada') = 1 THEN
        rel := rel || format(' A6 ok (gerou %s; gerar de novo devolve a mesma via; estado "aguardando assinatura"; um evento no histórico).', num1);
      ELSE ok := false; rel := rel || format(' FALHOU A6: numero=%s mesma=%s linhas=%s estado=%s.', num1, d1 = d1b, n, public.fin_declaracao_estado(q1)); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A6: ' || SQLERRM; END;

    -- A7: a de reembolso exige a chave PIX; a de oferta não
    IF pessoa_y IS NULL THEN rel := rel || ' (A7 de fora: falta uma segunda pessoa sem cadastro de favorecido.)'; ELSE
    BEGIN
      q3 := public.fin_registrar_quitacao(l3, 'pessoa', pessoa_y, NULL, 'reembolso', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO', 'pix');
      BEGIN
        d3 := public.fin_gerar_declaracao_terceiro(q3);
        IF (SELECT (conteudo->'declarado'->>'chave_pix') IS NULL FROM public.fin_declaracoes_terceiro WHERE id = d3) THEN rel := rel || ' A7a ok (o reembolso de quem não tem chave PIX gera a Declaração: o recebimento pode ser em espécie, com recibo, ou por TED).';
        ELSE ok := false; rel := rel || ' FALHOU A7a: apareceu uma chave PIX que ninguém cadastrou.'; END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A7a: ' || SQLERRM; END;
      q4 := public.fin_registrar_quitacao(l4, 'pessoa', pessoa_y, NULL, 'oferta', current_date - 4, current_date - 3, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO', 'cartao_debito');
      d3 := public.fin_gerar_declaracao_terceiro(q4);
      IF (SELECT conteudo->'declarado' ? 'chave_pix' FROM public.fin_declaracoes_terceiro WHERE id = d3) AND (SELECT (conteudo->'declarado'->>'chave_pix') IS NULL FROM public.fin_declaracoes_terceiro WHERE id = d3) THEN
        rel := rel || ' A7b ok (a Declaração de oferta é gerada sem chave PIX).';
      ELSE ok := false; rel := rel || ' FALHOU A7b: a oferta não deveria carregar chave PIX.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A7: ' || SQLERRM; END;
    END IF;

    -- A8: a via assinada (anexo + data da assinatura)
    BEGIN
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'declaracao_terceiro', 'assinada.pdf') RETURNING id INTO an1;
      BEGIN
        PERFORM public.fin_registrar_assinatura_declaracao(d1, an1, current_date - 5);
        ok := false; rel := rel || ' FALHOU A8a: aceitou assinatura anterior ao pagamento do terceiro.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%anterior ao pagamento%' THEN rel := rel || ' A8a ok (assinatura anterior ao pagamento é recusada).'; ELSE ok := false; rel := rel || ' FALHOU A8a: ' || SQLERRM; END IF;
      END;
      PERFORM public.fin_registrar_assinatura_declaracao(d1, an1, current_date - 1);
      IF public.fin_declaracao_estado(q1) = 'assinada' AND (SELECT declarado_em FROM public.fin_quitacoes WHERE id = q1) = current_date - 1
         AND (SELECT count(*) FROM public.fin_quitacao_eventos WHERE quitacao_id = q1 AND evento = 'declaracao_assinada' AND por = uid) = 1 THEN
        rel := rel || ' A8b ok (assinada: a data da assinatura virou a data da declaração, com usuário e hora no histórico).';
      ELSE ok := false; rel := rel || format(' FALHOU A8b: estado=%s.', public.fin_declaracao_estado(q1)); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A8: ' || SQLERRM; END;

    -- A9: reclassificar NÃO invalida; mudar o que o terceiro declarou invalida; a nova versão mantém o número
    BEGIN
      UPDATE public.fin_lancamentos SET categoria_id = COALESCE(cat2, cat) WHERE id = l1;
      IF public.fin_declaracao_estado(q1) = 'assinada' THEN rel := rel || ' A9a ok (reclassificar categoria não invalida a assinatura).'; ELSE ok := false; rel := rel || ' FALHOU A9a: reclassificar invalidou a assinatura.'; END IF;
      PERFORM public.fin_alterar_quitacao(q1, jsonb_build_object('forma_pagamento_terceiro', 'pix'), 'ENSAIO: o terceiro pagou por PIX');
      IF public.fin_declaracao_estado(q1) = 'desatualizada' THEN rel := rel || ' A9b ok (mudar a forma de pagamento declarada DESATUALIZA a via assinada).'; ELSE ok := false; rel := rel || format(' FALHOU A9b: estado=%s.', public.fin_declaracao_estado(q1)); END IF;
      d1b := public.fin_gerar_declaracao_terceiro(q1);
      IF d1b <> d1 AND (SELECT versao FROM public.fin_declaracoes_terceiro WHERE id = d1b) = 2 AND (SELECT numero FROM public.fin_declaracoes_terceiro WHERE id = d1b) = num1
         AND public.fin_declaracao_estado(q1) = 'aguardando_assinatura' THEN rel := rel || ' A9c ok (a versão 2 mantém o número e volta a aguardar assinatura).';
      ELSE ok := false; rel := rel || ' FALHOU A9c.'; END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A9: ' || SQLERRM; END;

    -- A10: o gerado não se altera nem se apaga
    BEGIN
      UPDATE public.fin_declaracoes_terceiro SET hash = 'x' WHERE id = d1;
      ok := false; rel := rel || ' FALHOU A10a: o conteúdo gerado foi alterado.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%não se altera%' THEN rel := rel || ' A10a ok (o conteúdo gerado não se altera).'; ELSE ok := false; rel := rel || ' FALHOU A10a: ' || SQLERRM; END IF;
    END;
    BEGIN
      DELETE FROM public.fin_declaracoes_terceiro WHERE id = d1;
      ok := false; rel := rel || ' FALHOU A10b: a Declaração gerada foi apagada.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%não se apaga%' THEN rel := rel || ' A10b ok (a Declaração gerada não se apaga).'; ELSE ok := false; rel := rel || ' FALHOU A10b: ' || SQLERRM; END IF;
    END;

    -- A11: limites do reembolso: só em ordem (Baixo ≤ Médio)
    BEGIN
      PERFORM public.fin_quitacao_parametros_alterar(jsonb_build_object('reembolso_teto_baixo', 350), 'ENSAIO');
      IF (SELECT reembolso_teto_baixo FROM public.fin_quitacao_parametros) = 350 THEN rel := rel || ' A11a ok (o limite do nível Baixo é alterável pelo Administrador).'; ELSE ok := false; rel := rel || ' FALHOU A11a.'; END IF;
      BEGIN
        PERFORM public.fin_quitacao_parametros_alterar(jsonb_build_object('reembolso_teto_baixo', 5000), 'ENSAIO');
        ok := false; rel := rel || ' FALHOU A11b: aceitou Baixo maior que Médio.';
      EXCEPTION WHEN OTHERS THEN rel := rel || ' A11b ok (Baixo maior que Médio é recusado).'; END;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A11: ' || SQLERRM; END;

    -- A12: registrar NF já quitada por terceiro também aceita a forma de pagamento (e a chamada antiga, sem ela, segue valendo)
    BEGIN
      l1 := public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 3, 55, 'ENSAIO 1D-a NF', 'NF-ENSAIO-12', NULL, cat, centro, 'consumo', 'cnpj_igreja', 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 3, NULL, false, 'ENSAIO', 'transferencia');
      SELECT forma_pagamento_terceiro INTO st FROM public.fin_quitacoes WHERE obrigacao_id = l1;
      l2 := public.fin_registrar_nf_quitada_por_terceiro(conta, emit, current_date - 3, 56, 'ENSAIO 1D-a NF antiga', 'NF-ENSAIO-13', NULL, cat, centro, 'consumo', 'cnpj_igreja', 'pessoa', pessoa_x, NULL, 'reembolso', current_date - 4, current_date - 3, NULL, false, 'ENSAIO');
      IF st = 'transferencia' AND (SELECT forma_pagamento_terceiro IS NULL FROM public.fin_quitacoes WHERE obrigacao_id = l2) THEN rel := rel || ' A12 ok (a NF já quitada grava a forma de pagamento; a chamada antiga continua válida).';
      ELSE ok := false; rel := rel || format(' FALHOU A12: forma=%s.', st); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU A12: ' || SQLERRM; END;

    -- garantias finais
    SELECT count(*) INTO n_entradas_depois FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
    SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_depois FROM public.fin_contas;
    IF n_entradas_depois <> n_entradas_antes THEN ok := false; rel := rel || ' FALHOU: nasceu uma entrada.'; END IF;
    IF h_saldos_depois IS DISTINCT FROM h_saldos_antes THEN ok := false; rel := rel || ' FALHOU: o saldo de alguma conta mudou.'; ELSE rel := rel || ' GARANTIA: nenhuma entrada nasceu e o saldo de TODAS as contas ficou idêntico em todo o ensaio.'; END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
