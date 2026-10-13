-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da migration 20261013100000 (D1 versão leve: linha nova nasce com obrigacao_id = o próprio id) contra os dados REAIS ──────────────
-- Dentro de uma transação que será desfeita: fotografa o estado de hoje, roda a migration inteira (gatilho, view das parcelas, função da fusão) e confere que
-- NADA do histórico mudou (nenhum preenchimento em massa), que uma linha NOVA nasce com obrigacao_id = id, que a view lista só parcelas e que a função da
-- fusão foi trocada. Se algo divergir, a mensagem diz FALHOU e você NÃO aplica.
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true;
  n_antes bigint; n_oid_antes bigint; n_filhas_antes bigint; saldos_antes text; sit_antes text;
  n_depois bigint; n_oid_depois bigint; n_filhas_depois bigint; saldos_depois text; sit_depois text;
  novo_id uuid; novo_oid uuid; n_view bigint; def_fusao text;
BEGIN
  -- ── antes ──
  SELECT count(*) INTO n_antes FROM public.fin_lancamentos;
  SELECT count(*) INTO n_oid_antes FROM public.fin_lancamentos WHERE obrigacao_id IS NOT NULL;
  SELECT count(*) INTO n_filhas_antes FROM public.fin_lancamentos WHERE obrigacao_id IS NOT NULL AND obrigacao_id <> id;
  SELECT string_agg(id::text || ':' || saldo_atual::text, ', ' ORDER BY id) INTO saldos_antes FROM public.fin_contas;
  SELECT string_agg(situacao || '=' || n, ', ' ORDER BY situacao) INTO sit_antes FROM (SELECT situacao, count(*) n FROM public.vw_fin_obrigacoes GROUP BY situacao) s;
  rel := format('ANTES: %s lançamentos; %s com obrigacao_id preenchido; %s são parcelas de outra linha; situações: %s.', n_antes, n_oid_antes, n_filhas_antes, sit_antes);

  -- ── a migration inteira ──
  -- comando 1 da migration
  EXECUTE $m1$CREATE OR REPLACE FUNCTION public.fin_lanc_obrigacao_propria() RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.obrigacao_id IS NULL THEN NEW.obrigacao_id := NEW.id; END IF;
  RETURN NEW;
END
$fn$;$m1$;
  -- comando 2 da migration
  EXECUTE $m2$DROP TRIGGER IF EXISTS fin_lanc_obrigacao_propria ON public.fin_lancamentos;$m2$;
  -- comando 3 da migration
  EXECUTE $m3$CREATE TRIGGER fin_lanc_obrigacao_propria BEFORE INSERT ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_lanc_obrigacao_propria();$m3$;
  -- comando 4 da migration
  EXECUTE $m4$CREATE OR REPLACE VIEW public.vw_fin_obrigacao_filhas WITH (security_invoker = true) AS
