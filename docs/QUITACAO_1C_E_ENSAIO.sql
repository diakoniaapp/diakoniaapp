-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da Fase 1C-e da Quitação (migration 20261015130000) contra os dados REAIS — CANCELADA e as FERRAMENTAS de regularização ──────────────────────────────────────────────────────
-- PRÉ-REQUISITOS: Fases 1A, 1B e 1C-a aplicadas.
-- Dentro de uma transação que será desfeita: roda a migration e confere que (1) nada existente mudou — e que NENHUM caso real foi regularizado; (2) cancelar exige a PROVA, recusa nota com quitação e
-- fica no histórico, e dá para desfazer; (3) a regularização de um caso SINTÉTICO ("Oferta de NF" + transferência + saída) deixa o SALDO DE CADA CONTA IDÊNTICO ao de antes de o caso existir, não deixa
-- entrada nem transferência, guarda tudo no backup e registra a quitação. Tudo desfeito no fim. Se algo divergir: FALHOU — não aplique.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; msg text; v record; n bigint; st text;
  n_lanc_antes bigint; h_lanc_antes text; n_ciclo_antes bigint; h_ciclo_antes text; n_obr_antes bigint; h_obr_antes text; n_q_antes bigint; h_q_antes text;
  n_lanc_depois bigint; h_lanc_depois text; n_ciclo_depois bigint; h_ciclo_depois text; n_obr_depois bigint; h_obr_depois text; n_q_depois bigint; h_q_depois text;
  conta uuid; conta2 uuid; emit uuid; pessoa_adm uuid; pessoa_x uuid; cat uuid; centro uuid; l1 uuid; l2 uuid; q1 uuid; ent uuid; po uuid; pnt uuid; sai uuid; qreg uuid;
  h_saldos_pre text; h_saldos_pos text; n_ent_pre bigint; n_ent_pos bigint; n_cand bigint;
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
  -- comando 1 de 21 da migration
  EXECUTE $m1$DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_lancamento_anexos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%' LOOP
    EXECUTE format('ALTER TABLE public.fin_lancamento_anexos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_lancamento_anexos ADD CONSTRAINT fin_lancamento_anexos_tipo_check CHECK (tipo IN (
    'nota_fiscal', 'boleto', 'guia', 'comprovante', 'fatura', 'contrato',
    'xml', 'rpa', 'rsp', 'dps', 'outro',
    'documento',
    'declaracao_terceiro', 'pedido_reembolso', 'prova_pagamento_terceiro',
    'prova_cancelamento'));                                                           -- o documento do cancelamento da nota com o emitente
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.fin_quitacao_eventos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%evento%' LOOP
    EXECUTE format('ALTER TABLE public.fin_quitacao_eventos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.fin_quitacao_eventos ADD CONSTRAINT fin_quitacao_eventos_evento_check CHECK (evento IN
    ('registrada', 'alterada', 'removida', 'aprovacao_reembolso', 'aprovacao_relatado', 'parametros', 'extinta_por_oferta', 'extincao_desfeita', 'reembolso_pago',
     'cancelada', 'cancelamento_desfeito', 'regularizada_oferta'));
