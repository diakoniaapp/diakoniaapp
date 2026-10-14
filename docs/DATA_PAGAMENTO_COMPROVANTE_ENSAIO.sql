-- ENSAIO — NÃO GRAVA NADA. Um comando só; termina SEMPRE com um erro de propósito ("ENSAIO CONCLUÍDO") para desfazer tudo — o relatório está na mensagem.
-- ─── Ensaio da data do pagamento lida do comprovante (migration 20261016130000) contra os dados REAIS ───────────────────────────────────
-- Dentro de uma transação que será desfeita: (M) roda a migration e confere que nenhum lançamento mudou; com um administrador real:
-- (D1) "usou a sugerida" grava, e quem/quando/obrigação vêm do banco (o aplicativo não forja); (D2) "alterou" sem motivo é recusado;
-- (D3) "usou a sugerida" com outra data é recusado; (D4) "alterou" para a MESMA data é recusado; (D5) "sem sugestão" com data sugerida é recusado
-- e sem ela grava; (D6) como usuário do aplicativo (papel authenticated): inclui e lê, mas NÃO altera nem apaga o histórico.
-- Leia o fim da mensagem: "TUDO OK, pode aplicar" ou "HÁ FALHAS, NÃO aplique".
DO $ensaio$
DECLARE
  rel text := ''; ok boolean := true; uid uuid; outro uuid := gen_random_uuid(); msg text; n bigint;
  h_antes text; h_depois text; n_lanc bigint; lanc uuid; d record; id1 uuid;
BEGIN
  IF to_regclass('public.fin_data_pagamento_decisoes') IS NOT NULL THEN rel := 'AVISO: a tabela JÁ existe (migration aplicada); o ensaio roda assim mesmo. '; END IF;
  SELECT count(*), md5(string_agg(t::text, '|' ORDER BY id)) INTO n_lanc, h_antes
    FROM (SELECT id, status, data, data_pagamento, valor, observacoes, obrigacao_id FROM public.fin_lancamentos) t;

  -- ── a migration inteira ──
  EXECUTE $m1$CREATE TABLE IF NOT EXISTS public.fin_data_pagamento_decisoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lancamento_id     uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  obrigacao_id      uuid,
  liquidacao_id     uuid,
  arquivo_nome      text,
  fonte             text CHECK (fonte IN ('pdf_texto', 'ocr')),
  tipo_operacao     text,
  banco             text,
  e2e               text,
  data_sugerida     date,
  hora_sugerida     text CHECK (hora_sugerida ~ '^\d{2}:\d{2}$'),
  valor_encontrado  numeric(14,2),
  confianca         text CHECK (confianca IN ('alta', 'media', 'baixa')),
  avisos            text[] NOT NULL DEFAULT '{}',
  data_escolhida    date NOT NULL,
  decisao           text NOT NULL CHECK (decisao IN ('usou_sugerida', 'alterou', 'sem_sugestao')),
  motivo            text,
  decidido_por      uuid,
  decidido_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_dpd_sem_sugestao CHECK ((decisao = 'sem_sugestao') = (data_sugerida IS NULL)),
  CONSTRAINT fin_dpd_confianca    CHECK ((data_sugerida IS NULL) = (confianca IS NULL)),
  CONSTRAINT fin_dpd_usou         CHECK (decisao <> 'usou_sugerida' OR data_escolhida = data_sugerida),
  CONSTRAINT fin_dpd_alterou      CHECK (decisao <> 'alterou' OR (data_escolhida <> data_sugerida AND motivo IS NOT NULL AND btrim(motivo) <> ''))
);$m1$;
  EXECUTE $m2$CREATE INDEX IF NOT EXISTS fin_dpd_lancamento_idx ON public.fin_data_pagamento_decisoes (lancamento_id);$m2$;
  EXECUTE $m3$CREATE INDEX IF NOT EXISTS fin_dpd_obrigacao_idx ON public.fin_data_pagamento_decisoes (obrigacao_id);$m3$;
  EXECUTE $m4$CREATE OR REPLACE FUNCTION public.fin_dpd_carimbo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'   -- lê fin_lancamentos para achar a obrigação, independente da permissão de quem grava