SELECT l.id, l.obrigacao_id
  FROM public.fin_lancamentos l
 WHERE l.obrigacao_id IS NOT NULL AND l.obrigacao_id <> l.id;$m4$;
  -- comando 5 da migration
  EXECUTE $m5$COMMENT ON VIEW public.vw_fin_obrigacao_filhas IS 'As linhas de fin_lancamentos que são PARCELAS de uma obrigação cuja raiz é outra linha (obrigacao_id ≠ id). A raiz é a linha apontada. security_invoker: vale a RLS de fin_lancamentos.';$m5$;
  -- comando 6 da migration
  EXECUTE $m6$GRANT SELECT ON public.vw_fin_obrigacao_filhas TO authenticated;$m6$;
  -- comando 7 da migration
  EXECUTE $m7$CREATE OR REPLACE FUNCTION public.fin_liquidar_com_pagamento_existente(
  p_previsto uuid, p_pagamento uuid, p_itens jsonb, p_encargos jsonb DEFAULT '[]'::jsonb, p_adotar_valor boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  pr public.fin_lancamentos%ROWTYPE; pg public.fin_lancamentos%ROWTYPE;
  fit text; liq uuid; n int; i jsonb;
BEGIN
  IF NOT has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para liquidar pagamentos.';
  END IF;
  IF p_previsto = p_pagamento THEN RAISE EXCEPTION 'A obrigação e o pagamento são o mesmo lançamento.'; END IF;

  SELECT * INTO pr FROM public.fin_lancamentos WHERE id = p_previsto FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A obrigação % não foi encontrada.', p_previsto; END IF;
  SELECT * INTO pg FROM public.fin_lancamentos WHERE id = p_pagamento FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'O pagamento % não foi encontrado.', p_pagamento; END IF;

  IF pr.tipo <> 'saida' OR pr.status <> 'previsto' THEN RAISE EXCEPTION 'A obrigação não está em aberto (status %): talvez já tenha sido liquidada.', pr.status; END IF;
  IF pg.tipo <> 'saida' OR pg.status NOT IN ('realizado', 'conciliado') THEN RAISE EXCEPTION 'O pagamento precisa ser uma saída já realizada ou conciliada (status %).', pg.status; END IF;
  IF pg.origem = 'transferencia' OR pg.lancamento_pai_id IS NOT NULL THEN RAISE EXCEPTION 'O pagamento é parte de uma transferência entre contas — não é pagamento de obrigação.'; END IF;
  -- (D1) obrigacao_id = o próprio id é a identidade de uma linha solta; só ser parcela de OUTRA obrigação impede a fusão
  IF pg.liquidacao_id IS NOT NULL OR (pg.obrigacao_id IS NOT NULL AND pg.obrigacao_id <> pg.id) OR pg.recorrencia_id IS NOT NULL THEN
    RAISE EXCEPTION 'O pagamento já está ligado a uma obrigação ou liquidação — nada foi alterado.';
  END IF;
  -- tudo o que for tocar o pagamento aponta para a obrigação: se algo mais depende dele, recusa
  IF EXISTS (SELECT 1 FROM public.fin_lancamentos x WHERE x.id <> pg.id AND (x.lancamento_pai_id = pg.id OR x.obrigacao_id = pg.id))
     OR EXISTS (SELECT 1 FROM public.fin_lancamento_rateio x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.arr_movimentos x WHERE x.fin_lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fin_folha_lancamentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fiscal_agenda x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.fin_estoque_movimentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.sustento_pagamentos x WHERE x.lancamento_id = pg.id)
     OR EXISTS (SELECT 1 FROM public.sustento_competencias x WHERE x.obrigacao_id = pg.id) THEN
    RAISE EXCEPTION 'O pagamento tem rateio, folha, fiscal, estoque, Sustento ou lançamentos ligados — não dá para fundir com segurança.';
  END IF;
  -- o plano só pode falar da obrigação
  IF jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <> 1 OR (p_itens->0->>'lancamento_id')::uuid <> pr.id THEN
    RAISE EXCEPTION 'O plano de liquidação precisa ter exatamente a obrigação % como único documento.', pr.id;
  END IF;
  FOR i IN SELECT * FROM jsonb_array_elements(COALESCE(p_encargos, '[]'::jsonb)) LOOP
    IF (i->>'lancamento_id')::uuid <> pr.id THEN RAISE EXCEPTION 'Todo encargo precisa apontar para a obrigação.'; END IF;
  END LOOP;

  fit := substring(pg.observacoes from '\[ofx:([^\]]+)\]');

  -- os documentos do pagamento passam a ser da obrigação
  UPDATE public.fin_lancamento_anexos SET lancamento_id = pr.id WHERE lancamento_id = pg.id;
  IF pr.comprovante_url IS NULL AND pg.comprovante_url IS NOT NULL THEN
    UPDATE public.fin_lancamentos SET comprovante_url = pg.comprovante_url WHERE id = pr.id;
  END IF;
  -- obrigação estimada: o valor real do pagamento substitui o estimado (antes da liquidação, que confere a soma)
  IF p_adotar_valor THEN UPDATE public.fin_lancamentos SET valor = pg.valor WHERE id = pr.id; END IF;

  -- sai o lançamento duplicado (o saldo da conta não muda: a obrigação, ao ser liquidada, ocupa o lugar dele)
  DELETE FROM public.fin_lancamentos WHERE id = pg.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Não consegui retirar o lançamento duplicado do pagamento (permissão?).'; END IF;

  liq := public.fin_liquidar(pg.conta_id, COALESCE(pg.data_pagamento, pg.data), pg.forma_pagamento, pg.valor, p_itens, p_encargos, NULL, fit,
                             'Liquidada com um pagamento que já estava registrado no extrato');

  -- a obrigação herda a situação do pagamento (conciliado) e a marca do banco
  UPDATE public.fin_lancamentos SET status = pg.status WHERE liquidacao_id = liq AND status = 'realizado';
  IF fit IS NOT NULL THEN
    UPDATE public.fin_lancamentos SET observacoes = btrim(concat_ws(' ', observacoes, '[ofx:' || fit || ']')) WHERE id = pr.id;
  END IF;
  RETURN liq;
END
$fn$;$m7$;
  -- comando 8 da migration
  EXECUTE $m8$REVOKE EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) FROM PUBLIC, anon;$m8$;
  -- comando 9 da migration
  EXECUTE $m9$GRANT  EXECUTE ON FUNCTION public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean) TO authenticated;$m9$;

  -- ── depois: o histórico não mudou ──
  SELECT count(*) INTO n_depois FROM public.fin_lancamentos;
  SELECT count(*) INTO n_oid_depois FROM public.fin_lancamentos WHERE obrigacao_id IS NOT NULL;
  SELECT count(*) INTO n_filhas_depois FROM public.vw_fin_obrigacao_filhas;
  SELECT string_agg(id::text || ':' || saldo_atual::text, ', ' ORDER BY id) INTO saldos_depois FROM public.fin_contas;
  SELECT string_agg(situacao || '=' || n, ', ' ORDER BY situacao) INTO sit_depois FROM (SELECT situacao, count(*) n FROM public.vw_fin_obrigacoes GROUP BY situacao) s;
  rel := rel || format(' DEPOIS: %s lançamentos; %s com obrigacao_id preenchido; a view das parcelas devolve %s; situações: %s.', n_depois, n_oid_depois, n_filhas_depois, sit_depois);
  IF n_depois <> n_antes THEN ok := false; rel := rel || ' FALHOU: o total de lançamentos mudou.'; END IF;
  IF n_oid_depois <> n_oid_antes THEN ok := false; rel := rel || ' FALHOU: o histórico foi preenchido (não deveria).'; END IF;
  IF n_filhas_depois <> n_filhas_antes THEN ok := false; rel := rel || ' FALHOU: a view das parcelas não bate com a contagem direta.'; END IF;
  IF saldos_depois IS DISTINCT FROM saldos_antes THEN ok := false; rel := rel || ' FALHOU: algum saldo mudou.'; END IF;
  IF sit_depois IS DISTINCT FROM sit_antes THEN ok := false; rel := rel || ' FALHOU: as situações das obrigações mudaram.'; END IF;

  -- ── uma linha NOVA (cópia de um previsto, sem vínculos) nasce com obrigacao_id = o próprio id ──
  CREATE TEMP TABLE ensaio_modelo ON COMMIT DROP AS SELECT * FROM public.fin_lancamentos WHERE status = 'previsto' AND tipo = 'saida' LIMIT 1;
  IF (SELECT count(*) FROM ensaio_modelo) = 0 THEN
    rel := rel || ' (nenhum previsto para copiar: a verificação da linha nova ficou de fora).';
  ELSE
    UPDATE ensaio_modelo SET id = gen_random_uuid(), obrigacao_id = NULL, recorrencia_id = NULL, liquidacao_id = NULL, lancamento_pai_id = NULL, observacoes = NULL, created_at = now();
    INSERT INTO public.fin_lancamentos SELECT * FROM ensaio_modelo RETURNING id, obrigacao_id INTO novo_id, novo_oid;
    IF novo_oid IS DISTINCT FROM novo_id THEN ok := false; rel := rel || ' FALHOU: a linha nova NÃO nasceu com obrigacao_id = id.'; ELSE rel := rel || ' A linha nova nasceu com obrigacao_id = o próprio id.'; END IF;
    SELECT count(*) INTO n_view FROM public.vw_fin_obrigacao_filhas WHERE id = novo_id;
    IF n_view <> 0 THEN ok := false; rel := rel || ' FALHOU: a linha de identidade própria apareceu como parcela.'; END IF;
  END IF;

  -- ── a função da fusão foi trocada (a nova aceita obrigacao_id = id) ──
  SELECT pg_get_functiondef('public.fin_liquidar_com_pagamento_existente(uuid, uuid, jsonb, jsonb, boolean)'::regprocedure) INTO def_fusao;
  IF def_fusao NOT LIKE '%obrigacao_id <> pg.id%' THEN ok := false; rel := rel || ' FALHOU: a função da fusão não foi atualizada.'; END IF;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