END $$;$m1$;
  -- comando 2 de 21 da migration
  EXECUTE $m2$CREATE OR REPLACE FUNCTION public.fin_cancelar_obrigacao(p_obrigacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para cancelar uma nota.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo do cancelamento (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Despesa não encontrada.'; END IF;
  IF l.tipo::text <> 'saida' OR l.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'Só uma despesa (saída) se cancela.'; END IF;
  IF COALESCE(l.obrigacao_id, l.id) <> l.id THEN RAISE EXCEPTION 'Cancele a obrigação principal, não uma das suas parcelas.'; END IF;
  IF l.status::text <> 'previsto' THEN RAISE EXCEPTION 'Esta despesa não está em aberto (situação: %). Só se cancela a nota que ainda não foi paga nem extinta.', l.status; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = l.id) THEN
    RAISE EXCEPTION 'Esta despesa tem uma quitação registrada (quem pagou). Remova a quitação, com motivo, antes de cancelar a nota: cancelada não é quitada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = l.id AND x.id <> l.id AND x.status::text IN ('realizado', 'conciliado', 'quitado_terceiro')) THEN
    RAISE EXCEPTION 'Esta obrigação já teve pagamento: não se cancela.';
  END IF;
  IF public.fin_despesa_enviada(l.id) THEN RAISE EXCEPTION 'Esta despesa já foi enviada à contabilidade: reabra-a antes de cancelar.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id WHERE COALESCE(x.obrigacao_id, x.id) = l.id AND a.tipo = 'prova_cancelamento') THEN
    RAISE EXCEPTION 'Sem a prova do cancelamento não há cancelamento: anexe o documento (tipo "Prova de cancelamento") e tente de novo. Sem prova suficiente, a nota continua A esclarecer.';
  END IF;
  UPDATE public.fin_lancamentos SET status = 'cancelado' WHERE id = l.id;
  INSERT INTO public.fin_quitacao_eventos (obrigacao_id, evento, motivo, por) VALUES (l.id, 'cancelada', btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;$m2$;
  -- comando 3 de 21 da migration
  EXECUTE $m3$CREATE OR REPLACE FUNCTION public.fin_desfazer_cancelamento(p_obrigacao uuid, p_motivo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE l public.fin_lancamentos%ROWTYPE;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN RAISE EXCEPTION 'Sem permissão para desfazer o cancelamento.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 5 THEN RAISE EXCEPTION 'Informe o motivo (pelo menos 5 caracteres).'; END IF;
  SELECT * INTO l FROM public.fin_lancamentos WHERE id = p_obrigacao FOR UPDATE;
  IF NOT FOUND OR l.status::text <> 'cancelado' THEN RAISE EXCEPTION 'Esta despesa não está cancelada.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento = 'cancelada') THEN
    RAISE EXCEPTION 'Esta despesa foi cancelada fora da Política (sem prova registrada): reative-a pela tela de lançamentos.';
  END IF;
  UPDATE public.fin_lancamentos SET status = 'previsto' WHERE id = l.id;
  INSERT INTO public.fin_quitacao_eventos (obrigacao_id, evento, motivo, por) VALUES (l.id, 'cancelamento_desfeito', btrim(p_motivo), (SELECT auth.uid()));
END
$fn$;$m3$;
  -- comando 4 de 21 da migration
  EXECUTE $m4$CREATE OR REPLACE VIEW public.vw_fin_canceladas WITH (security_invoker = true) AS
SELECT l.id AS obrigacao_id, l.data, l.valor, l.descricao, l.fornecedor_id, l.documento_numero,
       c.em AS cancelada_em, c.por AS cancelada_por, c.motivo,
       EXISTS (SELECT 1 FROM public.fin_lancamento_anexos a JOIN public.fin_lancamentos x ON x.id = a.lancamento_id WHERE COALESCE(x.obrigacao_id, x.id) = l.id AND a.tipo = 'prova_cancelamento') AS tem_prova
  FROM public.fin_lancamentos l
  JOIN LATERAL (SELECT e.em, e.por, e.motivo FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento IN ('cancelada', 'cancelamento_desfeito') ORDER BY e.em DESC LIMIT 1) c ON true
  JOIN LATERAL (SELECT e.evento FROM public.fin_quitacao_eventos e WHERE e.obrigacao_id = l.id AND e.evento IN ('cancelada', 'cancelamento_desfeito') ORDER BY e.em DESC LIMIT 1) u ON u.evento = 'cancelada'
 WHERE l.status::text = 'cancelado';$m4$;
  -- comando 5 de 21 da migration
  EXECUTE $m5$GRANT SELECT ON public.vw_fin_canceladas TO authenticated;$m5$;
  -- comando 6 de 21 da migration
  EXECUTE $m6$COMMENT ON VIEW public.vw_fin_canceladas IS 'Notas canceladas com o emitente pela Política (com a prova do cancelamento): desfecho próprio, nem quitada nem não localizada.';$m6$;
  -- comando 7 de 21 da migration
  EXECUTE $m7$CREATE TABLE IF NOT EXISTS public.fin_quitacao_regularizacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote        uuid NOT NULL,                       -- uma regularização = um lote
  tabela      text NOT NULL,
  linha       jsonb NOT NULL,                      -- o lançamento como era, inteiro
  removido_em timestamptz NOT NULL DEFAULT now(),
  por         uuid
);$m7$;
  -- comando 8 de 21 da migration
  EXECUTE $m8$CREATE INDEX IF NOT EXISTS fin_quitacao_regularizacoes_lote_idx ON public.fin_quitacao_regularizacoes (lote);$m8$;
  -- comando 9 de 21 da migration
  EXECUTE $m9$ALTER TABLE public.fin_quitacao_regularizacoes ENABLE ROW LEVEL SECURITY;$m9$;
  -- comando 10 de 21 da migration
  EXECUTE $m10$DROP POLICY IF EXISTS fin_quitacao_regularizacoes_leitura ON public.fin_quitacao_regularizacoes;$m10$;
  -- comando 11 de 21 da migration
  EXECUTE $m11$CREATE POLICY fin_quitacao_regularizacoes_leitura ON public.fin_quitacao_regularizacoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m11$;
  -- comando 12 de 21 da migration
  EXECUTE $m12$COMMENT ON TABLE public.fin_quitacao_regularizacoes IS 'Cópia integral do que a regularização de uma "Oferta de NF" removeu (a entrada e as duas pernas da transferência), por lote. Só as funções escrevem.';$m12$;
  -- comando 13 de 21 da migration
  EXECUTE $m13$CREATE OR REPLACE VIEW public.vw_fin_oferta_de_nf_candidatas WITH (security_invoker = true) AS
SELECT e.id AS entrada_id, e.data AS data_entrada, e.valor, e.status::text AS status_entrada, e.descricao AS descricao_entrada, e.observacoes AS observacoes_entrada, ce.nome AS conta_entrada,
       s.id AS saida_id, s.data AS data_saida, s.status::text AS status_saida, cs.nome AS conta_saida, f.nome AS fornecedor_saida, s.documento_numero AS nota_saida,
       (SELECT count(*) FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = e.valor AND p.tipo::text = 'saida' AND p.conta_id = e.conta_id AND abs(p.data - e.data) <= 20) AS pernas_de_saida,
       (SELECT count(*) FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = e.valor AND p.tipo::text = 'entrada' AND p.conta_id = s.conta_id AND abs(p.data - s.data) <= 20) AS pernas_de_entrada,
       'a_esclarecer'::text AS situacao
  FROM public.fin_lancamentos e
  JOIN public.fin_contas ce ON ce.id = e.conta_id
  LEFT JOIN public.fin_lancamentos s ON s.tipo::text = 'saida' AND s.valor = e.valor AND abs(s.data - e.data) <= 20 AND s.id <> e.id AND s.origem IS DISTINCT FROM 'transferencia'
  LEFT JOIN public.fin_contas cs ON cs.id = s.conta_id
  LEFT JOIN public.fin_fornecedores f ON f.id = s.fornecedor_id
 WHERE e.tipo::text = 'entrada' AND e.descricao ~* 'oferta de nf|oferta nf|nf ofertada';$m13$;
  -- comando 14 de 21 da migration
  EXECUTE $m14$GRANT SELECT ON public.vw_fin_oferta_de_nf_candidatas TO authenticated;$m14$;
  -- comando 15 de 21 da migration
  EXECUTE $m15$CREATE OR REPLACE FUNCTION public.fin_regularizar_oferta_de_nf(
  p_entrada uuid, p_saida uuid, p_responsavel_tipo text, p_pessoa uuid, p_fornecedor uuid, p_pago_em date, p_declarado_em date,
  p_natureza_item text, p_comprador text, p_motivo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE ent public.fin_lancamentos%ROWTYPE; sai public.fin_lancamentos%ROWTYPE; p_out public.fin_lancamentos%ROWTYPE; p_in public.fin_lancamentos%ROWTYPE;
        lote uuid := gen_random_uuid(); q uuid; uid uuid := (SELECT auth.uid()); n int;
BEGIN
  IF NOT has_any_role(uid, ARRAY['admin'::app_role]) THEN RAISE EXCEPTION 'Só o Administrador regulariza o histórico.'; END IF;
  IF p_motivo IS NULL OR char_length(btrim(p_motivo)) < 10 THEN RAISE EXCEPTION 'Informe o motivo da regularização, com a referência dos documentos validados (pelo menos 10 caracteres).'; END IF;
  IF p_responsavel_tipo NOT IN ('pessoa', 'empresa', 'entidade') THEN RAISE EXCEPTION 'Informe quem pagou a nota (pessoa, empresa ou entidade). Sem saber, a nota fica A esclarecer: não se regulariza.'; END IF;

  SELECT * INTO ent FROM public.fin_lancamentos WHERE id = p_entrada FOR UPDATE;
  SELECT * INTO sai FROM public.fin_lancamentos WHERE id = p_saida FOR UPDATE;
  IF ent.id IS NULL OR ent.tipo::text <> 'entrada' OR ent.status::text NOT IN ('realizado', 'conciliado') THEN RAISE EXCEPTION 'A entrada informada não existe ou não é uma entrada realizada.'; END IF;
  IF sai.id IS NULL OR sai.tipo::text <> 'saida' OR sai.status::text NOT IN ('realizado', 'conciliado') OR sai.origem IS NOT DISTINCT FROM 'transferencia' THEN RAISE EXCEPTION 'A saída informada não existe ou não é uma saída realizada.'; END IF;
  IF ent.valor <> sai.valor THEN RAISE EXCEPTION 'A entrada (%) e a saída (%) têm valores diferentes: não é o padrão "Oferta de NF".', ent.valor, sai.valor; END IF;
  IF COALESCE(sai.obrigacao_id, sai.id) <> sai.id OR EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.obrigacao_id = sai.id AND x.id <> sai.id) THEN RAISE EXCEPTION 'A saída é parte de uma obrigação paga em parcelas: regularize à mão.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE obrigacao_id = sai.id) THEN RAISE EXCEPTION 'A saída já tem uma quitação registrada.'; END IF;
  IF ent.fechamento_id IS NOT NULL OR sai.fechamento_id IS NOT NULL THEN RAISE EXCEPTION 'Um dos lançamentos pertence a um período fechado: reabra o período antes.'; END IF;
  IF public.fin_despesa_enviada(sai.id) THEN RAISE EXCEPTION 'A saída já foi enviada à contabilidade: reabra-a antes.'; END IF;

  SELECT count(*) INTO n FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'saida' AND p.conta_id = ent.conta_id AND abs(p.data - ent.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF n <> 1 THEN RAISE EXCEPTION 'Não identifiquei UMA perna de saída da transferência na conta da entrada (achei %): regularize à mão.', n; END IF;
  SELECT * INTO p_out FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'saida' AND p.conta_id = ent.conta_id AND abs(p.data - ent.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  SELECT count(*) INTO n FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'entrada' AND p.conta_id = sai.conta_id AND abs(p.data - sai.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF n <> 1 THEN RAISE EXCEPTION 'Não identifiquei UMA perna de entrada da transferência na conta da saída (achei %): regularize à mão.', n; END IF;
  SELECT * INTO p_in FROM public.fin_lancamentos p WHERE p.origem = 'transferencia' AND p.valor = ent.valor AND p.tipo::text = 'entrada' AND p.conta_id = sai.conta_id AND abs(p.data - sai.data) <= 20 AND p.status::text IN ('realizado', 'conciliado');
  IF p_out.fechamento_id IS NOT NULL OR p_in.fechamento_id IS NOT NULL THEN RAISE EXCEPTION 'Uma das pernas da transferência pertence a um período fechado: reabra o período antes.'; END IF;
  IF p_out.conta_id = p_in.conta_id THEN RAISE EXCEPTION 'As pernas da transferência estão na mesma conta: não é o padrão esperado.'; END IF;
  IF EXISTS (SELECT 1 FROM public.fin_extrato_vinculos v WHERE v.desfeito_em IS NULL AND v.lancamento_id IN (ent.id, sai.id, p_out.id, p_in.id)) THEN
    RAISE EXCEPTION 'Algum dos lançamentos está vinculado a uma linha de extrato bancário: desfaça o vínculo antes (a regularização não mexe em conciliação).';
  END IF;

  INSERT INTO public.fin_quitacao_regularizacoes (lote, tabela, linha, por)
  VALUES (lote, 'entrada', to_jsonb(ent), uid), (lote, 'perna_saida', to_jsonb(p_out), uid), (lote, 'perna_entrada', to_jsonb(p_in), uid), (lote, 'saida_antes', to_jsonb(sai), uid);
  DELETE FROM public.fin_lancamentos WHERE id IN (ent.id, p_out.id, p_in.id);
  UPDATE public.fin_lancamentos SET status = 'previsto', data_pagamento = NULL, conferido_em = NULL, conferido_por = NULL,
         observacoes = trim(both E'\n' from COALESCE(observacoes, '') || E'\n[Regularizada como oferta de NF — lote ' || lote::text || ']')
   WHERE id = sai.id;
  q := public.fin_registrar_quitacao(sai.id, p_responsavel_tipo, p_pessoa, p_fornecedor, 'oferta', p_pago_em, p_declarado_em, p_natureza_item, p_comprador, NULL, false, p_motivo);
  INSERT INTO public.fin_quitacao_eventos (quitacao_id, obrigacao_id, evento, de, motivo, por)
  VALUES (q, sai.id, 'regularizada_oferta', jsonb_build_object('lote', lote, 'entrada', ent.id, 'perna_saida', p_out.id, 'perna_entrada', p_in.id, 'valor', ent.valor), btrim(p_motivo), uid);
  RETURN q;
END
$fn$;$m15$;
  -- comando 16 de 21 da migration
  EXECUTE $m16$REVOKE EXECUTE ON FUNCTION public.fin_cancelar_obrigacao(uuid, text) FROM PUBLIC, anon;$m16$;
  -- comando 17 de 21 da migration
  EXECUTE $m17$REVOKE EXECUTE ON FUNCTION public.fin_desfazer_cancelamento(uuid, text) FROM PUBLIC, anon;$m17$;
  -- comando 18 de 21 da migration
  EXECUTE $m18$REVOKE EXECUTE ON FUNCTION public.fin_regularizar_oferta_de_nf(uuid, uuid, text, uuid, uuid, date, date, text, text, text) FROM PUBLIC, anon;$m18$;
  -- comando 19 de 21 da migration
  EXECUTE $m19$GRANT EXECUTE ON FUNCTION public.fin_cancelar_obrigacao(uuid, text) TO authenticated;$m19$;
  -- comando 20 de 21 da migration
  EXECUTE $m20$GRANT EXECUTE ON FUNCTION public.fin_desfazer_cancelamento(uuid, text) TO authenticated;$m20$;
  -- comando 21 de 21 da migration
  EXECUTE $m21$GRANT EXECUTE ON FUNCTION public.fin_regularizar_oferta_de_nf(uuid, uuid, text, uuid, uuid, date, date, text, text, text) TO authenticated;$m21$;

  -- ── depois: nada mudou, e nenhum caso real foi regularizado ──
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc_depois, h_lanc_depois
    FROM (SELECT id, conta_id, tipo, status, data, data_pagamento, valor, descricao, observacoes, obrigacao_id, categoria_id, centro_custo_id, fornecedor_id, pessoa_id FROM public.fin_lancamentos) t;
  SELECT count(*), md5(string_agg(lancamento_id::text || estado || COALESCE(atraso_dias::text, '') || COALESCE(conferencia, '') || COALESCE(resultado, '') || COALESCE(responsavel, ''), '|' ORDER BY lancamento_id)) INTO n_ciclo_depois, h_ciclo_depois FROM public.vw_fin_ciclo;
  SELECT count(*), md5(string_agg(obrigacao_id::text || situacao || valor_original::text || saldo_pendente::text || total_pago::text, '|' ORDER BY obrigacao_id)) INTO n_obr_depois, h_obr_depois FROM public.vw_fin_obrigacoes;
  SELECT count(*), md5(string_agg(quitacao_id::text || resultado || COALESCE(fila, '') || COALESCE(credor_atual, '') || suficiente::text, '|' ORDER BY quitacao_id)) INTO n_q_depois, h_q_depois FROM public.vw_fin_quitacao;
  IF h_lanc_depois IS DISTINCT FROM h_lanc_antes OR n_lanc_depois <> n_lanc_antes THEN ok := false; rel := rel || ' FALHOU: algum lançamento existente mudou.'; END IF;
  IF h_ciclo_depois IS DISTINCT FROM h_ciclo_antes OR n_ciclo_depois <> n_ciclo_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_ciclo mudou.'; END IF;
  IF h_obr_depois IS DISTINCT FROM h_obr_antes OR n_obr_depois <> n_obr_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_obrigacoes mudou.'; END IF;
  IF h_q_depois IS DISTINCT FROM h_q_antes OR n_q_depois <> n_q_antes THEN ok := false; rel := rel || ' FALHOU: vw_fin_quitacao mudou.';
  ELSE rel := rel || ' Depois da migration: tudo o que já existia segue IDÊNTICO; nenhum caso real foi regularizado.'; END IF;
  SELECT count(*) INTO n_cand FROM public.vw_fin_oferta_de_nf_candidatas;
  SELECT count(*) INTO n FROM public.fin_quitacao_regularizacoes;
  rel := rel || format(' A visão de candidatas (somente leitura) lista %s linha(s) "Oferta de NF" do histórico, todas A ESCLARECER; o backup de regularizações tem %s linha(s).', n_cand, n);

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
    SELECT id INTO conta2 FROM public.fin_contas WHERE id <> conta ORDER BY id LIMIT 1;
    SELECT id INTO emit FROM public.fin_fornecedores ORDER BY id LIMIT 1;
    SELECT id INTO cat FROM public.fin_categorias WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;
    SELECT id INTO centro FROM public.fin_centros_custo ORDER BY id LIMIT 1;
    SELECT m.id INTO pessoa_x FROM public.membros m WHERE m.id IS DISTINCT FROM pessoa_adm ORDER BY m.id LIMIT 1;

    -- E1: cancelar exige a PROVA; com a prova cancela, fica no histórico, aparece em vw_fin_canceladas, e dá para desfazer
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 5, 150, 'ENSAIO 1C-e cancelada', emit, 'manual', cat, centro) RETURNING id INTO l1;
      BEGIN
        PERFORM public.fin_cancelar_obrigacao(l1, 'ENSAIO sem prova');
        ok := false; rel := rel || ' FALHOU E1a: cancelou sem a prova do cancelamento.';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM ILIKE '%prova do cancelamento%' THEN rel := rel || ' E1a ok (sem a prova do cancelamento, a nota não cancela: segue A esclarecer).'; ELSE ok := false; rel := rel || ' FALHOU E1a: ' || SQLERRM; END IF;
      END;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l1, 'prova_cancelamento', 'cancelamento.pdf');
      PERFORM public.fin_cancelar_obrigacao(l1, 'ENSAIO cancelada com o emitente');
      SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
      SELECT * INTO v FROM public.vw_fin_canceladas WHERE obrigacao_id = l1;
      SELECT count(*) INTO n FROM public.fin_quitacao_eventos WHERE obrigacao_id = l1 AND evento = 'cancelada' AND por = uid;
      IF st = 'cancelado' AND v.tem_prova AND n = 1 THEN rel := rel || ' E1b ok (com a prova: cancelada, no histórico com usuário e hora, e listada em vw_fin_canceladas).';
      ELSE ok := false; rel := rel || format(' FALHOU E1b: status=%s tem_prova=%s eventos=%s.', st, v.tem_prova, n); END IF;
      PERFORM public.fin_desfazer_cancelamento(l1, 'ENSAIO desfazer');
      SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = l1;
      SELECT count(*) INTO n FROM public.vw_fin_canceladas WHERE obrigacao_id = l1;
      IF st = 'previsto' AND n = 0 THEN rel := rel || ' E1c ok (desfazer o cancelamento reabre a nota e a tira da lista de canceladas).'; ELSE ok := false; rel := rel || format(' FALHOU E1c: status=%s na lista=%s.', st, n); END IF;
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU E1: ' || SQLERRM; END;

    -- E2: nota com quitação registrada NÃO se cancela (cancelada não é quitada): é preciso remover a quitação antes
    BEGIN
      INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta, 'saida', 'previsto', current_date - 5, 90, 'ENSAIO 1C-e com quitação', emit, 'manual', cat, centro) RETURNING id INTO l2;
      INSERT INTO public.fin_lancamento_anexos (lancamento_id, tipo, url) VALUES (l2, 'nota_fiscal', 'nf.pdf'), (l2, 'prova_cancelamento', 'c.pdf');
      q1 := public.fin_registrar_quitacao(l2, 'pessoa', pessoa_x, NULL, 'nao_declarada', current_date - 6, NULL, 'consumo', 'cnpj_igreja', NULL, false, 'ENSAIO');
      PERFORM public.fin_cancelar_obrigacao(l2, 'ENSAIO com quitação');
      ok := false; rel := rel || ' FALHOU E2: cancelou uma nota que tem quitação.';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM ILIKE '%remova a quitação%' THEN rel := rel || ' E2 ok (nota com quitação não se cancela: remova a quitação antes, com motivo).'; ELSE ok := false; rel := rel || ' FALHOU E2: ' || SQLERRM; END IF;
    END;

    -- E3: regularização de um caso SINTÉTICO: o saldo de CADA conta fica idêntico ao de antes de o caso existir
    IF conta2 IS NULL OR pessoa_x IS NULL THEN rel := rel || ' (E3 de fora: faltam duas contas ou uma pessoa no cadastro.)';
    ELSE
      BEGIN
        SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_pre FROM public.fin_contas;
        SELECT count(*) INTO n_ent_pre FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, origem) VALUES (conta, 'entrada', 'realizado', current_date - 12, 237.50, 'ENSAIO Oferta de NF', 'manual') RETURNING id INTO ent;
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, origem) VALUES (conta, 'saida', 'realizado', current_date - 12, 237.50, 'ENSAIO transferência (saída)', 'transferencia') RETURNING id INTO po;
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, valor, descricao, origem) VALUES (conta2, 'entrada', 'realizado', current_date - 12, 237.50, 'ENSAIO transferência (entrada)', 'transferencia') RETURNING id INTO pnt;
        INSERT INTO public.fin_lancamentos (conta_id, tipo, status, data, data_pagamento, valor, descricao, fornecedor_id, origem, categoria_id, centro_custo_id) VALUES (conta2, 'saida', 'realizado', current_date - 11, current_date - 11, 237.50, 'ENSAIO nota paga pela Caixinha', emit, 'manual', cat, centro) RETURNING id INTO sai;
        SELECT count(*) INTO n FROM public.vw_fin_oferta_de_nf_candidatas WHERE entrada_id = ent AND saida_id = sai AND pernas_de_saida = 1 AND pernas_de_entrada = 1 AND situacao = 'a_esclarecer';
        IF n = 1 THEN rel := rel || ' E3a ok (a visão de candidatas enxerga o caso sintético, com as duas pernas, como A ESCLARECER).'; ELSE ok := false; rel := rel || format(' FALHOU E3a: a visão devolveu %s linha(s) para o caso.', n); END IF;
        qreg := public.fin_regularizar_oferta_de_nf(ent, sai, 'pessoa', pessoa_x, NULL, current_date - 13, current_date - 10, 'consumo', 'cnpj_igreja', 'ENSAIO: documentos validados (caso sintético)');
        SELECT md5(string_agg(id::text || ':' || saldo_atual::text, '|' ORDER BY id)) INTO h_saldos_pos FROM public.fin_contas;
        SELECT count(*) INTO n_ent_pos FROM public.fin_lancamentos WHERE tipo::text = 'entrada';
        SELECT count(*) INTO n FROM public.fin_lancamentos WHERE id IN (ent, po, pnt);
        IF h_saldos_pos = h_saldos_pre THEN rel := rel || ' E3b ok (o saldo de TODAS as contas ficou IDÊNTICO ao de antes de o caso existir).'; ELSE ok := false; rel := rel || ' FALHOU E3b: algum saldo mudou.'; END IF;
        IF n = 0 AND n_ent_pos = n_ent_pre THEN rel := rel || ' E3c ok (a entrada e as duas pernas da transferência saíram; nenhuma entrada ficou).'; ELSE ok := false; rel := rel || format(' FALHOU E3c: restaram %s lançamentos do trio; entradas %s→%s.', n, n_ent_pre, n_ent_pos); END IF;
        SELECT count(*) INTO n FROM public.fin_quitacao_regularizacoes WHERE tabela IN ('entrada', 'perna_saida', 'perna_entrada', 'saida_antes') AND (linha->>'id')::uuid IN (ent, po, pnt, sai);
        SELECT status::text INTO st FROM public.fin_lancamentos WHERE id = sai;
        IF n = 4 AND st IN ('previsto', 'quitado_terceiro') AND EXISTS (SELECT 1 FROM public.fin_quitacoes WHERE id = qreg AND obrigacao_id = sai) THEN rel := rel || format(' E3d ok (os 4 lançamentos ficaram no backup; a saída virou obrigação com quitação de oferta — situação %s, sem presumir prova).', st);
        ELSE ok := false; rel := rel || format(' FALHOU E3d: backup=%s status=%s.', n, st); END IF;
      EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU E3: ' || SQLERRM; END;
    END IF;
  END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