AS $fn$
BEGIN
  NEW.decidido_por := (SELECT auth.uid());
  NEW.decidido_em := now();
  IF NEW.lancamento_id IS NOT NULL AND NEW.obrigacao_id IS NULL THEN
    NEW.obrigacao_id := (SELECT COALESCE(obrigacao_id, id) FROM public.fin_lancamentos WHERE id = NEW.lancamento_id);
  END IF;
  RETURN NEW;
END
$fn$;$m4$;
  EXECUTE $m5$DROP TRIGGER IF EXISTS fin_dpd_carimbo ON public.fin_data_pagamento_decisoes;$m5$;
  EXECUTE $m6$CREATE TRIGGER fin_dpd_carimbo BEFORE INSERT ON public.fin_data_pagamento_decisoes FOR EACH ROW EXECUTE FUNCTION public.fin_dpd_carimbo();$m6$;
  EXECUTE $m7$ALTER TABLE public.fin_data_pagamento_decisoes ENABLE ROW LEVEL SECURITY;$m7$;
  EXECUTE $m8$DROP POLICY IF EXISTS fin_dpd_leitura ON public.fin_data_pagamento_decisoes;$m8$;
  EXECUTE $m9$CREATE POLICY fin_dpd_leitura ON public.fin_data_pagamento_decisoes FOR SELECT TO authenticated
  USING (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m9$;
  EXECUTE $m10$DROP POLICY IF EXISTS fin_dpd_inclusao ON public.fin_data_pagamento_decisoes;$m10$;
  EXECUTE $m11$CREATE POLICY fin_dpd_inclusao ON public.fin_data_pagamento_decisoes FOR INSERT TO authenticated
  WITH CHECK (has_any_role((SELECT auth.uid()), ARRAY['admin'::app_role, 'diakonia'::app_role, 'secretaria'::app_role, 'tesouraria'::app_role]));$m11$;
  EXECUTE $m12$REVOKE ALL ON public.fin_data_pagamento_decisoes FROM anon;$m12$;
  EXECUTE $m13$REVOKE UPDATE, DELETE, TRUNCATE ON public.fin_data_pagamento_decisoes FROM authenticated;$m13$;
  EXECUTE $m14$GRANT SELECT, INSERT ON public.fin_data_pagamento_decisoes TO authenticated;$m14$;

  SELECT md5(string_agg(t::text, '|' ORDER BY id)) INTO h_depois FROM (SELECT id, status, data, data_pagamento, valor, observacoes, obrigacao_id FROM public.fin_lancamentos) t;
  IF h_depois IS DISTINCT FROM h_antes THEN ok := false; rel := rel || ' FALHOU M: algum lançamento mudou.';
  ELSE rel := rel || format(' M ok (tabela criada; os %s lançamentos seguem IDÊNTICOS).', n_lanc); END IF;

  -- ── com um administrador real ──
  SELECT ur.user_id INTO uid FROM public.user_roles ur WHERE ur.role::text = 'admin' LIMIT 1;
  IF uid IS NULL THEN RAISE EXCEPTION 'Nenhum administrador encontrado: o ensaio precisa de um.'; END IF;
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  SELECT id INTO lanc FROM public.fin_lancamentos WHERE tipo::text = 'saida' ORDER BY id LIMIT 1;

  -- D1
  BEGIN
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, fonte, banco, data_sugerida, hora_sugerida, valor_encontrado, confianca, data_escolhida, decisao, decidido_por, decidido_em)
    VALUES (lanc, 'pdf_texto', 'Bradesco', DATE '2026-09-28', '15:42', 1500, 'alta', DATE '2026-09-28', 'usou_sugerida', outro, now() - interval '30 days') RETURNING id INTO id1;
    SELECT * INTO d FROM public.fin_data_pagamento_decisoes WHERE id = id1;
    IF d.decidido_por = uid AND d.decidido_em > now() - interval '1 minute' AND d.obrigacao_id IS NOT NULL THEN
      rel := rel || ' D1 ok ("usou a sugerida" grava; quem, quando e a obrigação vêm do banco — o aplicativo não forja).';
    ELSE ok := false; rel := rel || format(' FALHOU D1: por=%s em=%s obrigacao=%s.', d.decidido_por, d.decidido_em, d.obrigacao_id); END IF;
  EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU D1: ' || SQLERRM; END;

  -- D2..D5: as regras da decisão
  BEGIN
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, data_sugerida, confianca, data_escolhida, decisao) VALUES (lanc, DATE '2026-09-28', 'alta', DATE '2026-10-03', 'alterou');
    ok := false; rel := rel || ' FALHOU D2: aceitou alterar sem motivo.';
  EXCEPTION WHEN check_violation THEN rel := rel || ' D2 ok (alterar sem motivo é recusado).'; END;
  BEGIN
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, data_sugerida, confianca, data_escolhida, decisao) VALUES (lanc, DATE '2026-09-28', 'alta', DATE '2026-10-03', 'usou_sugerida');
    ok := false; rel := rel || ' FALHOU D3: "usou a sugerida" com outra data.';
  EXCEPTION WHEN check_violation THEN rel := rel || ' D3 ok ("usou a sugerida" com outra data é recusado).'; END;
  BEGIN
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, data_sugerida, confianca, data_escolhida, decisao, motivo) VALUES (lanc, DATE '2026-09-28', 'alta', DATE '2026-09-28', 'alterou', 'x');
    ok := false; rel := rel || ' FALHOU D4: "alterou" para a mesma data.';
  EXCEPTION WHEN check_violation THEN rel := rel || ' D4 ok ("alterou" para a mesma data é recusado).'; END;
  BEGIN
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, data_sugerida, confianca, data_escolhida, decisao) VALUES (lanc, DATE '2026-09-28', 'alta', DATE '2026-09-28', 'sem_sugestao');
    ok := false; rel := rel || ' FALHOU D5: "sem sugestão" com data sugerida.';
  EXCEPTION WHEN check_violation THEN
    BEGIN
      INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, fonte, data_escolhida, decisao, avisos) VALUES (lanc, 'ocr', DATE '2026-10-03', 'sem_sugestao', ARRAY['Não foi possível identificar a data do comprovante.']);
      rel := rel || ' D5 ok ("sem sugestão" só sem data sugerida, e grava).';
    EXCEPTION WHEN OTHERS THEN ok := false; rel := rel || ' FALHOU D5: ' || SQLERRM; END;
  END;

  -- D6: como o aplicativo (papel authenticated)
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    INSERT INTO public.fin_data_pagamento_decisoes (lancamento_id, data_escolhida, decisao) VALUES (lanc, DATE '2026-10-03', 'sem_sugestao');
    SELECT count(*) INTO n FROM public.fin_data_pagamento_decisoes WHERE lancamento_id = lanc;
    BEGIN
      UPDATE public.fin_data_pagamento_decisoes SET motivo = 'adulterado' WHERE id = id1;
      ok := false; rel := rel || ' FALHOU D6: o aplicativo conseguiu ALTERAR o histórico.';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
      DELETE FROM public.fin_data_pagamento_decisoes WHERE id = id1;
      ok := false; rel := rel || ' FALHOU D6: o aplicativo conseguiu APAGAR o histórico.';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    PERFORM set_config('role', 'none', true);
    IF n >= 3 THEN rel := rel || ' D6 ok (o aplicativo inclui e lê, mas não altera nem apaga o histórico).'; ELSE ok := false; rel := rel || format(' FALHOU D6: leu %s linhas.', n); END IF;
  EXCEPTION WHEN OTHERS THEN PERFORM set_config('role', 'none', true); ok := false; rel := rel || ' FALHOU D6: ' || SQLERRM; END;

  RAISE EXCEPTION 'ENSAIO CONCLUÍDO (nada foi gravado) — %: %', CASE WHEN ok THEN 'TUDO OK, pode aplicar' ELSE 'HÁ FALHAS, NÃO aplique' END, rel;
END
$ensaio$;
